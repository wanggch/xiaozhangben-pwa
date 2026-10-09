/** 简单的内存固定窗口限流（单进程部署足够；多实例需换成共享存储） */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs: number) {}
  /** 返回需要等待的毫秒数；0 表示放行 */
  take(key: string, now = Date.now()): number {
    let h = this.hits.get(key);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + this.windowMs }; this.hits.set(key, h); }
    h.n++;
    if (this.hits.size > 50_000) for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    return h.n > this.limit ? h.reset - now : 0;
  }
  reset() { this.hits.clear(); }
}
