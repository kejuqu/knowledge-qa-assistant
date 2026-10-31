import { getTenantUser } from "@/lib/tenant-user";
import { and, eq, isNull } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { renderDocxPreviewHtml, renderSafePreviewHtml, DOCX_PREVIEW_CSP } from "@kqa/ai";
import { getPreviewType } from "@/lib/utils";
import { readDocumentObject } from "@/lib/object-storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [document] = await db
    .select({
      filename: documents.filename,
      mimeType: documents.mimeType,
      sourceText: documents.sourceText,
      objectKey: documents.objectKey,
      fileData: documents.fileData,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.tenantId, user.tenantId),
        isNull(documents.deletedAt)
      )
    )
    .limit(1);

  if (!document) {
    return Response.json({ error: "文档不存在" }, { status: 404 });
  }

  const previewType = getPreviewType(document.mimeType);
  const isHtml = previewType === "html";
  const isPdf = previewType === "pdf";
  const isDocx = previewType === "docx";
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("format") === "metadata") {
    return Response.json({ mimeType: document.mimeType }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const shouldDownload = isHtml || searchParams.get("download") === "1";
  const disposition = contentDisposition(shouldDownload ? "attachment" : "inline", document.filename);

  // HTML 只通过专用预览入口返回清理后的内容；下载仍保留原文件。
  if (isHtml && searchParams.get("format") === "html" && searchParams.get("download") !== "1") {
    try {
      const body = document.objectKey
        ? await readDocumentObject(document.objectKey)
        : document.fileData;
      if (!body) return Response.json({ error: "原文件不存在" }, { status: 404 });
      return new Response(renderSafePreviewHtml(Buffer.from(body).toString("utf8")), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": `${DOCX_PREVIEW_CSP}; sandbox`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error(`[preview] failed to render html for ${id}:`, error);
      return Response.json({ error: "文档预览生成失败" }, { status: 502 });
    }
  }

  // docx 页面内预览：mammoth 转 HTML + 白名单消毒，前端在 sandbox iframe 中渲染
  if (isDocx && searchParams.get("format") === "html" && (document.objectKey || document.fileData)) {
    try {
      const body = document.objectKey
        ? await readDocumentObject(document.objectKey)
        : document.fileData!;
      const html = await renderDocxPreviewHtml(Buffer.from(body));
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": disposition,
          "Content-Security-Policy": DOCX_PREVIEW_CSP,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error(`[preview] failed to render docx for ${id}:`, error);
      return Response.json({ error: "文档预览生成失败" }, { status: 502 });
    }
  }

  if ((shouldDownload || isPdf) && (document.objectKey || document.fileData)) {
    try {
      const body = document.objectKey
        ? await readDocumentObject(document.objectKey)
        : document.fileData!;
      const responseBody = new Uint8Array(body.byteLength);
      responseBody.set(body);
      return new Response(responseBody, {
        headers: {
          "Content-Type": shouldDownload && isHtml ? "application/octet-stream" : document.mimeType,
          "Content-Disposition": disposition,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error(`[preview] failed to read object for ${id}:`, error);
      return Response.json({ error: "文件读取失败" }, { status: 502 });
    }
  }

  // 浏览器不能原生安全预览 docx；展示上传时抽取的文本。旧文档也走此回退路径。
  return new Response(document.sourceText ?? "", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function contentDisposition(kind: "inline" | "attachment", filename: string) {
  const safeFilename = filename
    .replace(/[\r\n]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encodedFilename = encodeURIComponent(filename.replace(/[\r\n]/g, ""));
  return `${kind}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}
