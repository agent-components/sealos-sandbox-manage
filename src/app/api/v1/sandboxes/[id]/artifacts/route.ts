import { NextRequest } from "next/server";
import { runSandboxApiCall } from "@/lib/api/call-context";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  contentDisposition,
  openSandboxArtifact,
} from "@/lib/sandbox/artifact";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const path = req.nextUrl.searchParams.get("path") ?? "";
    return await runSandboxApiCall({
      req,
      tool: "read",
      method: "GET",
      path: "/sandboxes/{id}/artifacts",
      arguments: { id, path },
      sandboxId: id,
      trackActivity: true,
      run: async () => {
        const artifact = await openSandboxArtifact(id, path, req.signal);
        if (artifact.kind === "image") {
          const body = {
            path: artifact.path,
            mediaType: artifact.mediaType,
            encoding: "base64" as const,
            data: artifact.base64,
          };
          return {
            status: 200,
            result: null,
            value: jsonOk(body, {
              headers: {
                "X-Artifact-Kind": "image",
                "Cache-Control": "no-store",
              },
            }),
          };
        }

        const headers = new Headers({
          "Content-Type": artifact.mediaType,
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "X-Artifact-Kind": artifact.kind,
        });
        if (artifact.kind === "binary") {
          headers.set(
            "Content-Disposition",
            contentDisposition(artifact.filename)
          );
        }
        return {
          status: 200,
          result: null,
          value: new Response(artifact.stream, { headers }),
        };
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
