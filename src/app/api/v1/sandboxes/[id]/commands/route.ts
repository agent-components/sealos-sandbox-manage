import { NextRequest } from "next/server";
import { runSandboxApiCall } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import { resolveSandboxForCommand } from "@/lib/sandbox/command";
import { RunSandboxCommandSchema } from "@/lib/sandbox/schema";
import { execInPod } from "@/lib/sealos/kube";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => ({}));
    const body = RunSandboxCommandSchema.parse(raw);
    return await runSandboxApiCall({
      req,
      tool: "runSandboxCommand",
      method: "POST",
      path: "/sandboxes/{id}/commands",
      arguments: { id, command: body.command },
      sandboxId: id,
      trackActivity: true,
      run: async () => {
        const target = await resolveSandboxForCommand(id, req.signal);
        const result = await execInPod(target.kubeconfig, {
          pod: target.pod,
          container: target.container,
          command: ["/bin/sh", "-c", body.command],
        });
        const payload = {
          ok: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
        return { status: 200, result: payload, value: jsonOk(payload) };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
