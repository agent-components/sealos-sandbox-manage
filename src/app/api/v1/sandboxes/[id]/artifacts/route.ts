import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { contentDisposition, openSandboxArtifact } from "@/lib/sandbox/artifact";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const artifact = await openSandboxArtifact(id, req.nextUrl.searchParams.get("path") ?? "", req.signal);
    if (artifact.kind === "image") {
      return jsonOk(
        {
          path: artifact.path,
          mediaType: artifact.mediaType,
          encoding: "base64" as const,
          data: artifact.base64,
        },
        { headers: { "X-Artifact-Kind": "image", "Cache-Control": "no-store" } },
      );
    }

    const headers = new Headers({
      "Content-Type": artifact.mediaType,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Artifact-Kind": artifact.kind,
    });
    if (artifact.kind === "binary") {
      headers.set("Content-Disposition", contentDisposition(artifact.filename));
    }
    return new Response(artifact.stream, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
