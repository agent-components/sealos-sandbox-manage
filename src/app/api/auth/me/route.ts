import { readUserSession } from "@/lib/auth/session";
import { jsonOk } from "@/lib/api/response";

export async function GET() {
  const session = await readUserSession();
  if (!session) {
    return jsonOk({ authenticated: false as const, user: null });
  }
  return jsonOk({
    authenticated: true as const,
    user: { username: session.username },
  });
}
