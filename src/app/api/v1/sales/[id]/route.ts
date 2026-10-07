import { requireRole, requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getSaleDetail, voidSale } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    return getSaleDetail(ctx, id);
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner", "manager"]);
    const { id } = await params;
    return voidSale(ctx, id);
  });
}
