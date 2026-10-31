import { createHash } from "node:crypto";

export function documentSha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}
