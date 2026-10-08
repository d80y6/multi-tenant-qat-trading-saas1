import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/lib/phone";

describe("normalizePhone — توحيد صيغة رقم الجوال", () => {
  it("يترك الرقم المحلي كما هو", () => {
    expect(normalizePhone("777000111")).toBe("777000111");
  });

  it("يزيل الصفر الابتدائي", () => {
    expect(normalizePhone("0777000111")).toBe("777000111");
  });

  it("يزيل مفتاح الدولة 967", () => {
    expect(normalizePhone("967777000111")).toBe("777000111");
    expect(normalizePhone("00967777000111")).toBe("777000111");
  });

  it("يزيل الرموز والمسافات", () => {
    expect(normalizePhone("+967 777 000 111")).toBe("777000111");
    expect(normalizePhone("777-000-111")).toBe("777000111");
    expect(normalizePhone("(777) 000.111")).toBe("777000111");
  });

  it("يحوّل الأرقام العربية إلى لاتينية", () => {
    expect(normalizePhone("٧٧٧٠٠٠١١١")).toBe("777000111");
    expect(normalizePhone("۷۷۷۰۰۰۱۱۱")).toBe("777000111");
  });

  it("يعيد سلسلة فارغة للمدخلات الفارغة", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });
});
