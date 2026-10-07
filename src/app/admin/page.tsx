import AdminConsole from "@/components/AdminConsole";
import AdminLogin from "@/components/AdminLogin";
import { readToken } from "@/lib/auth";
import { ensureDatabaseReadySafe } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await ensureDatabaseReadySafe();
  const token = await readToken();

  if (!token || token.scope !== "platform") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <AdminLogin />
      </main>
    );
  }

  return <AdminConsole adminName={token.name} />;
}
