#!/usr/bin/env bash
# استعادة نسخة احتياطية.
# الاستخدام: DATABASE_URL=postgres://... ./scripts/restore.sh backups/qati_20260101_030000.sql.gz
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "ERROR: حدد مسار ملف النسخة الاحتياطية" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL غير معرف" >&2
  exit 1
fi

echo "==> تنبيه: الاستعادة تستبدل البيانات الحالية في ${DATABASE_URL##*@}"
read -r -p "اكتب YES للمتابعة: " CONFIRM
[[ "$CONFIRM" == "YES" ]] || { echo "أُلغيت."; exit 1; }

echo "==> الاستعادة من ${FILE}"
if [[ "$FILE" == *.gz ]]; then
  gunzip -c "$FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
else
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$FILE"
fi

echo "==> اكتملت الاستعادة"
