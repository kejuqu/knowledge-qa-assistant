import sanitizeHtml from "sanitize-html";
import { convertDocxToHtml } from "./parsers";

/**
 * 预览用 HTML 白名单：只保留排版语义标签，不放行任何可执行内容。
 * - 不允许远程资源（img 仅 data URI），文档里的引用无法携带追踪请求
 * - 不放行 <a>/<script>/<style 标签>/<事件属性>
 */
const PREVIEW_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "strong", "em", "s", "sub", "sup",
    "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col", "caption",
    "img", "figure", "figcaption",
  ],
  allowedAttributes: {
    img: ["src", "alt"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  // 不放行任何链接协议；图片只允许 data URI，杜绝外发请求
  allowedSchemes: [],
  allowedSchemesByTag: { img: ["data"] },
  disallowedTagsMode: "discard",
};

/**
 * CSP 双保险：即使消毒有遗漏，iframe 内也无法发起请求或执行脚本。
 * style 仅限行内，配合下方基础排版样式使用。
 */
const PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

/** 供 HTTP 响应头使用的同款 CSP（iframe srcdoc 场景由 meta 生效）。 */
export const DOCX_PREVIEW_CSP = PREVIEW_CSP;

const PREVIEW_STYLES = `
  body { font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2933; line-height: 1.75; padding: 1.25rem 1.5rem 3rem; max-width: 52rem; margin: 0 auto; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
  th, td { border: 1px solid #d5dae1; padding: 0.4rem 0.65rem; text-align: left; font-size: 0.9em; }
  th { background: #f2f4f7; }
  blockquote { margin: 0.75rem 0; padding-left: 0.9rem; border-left: 3px solid #b6c2cf; color: #5b6675; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  mark { background: #fde68a; color: inherit; padding: 0 0.1em; border-radius: 0.2em; }
`;

/**
 * docx 预览完整流程：mammoth 转 HTML -> 白名单消毒 -> 注入 CSP meta 与排版样式。
 * 输出是完整 HTML 文档，可直接作为 sandbox iframe 的 srcdoc / 响应体。
 */
export async function renderDocxPreviewHtml(buffer: Buffer): Promise<string> {
  const raw = await convertDocxToHtml(buffer);
  const body = sanitizeHtml(raw, PREVIEW_SANITIZE_OPTIONS);
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`,
    `<style>${PREVIEW_STYLES}</style>`,
    "</head><body>",
    body,
    "</body></html>",
  ].join("");
}
