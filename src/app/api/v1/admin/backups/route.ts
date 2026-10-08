import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { requirePlatformAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";
import { logAudit } from "@/lib/services/audit";

const exec = promisify(execFile);
const BACKUP_DIR = path.join(process.cwd(), "backups");

export const dynamic = "force-dynamic";

async function listBackups() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const rows = await Promise.all(
      files
        .filter((f) => f.startsWith("qati_") && f.endsWith(".sql.gz"))
        .map(async (name) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, name));
          return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
        }),
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** قائمة النسخ الاحتياطية المتاحة. */
export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    return {
      directory: BACKUP_DIR,
      retentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 14),
      backups: await listBackups(),
    };
  });
}

/** تنفيذ نسخة احتياطية فورية عبر scripts/backup.sh (pg_dump). */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requirePlatformAdmin(req);

    await exec("bash", [path.join(process.cwd(), "scripts", "backup.sh"), BACKUP_DIR], {
      env: { ...process.env },
      timeout: 120_000,
    });

    const backups = await listBackups();

    await logAudit({
      userId: actor.userId,
      actorScope: "platform",
      action: "backup_created",
      entity: "backup",
      entityId: backups[0]?.name ?? null,
      details: { count: backups.length },
    });

    return { created: backups[0] ?? null, backups };
  });
}
