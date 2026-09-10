import { md5, md5_blob } from "../md5";
import { partial_store, type IPartialStore } from "./partial_store";

export interface IResumableDownloadOptions {
  md5?: string;
  type?: string;
  version?: number;
  signal?: AbortSignal;
  aborted?: () => boolean;
  retry?: number;
  retry_delay?: number;
  stall_timeout?: number;
  on_progress?: (progress: number, size: number) => void;
}

export interface IResumableDownloadResult {
  blob: Blob;
  md5: string;
  size: number;
  stored: boolean;
}

function download_aborted(): Error {
  return Object.assign(new Error("download aborted"), { is_download_aborted: true });
}

function download_fatal(message: string): Error {
  return Object.assign(new Error(message), { is_download_fatal: true });
}

function is_download_aborted(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { is_download_aborted?: boolean }).is_download_aborted === true;
}

function is_download_fatal(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { is_download_fatal?: boolean }).is_download_fatal === true;
}

const DEFAULT_RETRY = 3;
const DEFAULT_RETRY_DELAY = 500;
const DEFAULT_STALL_TIMEOUT = 15000;

export function download_key(url: string): string {
  return md5("lf2-partial:" + url);
}

function is_abort_error(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
}

function materialize(file: Blob): Promise<Blob> {
  return new Response(file.stream()).blob();
}

function is_aborted(options: IResumableDownloadOptions): boolean {
  return !!options.aborted?.() || !!options.signal?.aborted;
}

function sleep(ms: number, options: IResumableDownloadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const on_abort = () => {
      clearTimeout(timer);
      reject(download_aborted());
    };
    const timer = setTimeout(() => {
      options.signal?.removeEventListener("abort", on_abort);
      resolve();
    }, ms);
    options.signal?.addEventListener("abort", on_abort);
  });
}

export async function download_resumable(
  url: string,
  options: IResumableDownloadOptions = {},
): Promise<IResumableDownloadResult> {
  if (is_aborted(options)) throw download_aborted();
  const store = await partial_store();
  const key = download_key(url);
  const retry = Math.max(1, options.retry ?? DEFAULT_RETRY);
  let last_error: unknown;
  for (let attempt = 1; attempt <= retry; ++attempt) {
    if (attempt > 1) {
      const delay = (options.retry_delay ?? DEFAULT_RETRY_DELAY) * 2 ** (attempt - 2) + Math.floor(Math.random() * 200);
      await sleep(delay, options);
    }
    try {
      return await download_once(store, key, url, options);
    } catch (e) {
      if (is_download_aborted(e) || is_aborted(options)) throw download_aborted();
      if (is_download_fatal(e)) throw e;
      last_error = e;
    }
  }
  throw last_error instanceof Error ? last_error : new Error(`[download_resumable] failed: ${url}`);
}

