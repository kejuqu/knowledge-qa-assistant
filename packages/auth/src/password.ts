import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  // 把明文密码变成不可逆的哈希字符串，存进数据库
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // 用户登录时，校验输入的明文密码是否和数据库里的哈希匹配
  // 数据库永远不存明文密码，只存哈希。返回 true / false
  return bcrypt.compare(plain, hash); // 从 hash 里解析出盐和 cost，用同样的参数对 plain 再算一次，然后安全地比较两者是否一致
}
