import type { NotificationType } from "@kqa/db/notifications";

/** 新增通知类型时必须同时指定点击目的地，避免漏掉跳转处理。 */
export const NOTIFICATION_ROUTES = {
  join_request: "/team#join-requests",
  join_approved: "/documents",
  join_rejected: "/membership",
  access_updated: "/account",
} satisfies Record<NotificationType, string>;
