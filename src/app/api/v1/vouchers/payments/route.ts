import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createPayment, voucherSchema } from "@/lib/services/trading";

export const dynamic = "force-dynamic";

/** سند صرف لمورد */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = voucherSchema.parse(await req.json());
    return createPayment(ctx, body);
  });
}
