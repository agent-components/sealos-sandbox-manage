import { NextRequest } from "next/server";
import { requireSessionUser } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { AuthError } from "@/lib/sealos/errors";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionUser(req);
    return jsonOk({
      authenticated: true as const,
      user: {
        username: session.username,
        displayName: session.displayName,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonOk({ authenticated: false as const, user: null });
    }
    return jsonError(error);
  }
}
