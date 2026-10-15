import { ArtifactPathSchema } from "@/lib/sandbox/schema";
import { resolveRunningSandbox } from "@/lib/sandbox/command";
import { SealosApiError } from "@/lib/sealos/errors";
import { ExecCancelledError, execInPod } from "@/lib/sealos/kube";

export const ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;
const SNIFF_BYTES = 8192;

const TEXT_MEDIA: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  xhtml: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  jsx: "text/javascript; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  tsx: "text/plain; charset=utf-8",
  mts: "text/plain; charset=utf-8",
  cts: "text/plain; charset=utf-8",
  css: "text/css; charset=utf-8",
  scss: "text/css; charset=utf-8",
  sass: "text/css; charset=utf-8",
  less: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  jsonc: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  xml: "text/xml; charset=utf-8",
  svg: "text/xml; charset=utf-8",
  md: "text/plain; charset=utf-8",
  mdx: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  text: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  tsv: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  yml: "text/plain; charset=utf-8",
  toml: "text/plain; charset=utf-8",
  ini: "text/plain; charset=utf-8",
  conf: "text/plain; charset=utf-8",
  cfg: "text/plain; charset=utf-8",
  env: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  bash: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8",
  rb: "text/plain; charset=utf-8",
  go: "text/plain; charset=utf-8",
  rs: "text/plain; charset=utf-8",
  java: "text/plain; charset=utf-8",
  kt: "text/plain; charset=utf-8",
  c: "text/plain; charset=utf-8",
  h: "text/plain; charset=utf-8",
  cc: "text/plain; charset=utf-8",
  cpp: "text/plain; charset=utf-8",
  hpp: "text/plain; charset=utf-8",
  cs: "text/plain; charset=utf-8",
  php: "text/plain; charset=utf-8",
  vue: "text/plain; charset=utf-8",
  svelte: "text/plain; charset=utf-8",
  astro: "text/plain; charset=utf-8",
  sql: "text/plain; charset=utf-8",
  graphql: "text/plain; charset=utf-8",
  gql: "text/plain; charset=utf-8",
  lock: "text/plain; charset=utf-8",
};

const IMAGE_MEDIA: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heic",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export type ArtifactFile = {
  path: string;
  filename: string;
  mediaType: string;
} & (
  | { kind: "image"; bytes: number; base64: string }
  | { kind: "text" | "binary"; stream: ReadableStream<Uint8Array> }
);

