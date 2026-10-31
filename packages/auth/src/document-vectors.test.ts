import { beforeEach, describe, expect, it, vi } from "vitest";

const milvus = vi.hoisted(() => ({
  hasCollection: vi.fn(),
  delete: vi.fn(),
  closeConnection: vi.fn(),
}));

vi.mock("../../ai/node_modules/@langchain/community/vectorstores/milvus", () => ({ Milvus: vi.fn() }));
vi.mock("../../ai/node_modules/@zilliz/milvus2-sdk-node", () => ({
  ErrorCode: { SUCCESS: "Success" },
  MilvusClient: class {
    hasCollection = milvus.hasCollection;
    delete = milvus.delete;
    closeConnection = milvus.closeConnection;
  },
}));

import { deleteDocumentVectors } from "../../ai/src/vector-store";

describe("文档向量删除", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    milvus.hasCollection.mockResolvedValue({ status: { error_code: "Success" }, value: true });
    milvus.delete.mockResolvedValue({ status: { error_code: "Success" } });
  });

  it("按文档 ID 删除所有分块并关闭连接", async () => {
    await deleteDocumentVectors("doc-1");
    expect(milvus.delete).toHaveBeenCalledWith({
      collection_name: "kqa_chunks", filter: 'documentId == "doc-1"',
    });
    expect(milvus.closeConnection).toHaveBeenCalledOnce();
  });

  it("集合尚未创建时无需删除", async () => {
    milvus.hasCollection.mockResolvedValue({ status: { error_code: "Success" }, value: false });
    await deleteDocumentVectors("doc-1");
    expect(milvus.delete).not.toHaveBeenCalled();
    expect(milvus.closeConnection).toHaveBeenCalledOnce();
  });

  it("Milvus 返回失败状态时不能报告删除成功", async () => {
    milvus.delete.mockResolvedValue({ status: { error_code: "UnexpectedError", reason: "delete failed" } });
    await expect(deleteDocumentVectors("doc-1")).rejects.toThrow("delete failed");
    expect(milvus.closeConnection).toHaveBeenCalledOnce();
  });

  it("集合检查失败时不能当成没有向量", async () => {
    milvus.hasCollection.mockResolvedValue({ status: { error_code: "UnexpectedError", reason: "unavailable" } });
    await expect(deleteDocumentVectors("doc-1")).rejects.toThrow("unavailable");
    expect(milvus.delete).not.toHaveBeenCalled();
    expect(milvus.closeConnection).toHaveBeenCalledOnce();
  });

  it("网络异常时传播错误并关闭连接", async () => {
    milvus.delete.mockRejectedValue(new Error("offline"));
    await expect(deleteDocumentVectors("doc-1")).rejects.toThrow("offline");
    expect(milvus.closeConnection).toHaveBeenCalledOnce();
  });
});
