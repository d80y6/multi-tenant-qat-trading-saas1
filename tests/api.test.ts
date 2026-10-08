import { describe, expect, it } from "vitest";
import { handle, money, num } from "../src/lib/api";
import { ApiError } from "../src/lib/auth";

describe("handle — غلاف مسارات الـ API", () => {
  it("يلفّ النجاح في {success:true,data}", async () => {
    const res = await handle(async () => ({ id: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { id: 1 } });
  });

  it("يحوّل ApiError إلى رمز حالته الصحيح", async () => {
    const res = await handle(async () => {
      throw new ApiError("غير مصرح", 401);
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("غير مصرح");
  });

  it("يخفي تفاصيل الأخطاء غير المتوقعة ويعيد 500", async () => {
    const res = await handle(async () => {
      throw new Error("connection string: postgres://secret");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("يقيس زمن التنفيذ دون إسقاط الطلب", async () => {
    const res = await handle(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "ok";
    });
    expect((await res.json()).data).toBe("ok");
  });
});

describe("أدوات المبالغ", () => {
  it("تمنع قيماً غير صالحة من الدخول للحسابات", () => {
    expect(num("")).toBe(0);
    expect(num("abc", 5)).toBe(5);
    expect(money(1 / 3)).toBe("0.33");
  });
});
