import { eq } from "drizzle-orm";
import { db, users } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";
import { prepareAvatar } from "@/lib/avatar";
import { getAvatarUrl } from "@/lib/avatar-url";

export async function PUT(request: Request) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择头像图片" }, { status: 400 });
  let avatar: Buffer;
  try { avatar = await prepareAvatar(file); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "头像处理失败" }, { status: 400 }); }
  const updatedAt = new Date();
  await db.update(users).set({ avatarData: avatar, avatarUpdatedAt: updatedAt }).where(eq(users.id, user.sub));
  return Response.json({ avatarUrl: getAvatarUrl(user.sub, true, updatedAt) });
}

export async function DELETE() {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  await db.update(users).set({ avatarData: null, avatarUpdatedAt: null }).where(eq(users.id, user.sub));
  return Response.json({ avatarUrl: null });
}
