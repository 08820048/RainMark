/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

export type Settings = {
  autoClassify: boolean;
  enableNotifications: boolean;
  enableRecommendations: boolean;
  checkInvalidBookmarks: boolean;
  checkFrequency: string;
  autoCleanDuplicates: boolean;
  defaultCategory: string;
  themeAccent?: string;
  serverUrl?: string;
  aiProvider?: "deepseek";
  aiApiKey?: string;
  aiModel?: string;
  aiApiUrl?: string;
  recommendationMode?: "auto" | "ai" | "local";
  userClassificationRules?: Array<{ pattern: string; category: string; created: number }>;
};

/**
 * 读取设置（带默认值）
 */
export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.sync.get([
    "autoClassify",
    "enableNotifications",
    "enableRecommendations",
    "checkInvalidBookmarks",
    "checkFrequency",
    "autoCleanDuplicates",
    "defaultCategory",
    "themeAccent",
    "serverUrl",
    "aiProvider",
    "aiApiKey",
    "aiModel",
    "aiApiUrl",
    "recommendationMode",
    "userClassificationRules",
  ]);
  return {
    autoClassify: data.autoClassify !== false,
    enableNotifications: data.enableNotifications !== false,
    enableRecommendations: data.enableRecommendations !== false,
    checkInvalidBookmarks: data.checkInvalidBookmarks !== false,
    checkFrequency: data.checkFrequency ?? "60",
    autoCleanDuplicates: !!data.autoCleanDuplicates,
    defaultCategory: data.defaultCategory ?? "其他",
    themeAccent: data.themeAccent ?? "rgba(0, 186, 189, 1)",
    serverUrl: data.serverUrl ?? "http://localhost:5175",
    aiProvider: (data.aiProvider as "deepseek") ?? "deepseek",
    aiApiKey: data.aiApiKey ?? "",
    aiModel: data.aiModel ?? "deepseek-chat",
    aiApiUrl: data.aiApiUrl ?? "https://api.deepseek.com",
    recommendationMode: (data.recommendationMode as "auto" | "ai" | "local") ?? "local",
    userClassificationRules: data.userClassificationRules ?? [],
  };
}

/**
 * 保存设置
 */
export async function setSettings(settings: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(settings);
}

/**
 * 应用自定义分类规则，返回匹配到的分类或 undefined
 */
export function applyUserRules(
  rules: Array<{ pattern: string; category: string }>,
  title: string,
  url: string,
): string | undefined {
  const text = `${title} ${url}`;
  for (const r of rules) {
    try {
      const re = new RegExp(r.pattern, "i");
      if (re.test(text)) return r.category;
    } catch {
      // ignore invalid regex
    }
  }
  return undefined;
}
