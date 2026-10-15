import { AuthError, SealosApiError } from "@/lib/sealos/errors";
import type { LaunchpadApp } from "@/lib/sealos/map";
import { isBoatSandbox } from "@/lib/sealos/map";

export function ownerOf(app: LaunchpadApp): string | null {
  return app.env?.find((e) => e.name === "BOAT_USER")?.value ?? null;
}

export function isOwnedBy(app: LaunchpadApp, username: string): boolean {
  return isBoatSandbox(app) && ownerOf(app) === username;
}

export function assertOwnedBy(app: LaunchpadApp, username: string) {
  if (!isBoatSandbox(app)) {
    throw new SealosApiError("沙箱不存在", 404);
  }
  if (ownerOf(app) !== username) {
    throw new AuthError("无权访问该沙箱", 403);
  }
}
