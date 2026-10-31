import sharp from "sharp";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** 解码验证真实图片格式，并去除原图元数据，统一输出正方形 WebP。 */
export async function prepareAvatar(file: File): Promise<Buffer> {
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error("头像大小不能超过 2MB，且不能为空");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("unsupported format");
    return await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new Error("图片无法读取或分辨率过大，请更换 JPG、PNG 或 WebP 图片");
  }
}
