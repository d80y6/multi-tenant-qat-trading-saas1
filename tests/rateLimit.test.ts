import { describe, expect, it } from "vitest";
import { rateLimitSync, resetRateLimit } from "../src/lib/rateLimit";

describe("rateLimit — الحد من محاولات الدخول", () => {
  it("يسمح حتى الحد الأقصى ثم يرفض", () => {
    const key = "test:brute";
    resetRateLimit(key);
    for (let i = 0; i < 5; i++) {
      expect(rateLimitSync(key, 5, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimitSync(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("يفصل بين المفاتيح المختلفة", () => {
    resetRateLimit("test:ip-a");
    resetRateLimit("test:ip-b");
    for (let i = 0; i < 3; i++) rateLimitSync("test:ip-a", 3, 60_000);
    expect(rateLimitSync("test:ip-a", 3, 60_000).allowed).toBe(false);
    expect(rateLimitSync("test:ip-b", 3, 60_000).allowed).toBe(true);
  });

  it("يعيد ضبط العداد بعد إعادة الضبط", () => {
    const key = "test:reset";
    for (let i = 0; i < 4; i++) rateLimitSync(key, 2, 60_000);
    expect(rateLimitSync(key, 2, 60_000).allowed).toBe(false);
    resetRateLimit(key);
    expect(rateLimitSync(key, 2, 60_000).allowed).toBe(true);
  });
});
