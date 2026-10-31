import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

// 默认阈值 21 小时后就说"1 天前"，放宽到 24 小时，与下方"24 小时内相对时间"的分支保持一致
dayjs.extend(relativeTime, {
  thresholds: [
    { l: "s", r: 44, d: "second" },
    { l: "m", r: 89 },
    { l: "mm", r: 44, d: "minute" },
    { l: "h", r: 89 },
    { l: "hh", r: 24, d: "hour" },
    { l: "d", r: 35 },
    { l: "dd", r: 25, d: "day" },
    { l: "M", r: 45 },
    { l: "MM", r: 10, d: "month" },
    { l: "y", r: 17 },
    { l: "yy", d: "year" },
  ],
});
dayjs.locale("zh-cn");

/** 消息 hover 时间：24 小时内用 fromNow() 相对时间，更早显示绝对日期。 */
export function formatMessageTime(iso: string) {
  const date = dayjs(iso);
  if (!date.isValid()) return "";
  const now = dayjs();
  if (now.diff(date, "minute") < 1) return "刚刚";
  if (now.diff(date, "hour") < 24) return date.fromNow();
  const md = date.format("M月D日");
  const hm = date.format("HH:mm");
  return date.year() === now.year() ? `${md} ${hm}` : `${date.year()}年${md} ${hm}`;
}

export { getDocumentMimeType, getPreviewType, type DocumentPreviewType } from "./utils/document";
