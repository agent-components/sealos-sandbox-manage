export type EnvPair = { name: string; value: string };

export type ParseEnvTextResult =
  | { ok: true; env: EnvPair[] }
  | { ok: false; error: string };

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 把已保存的环境变量格式化成可编辑的纯文本。 */
export function formatEnvText(
  env: Array<{ name: string; value?: string | null }>,
): string {
  return env
    .filter((item) => item.name.trim())
    .map((item) => formatEnvLine(item.name.trim(), item.value ?? ""))
    .join("\n");
}

function formatEnvLine(name: string, value: string): string {
  if (value === "") return `${name}=`;
  if (/[\s"'#\\]/.test(value)) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    return `${name}="${escaped}"`;
  }
  return `${name}=${value}`;
}

/**
 * 保存时识别纯文本。支持：
 * - 每行 `KEY=value` / `KEY: value` / `export KEY=value`
 * - `#` 注释与空行
 * - JSON 对象，或 `[{ name, value }]`
 */
export function parseEnvText(input: string): ParseEnvTextResult {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return { ok: true, env: [] };
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseEnvJson(trimmed);
  }
  return parseEnvLines(text);
}

function parseEnvJson(text: string): ParseEnvTextResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 无法解析" };
  }
  if (Array.isArray(data)) {
    if (data.every((item) => typeof item === "string")) {
      return parseEnvLines(data.join("\n"));
    }
    if (data.every(isNameValueRecord)) {
      return collect(
        data.map((item) => ({
          name: item.name.trim(),
          value: jsonValueToString(item.value),
        })),
      );
    }
    return { ok: false, error: "无法识别 JSON 内容" };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "无法识别 JSON 内容" };
  }
  return collect(
    Object.entries(data).map(([name, value]) => ({
      name: name.trim(),
      value: jsonValueToString(value),
    })),
  );
}

function isNameValueRecord(
  item: unknown,
): item is { name: string; value: unknown } {
  return (
    !!item &&
    typeof item === "object" &&
    "name" in item &&
    typeof item.name === "string"
  );
}

function jsonValueToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseEnvLines(text: string): ParseEnvTextResult {
  const lines = text.split("\n");
  const items: EnvPair[] = [];
  let index = 0;
  while (index < lines.length) {
    const lineNo = index + 1;
    const raw = lines[index] ?? "";
    if (!raw.trim() || raw.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    let body = raw.trim();
    if (body.startsWith("export ")) {
      body = body.slice("export ".length).trim();
    }
    if (!body) {
      return { ok: false, error: `第 ${lineNo} 行无法识别` };
    }

    let name = "";
    let rest = "";
    const eqAt = body.indexOf("=");
    if (eqAt >= 0) {
      name = body.slice(0, eqAt).trim();
      rest = body.slice(eqAt + 1);
    } else {
      const matched = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s?([\s\S]*)$/.exec(body);
      if (!matched) return { ok: false, error: `第 ${lineNo} 行无法识别` };
      name = matched[1] ?? "";
      rest = matched[2] ?? "";
    }

    const nameError = validateName(name, `第 ${lineNo} 行变量名「${name || "（空）"}」`);
    if (nameError) return { ok: false, error: nameError };

    const trimmedRest = rest.trim();
    if (trimmedRest.startsWith("\"") || trimmedRest.startsWith("'")) {
      const quote = trimmedRest[0]!;
      const quoted = readQuoted(lines, index, trimmedRest, quote);
      if ("error" in quoted) return { ok: false, error: quoted.error };
      const valueError = validateValue(quoted.value, `第 ${lineNo} 行`);
      if (valueError) return { ok: false, error: valueError };
      pushEnv(items, name, quoted.value);
      index = quoted.nextIndex;
      continue;
    }

    const valueError = validateValue(trimmedRest, `第 ${lineNo} 行`);
    if (valueError) return { ok: false, error: valueError };
    pushEnv(items, name, trimmedRest);
    index += 1;
  }
  return { ok: true, env: items };
}

function readQuoted(
  lines: string[],
  lineIndex: number,
  first: string,
  quote: string,
): { value: string; nextIndex: number } | { error: string } {
  let value = "";
  let content = first.slice(1);
  let index = lineIndex;
  while (true) {
    for (let cursor = 0; cursor < content.length; cursor += 1) {
      const char = content[cursor]!;
      if (char === "\\") {
        const next = content[cursor + 1];
        if (next === undefined) {
          value += "\\";
          continue;
        }
        cursor += 1;
        if (next === "n") value += "\n";
        else if (next === "r") value += "\r";
        else if (next === "t") value += "\t";
        else value += next;
        continue;
      }
      if (char === quote) {
        const trailing = content.slice(cursor + 1).trim();
        if (trailing && !trailing.startsWith("#")) {
          return { error: `第 ${index + 1} 行引号后有多余内容` };
        }
        return { value, nextIndex: index + 1 };
      }
      value += char;
    }
    index += 1;
    if (index >= lines.length) {
      return { error: `第 ${lineIndex + 1} 行引号未闭合` };
    }
    value += "\n";
    content = lines[index] ?? "";
  }
}

function collect(pairs: EnvPair[]): ParseEnvTextResult {
  const items: EnvPair[] = [];
  for (const item of pairs) {
    const nameError = validateName(item.name, `变量名「${item.name || "（空）"}」`);
    if (nameError) return { ok: false, error: nameError };
    const valueError = validateValue(item.value, `变量 ${item.name}`);
    if (valueError) return { ok: false, error: valueError };
    pushEnv(items, item.name, item.value);
  }
  return { ok: true, env: items };
}

function pushEnv(items: EnvPair[], name: string, value: string) {
  const existing = items.findIndex((item) => item.name === name);
  if (existing >= 0) {
    items[existing] = { name, value };
    return;
  }
  items.push({ name, value });
}

function validateName(name: string, where: string): string | null {
  if (!name || !NAME_RE.test(name) || name.length > 128) {
    return `${where}无效，需以字母或下划线开头`;
  }
  return null;
}

function validateValue(value: string, where: string): string | null {
  if (value.length > 4096) return `${where}的值超过 4096 个字符`;
  return null;
}
