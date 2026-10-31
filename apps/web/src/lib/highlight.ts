"use client";

/**
 * 召回段落高亮工具。
 *
 * 召回 chunk 与原文来自同一份 sourceText，但分词器在切分时会丢弃边界分隔符，
 * 直接 indexOf 经常失配。这里把双方都做空白归一化后再匹配，并把命中区间
 * 映射回原文下标，供 React 渲染成 <mark> 或注入 docx 预览 HTML。
 */

export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

/** 原文过短时高亮意义不大，跳过 */
const MIN_NEEDLE_LENGTH = 4;
/** 单个 needle 最多标记的命中次数，避免病态文档刷满高亮 */
const MAX_MATCHES_PER_NEEDLE = 10;

/**
 * 删除全部空白，并记录归一化下标 -> 原下标 的映射。
 * 分词器切 chunk 时会丢弃边界分隔符，所以匹配侧也必须忽略空白差异：
 * chunk 里的 "制，每日" 要能在原文 "制，\n每日" 中命中。
 */
function normalizeWithMap(source: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (/\s/.test(source[i])) continue;
    text += source[i];
    map.push(i);
  }
  return { text, map };
}

/** 把归一化空间的命中区间映射回原下标区间（[start, end)）。 */
function toOriginalRange(
  map: number[],
  start: number,
  end: number
): [number, number] {
  return [map[start], map[end - 1] + 1];
}

/**
 * 召回段落可能带注入的"【章节：…】"上下文前缀（原文中不存在），
 * 匹配时先整段找，找不到就剥掉该前缀再试；通用短首段也做同样尝试。
 */
function needleCandidates(raw: string): string[] {
  const candidates = [raw];
  const injectedPrefix = /^【章节：[^】]*】\n\s*\n/;
  const stripped = injectedPrefix.exec(raw);
  if (stripped) {
    candidates.push(raw.slice(stripped[0].length));
  } else {
    const blankLine = /\n\s*\n/.exec(raw);
    if (blankLine && blankLine.index < 40) {
      candidates.push(raw.slice(blankLine.index + blankLine[0].length));
    }
  }
  return candidates;
}

/**
 * 在 source 中定位 needles（空白归一化匹配），返回可直接渲染的分段。
 * 未命中任何 needle 时返回 [{ text: source, highlight: false }]。
 */
export function buildHighlightSegments(source: string, needles: string[]): HighlightSegment[] {
  if (!source) return [];
  const { text, map } = normalizeWithMap(source);

  const ranges: Array<[number, number]> = [];
  for (const raw of needles) {
    if (!raw) continue;
    for (const candidate of needleCandidates(raw)) {
      let matched = candidate.replace(/\s+/g, "");
      if (matched.length < MIN_NEEDLE_LENGTH) continue;

      let from = text.indexOf(matched);
      if (from === -1) {
        // 长段落跨 chunk 边界被截断时，退化为匹配前 80 字
        matched = matched.slice(0, 80);
        if (matched.length < MIN_NEEDLE_LENGTH) continue;
        from = text.indexOf(matched);
      }
      if (from === -1) continue;

      let count = 0;
      while (from !== -1 && count < MAX_MATCHES_PER_NEEDLE) {
        ranges.push([from, from + matched.length]);
        count += 1;
        from = text.indexOf(matched, from + matched.length);
      }
      break; // 该 needle 已命中，不再尝试其他候选
    }
  }

  if (ranges.length === 0) return [{ text: source, highlight: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    const [origStart, origEnd] = toOriginalRange(map, start, end);
    if (origStart > cursor) segments.push({ text: source.slice(cursor, origStart), highlight: false });
    segments.push({ text: source.slice(origStart, origEnd), highlight: true });
    cursor = origEnd;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), highlight: false });
  return segments;
}

/**
 * 把高亮注入 HTML 文档的文本节点（docx 预览用）。
 * 仅在纯文本节点上切分，不触碰标签结构；输入应为已消毒的可信 HTML。
 */
export function injectHighlightsIntoHtml(html: string, needles: string[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    const segments = buildHighlightSegments(textNode.data, needles);
    if (!segments.some((segment) => segment.highlight)) continue;

    const fragment = doc.createDocumentFragment();
    for (const segment of segments) {
      if (segment.highlight) {
        const mark = doc.createElement("mark");
        mark.textContent = segment.text;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(doc.createTextNode(segment.text));
      }
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
