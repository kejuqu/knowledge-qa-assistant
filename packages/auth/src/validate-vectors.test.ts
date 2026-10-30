import { describe, expect, it } from "vitest";
import { validateVectors } from "../../ai/src/validate-vectors";

describe("Milvus vector validation", () => {
  it("accepts one finite vector per chunk", () => {
    expect(validateVectors([[1, 2], [3, 4]], 2, 2)).toBe(2);
  });
  it("rejects the reported two 3584-dimensional rows against a 1024-dimensional collection", () => {
    expect(() => validateVectors([Array(3584).fill(0), Array(3584).fill(0)], 2, 1024)).toThrow("预期 1024");
  });
  it("rejects missing rows instead of silently omitting chunks", () => {
    expect(() => validateVectors([[1, 2]], 2)).toThrow("2 个分块");
  });
  it.each([[[1, NaN]], [[Infinity, 1]], [[]], [[1, 2], [1]]])("rejects malformed embeddings: %j", (...vectors) => {
    expect(() => validateVectors(vectors as number[][], vectors.length, 2)).toThrow();
  });
});
