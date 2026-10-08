/**
 * حدّ محاولات موزّع:
 *
 * - عند ضبط `REDIS_URL` يعمل عبر Redis (مناسب للنشر متعدد الخوادم).
 * - بدونه يعود إلى حدّ داخل الذاكرة (كافٍ لخادم واحد / التطوير).
 *
 * الاستخدام في مسارات المصادقة:
 *   const limit = await rateLimit(`login:${ip}`, 30);
 *   if (!limit.allowed) throw new ApiError("...", 429);
 */

type Bucket = { count: number; resetAt: number };
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

if (typeof setInterval === "function") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000).unref?.();
}

/** حدّ داخل الذاكرة — يُستخدم في الاختبارات وكخيار احتياطي. */
export function rateLimitSync(key: string, max = MAX_ATTEMPTS, windowMs = WINDOW_MS): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfter: 0 };
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { allowed: true, remaining: max - bucket.count, retryAfter: 0 };
}

/* --------------------------- Redis (اختياري) --------------------------- */

type RedisClient = {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  del(key: string): Promise<number>;
  quit(): Promise<unknown>;
};

let redis: RedisClient | null = null;
let redisUnavailable = false;

async function getRedis(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url || redisUnavailable) return null;
  if (redis) return redis;

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    }) as unknown as RedisClient;
    // اتصال كسول: نجرّب أول استخدام فقط
    await (client as unknown as { connect?: () => Promise<void> }).connect?.();
    redis = client;
    return redis;
  } catch (error) {
    console.warn("[rateLimit] Redis غير متاح — الرجوع للحد المحلي:", error);
    redisUnavailable = true;
    return null;
  }
}

/** الحدّ الموزّع — Redis عند التوفّر، وإلا الذاكرة. */
export async function rateLimit(
  key: string,
  max = MAX_ATTEMPTS,
  windowMs = WINDOW_MS,
): Promise<RateLimitResult> {
  const client = await getRedis();
  if (!client) return rateLimitSync(key, max, windowMs);

  try {
    const redisKey = `ratelimit:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) await client.pexpire(redisKey, windowMs);

    if (count > max) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
    }
    return { allowed: true, remaining: max - count, retryAfter: 0 };
  } catch {
    return rateLimitSync(key, max, windowMs);
  }
}

/** إعادة ضبط العداد (بعد نجاح الدخول مثلاً). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
  void getRedis()
    .then((client) => client?.del(`ratelimit:${key}`))
    .catch(() => undefined);
}

/** هوية العميل المبسطة (IP) لاستخدامها كمفتاح للحد. */
export function clientIp(req?: Request): string {
  const forwarded = req?.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req?.headers.get("x-real-ip") ?? "local";
}
