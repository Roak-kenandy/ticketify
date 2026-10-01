/**
 * Single-value cache with a time-to-live that also coalesces concurrent calls:
 * while a load is in flight, every caller awaits the same promise instead of
 * starting another upstream request. Failed loads are not cached.
 */
export class TtlCache<T> {
  private value: { at: number; data: T } | null = null;
  private inflight: Promise<T> | null = null;

  constructor(private readonly ttlMs: () => number) {}

  async get(load: () => Promise<T>): Promise<T> {
    if (this.value && Date.now() - this.value.at < this.ttlMs()) {
      return this.value.data;
    }
    if (this.inflight) return this.inflight;

    this.inflight = load()
      .then(data => {
        this.value = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  invalidate() {
    this.value = null;
  }
}
