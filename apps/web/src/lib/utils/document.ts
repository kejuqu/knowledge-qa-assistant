const MIME_BY_EXTENSION: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** 上传时规范化类型；浏览器未提供可靠 MIME 时才使用扩展名。 */
export function getDocumentMimeType(filename: string, mimeType: string): string {
  const declared = mimeType.split(";")[0]!.trim().toLowerCase();
  if (Object.values(MIME_BY_EXTENSION).includes(declared) && declared !== "text/plain") return declared;
  return MIME_BY_EXTENSION[filename.split(".").pop()?.toLowerCase() ?? ""] ?? "text/plain";
}

export type DocumentPreviewType = "pdf" | "markdown" | "html" | "docx" | "text";

/** 根据已保存的 MIME 类型选择预览方式，未知类型按纯文本处理。 */
export function getPreviewType(mimeType: string): DocumentPreviewType {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/markdown") return "markdown";
  if (mimeType === "text/html") return "html";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "text";
}
