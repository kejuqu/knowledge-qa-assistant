export const MAX_EMPLOYEES = 100;
export const MAX_IMPORT_BYTES = 1024 * 1024;
export class ImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type EmployeeInput = { name: string; email: string; password?: string };

export function validateEmployees(value: unknown): EmployeeInput[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EMPLOYEES) {
    throw new ImportError(`每批须包含 1–${MAX_EMPLOYEES} 位员工`);
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).some((key) => !["name", "email", "password"].includes(key))
      || typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 100
      || typeof row.email !== "string" || row.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())
      || (row.password !== undefined && (typeof row.password !== "string"
        || (row.password !== "" && (row.password.length < 8 || new TextEncoder().encode(row.password).length > 72))))) {
      throw new ImportError(`第 ${index + 1} 条员工数据无效：需姓名、邮箱；初始密码为至少 8 位且不超过 72 字节。不支持指定租户、角色或权限。`);
    }
    return { name: row.name.trim(), email: row.email.trim().toLowerCase(), password: row.password || undefined };
  });
}

/** 不依赖 Content-Length，限制分块请求的实际大小。 */
export async function readImportBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ImportError("请求内容为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) { await reader.cancel(); throw new ImportError("文件或请求不能超过 1 MB", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
