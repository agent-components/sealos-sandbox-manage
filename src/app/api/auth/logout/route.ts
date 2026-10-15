import { clearUserSession } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST() {
  try {
    await clearUserSession();
    return jsonOk({ ok: true as const });
  } catch (error) {
    return jsonError(error);
  }
}
