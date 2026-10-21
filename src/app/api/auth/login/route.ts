import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/users";
import { setUserSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/sealos/errors";
import { jsonError, jsonOk } from "@/lib/api/response";

const BodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const user = await authenticateUser(body.username.trim(), body.password);
    if (!user) {
      throw new AuthError("用户名或密码错误");
    }
    await setUserSession(user.username);
    return jsonOk({
      user: { username: user.username, displayName: user.displayName },
    });
  } catch (error) {
    return jsonError(error);
  }
}
