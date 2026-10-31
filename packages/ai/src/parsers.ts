import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import TurndownService from "turndown";
// @ts-expect-error turndown-plugin-gfm 无类型声明（@types 包已下架），导入后手动收窄类型
import { gfm as gfmPlugin } from "turndown-plugin-gfm";

const gfm = gfmPlugin as (service: TurndownService) => void;

export const SUPPORTED_EXTENSIONS = ["txt", "md", "markdown", "html", "htm", "pdf", "docx"] as const;

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedFile(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(getExtension(filename));
}

let turndown: TurndownService | undefined;

/**
 * HTML -> Markdown（GFM：表格、任务列表、删除线）。
 * 图片转成占位文本，避免内嵌 base64 把分块撑爆。
 */
function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      // 纯文本格式（pdf/txt 抽取结果）里换行就是段落边界
      preformattedCode: true,
    });
    turndown.use(gfm);
    turndown.addRule("imagePlaceholder", {
      filter: "img",
      replacement: (_content, node) => {
        const alt = (node as HTMLElement).getAttribute?.("alt")?.trim();
        return alt ? `[图片: ${alt}]` : "[图片]";
      },
    });
  }
  return turndown;
}

export function htmlToMarkdown(html: string): string {
  return getTurndown().turndown(html);
}

/** turndown-plugin-gfm 只转换首行是表头(<th>)的表格，而真实 docx 表格常没有表头行。
 *  这里统一做两件事：首行全是 td 时提升为 th；拆平单元格里的块级 <p>。
 *  否则表格会被原样保留成内嵌 HTML，污染召回文本。 */
function normalizeTables($: cheerio.CheerioAPI) {
  $("table").each((_, table) => {
    const firstRow = $("tr", table).first();
    if (
      firstRow.length > 0 &&
      firstRow.children("th").length === 0 &&
      firstRow.children("td").length > 0
    ) {
      firstRow.children("td").each((__, cell) => {
        const th = $("<th></th>");
        th.html($(cell).html() ?? "");
        $(cell).replaceWith(th);
      });
    }
  });
  $("td > p, th > p").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
}

/**
 * 按扩展名解析文档为 Markdown 文本入库。
 * docx/html 先转 HTML 再转 Markdown，保留标题/列表/表格结构，召回 chunk 带排版语义；
 * pdf/txt 抽取结果本身就是合法 Markdown 源，直接用。
 * 解析器按格式插件化，后续 OCR（扫描件 PDF / 图片）在 pdf 分支里加扩展点即可。
 */
export async function extractText(buffer: Buffer, filename: string, mimeType?: string): Promise<string> {
  const extensionByMime: Record<string, string> = {
    "text/plain": "txt",
    "text/markdown": "md",
    "text/html": "html",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  const ext = (mimeType && extensionByMime[mimeType]) || getExtension(filename);

  switch (ext) {
    case "txt":
    case "md":
    case "markdown":
      return buffer.toString("utf-8");

    case "html":
    case "htm": {
      // 去掉 script/style/导航等噪声，只留正文结构再转 Markdown
      const $ = cheerio.load(buffer.toString("utf-8"));
      $("script, style, nav, footer, header").remove();
      normalizeTables($);
      return htmlToMarkdown($("body").html() ?? "");
    }

    case "pdf": {
      // TODO(扩展点): 扫描件 PDF 解析结果为空时，走 OCR/VLM 多模态识别
      const result = await pdfParse(buffer);
      return result.text;
    }

    case "docx": {
      const result = await mammoth.convertToHtml({ buffer });
      const $ = cheerio.load(result.value);
      normalizeTables($);
      return htmlToMarkdown($("body").html() ?? result.value);
    }

    default:
      throw new Error(`不支持的文件格式: .${ext}（支持 ${SUPPORTED_EXTENSIONS.join("/")}）`);
  }
}

/**
 * docx -> 语义化 HTML（供页面内安全预览，配合白名单消毒与 sandbox iframe 使用）。
 * 图片转为 data URI，不产生任何外部请求。
 */
export async function convertDocxToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
