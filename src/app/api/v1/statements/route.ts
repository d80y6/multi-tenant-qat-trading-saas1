import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getStatement } from "@/lib/services/statements";
import { ApiError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const partyType = url.searchParams.get("partyType");
    const partyId = url.searchParams.get("partyId");
    if ((partyType !== "customer" && partyType !== "supplier") || !partyId) {
      throw new ApiError("partyType و partyId مطلوبة", 422);
    }
    return getStatement(ctx, partyType, partyId);
  });
}
