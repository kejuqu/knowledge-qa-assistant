export function getAvatarUrl(userId: string, hasAvatar: boolean, updatedAt: Date | null) {
  return hasAvatar && updatedAt ? `/api/users/${userId}/avatar?v=${updatedAt.getTime()}` : null;
}
