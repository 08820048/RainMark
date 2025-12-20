/* eslint-disable @typescript-eslint/no-explicit-any */
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/sandbox";
import { classifyBookmark, extractKeywords, jaccardSimilarity, getAllBookmarks } from "@shared/bookmarks";
import { getSettings, setSettings, applyUserRules } from "@shared/storage";

console.log("RainMark background (WXT) starting...");

function t(id: string, args?: Array<string>) {
  try {
    const msg = (browser as any)?.i18n?.getMessage?.(id, args ?? []);
    if (msg) return msg;
  } catch {}
  return id;
}

async function pushToast(payload: { type?: "success" | "info" | "warning" | "error"; title?: string; message: string }) {
  try {
    const s = await getSettings();
    if (s.enableNotifications === false) return;
    await browser.runtime.sendMessage({ action: "toast", payload });
  } catch {}
}

/**
 * 获取或创建分类文件夹并返回其ID
 */
async function getCategoryFolderId(category: string): Promise<string> {
  try {
    const tree = await browser.bookmarks.getTree();
    const bookmarksBar = tree?.[0]?.children?.[0];
    if (!bookmarksBar) return "1";
    let folder = bookmarksBar.children?.find((n: any) => n.title === category);
    if (!folder) {
      folder = await browser.bookmarks.create({
        title: category,
        parentId: bookmarksBar.id,
      });
    }
    return folder.id;
  } catch (error) {
    console.error("Error getting category folder:", error);
    return "1";
  }
}

/**
 * 生成智能推荐（基于当前标签页与 Jaccard 相似度）
 */
async function getRecommendations(): Promise<
  Array<{ id: string; title: string; url: string; score: number; similarity?: number; source?: "AI" | "Local" }>
> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return [];
    const t = tabs[0];
    const settings = await getSettings();
    if (settings.enableRecommendations === false) return [];
    const curKeywords = extractKeywords(`${t.title} ${t.url}`);
    const all = await getAllBookmarks();
    const scored = all.map((b) => {
      const ks = extractKeywords(`${b.title} ${b.url}`);
      const sim = jaccardSimilarity(curKeywords, ks);
      return { ...b, score: sim, similarity: sim };
    });
    const localTop = scored.sort((a, b) => b.score - a.score).slice(0, 20);
    const mode = settings.recommendationMode ?? "auto";
    const useAI = mode === "ai" || (mode === "auto" && !!settings.aiApiKey);
    if (useAI) {
      try {
        const base = settings.serverUrl || "http://localhost:5175";
        const resp = await fetch(`${base}/recommend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current: { title: t.title, url: t.url },
            candidates: localTop.map((b) => ({ id: b.id, title: b.title, url: b.url })),
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            apiUrl: settings.aiApiUrl,
            model: settings.aiModel,
            limit: 5,
          }),
        });
        const data = await resp.json();
        const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
        if (Array.isArray(recs) && recs.length) {
          return recs.map((r) => ({ ...r, source: "AI" }));
        }
      } catch {
        // ignore and fallback to local
      }
    }
    return localTop.slice(0, 5).map((r) => ({ ...r, source: "Local" }));
  } catch (e) {
    console.error("Error getting recommendations:", e);
    return [];
  }
}

/**
 * 立即检查失效链接并归档到“失效链接”
 * 优先使用 Fastify 服务端进行 URL 可达性检查
 */
async function checkInvalidBookmarksNow(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const all = await getAllBookmarks();
    const invalid: typeof all = [];
    const sample = all.slice(0, 10);
    const total = sample.length;
    let done = 0;
    try {
      await browser.runtime.sendMessage({ action: "checkProgress", current: 0, total });
    } catch {}
    for (const b of sample) {
      if (!b.url) continue;
      try {
        const s = await getSettings();
        const base = s.serverUrl || "http://localhost:5175";
        const resp = await fetch(`${base}/check?url=${encodeURIComponent(b.url)}`);
        const data = await resp.json();
        if (!data?.valid) invalid.push(b);
      } catch {
        // 回退到本地 HEAD 检查
        try {
          await fetch(b.url, { method: "HEAD", mode: "no-cors" });
        } catch {
          invalid.push(b);
        }
      }
      done++;
      try {
        await browser.runtime.sendMessage({ action: "checkProgress", current: done, total });
      } catch {}
    }
    if (invalid.length) {
      let folder = (await browser.bookmarks.search({ title: "失效链接" }))[0];
      if (!folder) {
        folder = await browser.bookmarks.create({ title: "失效链接", parentId: "1" });
      }
      for (const b of invalid) {
        try {
          await browser.bookmarks.move(b.id, { parentId: folder.id });
        } catch (e) {
          console.error("Error moving invalid bookmark:", e);
        }
      }
      const settings = await getSettings();
      if (settings.enableNotifications !== false) {
        await pushToast({
          type: "info",
          title: t("bg_invalid_title"),
          message: t("bg_invalid_msg", [String(invalid.length)]),
        });
      }
    }
    return { success: true, count: invalid.length };
  } catch (e: any) {
    console.error("Error checking invalid bookmarks:", e);
    return { success: false, error: e?.message ?? String(e) };
  }
}

export default defineBackground(() => {
  const shareTexts = new Map<string, string>();
  const iconUrl = (chrome as any)?.runtime?.getURL?.("icons/icon128.png") || "icons/icon128.png";
  browser.notifications?.onButtonClicked?.addListener(async (nid: string, idx: number) => {
    if (idx !== 0) return;
    const text = shareTexts.get(nid);
    if (!text) return;
    try {
      await (navigator.clipboard as any)?.writeText?.(text);
      try {
        await browser.notifications.clear(nid);
      } catch {}
      await browser.notifications.create(`rm-share-ok-${Math.random().toString(36).slice(2)}`, {
        type: "basic",
        title: "已复制更佳文案",
        message: "请在 X 发帖框粘贴替换",
        iconUrl,
        priority: 2,
      } as any);
    } catch {
      await browser.notifications.create(`rm-share-copy-failed-${Math.random().toString(36).slice(2)}`, {
        type: "basic",
        title: "复制失败",
        message: "请手动复制通知中的文案",
        iconUrl,
        priority: 2,
      } as any);
    }
  });
  // 书签创建事件：自动分类与通知
  browser.bookmarks.onCreated?.addListener(async (id: string, bookmark: any) => {
    try {
      const settings = await getSettings();
      if (settings.autoClassify && bookmark.url) {
        // 用户规则优先
        let userCat =
          applyUserRules(settings.userClassificationRules ?? [], bookmark.title, bookmark.url) ?? undefined;
        // 服务端 AI 分类
        if (!userCat) {
          try {
            const base = settings.serverUrl || "http://localhost:5175";
            const resp = await fetch(`${base}/classify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: bookmark.title,
                url: bookmark.url,
                provider: settings.aiProvider,
                apiKey: settings.aiApiKey,
                apiUrl: settings.aiApiUrl,
                model: settings.aiModel,
              }),
            });
            const data = await resp.json();
            userCat = (data?.category as string) || undefined;
          } catch {
            // ignore and fallback
          }
        }
        // 回退本地分类
        const finalCat = userCat ?? classifyBookmark(bookmark.title, bookmark.url);
        const folderId = await getCategoryFolderId(finalCat || settings.defaultCategory || "其他");
        await browser.bookmarks.move(id, { parentId: folderId });
        if (settings.enableNotifications !== false) {
          await pushToast({
            type: "success",
            title: t("bg_classify_title"),
            message: t("bg_classify_msg", [String(bookmark.title || ""), String(finalCat || "")]),
          });
        }
      }
    } catch (e) {
      console.error("Error processing bookmark creation:", e);
    }
  });

  // 消息路由
  browser.runtime.onMessage?.addListener((req: any) => {
    switch (req.action) {
      case "getRecommendations":
        return getRecommendations();
      case "checkInvalidBookmarks":
        return checkInvalidBookmarksNow();
      case "getAllBookmarks":
        return getAllBookmarks();
      case "getSettings":
        return getSettings();
      case "setSettings":
        return (async () => {
          await setSettings(req.payload || {});
          return { success: true };
        })();
      case "shareSummarize":
        return (async () => {
          try {
            const payload = req.payload || {};
            const title = String(payload.title || "");
            const url = String(payload.url || "");
            const lang = (payload.lang as "zh" | "en") || "zh";
            const s = await getSettings();
            const base = s.serverUrl || "http://localhost:5175";
            const nid = `rm-share-${Math.random().toString(36).slice(2)}`;
            await browser.notifications.create(nid, {
              type: "basic",
              title: "正在生成更佳文案…",
              message: "打开 X 后稍等片刻，生成完成可复制",
              iconUrl,
              priority: 2,
            } as any);
            try {
              const resp = await fetch(`${base}/share/summarize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url,
                  title,
                  provider: s.aiProvider,
                  apiKey: s.aiApiKey,
                  apiUrl: s.aiApiUrl,
                  model: s.aiModel,
                  lang,
                }),
              });
              if (resp.ok) {
                const data = await resp.json();
                let text = `${title.slice(0, 120)}`;
                let tags: string[] = lang === "en" ? ["#RainMarkExtension", "#Bookmarks"] : ["#RainMark插件", "#书签"];
                if (data?.text) text = `🔖 ${String(data.text).trim()}`;
                if (Array.isArray(data?.tags) && data.tags.length) tags = data.tags.slice(0, 4);
                const suffix = `${(browser as any)?.i18n?.getMessage?.("share_suffix_source") || "来源"} ${tags.join(" ")}`.trim();
                const composed = `${text}\n${suffix}\n${url}`.trim();
                shareTexts.set(nid, composed);
                try {
                  await browser.notifications.clear(nid);
                } catch {}
                await browser.notifications.create(nid, {
                  type: "basic",
                  title: "文案已生成",
                  message: "点击“复制”按钮复制到剪贴板",
                  iconUrl,
                  buttons: [{ title: "复制" }],
                  priority: 2,
                } as any);
              } else {
                try {
                  await browser.notifications.clear(nid);
                } catch {}
                await browser.notifications.create(`rm-share-failed-${Math.random().toString(36).slice(2)}`, {
                  type: "basic",
                  title: "生成失败",
                  message: "已使用默认文案打开 X",
                  iconUrl,
                  priority: 2,
                } as any);
              }
            } catch {
              try {
                await browser.notifications.clear(nid);
              } catch {}
              await browser.notifications.create(`rm-share-error-${Math.random().toString(36).slice(2)}`, {
                type: "basic",
                title: "生成失败",
                message: "已使用默认文案打开 X",
                iconUrl,
                priority: 2,
              } as any);
            }
            return { success: true };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        })();
      case "ping":
        return { status: "ok", version: "1.0.0" };
      default:
        return { error: "Unknown action" };
    }
  });

  // 安装/更新时初始化
  browser.runtime.onInstalled?.addListener(async () => {
    await setSettings({
      autoClassify: true,
      enableNotifications: true,
      enableRecommendations: true,
      checkInvalidBookmarks: true,
      checkFrequency: "60",
      autoCleanDuplicates: false,
      defaultCategory: "其他",
    });
    if (browser.alarms?.create && browser.alarms?.onAlarm?.addListener) {
      browser.alarms.create("checkInvalidBookmarks", { periodInMinutes: 60 });
      browser.alarms.onAlarm.addListener(async (alarm: any) => {
        if (alarm.name === "checkInvalidBookmarks") {
          const s = await getSettings();
          if (s.checkInvalidBookmarks !== false) {
            await checkInvalidBookmarksNow();
          }
        }
      });
    }
  });
});

console.log("RainMark background (WXT) ready.");
