/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

/**
 * 获取全部书签（扁平化）
 */
export async function getAllBookmarks(): Promise<
  Array<{ id: string; title: string; url: string; dateAdded?: number; parentId?: string }>
> {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks?.getTree) {
      reject(new Error("Bookmarks API not available"));
      return;
    }
    chrome.bookmarks.getTree((tree: any[]) => {
      const bookmarks: Array<{
        id: string;
        title: string;
        url: string;
        dateAdded?: number;
        parentId?: string;
      }> = [];
      function traverse(node: any) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            title: node.title || "无标题",
            url: node.url,
            dateAdded: node.dateAdded,
            parentId: node.parentId,
          });
        }
        if (node.children) {
          node.children.forEach(traverse);
        }
      }
      traverse(tree[0]);
      resolve(bookmarks);
    });
  });
}

/**
 * 简单分类函数：根据标题与URL判定类别
 */
export function classifyBookmark(title: string, url: string): string {
  const text = (title + " " + url).toLowerCase();
  if (/(work|job|office|company|business|meeting)/.test(text)) return "工作";
  if (/(study|learn|course|tutorial|education|school|university)/.test(text)) return "学习";
  if (/(entertainment|movie|music|game|fun|video)/.test(text)) return "娱乐";
  if (/(news|press|journal|media)/.test(text)) return "新闻";
  if (/(tech|development|programming|software|computer)/.test(text)) return "技术";
  if (/(shop|buy|store|mall|purchase)/.test(text)) return "购物";
  return "其他";
}

/**
 * 提取关键词（中文使用二元分词，英文按词过滤停用词）
 */
export function extractKeywords(text: string): string[] {
  const lower = String(text || "").toLowerCase();
  // 中文：匹配连续汉字序列并生成二元分词
  const hanSeqs = lower.match(/\p{Script=Han}+/gu) || [];
  const hanTokens: string[] = [];
  for (const seq of hanSeqs) {
    if (!seq) continue;
    if (seq.length === 1) {
      hanTokens.push(seq);
    } else {
      for (let i = 0; i < seq.length - 1; i++) {
        hanTokens.push(seq.slice(i, i + 2));
      }
    }
  }
  // 英文/数字：按词提取，长度>=3
  const latinWords = lower.match(/[a-z0-9]{3,}/g) || [];
  const stop = new Set([
    "the","and","or","but","in","on","at","to","for","of","with","by","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","should","could","can","may","might","must","this","that","these","those","then","than","from",
  ]);
  const filteredLatin = latinWords.filter((w) => !stop.has(w));
  return [...hanTokens, ...filteredLatin];
}

/**
 * 计算 Jaccard 相似度
 */
export function jaccardSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const inter = [...set1].filter((x) => set2.has(x)).length;
  const union = set1.size + set2.size - inter;
  return inter / union;
}

/**
 * 使用 HEAD 请求粗略判断 URL 是否可达
 */
export async function isUrlValid(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "HEAD", mode: "no-cors" });
    return true;
  } catch {
    return false;
  }
}
