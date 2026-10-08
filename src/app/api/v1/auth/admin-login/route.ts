import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { platformAdmins } from "@/db/schema";
import { ApiError, TOKEN_COOKIE, signToken, verifyPassword } from "@/lib/auth";
import { handle } from "@/lib/api";
import { ensureDatabaseReadySafe } from "@/lib/bootstrap";
import { clientIp, rateLimit } from "@/lib/rateLimit";

const schema = z.object({ email: z.string().min(3), password: z.string().min(1) });

export async function POST(req: Request) {
  return handle(async () => {
    await ensureDatabaseReadySafe();
    const limit = await rateLimit(`admin:${clientIp(req)}`);
    if (!limit.allowed) {
      throw new ApiError(
        `محاولات كثيرة جداً — أعد المحاولة بعد ${limit.retryAfter} ثانية`,
        429,
      );
    }

    const body = schema.parse(await req.json());

    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.email, body.email.trim().toLowerCase()))
      .limit(1);

    if (!admin) throw new ApiError("البريد الإلكتروني غير مسجل", 401);
    if (!(await verifyPassword(body.password, admin.passwordHash))) {
      throw new ApiError("كلمة المرور غير صحيحة", 401);
    }
    if (!admin.isActive) throw new ApiError("الحساب معطّل", 403);

    const token = await signToken({
      scope: "platform",
      userId: admin.id,
      tenantId: null,
      role: admin.role,
      name: admin.name,
    });

    const store = await cookies();
    store.set(TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
  });
}
