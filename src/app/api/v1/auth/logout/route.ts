import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/auth";
import { handle } from "@/lib/api";

export async function POST() {
  return handle(async () => {
    const store = await cookies();
    store.delete(TOKEN_COOKIE);
    return { loggedOut: true };
  });
}
