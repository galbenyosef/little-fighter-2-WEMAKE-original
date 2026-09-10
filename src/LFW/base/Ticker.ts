import { Ditto } from "../ditto/Instance";
import { clamp } from "../utils/math/clamp";

export interface ITickerOptions {
  step_ms(): number;
  on_step(dt: number): void;
}

export class Ticker {
  static readonly TAG: string = "Ticker";

  safety: number = 1.06;
  slew: number = 0.004;
  max_span: number = 2;
  sleep_threshold: number = 2;
  max_lag_steps: number = 8;
  rate_window: number = 1000;

  private readonly _opt: ITickerOptions;
  private _running: boolean = false;
  private _pending: boolean = false;
  private _base: number = 0;
  private _span: number = 1;
  private _cost: number = 0;
  private _deadline: number = 0;
  private _last_step: number = 0;
  private _timer: number = 0;
  private _wake_id: number = 0;
  private _rate: number = 0;
  private _rate_steps: number = 0;
  private _rate_start: number = 0;

  constructor(options: ITickerOptions) {
    this._opt = options;
  }

  get step(): number {
    return this._base * this._span;
  }
  get span(): number {
    return this._span;
  }
  get cost(): number {
    return this._cost;
  }
  get rate(): number {
    return this._rate;
  }
  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._pending = false;
    this._base = this._opt.step_ms();
    this._span = 1;
    this._cost = 0;
    const now = Ditto.Clock.now();
    this._deadline = now + this._base;
    this._last_step = now;
    this._rate = this._base > 0 ? 1000 / this._base : 0;
    this._rate_start = now;
    this._rate_steps = 0;
    this._schedule();
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    this._cancel();
  }

  private _cancel(): void {
    this._pending = false;
    if (this._timer) {
      Ditto.Timeout.del(this._timer);
      this._timer = 0;
    }
    if (this._wake_id) {
      Ditto.Clock.del(this._wake_id);
      this._wake_id = 0;
    }
  }

  resync(immediate: boolean = false): void {
    if (!this._running) return;
    const now = Ditto.Clock.now();
    this._base = this._opt.step_ms();
    this._deadline = immediate ? now : now + this._base * this._span;
    if (!immediate) this._last_step = now;
    this._rate_start = now;
    this._rate_steps = 0;
    this._cancel();
    this._schedule();
  }

  private _schedule(): void {
    if (!this._running || this._pending) return;
    const delay = this._deadline - Ditto.Clock.now();
    if (delay > this.sleep_threshold && !Ditto.Clock.hidden()) {
      this._pending = true;
      this._timer = Ditto.Timeout.add(this._tick, delay - 1);
      return;
    }
    this._pending = true;
    this._wake_id = Ditto.Clock.add(this._tick);
  }

  private readonly _tick = (): void => {
    this._pending = false;
    this._timer = 0;
    this._wake_id = 0;
    if (!this._running) return;
    try {
      this._step_once();
    } finally {
      this._schedule();
    }
  };

  private _step_once(): void {
    const base = this._opt.step_ms();
    if (base > 0 && Math.abs(base - this._base) > base * 0.05) {
      this._base = base;
      this._span = clamp((this._cost * this.safety) / base, 1, this.max_span);
    } else if (base > 0) {
      this._base = base;
    }

    const t0 = Ditto.Clock.now();
    if (t0 < this._deadline) return;

    const dt = clamp(t0 - this._last_step, 0, this._base * 4);
    this._last_step = t0;
    this._opt.on_step(dt);

    const cost = Ditto.Clock.now() - t0;
    this._cost = this._cost ? this._cost * 0.9 + cost * 0.1 : cost;
    const want = clamp(
      (this._cost * this.safety) / this._base,
      1,
      this.max_span
    );
    this._span = clamp(
      this._span + clamp(want - this._span, -this.slew, this.slew),
      1,
      this.max_span
    );
    this._deadline += this._base * this._span;

    this._rate_steps++;
    const el = t0 - this._rate_start;
    if (el >= this.rate_window) {
      this._rate = (this._rate_steps * 1000) / el;
      this._rate_steps = 0;
      this._rate_start = t0;
    }

    const t1 = Ditto.Clock.now();
    if (t1 - this._deadline > this._base * this.max_lag_steps) {
      this._deadline = t1 + this._base * this._span;
      this._last_step = t1;
      this._rate_start = t1;
      this._rate_steps = 0;
    }
  }
}
