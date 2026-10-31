import { getTenantUser } from "@/lib/tenant-user";

export async function GET() {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ id: user.sub, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
}