type ChunkReader = {
  read: () => Promise<
    | { done: false; value: Buffer }
    | { done: true; exitCode: number; stderr: string }
  >;
  cancel: () => void;
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function artifactFilename(path: string): string {
  const name = path.split("/").filter(Boolean).pop();
  return name || "artifact";
}

function imageMagic(sample: Buffer): string | null {
  if (sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    sample.length >= 8 &&
    sample[0] === 0x89 &&
    sample[1] === 0x50 &&
    sample[2] === 0x4e &&
    sample[3] === 0x47
  ) {
    return "image/png";
  }
  const head = sample.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  if (
    sample.length >= 12 &&
    sample.subarray(0, 4).toString("ascii") === "RIFF" &&
    sample.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (sample.length >= 2 && sample[0] === 0x42 && sample[1] === 0x4d) return "image/bmp";
  if (sample.length >= 4 && sample[0] === 0 && sample[1] === 0 && sample[2] === 1 && sample[3] === 0) {
    return "image/x-icon";
  }
  if (sample.length >= 12 && sample.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = sample.subarray(8, 12).toString("ascii");
    if (brand.startsWith("avi")) return "image/avif";
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") return "image/heic";
  }
  return null;
}

function trimIncompleteUtf8(sample: Buffer): Buffer {
  let index = sample.length - 1;
  let continuation = 0;
  while (index >= 0 && index >= sample.length - 4 && (sample[index]! & 0xc0) === 0x80) {
    continuation += 1;
    index -= 1;
  }
  if (index < 0) return sample;
  const lead = sample[index]!;
  let need = 0;
  if ((lead & 0x80) === 0) need = 0;
  else if ((lead & 0xe0) === 0xc0) need = 1;
  else if ((lead & 0xf0) === 0xe0) need = 2;
  else if ((lead & 0xf8) === 0xf0) need = 3;
  else return sample.subarray(0, index);
  if (continuation < need) return sample.subarray(0, index);
  return sample;
}

function looksLikeText(sample: Buffer): boolean {
  if (sample.length === 0) return true;
  if (sample.includes(0)) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(trimIncompleteUtf8(sample));
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function classifyArtifact(path: string, sample: Buffer): {
  kind: "text" | "image" | "binary";
  mediaType: string;
} {
  const ext = extensionOf(path);
  const textType = TEXT_MEDIA[ext];
  if (textType) return { kind: "text", mediaType: textType };
  const imageType = IMAGE_MEDIA[ext] ?? imageMagic(sample);
  if (imageType) return { kind: "image", mediaType: imageType };
  if (looksLikeText(sample)) return { kind: "text", mediaType: "text/plain; charset=utf-8" };
  return { kind: "binary", mediaType: "application/octet-stream" };
}

function artifactFailure(exitCode: number, stderr: string): Error | null {
  if (exitCode === 0) return null;
  const text = stderr.trim();
  if (/no such file|not found|cannot open/i.test(text)) {
    return new SealosApiError("文件不存在", 404);
  }
  if (/is a directory/i.test(text)) {
    return new SealosApiError("路径是目录，不能当文件读取", 400);
  }
  if (/permission denied/i.test(text)) {
    return new SealosApiError("无权读取该文件", 403);
  }
  return new SealosApiError(text || `读取文件失败（${exitCode}）`, 400);
}

function openCat(kubeconfig: string, pod: string, container: string, path: string, signal?: AbortSignal): ChunkReader {
  const chunks: Buffer[] = [];
  let ended: { exitCode: number; stderr: string } | null = null;
  let failed: Error | null = null;
  let wake: (() => void) | null = null;
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  if (signal?.aborted) abort.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  const poke = () => {
    wake?.();
    wake = null;
  };

  void execInPod(kubeconfig, {
    pod,
    container,
    command: ["cat", "--", path],
    timeoutMs: 0,
    maxBytes: ARTIFACT_MAX_BYTES,
    retainStdout: false,
    tooLargeMessage: "文件超过 32MB",
    signal: abort.signal,
    onStdout: (chunk) => {
      chunks.push(chunk);
      poke();
    },
  }).then(
    (result) => {
      ended = { exitCode: result.exitCode, stderr: result.stderr };
      poke();
    },
    (error) => {
      failed = error instanceof ExecCancelledError ? error : error instanceof Error ? error : new Error("读取文件失败");
      poke();
    },
  );

  return {
    cancel() {
      signal?.removeEventListener("abort", onAbort);
      abort.abort();
    },
    async read() {
      while (true) {
        const next = chunks.shift();
        if (next) return { done: false as const, value: next };
        if (failed) throw failed;
        if (ended) return { done: true as const, exitCode: ended.exitCode, stderr: ended.stderr };
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}

function streamRest(
  first: Buffer[],
  reader: ChunkReader,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const chunk of first) controller.enqueue(chunk);
        while (true) {
          const piece = await reader.read();
          if (piece.done) {
            const error = artifactFailure(piece.exitCode, piece.stderr);
            if (error) controller.error(error);
            else controller.close();
            return;
          }
          controller.enqueue(piece.value);
        }
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("读取文件失败"));
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

/** 从运行中的沙箱读取一个文件，并按文本、图片或其他分类。 */
export async function openSandboxArtifact(
  id: string,
  rawPath: string,
  signal?: AbortSignal,
): Promise<ArtifactFile> {
  const path = ArtifactPathSchema.parse(rawPath);
  const target = await resolveRunningSandbox(id);
  const reader = openCat(target.kubeconfig, target.pod, target.container, path, signal);
  const sampleParts: Buffer[] = [];
  let sampleLen = 0;
  try {
    while (sampleLen < SNIFF_BYTES) {
      const piece = await reader.read();
      if (piece.done) {
        const error = artifactFailure(piece.exitCode, piece.stderr);
        if (error) throw error;
        break;
      }
      sampleParts.push(piece.value);
      sampleLen += piece.value.length;
    }
  } catch (error) {
    reader.cancel();
    throw error;
  }

  const sample = Buffer.concat(sampleParts);
  const kind = classifyArtifact(path, sample);
  const filename = artifactFilename(path);
  if (kind.kind === "image") {
    const parts: Uint8Array[] = [sample];
    let size = sample.length;
    try {
      while (true) {
        const piece = await reader.read();
        if (piece.done) {
          const error = artifactFailure(piece.exitCode, piece.stderr);
          if (error) throw error;
          break;
        }
        parts.push(piece.value);
        size += piece.value.length;
      }
    } catch (error) {
      reader.cancel();
      throw error;
    }
    return {
      kind: "image",
      path,
      filename,
      mediaType: kind.mediaType,
      bytes: size,
      base64: Buffer.concat(parts).toString("base64"),
    };
  }

  return {
    kind: kind.kind,
    path,
    filename,
    mediaType: kind.mediaType,
    stream: streamRest(sampleParts, reader),
  };
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
