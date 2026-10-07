import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getPeriodReport } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 29 * 86400000);
    const to = toParam ? new Date(toParam) : new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    return getPeriodReport(ctx, from, to);
  });
}
