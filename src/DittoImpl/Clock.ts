import type { IClock } from "../LFW/ditto/IClock";

const NOW: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

const _pending = new Map<number, () => void>();
let _counter = 0;
let _mc: MessageChannel | undefined;

function flush(): void {
  if (!_pending.size) return;
  const batch = Array.from(_pending.values());
  _pending.clear();
  for (const fn of batch) fn();
}

export const __Clock: IClock = {
  now: () => NOW(),
  add(handler: () => void): number {
    const handle = ++_counter;
    _pending.set(handle, handler);
    if (!_mc && typeof MessageChannel !== "undefined") {
      _mc = new MessageChannel();
      _mc.port1.onmessage = flush;
    }
    if (_mc) _mc.port2.postMessage(0);
    else window.setTimeout(flush, 0);
    return handle;
  },
  del(handle: number): void {
    _pending.delete(handle);
  },
  hidden: () =>
    typeof document !== "undefined" && document.visibilityState === "hidden",
};
