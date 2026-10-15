import { NextRequest } from "next/server";
import { requireUser, resolveKubeconfig } from "@/lib/auth/resolve";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createSandboxId } from "@/lib/sandbox/id";
import { CreateSandboxSchema } from "@/lib/sandbox/schema";
import { isOwnedBy } from "@/lib/sandbox/ownership";
import { createLaunchpadClient } from "@/lib/sealos/launchpad";
import { toSandbox } from "@/lib/sealos/map";

export async function GET() {
  try {
    const user = await requireUser();
    const kubeconfig = await resolveKubeconfig();
    const client = createLaunchpadClient({ kubeconfig });
    const apps = await client.listApps();
    const sandboxes = apps
      .filter((app) => isOwnedBy(app, user.username))
      .map(toSandbox);
    return jsonOk({ sandboxes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const kubeconfig = await resolveKubeconfig();
    const input = CreateSandboxSchema.parse(await req.json().catch(() => ({})));
    const client = createLaunchpadClient({ kubeconfig });
    const id = input.name ?? createSandboxId();
    const app = await client.createApp({
      name: id,
      owner: user.username,
      resources: {
        cpu: input.cpu,
        memoryGi: input.memoryGi,
        diskGi: input.diskGi,
      },
    });
    return jsonOk({ sandbox: toSandbox(app) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
