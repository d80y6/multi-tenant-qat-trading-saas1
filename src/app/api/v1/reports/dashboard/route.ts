import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getDashboard } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    return getDashboard(ctx);
  });
}
