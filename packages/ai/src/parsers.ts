import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const SUPPORTED_EXTENSIONS = ["txt", "md", "markdown", "html", "htm", "pdf", "docx"] as const;

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedFile(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(getExtension(filename));
}

/**
 * 按扩展名解析文档为纯文本。
 * 解析器按格式插件化，后续 OCR（扫描件 PDF / 图片）在 pdf 分支里加扩展点即可。
 */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = getExtension(filename);

  switch (ext) {
    case "txt":
    case "md":
    case "markdown":
      return buffer.toString("utf-8");

    case "html":
    case "htm": {
      // 去掉 script/style/标签，只留正文文本
      const $ = cheerio.load(buffer.toString("utf-8"));
      $("script, style, nav, footer, header").remove();
      return $("body").text().replace(/\s+/g, " ").trim();
    }

    case "pdf": {
      // TODO(扩展点): 扫描件 PDF 解析结果为空时，走 OCR/VLM 多模态识别
      const result = await pdfParse(buffer);
      return result.text;
    }

    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default:
      throw new Error(`不支持的文件格式: .${ext}（支持 ${SUPPORTED_EXTENSIONS.join("/")}）`);
  }
}
