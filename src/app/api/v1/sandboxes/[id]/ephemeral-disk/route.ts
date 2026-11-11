import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { inspectEphemeralDisk } from "@/lib/sandbox/ephemeral-disk";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const report = await inspectEphemeralDisk(id, req);
    return jsonOk(report);
  } catch (error) {
    return jsonError(error);
  }
}
