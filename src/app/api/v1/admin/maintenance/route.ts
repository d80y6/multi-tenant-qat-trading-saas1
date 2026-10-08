import { requirePlatformAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";
import {
  runSubscriptionMaintenance,
  subscriptionHealth,
} from "@/lib/services/subscriptions";

export const dynamic = "force-dynamic";

/**
 * تشغيل يدوي لدورة حياة الاشتراكات من لوحة المشرف:
 * إنهاء التجارب المنتهية، انتهاء الاشتراكات، والتجديد التلقائي.
 */
export async function POST(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const result = await runSubscriptionMaintenance(true);
    const health = await subscriptionHealth();
    return { result, health };
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    return subscriptionHealth();
  });
}