async function download_once(
  store: IPartialStore,
  key: string,
  url: string,
  options: IResumableDownloadOptions,
): Promise<IResumableDownloadResult> {
  const controller = new AbortController();
  const on_outer_abort = () => controller.abort();
  options.signal?.addEventListener("abort", on_outer_abort);
  let stall: ReturnType<typeof setTimeout> | undefined;
  const reset_stall = () => {
    clearTimeout(stall);
    stall = setTimeout(() => controller.abort(), options.stall_timeout ?? DEFAULT_STALL_TIMEOUT);
  };
  const clear_stall = () => {
    clearTimeout(stall);
    stall = void 0;
  };
  try {
    let meta = await store.get_meta(key);
    if (meta?.complete) {
      if (options.md5 && meta.md5 === options.md5) {
        const file = await store.get_file(key);
        if (file) {
          options.on_progress?.(100, file.size);
          return { blob: file, md5: options.md5, size: file.size, stored: true };
        }
      }
      await store.del(key);
      meta = null;
    }
    let committed = await store.committed(key);
    if (committed > 0 && !meta) {
      await store.del(key);
      committed = 0;
    }

    let no_range = !!meta?.no_range;
    const sent_range = committed > 0 && !no_range;
    const headers: Record<string, string> = {};
    if (sent_range) headers.Range = `bytes=${committed}-`;

    reset_stall();
    const resp = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (resp.status === 416) {
      await store.del(key);
      throw new Error(`[download_resumable] range not satisfiable: ${url}`);
    }
    if (resp.status !== 200 && resp.status !== 206) {
      const message = `[download_resumable] http ${resp.status}: ${url}`;
      const retryable = resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429;
      if (retryable && sent_range) {
        await store.set_meta(key, { ...meta, no_range: true, create_date: meta?.create_date ?? Date.now() });
        throw new Error(message);
      }
      if (retryable) throw download_fatal(message);
      throw new Error(message);
    }

    let offset: number;
    let total: number | undefined;
    const etag = resp.headers.get("etag");
    if (resp.status === 206) {
      const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/.exec((resp.headers.get("content-range") ?? "").trim());
      if (!match) {
        await store.del(key);
        throw new Error(`[download_resumable] invalid content-range: ${url}`);
      }
      offset = Number(match[1]);
      total = match[3] === "*" ? void 0 : Number(match[3]);
      if (offset !== committed || (!!meta?.etag && !!etag && meta.etag !== etag)) {
        await store.del(key);
        throw new Error(`[download_resumable] resume mismatch: ${url}`);
      }
    } else {
      if (sent_range) no_range = true;
      if (committed > 0) await store.del(key);
      offset = 0;
      const length = resp.headers.get("content-length");
      total = length ? Number(length) : void 0;
    }

    await store.set_meta(key, { etag, total, no_range, create_date: meta?.create_date ?? Date.now() });

    const writer = await store.open_writer(key, offset);
    let received = offset;
    let reported = -1;
    const report = () => {
      const progress = total ? Math.min(99, Math.floor((received * 100) / total)) : 0;
      if (progress === reported) return;
      reported = progress;
      options.on_progress?.(progress, total ?? received);
    };
    report();
    try {
      const reader = resp.body?.getReader();
      if (reader) {
        for (; ;) {
          if (is_aborted(options)) throw download_aborted();
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          if (is_aborted(options)) throw download_aborted();
          await writer.write(value as Uint8Array<ArrayBuffer>);
          received += value.byteLength;
          reset_stall();
          report();
        }
      } else {
        const buf = new Uint8Array(await resp.arrayBuffer());
        await writer.write(buf);
        received += buf.byteLength;
        report();
      }
    } finally {
      await writer.close().catch(() => void 0);
      clear_stall();
    }

    if (total != null && received !== total) throw new Error(`[download_resumable] incomplete download: ${received}/${total} ${url}`);

    const persist = store.kind === "opfs" && !!options.md5;
    const file = await store.read(key);
    const blob = persist ? file : await materialize(file);
    const actual_md5 = await md5_blob(blob);
    if (options.md5 && actual_md5 !== options.md5) {
      await store.del(key);
      throw download_fatal(`[download_resumable] md5 mismatch: ${url}`);
    }

    if (persist) {
      await store.set_meta(key, {
        etag,
        total,
        no_range,
        create_date: meta?.create_date ?? Date.now(),
        md5: actual_md5,
        complete: true,
        type: options.type,
        version: options.version,
      });
    } else {
      await store.del(key);
    }
    options.on_progress?.(100, blob.size);
    return { blob, md5: actual_md5, size: blob.size, stored: persist };
  } catch (e) {
    if (is_aborted(options)) throw download_aborted();
    if (is_abort_error(e)) throw new Error(`[download_resumable] stalled: ${url}`);
    throw e;
  } finally {
    clear_stall();
    options.signal?.removeEventListener("abort", on_outer_abort);
  }
}

export async function get_stored_download(url: string, md5?: string): Promise<Blob | null> {
  try {
    const store = await partial_store();
    const key = download_key(url);
    const meta = await store.get_meta(key);
    if (!meta?.complete || !meta.md5) return null;
    if (md5 && meta.md5 !== md5) {
      await store.del(key);
      return null;
    }
    const file = await store.get_file(key);
    if (!file) return null;
    if (meta.total != null && file.size !== meta.total) {
      await store.del(key);
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

export async function forget_stored_download(type: string, version: number): Promise<void> {
  const store = await partial_store();
  for (const key of await store.list()) {
    const meta = await store.get_meta(key);
    if (!meta?.complete || meta.type !== type || meta.version === version) continue;
    await store.del(key);
  }
}
