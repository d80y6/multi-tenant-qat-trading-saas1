#!/usr/bin/env bash
# نسخ احتياطي لقاعدة بيانات المنصة.
# الاستخدام:  DATABASE_URL=postgres://... ./scripts/backup.sh [مجلد الوجهة]
# يُنصح بجدولته يومياً عبر cron مع رفع الملفات إلى تخزين خارجي.
set -euo pipefail

DEST="${1:-backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILE="${DEST}/qati_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL غير معرف" >&2
  exit 1
fi

mkdir -p "$DEST"

echo "==> بدء النسخ الاحتياطي إلى ${FILE}"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE"

# التحقق من سلامة الملف (لا يمكن فك ضغط ملف تالف)
gzip -t "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "==> تم: ${FILE} (${SIZE})"

# حذف النسخ الأقدم من مدة الاحتفاظ
find "$DEST" -name 'qati_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "==> الاحتفاظ: ${RETENTION_DAYS} يوماً"
