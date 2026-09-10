import { Ticker } from "../LFW/base/Ticker";
import { Ditto } from "../LFW/ditto/Instance";

const wakes = new Map<number, () => void>();
let wake_seq = 0;

function flush_wakes() {
  const list = Array.from(wakes.values());
  wakes.clear();
  for (const fn of list) fn();
}

function advance(ms: number) {
  const target = Date.now() + ms;
  for (let guard = 0; guard < 10000; guard++) {
    const left = target - Date.now();
    if (left > 0) {
      jest.advanceTimersByTime(left);
      continue;
    }
    if (!wakes.size) break;
    flush_wakes();
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  wakes.clear();
  wake_seq = 0;
  Ditto.setup({
    Clock: {
      now: () => Date.now(),
      add: (handler: () => void) => {
        const handle = ++wake_seq;
        wakes.set(handle, handler);
        return handle;
      },
      del: (handle: number) => void wakes.delete(handle),
      hidden: () => false,
    },
    Timeout: {
      add: (handler: () => void, timeout?: number) =>
        setTimeout(handler, timeout) as unknown as number,
      del: (timer_id: number) => clearTimeout(timer_id as unknown as ReturnType<typeof setTimeout>),
    },
  } as any);
});

afterEach(() => {
  jest.useRealTimers();
});

test("Ticker 持续步进", () => {
  let steps = 0;
  const ticker = new Ticker({ step_ms: () => 100, on_step: () => { steps++; } });
  ticker.start();
  advance(1000);
  ticker.stop();
  expect(steps).toBe(10);
});

test("Ticker.resync 后仍然继续步进", () => {
  let steps = 0;
  const ticker = new Ticker({ step_ms: () => 100, on_step: () => { steps++; } });
  ticker.start();
  advance(300);
  expect(steps).toBe(3);
  ticker.resync();
  advance(300);
  expect(steps).toBe(6);
  ticker.stop();
});

test("Ticker.resync(true) 立即执行(联机 awake 用)", () => {
  let steps = 0;
  const ticker = new Ticker({ step_ms: () => 100, on_step: () => { steps++; } });
  ticker.start();
  advance(100);
  expect(steps).toBe(1);
  ticker.resync(true);
  flush_wakes();
  expect(steps).toBe(2);
  ticker.stop();
});

test("Ticker.stop 后不再步进", () => {
  let steps = 0;
  const ticker = new Ticker({ step_ms: () => 100, on_step: () => { steps++; } });
  ticker.start();
  advance(500);
  ticker.stop();
  const after_stop = steps;
  advance(500);
  expect(steps).toBe(after_stop);
});
