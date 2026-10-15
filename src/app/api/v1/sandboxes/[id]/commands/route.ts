import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { resolveRunningSandbox } from "@/lib/sandbox/command";
import { RunSandboxCommandSchema } from "@/lib/sandbox/schema";
import { execInPod } from "@/lib/sealos/kube";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = RunSandboxCommandSchema.parse(await req.json().catch(() => ({})));
    const target = await resolveRunningSandbox(id);
    const result = await execInPod(target.kubeconfig, {
      pod: target.pod,
      container: target.container,
      command: ["/bin/sh", "-c", body.command],
    });
    return jsonOk({
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    return jsonError(error);
  }
}
