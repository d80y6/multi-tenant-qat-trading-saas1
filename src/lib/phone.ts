/**
 * توحيد صيغة رقم الجوال اليمني حتى لا يفشل الدخول بسبب اختلاف الكتابة:
 * "+967 777 000 111" / "00967777000111" / "0777000111" → "777000111"
 * كما يحوّل الأرقام العربية (٠١٢٣…) إلى أرقام لاتينية.
 */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizePhone(input: string): string {
  if (!input) return "";

  let value = input.trim();

  value = value.replace(/[٠-٩۰-۹]/g, (char) => {
    const ar = ARABIC_DIGITS.indexOf(char);
    if (ar >= 0) return String(ar);
    const fa = PERSIAN_DIGITS.indexOf(char);
    return fa >= 0 ? String(fa) : char;
  });

  value = value.replace(/\D/g, "");

  if (value.startsWith("00967")) value = value.slice(5);
  else if (value.startsWith("967") && value.length > 9) value = value.slice(3);

  while (value.startsWith("0") && value.length > 9) value = value.slice(1);
  if (value.startsWith("0") && value.length === 10) value = value.slice(1);

  return value;
}
