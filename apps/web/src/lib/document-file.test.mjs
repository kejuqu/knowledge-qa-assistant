import assert from "node:assert/strict";
import { test } from "node:test";
import { documentSha256 } from "./document-file.ts";
import { getDocumentMimeType } from "./utils/document.ts";

test("SHA-256 对原始字节计算，内容相同不受文件名影响", () => {
  assert.equal(documentSha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(documentSha256(Buffer.from("abc")), documentSha256(new Uint8Array([97, 98, 99])));
  assert.notEqual(documentSha256(Buffer.from("abc")), documentSha256(Buffer.from("abd")));
});

test("优先使用已知 MIME 并规范化参数、大小写", () => {
  assert.equal(getDocumentMimeType("document.txt", " Application/PDF; charset=binary "), "application/pdf");
  assert.equal(getDocumentMimeType("document.txt", "text/html"), "text/html");
});

test("浏览器 MIME 缺失或通用时按上传格式规范化保存", () => {
  assert.equal(getDocumentMimeType("document.MD", "text/plain"), "text/markdown");
  assert.equal(getDocumentMimeType("document.htm", ""), "text/html");
  assert.equal(getDocumentMimeType("document.docx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(getDocumentMimeType("document.txt", ""), "text/plain");
});
