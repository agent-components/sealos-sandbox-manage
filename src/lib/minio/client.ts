import { Client } from "minio";

type MinioSettings = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __boatMinio: Client | undefined;
}

/** 从环境变量读取 MinIO。未配齐时返回 null，调用方应跳过上传。 */
export function readMinioSettings(): MinioSettings | null {
  const endpoint = process.env.MINIO_ENDPOINT?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
  const secretKey = process.env.MINIO_SECRET_KEY?.trim();
  const bucket = process.env.MINIO_BUCKET?.trim();
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;

  const url = new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`);
  const useSSL = url.protocol === "https:";
  const port = url.port ? Number(url.port) : useSSL ? 443 : 80;
  if (!Number.isInteger(port) || port <= 0) return null;

  return {
    endPoint: url.hostname,
    port,
    useSSL,
    accessKey,
    secretKey,
    bucket,
    region: process.env.MINIO_REGION?.trim() || "us-east-1",
  };
}

export function getMinioClient(): Client | null {
  const settings = readMinioSettings();
  if (!settings) return null;
  if (!global.__boatMinio) {
    global.__boatMinio = new Client({
      endPoint: settings.endPoint,
      port: settings.port,
      useSSL: settings.useSSL,
      accessKey: settings.accessKey,
      secretKey: settings.secretKey,
      region: settings.region,
      pathStyle: true,
    });
  }
  return global.__boatMinio;
}

export function minioBucket(): string | null {
  return readMinioSettings()?.bucket ?? null;
}
