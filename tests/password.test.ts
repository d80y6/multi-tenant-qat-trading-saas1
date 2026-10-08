import { describe, expect, it } from "vitest";
import { passwordIssues } from "../src/lib/password";

describe("سياسة كلمات المرور", () => {
  it("ترفض الكلمات الأقصر من 8 أحرف", () => {
    expect(passwordIssues("abc123")).toContain("ثمانية أحرف على الأقل");
  });

  it("ترفض الكلمات بلا أحرف", () => {
    expect(passwordIssues("12345678")).toContain("حرفاً واحداً على الأقل");
  });

  it("ترفض الكلمات بلا أرقام", () => {
    expect(passwordIssues("qwertyui")).toContain("رقماً واحداً على الأقل");
  });

  it("ترفض الكلمات الشائعة", () => {
    expect(passwordIssues("password1")).toContain("ليست كلمة مرور شائعة");
  });

  it("تقبل كلمة مرور قوية", () => {
    expect(passwordIssues("Qati@2026pass")).toEqual([]);
    expect(passwordIssues("souq7market")).toEqual([]);
  });

  it("تدعم الحروف العربية", () => {
    expect(passwordIssues("قاتٍٍ2026سريع")).toEqual([]);
  });
});
