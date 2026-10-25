import { NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/resolve";
import { clearUserToken } from "@/lib/auth/users";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const user = await optionalUser(req);
    if (user && !user.apiKeyId) {
      const header = req.headers.get("authorization");
      const token = header?.replace(/^Bearer\s+/i, "").trim();
      if (token) await clearUserToken(token);
    }
    return jsonOk({ ok: true as const });
  } catch (error) {
    return jsonError(error);
  }
}
