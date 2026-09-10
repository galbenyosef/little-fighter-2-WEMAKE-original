import Dexie, { type EntityTable } from "dexie";

export interface IPartialMeta {
  etag?: string | null;
  total?: number | null;
  no_range?: boolean;
  create_date: number;
  md5?: string;
  complete?: boolean;
  type?: string;
  version?: number;
}

export interface IPartialWriter {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}

export interface IPartialStore {
  readonly kind: "opfs" | "idb" | "memory";
  committed(key: string): Promise<number>;
  open_writer(key: string, offset: number): Promise<IPartialWriter>;
  read(key: string): Promise<Blob>;
  get_file(key: string): Promise<Blob | null>;
  list(): Promise<string[]>;
  del(key: string): Promise<void>;
  get_meta(key: string): Promise<IPartialMeta | null>;
  set_meta(key: string, meta: IPartialMeta): Promise<void>;
}

const DIR_NAME = "lf2_partials";
const CHUNK_SIZE = 4 * 1024 * 1024;

class OpfsStore implements IPartialStore {
  readonly kind = "opfs" as const;
  protected root: FileSystemDirectoryHandle;
  protected dir_promise?: Promise<FileSystemDirectoryHandle>;

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
  }

  protected dir(): Promise<FileSystemDirectoryHandle> {
    if (!this.dir_promise) this.dir_promise = this.root.getDirectoryHandle(DIR_NAME, { create: true });
    return this.dir_promise;
  }

  async committed(key: string): Promise<number> {
    try {
      const dir = await this.dir();
      const handle = await dir.getFileHandle(key + ".part");
      return (await handle.getFile()).size;
    } catch {
      return 0;
    }
  }

  async open_writer(key: string, offset: number): Promise<IPartialWriter> {
    const dir = await this.dir();
    const handle = await dir.getFileHandle(key + ".part", { create: true });
    const writable = await handle.createWritable({ keepExistingData: true });
    let position = offset;
    return {
      write: async (chunk) => {
        await writable.write({ type: "write", position, data: chunk });
        position += chunk.byteLength;
      },
      close: async () => {
        await writable.close();
      },
    };
  }

  async read(key: string): Promise<Blob> {
    const dir = await this.dir();
    const handle = await dir.getFileHandle(key + ".part");
    return await handle.getFile();
  }

  async get_file(key: string): Promise<Blob | null> {
    try {
      const dir = await this.dir();
      const handle = await dir.getFileHandle(key + ".part");
      return await handle.getFile();
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    const dir = await this.dir();
    const iterable = dir as unknown as { keys(): AsyncIterableIterator<string> };
    const keys: string[] = [];
    for await (const name of iterable.keys()) {
      if (name.endsWith(".meta")) keys.push(name.substring(0, name.length - ".meta".length));
    }
    return keys;
  }

  async del(key: string): Promise<void> {
    const dir = await this.dir();
    await Promise.all([key + ".part", key + ".meta"].map((name) => dir.removeEntry(name).catch(() => void 0)));
  }

  async get_meta(key: string): Promise<IPartialMeta | null> {
    try {
      const dir = await this.dir();
      const handle = await dir.getFileHandle(key + ".meta");
      const text = await (await handle.getFile()).text();
      return JSON.parse(text) as IPartialMeta;
    } catch {
      return null;
    }
  }

  async set_meta(key: string, meta: IPartialMeta): Promise<void> {
    const dir = await this.dir();
    const handle = await dir.getFileHandle(key + ".meta", { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(meta));
    await writable.close();
  }
}

interface IPartialChunk {
  id?: number;
  key: string;
  index: number;
  size: number;
  blob: Blob;
}

interface IPartialMetaRow extends IPartialMeta {
  key: string;
}

const db = new Dexie("lf2_partials") as Dexie & {
  partials: EntityTable<IPartialChunk, "id">;
  metas: EntityTable<IPartialMetaRow, "key">;
};
db.version(1).stores({
  partials: "++id, key, index",
  metas: "key",
});

class IdbStore implements IPartialStore {
  readonly kind = "idb" as const;

  async committed(key: string): Promise<number> {
    const rows = await db.partials.where("key").equals(key).toArray();
    return rows.reduce((total, row) => total + row.size, 0);
  }

  async open_writer(key: string, offset: number): Promise<IPartialWriter> {
    const rows = await db.partials.where("key").equals(key).toArray();
    let index = rows.reduce((next, row) => Math.max(next, row.index + 1), 0);
    let buffered = 0;
    let parts: BlobPart[] = [];
    const flush = async () => {
      if (!buffered) return;
      const blob = new Blob(parts);
      parts = [];
      buffered = 0;
      await db.partials.add({ key, index, size: blob.size, blob });
      ++index;
    };
    return {
      write: async (chunk) => {
        parts.push(chunk);
        buffered += chunk.byteLength;
        if (buffered >= CHUNK_SIZE) await flush();
      },
      close: async () => {
        await flush();
      },
    };
  }

  async read(key: string): Promise<Blob> {
    const rows = await db.partials.where("key").equals(key).toArray();
    rows.sort((a, b) => a.index - b.index);
    return new Blob(rows.map((row) => row.blob));
  }

  async get_file(_key: string): Promise<Blob | null> {
    return null;
  }

  async list(): Promise<string[]> {
    return [];
  }

  async del(key: string): Promise<void> {
    await db.partials.where("key").equals(key).delete();
    await db.metas.delete(key);
  }

  async get_meta(key: string): Promise<IPartialMeta | null> {
    return (await db.metas.get(key)) ?? null;
  }

  async set_meta(key: string, meta: IPartialMeta): Promise<void> {
    await db.metas.put({ ...meta, key });
  }
}

class MemoryStore implements IPartialStore {
  readonly kind = "memory" as const;
  protected items = new Map<string, { parts: Blob[]; size: number; meta: IPartialMeta | null }>();

  async committed(key: string): Promise<number> {
    return this.items.get(key)?.size ?? 0;
  }

  async open_writer(key: string, offset: number): Promise<IPartialWriter> {
    const item = this.items.get(key) ?? { parts: [], size: 0, meta: null };
    item.size = offset;
    this.items.set(key, item);
    return {
      write: async (chunk) => {
        const blob = new Blob([chunk]);
        item.parts.push(blob);
        item.size += blob.size;
      },
      close: async () => void 0,
    };
  }

  async read(key: string): Promise<Blob> {
    return new Blob(this.items.get(key)?.parts ?? []);
  }

  async get_file(_key: string): Promise<Blob | null> {
    return null;
  }

  async list(): Promise<string[]> {
    return [];
  }

  async del(key: string): Promise<void> {
    this.items.delete(key);
  }

  async get_meta(key: string): Promise<IPartialMeta | null> {
    return this.items.get(key)?.meta ?? null;
  }

  async set_meta(key: string, meta: IPartialMeta): Promise<void> {
    const item = this.items.get(key) ?? { parts: [], size: 0, meta: null };
    item.meta = meta;
    this.items.set(key, item);
  }
}

let store_promise: Promise<IPartialStore> | undefined;

export function partial_store(): Promise<IPartialStore> {
  if (!store_promise) store_promise = pick_store();
  return store_promise;
}

async function pick_store(): Promise<IPartialStore> {
  try {
    if (navigator.storage?.getDirectory) return new OpfsStore(await navigator.storage.getDirectory());
  } catch {
  }
  try {
    if (typeof indexedDB !== "undefined") {
      await db.open();
      return new IdbStore();
    }
  } catch {
  }
  return new MemoryStore();
}
