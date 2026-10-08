import { describe, expect, it } from "vitest";
import { money, num } from "../src/lib/api";
import { paymentStatusFor } from "../src/lib/services/trading";

describe("num — تحويل آمن للأرقام", () => {
  it("يحوّل السلاسل الرقمية", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num(7)).toBe(7);
  });

  it("يعيد القيمة الافتراضية للمدخلات غير الصالحة", () => {
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined, 3)).toBe(3);
  });
});

describe("money — تقريب المبالغ إلى منزلتين", () => {
  it("يصحّح أخطاء الفاصلة العائمة", () => {
    expect(money(0.1 + 0.2)).toBe("0.30");
    expect(money(19.999)).toBe("20.00");
  });

  it("يحدّد منزلتين ثابتتين", () => {
    expect(money(5)).toBe("5.00");
    expect(money(5.4)).toBe("5.40");
  });
});

describe("paymentStatusFor — حالة الدفع", () => {
  it("يعتبر الدفع الكامل نقداً", () => {
    expect(paymentStatusFor(100, 100)).toBe("cash");
  });

  it("يصنّف الدفع الجزئي", () => {
    expect(paymentStatusFor(100, 40)).toBe("partial");
  });

  it("يصنّف عدم الدفع آجلاً", () => {
    expect(paymentStatusFor(100, 0)).toBe("credit");
  });

  it("يتعامل مع القيم الكسرية دون خطأ", () => {
    expect(paymentStatusFor(33.33, 33.3300001)).toBe("cash");
    expect(paymentStatusFor(33.33, 33.329)).toBe("partial");
  });
});
