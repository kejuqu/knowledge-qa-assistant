/** 新增通知时在此添加 type 及其对应的数据结构；此模块可安全用于客户端。 */
export const NOTIFICATION_TYPES = ["join_request", "join_approved", "join_rejected", "access_updated"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type Actor = { id: string; name: string };
type Access = { role: "admin" | "member"; permissions: string[] | null };

export interface NotificationBodyMap {
  join_request: {
    message: string;
    tenantName: string;
    applicant: Actor & { email: string };
  };
  join_approved: {
    message: string;
    tenantName: string;
    reviewer: Actor;
    access: Access;
  };
  join_rejected: {
    message: string;
    tenantName: string;
    reviewer: Actor;
    reason?: string;
  };
  access_updated: {
    message: string;
    changedBy: Actor;
    access: Access;
  };
}

/** 使用判别联合，写入时由 type 限定 body 的字段。 */
export type NotificationContent = {
  [T in NotificationType]: { type: T; body: NotificationBodyMap[T] };
}[NotificationType];

/** 迁移保留历史文本；不为旧通知编造当时的角色、权限或操作者。 */
export type LegacyNotificationBody = { message: string; legacy: true };
export type NotificationBody = NotificationContent["body"] | LegacyNotificationBody;
export type StoredNotificationContent = {
  [T in NotificationType]: { type: T; body: NotificationBodyMap[T] | LegacyNotificationBody };
}[NotificationType];
