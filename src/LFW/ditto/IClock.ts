export interface IClock {
  now(): number;
  add(handler: () => void): number;
  del(handle: number): void;
  hidden(): boolean;
}
