import { AuthError, SealosApiError } from "../sealos/errors";
import { ZodError } from "zod";

export type JsonResponse = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): JsonResponse {
  return {
    status: init?.status ?? 200,
    body: data,
    headers: { ...JSON_HEADERS, ...init?.headers },
  };
}

export function jsonError(error: unknown): JsonResponse {
  if (error instanceof AuthError) {
    return {
      status: error.status,
      body: { error: error.message },
      headers: JSON_HEADERS,
    };
  }
  if (error instanceof SealosApiError) {
    return {
      status: error.status >= 400 && error.status < 600 ? error.status : 502,
      body: { error: error.message, details: error.details },
      headers: JSON_HEADERS,
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: { error: "参数校验失败", details: error.flatten() },
      headers: JSON_HEADERS,
    };
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "服务器内部错误";
  return {
    status: 500,
    body: { error: message },
    headers: JSON_HEADERS,
  };
}

/** 将 JsonResponse 写入 Node http ServerResponse。 */
export function sendJson(res: import("node:http").ServerResponse, response: JsonResponse) {
  const body = JSON.stringify(response.body);
  res.writeHead(response.status, {
    ...response.headers,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}