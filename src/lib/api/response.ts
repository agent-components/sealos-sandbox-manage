import { NextResponse } from "next/server";
import { AuthError, SealosApiError } from "@/lib/sealos/errors";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function isPrerenderBailout(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return (
    digest === "NEXT_PRERENDER_INTERRUPTED" ||
    digest === "DYNAMIC_SERVER_USAGE" ||
    digest === "HANGING_PROMISE_REJECTION"
  );
}

export function jsonError(error: unknown) {
  if (isPrerenderBailout(error)) throw error;
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SealosApiError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "参数校验失败", details: error.flatten() },
      { status: 400 },
    );
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "服务器内部错误";
  return NextResponse.json({ error: message }, { status: 500 });
}
