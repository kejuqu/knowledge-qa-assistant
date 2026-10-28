declare module "pdf-parse" {
  interface PdfParseResult {
    /** 提取出的纯文本 */
    text: string;
    /** 页数 */
    numpages: number;
    /** 文档元信息 */
    info: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
