import { ApiError } from "@/lib/auth";

/**
 * سياسة كلمات المرور للإطلاق التجاري:
 * 8 أحرف على الأقل، وتضم حرفاً ورقماً، وليست ضمن الشائعة.
 */
const COMMON = new Set([
  "12345678",
  "123456789",
  "password",
  "password1",
  "qwertyui",
  "admin123",
  "11111111",
  "00000000",
  "abcd1234",
  "iloveyou",
]);

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push("ثمانية أحرف على الأقل");
  if (!/[A-Za-z\u0600-\u06FF]/.test(password)) issues.push("حرفاً واحداً على الأقل");
  if (!/[0-9]/.test(password)) issues.push("رقماً واحداً على الأقل");
  if (COMMON.has(password.toLowerCase())) issues.push("ليست كلمة مرور شائعة");
  return issues;
}

export function assertPasswordStrength(password: string) {
  const issues = passwordIssues(password);
  if (issues.length) {
    throw new ApiError(`كلمة المرور غير كافية: ${issues.join("، ")}`, 422);
  }
}
