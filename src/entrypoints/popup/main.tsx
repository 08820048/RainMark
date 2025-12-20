/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useMemo, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { getAllBookmarks, extractKeywords, jaccardSimilarity } from "@shared/bookmarks";
import { browser } from "wxt/browser";
import { toast } from "@shared/ui/toast";
import "@shared/ui/theme.css";
import { Trash2, Unlink, Settings, LayoutGrid, Cpu, Sparkles, Link as LinkIcon, Palette, Star } from "lucide-react";

type TabKey = "recommendations" | "bookmarks" | "stats";

/**
 * 获取本地化文案
 */
function t(id: string, args?: Array<string | number>) {
  try {
    const msg = chrome?.i18n?.getMessage?.(id, args ?? []);
    if (msg) return msg;
  } catch {}
  return id;
}

/**
 * 检测用户界面语言（归一化为 zh/en）
 */
function detectLang(): "zh" | "en" {
  try {
    const ui = String(chrome?.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
    if (ui.startsWith("zh")) return "zh";
  } catch {}
  return "en";
}
/**
 * Popup 主组件
 */
function PopupApp() {
  const [tab, setTab] = useState<TabKey>("recommendations");
  const [search, setSearch] = useState("");
  const [bookmarks, setBookmarks] = useState<
    Array<{ id: string; title: string; url: string; dateAdded?: number; parentId?: string }>
  >([]);
  const [recs, setRecs] = useState<
    Array<{ id: string; title: string; url: string; score: number; source?: "AI" | "Local" }>
  >([]);
  const [currentPage, setCurrentPage] = useState<{ title: string; url: string } | null>(null);
  const [stats, setStats] = useState({ total: 0, categories: 0, duplicates: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [recMode, setRecMode] = useState<"local" | "ai">("local");
  const [checkingInvalid, setCheckingInvalid] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [checkResult, setCheckResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);
  const [openMenu, setOpenMenu] = useState<{ list: "recs" | "bookmarks" | "current" | "query"; id: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; title: string; url: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [recent, setRecent] = useState<
    Array<{ id: string; title: string; url: string; lastVisitTime: number; visitCount?: number }>
  >([]);
  const [queryRecs, setQueryRecs] = useState<
    Array<{ id: string; title: string; url: string; score: number; source?: "AI" | "Local" }>
  >([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryLoadingText, setQueryLoadingText] = useState("");
  const ACCENTS = [
    "rgba(0, 186, 189, 1)",   // cyan (default)
    "rgba(59, 130, 246, 1)",  // blue
    "rgba(139, 92, 246, 1)",  // purple
    "rgba(16, 185, 129, 1)",  // green
    "rgba(245, 158, 11, 1)",  // orange
    "rgba(239, 68, 68, 1)",   // red
  ];
  const [accentIdx, setAccentIdx] = useState(0);
  const sseAbortRef = useRef<AbortController | null>(null);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);

  function applyThemeBorder() {
    try {
      const el = document.body;
      el.style.border = "2px solid var(--rm-primary)";
      el.style.borderRadius = "12px";
      el.style.margin = "0";
      el.style.boxSizing = "border-box";
      el.style.minHeight = "100vh";
      const html = document.documentElement;
      html.style.margin = "0";
      html.style.boxSizing = "border-box";
    } catch {}
  }

  /**
   * 基于查询字符串的本地推荐（Jaccard）
   */
  function computeLocalQueryRecommendations(
    query: string,
    candidates: Array<{ id: string; title: string; url: string }>
  ): Array<{ id: string; title: string; url: string; score: number; source: "Local" }> {
    const qKeywords = extractKeywords(String(query || ""));
    const scored = candidates
      .map((b) => {
        const ks = extractKeywords(`${b.title} ${b.url}`);
        const base = jaccardSimilarity(qKeywords, ks);
        const text = (b.title + " " + b.url).toLowerCase();
        const hits = qKeywords.length ? qKeywords.filter((t) => text.includes(t)).length : 0;
        const boost = qKeywords.length ? (hits / qKeywords.length) * 0.2 : 0;
        const s = base + boost;
        return { id: b.id, title: b.title, url: b.url, score: s, source: "Local" as const };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 5);
  }

  /**
   * 基于搜索需求的流式推荐（书签页）
   */
  async function loadQueryRecommendationsStream() {
    try {
      const qInput = search.trim();
      if (!qInput) {
        setQueryRecs([]);
        setQueryLoading(false);
        setQueryLoadingText("");
        return;
      }
      setQueryRecs([]);
      setQueryLoading(true);
      setQueryLoadingText(t("loading_generating"));
      const settings = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
      });
      const mode = settings?.recommendationMode || "auto";
      const useAI = mode === "ai" || (mode === "auto" && !!settings?.aiApiKey);
      const server = settings?.serverUrl || "http://localhost:5175";
      const allCandidates = await getAllBookmarks();
      const body: any = {
        query: qInput,
        candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
        limit: 5,
      };
      if (useAI) {
        body.provider = settings?.aiProvider;
        body.apiKey = settings?.aiApiKey;
        body.apiUrl = settings?.aiApiUrl;
        body.model = settings?.aiModel;
      }
      try {
        sseAbortRef.current?.abort();
      } catch {}
      const ac = new AbortController();
      sseAbortRef.current = ac;
      const resp = await fetch(`${server}/recommend/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        setServerConnected(false);
        // 回退一次性推荐
        const once = await fetch(`${server}/recommend/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await once.json();
        const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
        if (Array.isArray(recs) && recs.length) {
          setQueryRecs(recs.map((r) => ({ ...r, source: useAI ? "AI" : "Local" })));
        } else {
          setQueryRecs(computeLocalQueryRecommendations(qInput, allCandidates));
        }
        setQueryLoading(false);
        setQueryLoadingText("");
        return;
      }
      setServerConnected(true);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let qReceivedAny = false;
      const handleEvent = (event: string, data: any) => {
        if (event === "mode") {
          setQueryLoadingText(data?.mode === "AI" ? t("loading_ai_generating") : t("loading_generating"));
        } else if (event === "reset") {
          setQueryRecs([]);
        } else if (event === "item") {
          qReceivedAny = true;
          setQueryRecs((prev) => [...prev, data]);
        } else if (event === "done") {
          setQueryLoading(false);
          setQueryLoadingText("");
          if (!qReceivedAny) {
            setQueryRecs(computeLocalQueryRecommendations(qInput, allCandidates));
          }
        } else if (event === "error") {
          const msg = typeof data?.error === "string" ? data.error : t("alert_ai_failed");
          toast.error(msg);
          setQueryLoading(false);
          setQueryLoadingText("");
          setServerConnected(false);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let event = "message";
          let data: any = null;
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) {
              try {
                data = JSON.parse(line.slice(5).trim());
              } catch {
                data = null;
              }
            }
          }
          handleEvent(event, data);
        }
      }
    } catch (e) {
      try {
        const qInput = search.trim();
        if (!qInput) {
          setQueryRecs([]);
          return;
        }
        const settings = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
        });
        const server = settings?.serverUrl || "http://localhost:5175";
        const allCandidates = await getAllBookmarks();
        const once = await fetch(`${server}/recommend/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: qInput,
            candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
            limit: 5,
          }),
        });
        const data = await once.json();
        const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
        if (Array.isArray(recs) && recs.length) {
          setQueryRecs(recs);
        } else {
          setQueryRecs(computeLocalQueryRecommendations(qInput, allCandidates));
        }
      } catch (err) {
        console.error("query recommend fallback failed:", err);
        try {
          const qInput = search.trim();
          const allCandidates = await getAllBookmarks();
          setQueryRecs(computeLocalQueryRecommendations(qInput, allCandidates));
        } catch {
          setQueryRecs([]);
        }
      } finally {
        setQueryLoading(false);
        setQueryLoadingText("");
      }
    }
  }

  /**
   * 加载全部书签并计算统计信息
   */
  async function loadAll() {
    const all = await getAllBookmarks();
    setBookmarks(all);
    const total = all.length;
    const categories = new Set(all.map((b) => b.parentId)).size;
    const urlMap = new Map<string, boolean>();
    let dups = 0;
    for (const b of all) {
      if (urlMap.has(b.url)) dups++;
      else urlMap.set(b.url, true);
    }
    setStats({ total, categories, duplicates: dups });
  }

  /**
   * 加载流式推荐列表（根据设置决定使用本地或AI）
   */
  async function loadRecommendationsStream() {
    try {
      setRecs([]);
      setLoading(true);
      setLoadingText(t("loading_generating"));
      const settings = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
      });
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      setCurrentPage({ title: activeTab?.title || "", url: activeTab?.url || "" });
      const mode = settings?.recommendationMode || "auto";
      const useAI = mode === "ai" || (mode === "auto" && !!settings?.aiApiKey);
      setRecMode(useAI ? "ai" : "local");
      const server = settings?.serverUrl || "http://localhost:5175";
      const qInput = search.trim();
      const isQuery = qInput.length > 0;
      const allCandidates = await getAllBookmarks();
      const body: any = isQuery
        ? {
            query: qInput,
            candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
            limit: 5,
          }
        : {
            current: { title: activeTab?.title || "", url: activeTab?.url || "" },
            candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
            limit: 5,
          };
      if (useAI) {
        body.provider = settings?.aiProvider;
        body.apiKey = settings?.aiApiKey;
        body.apiUrl = settings?.aiApiUrl;
        body.model = settings?.aiModel;
      }
      // 取消上一次流式请求，避免并发
      try {
        sseAbortRef.current?.abort();
      } catch {}
      const ac = new AbortController();
      sseAbortRef.current = ac;
      const endpoint = isQuery ? "/recommend/query/stream" : "/recommend/stream";
      const resp = await fetch(`${server}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        if (isQuery) {
          // 回退：非流式查询推荐
          try {
            const once = await fetch(`${server}/recommend/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await once.json();
            const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
            if (Array.isArray(recs) && recs.length) {
              setRecs(recs);
            } else {
              setRecs(computeLocalQueryRecommendations(qInput, allCandidates));
            }
          } catch {
            setRecs(computeLocalQueryRecommendations(qInput, allCandidates));
          } finally {
            setLoading(false);
            setLoadingText("");
          }
          return;
        } else {
          // 回退优先尝试一次性服务端推荐（当前页）
          try {
            const once = await fetch(`${server}/recommend`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await once.json();
            const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
            if (Array.isArray(recs)) {
              setRecs(recs);
              setServerConnected(true);
              setLoading(false);
              setLoadingText("");
              return;
            }
          } catch {}
          // 再回退到后台一次性推荐
          try {
            const fallback = await new Promise<any>((resolve, reject) => {
              chrome.runtime.sendMessage({ action: "getRecommendations" }, (res: any) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(res);
              });
            });
            setRecs(fallback ?? []);
            setServerConnected(false);
          } catch {}
          setLoading(false);
          setLoadingText("");
          return;
        }
      }
      setServerConnected(true);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedAny = false;
      const handleEvent = (event: string, data: any) => {
        if (event === "mode") {
          setLoadingText(data?.mode === "AI" ? t("loading_ai_generating") : t("loading_generating"));
        } else if (event === "reset") {
          setRecs([]);
        } else if (event === "item") {
          receivedAny = true;
          setRecs((prev) => [...prev, data]);
        } else if (event === "done") {
          setLoading(false);
          setLoadingText("");
          if (!receivedAny) {
            if (isQuery) {
              setRecs(computeLocalQueryRecommendations(qInput, allCandidates));
            } else {
              setRecs(
                allCandidates
                  .slice(0, 5)
                  .map((b) => ({ id: b.id, title: b.title, url: b.url, score: 0, source: "Local" as const })),
              );
            }
          }
        } else if (event === "error") {
          const msg = typeof data?.error === "string" ? data.error : t("alert_ai_failed");
          toast.error(msg);
          setLoading(false);
          setLoadingText("");
          setServerConnected(false);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let event = "message";
          let data: any = null;
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) {
              try {
                data = JSON.parse(line.slice(5).trim());
              } catch {
                data = null;
              }
            }
          }
          handleEvent(event, data);
        }
      }
    } catch (e) {
      // 流式失败回退一次性推荐
      try {
        const qInput = search.trim();
        const isQuery = qInput.length > 0;
        const settings = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
        });
        const server = settings?.serverUrl || "http://localhost:5175";
        const allCandidates = await getAllBookmarks();
        if (isQuery) {
          try {
            const once = await fetch(`${server}/recommend/query`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: qInput,
                candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
                limit: 5,
              }),
            });
            const data = await once.json();
            const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
            if (Array.isArray(recs) && recs.length) {
              setRecs(recs);
            } else {
              setRecs(computeLocalQueryRecommendations(qInput, allCandidates));
            }
          } catch {
            setRecs(computeLocalQueryRecommendations(qInput, allCandidates));
          }
        } else {
          // 先尝试一次性服务端推荐
          try {
            const tabs2 = await browser.tabs.query({ active: true, currentWindow: true });
            const t2 = tabs2[0];
            const once = await fetch(`${server}/recommend`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                current: { title: t2?.title || "", url: t2?.url || "" },
                candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
                limit: 5,
              }),
            });
            const data = await once.json();
            const recs = (data?.recommendations ?? []) as Array<{ id: string; title: string; url: string; score: number }>;
            if (Array.isArray(recs) && recs.length) {
              setRecs(recs);
            } else {
              // 最后回退到后台推荐
              const fallback = await new Promise<any>((resolve, reject) => {
                chrome.runtime.sendMessage({ action: "getRecommendations" }, (res: any) => {
                  if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                  else resolve(res);
                });
              });
              setRecs(fallback ?? []);
            }
          } catch {
            const fallback = await new Promise<any>((resolve, reject) => {
              chrome.runtime.sendMessage({ action: "getRecommendations" }, (res: any) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(res);
              });
            });
            setRecs(fallback ?? []);
          }
        }
      } catch (err) {
        console.error("recommend stream fallback failed:", err);
      } finally {
        setLoading(false);
        setLoadingText("");
        console.error("recommend stream failed:", e);
        setServerConnected(false);
      }
    }
  }

  /**
   * 搜索框输入变化时，触发基于查询的推荐（带去抖）
   */
  useEffect(() => {
    if (tab !== "recommendations") return;
    const h = setTimeout(() => {
      loadRecommendationsStream();
    }, 420);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /**
   * 书签页：搜索变化时触发查询推荐（带去抖）
   */
  useEffect(() => {
    if (tab !== "bookmarks") return;
    const h = setTimeout(() => {
      loadQueryRecommendationsStream();
    }, 420);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab]);

  /**
   * 复制书签标题与URL到剪贴板
   */
  async function copyBookmark(title: string, url: string) {
    try {
      const text = `${title || ""}\n${url || ""}`.trim();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("alert_copied"));
      setOpenMenu(null);
    } catch (e) {
      console.error("copy failed:", e);
      toast.error(String(e));
    }
  }


  /**
   * 切换推荐模式并立即刷新列表
   */
  async function toggleRecommendationMode(next: "local" | "ai") {
    if (next === "ai") {
      const settings = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
      });
      const hasKey = typeof settings?.aiApiKey === "string" && settings.aiApiKey.trim().length > 0;
      if (!hasKey) {
        toast.error(t("alert_no_ai_config"));
        return;
      }
    }
    setRecMode(next);
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(
        { action: "setSettings", payload: { recommendationMode: next } },
        () => resolve(),
      );
    });
    await loadRecommendationsStream();
  }

  /**
   * 打开或关闭某条目的菜单
   */
  function toggleMenu(list: "recs" | "bookmarks" | "query", id: string) {
    setOpenMenu((prev) => (prev && prev.id === id && prev.list === list ? null : { list, id }));
  }

  /**
   * 监听全局点击：当点到非菜单区域时自动关闭“更多”菜单
   */
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      try {
        if (!openMenu) return;
        const el = e.target as HTMLElement | null;
        if (!el) return;
        // 保留菜单内部与触发按钮的点击；其他区域点击关闭菜单
        if (el.closest(".menu") || el.closest(".menu-btn")) return;
        setOpenMenu(null);
      } catch {}
    }
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
    };
  }, [openMenu]);

  /**
   * 移除书签
   */
  async function removeBookmark(id: string) {
    try {
      await new Promise<void>((resolve) => chrome.bookmarks.remove(id, () => resolve()));
    } catch (e) {
      console.error("remove bookmark failed:", e);
    } finally {
      setOpenMenu(null);
      await loadAll();
      await loadRecommendationsStream();
    }
  }

  /**
   * 打开编辑对话框
   */
  async function openEdit(id: string, title: string, url: string) {
    setEditTarget({ id, title, url });
    setEditTitle(title || "");
    setEditUrl(url || "");
    setOpenMenu(null);
  }

  /**
   * 保存编辑（更新标题；若URL变更则重建书签）
   */
  async function saveEdit() {
    if (!editTarget) return;
    try {
      const nodes = await browser.bookmarks.get(editTarget.id);
      const node = nodes?.[0];
      const parentId = (node as any)?.parentId || undefined;
      if (editUrl && editUrl !== node?.url) {
        // URL 变更：删除并重建
        try {
          await new Promise<void>((resolve) => chrome.bookmarks.remove(editTarget.id, () => resolve()));
        } catch {}
        if (parentId) {
          await browser.bookmarks.create({ title: editTitle || "", url: editUrl, parentId });
        } else {
          await browser.bookmarks.create({ title: editTitle || "", url: editUrl });
        }
      } else {
        // 仅更新标题
        await new Promise<void>((resolve) =>
          chrome.bookmarks.update(editTarget.id, { title: editTitle || "" }, () => resolve()),
        );
      }
    } catch (e) {
      console.error("save edit failed:", e);
    } finally {
      setEditTarget(null);
      await loadAll();
      await loadRecommendationsStream();
    }
  }

  /**
   * 分享到 X（Twitter）：使用 AI 生成简短功能描述，英文来源 + 标签
   */
  async function shareToX(title: string, url: string) {
    const lang: "zh" | "en" = detectLang();
    const baseText = `${t("share_fallback_prefix")}${(title || "").slice(0, 120)}`;
    const baseTags = lang === "en" ? ["#RainMarkExtension", "#Bookmarks"] : ["#RainMark插件", "#书签"];
    const baseSuffix = `${t("share_suffix_source")} ${baseTags.join(" ")}`.trim();
    const baseUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${baseText}\n${baseSuffix}`)}&url=${encodeURIComponent(
      url || "",
    )}`;
    try {
      chrome.runtime.sendMessage?.({ action: "shareSummarize", payload: { title, url, lang } });
    } catch {}
    window.open(baseUrl, "_blank");
    setOpenMenu(null);
  }
  /**
   * 监听后台进度消息并更新界面
   */
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.action === "checkProgress") {
        const c = Number(msg.current || 0);
        const t = Number(msg.total || 0);
        setCheckProgress({ current: c, total: t });
      } else if (msg?.action === "toast" && msg?.payload) {
        const p = msg.payload || {};
        const type = p.type || "info";
        const title = p.title || "";
        const message = p.message || "";
        if (type === "success") toast.success(message, title);
        else if (type === "warning") toast.warning(message, title);
        else if (type === "error") toast.error(message, title);
        else toast.info(message, title);
      }
    };
    chrome.runtime.onMessage?.addListener(handler);
    return () => {
      try {
        chrome.runtime.onMessage?.removeListener(handler);
      } catch {}
    };
  }, []);

  useEffect(() => {
    (async () => {
      await loadAll();
      await loadRecommendationsStream();
      try {
        const settings = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
        });
        const col = settings?.themeAccent || ACCENTS[0];
        const idx = Math.max(0, ACCENTS.findIndex((c) => c === col));
        setAccentIdx(idx === -1 ? 0 : idx);
        document.documentElement.style.setProperty("--rm-accent", col);
        document.documentElement.style.setProperty("--rm-primary", col);
        document.documentElement.style.setProperty("--rm-accent-hover", col);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (b: { title: string; url: string }) => (b.title + " " + b.url).toLowerCase().includes(q),
    );
  }, [bookmarks, search]);

  function cycleAccent() {
    const nextIdx = (accentIdx + 1) % ACCENTS.length;
    const nextColor = ACCENTS[nextIdx];
    setAccentIdx(nextIdx);
    document.documentElement.style.setProperty("--rm-accent", nextColor);
    document.documentElement.style.setProperty("--rm-primary", nextColor);
    document.documentElement.style.setProperty("--rm-accent-hover", nextColor);
    chrome.runtime.sendMessage?.({ action: "setSettings", payload: { themeAccent: nextColor } });
  }

  /**
   * 加载最近使用的书签（基于浏览历史与现有书签URL匹配）
   */
  async function loadRecentBookmarks() {
    try {
      const start = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const historyItems = await browser.history.search({ text: "", startTime: start, maxResults: 300 });
      const norm = (u: string) => {
        try {
          const url = new URL(u);
          url.hash = "";
          return url.toString().replace(/\/$/, "");
        } catch {
          return String(u || "").replace(/\/$/, "");
        }
      };
      const bmMap = new Map<string, { id: string; title: string; url: string }>();
      for (const b of bookmarks) {
        if (!b.url) continue;
        bmMap.set(norm(b.url), { id: b.id, title: b.title, url: b.url });
      }
      const agg = new Map<string, { id: string; title: string; url: string; lastVisitTime: number; visitCount?: number }>();
      for (const h of historyItems) {
        const key = norm(h.url || "");
        const match = bmMap.get(key);
        if (!match) continue;
        const prev = agg.get(key);
        const last = Number(h.lastVisitTime || 0);
        const count = (h as any)?.visitCount;
        if (!prev || last > prev.lastVisitTime) {
          agg.set(key, { id: match.id, title: match.title, url: match.url, lastVisitTime: last, visitCount: count });
        }
      }
      const list = [...agg.values()].sort((a, b) => b.lastVisitTime - a.lastVisitTime).slice(0, 12);
      setRecent(list);
    } catch (e) {
      console.error("loadRecentBookmarks failed:", e);
      setRecent([]);
    }
  }

  /**
   * 切换到统计页时加载最近使用记录
   */
  useEffect(() => {
    if (tab === "stats") {
      loadRecentBookmarks();
    }
  }, [tab, bookmarks]);

  /**
   * 清理重复书签
   */
  async function cleanDuplicates() {
    const urlMap = new Map<string, string>();
    const dupIds: string[] = [];
    for (const b of bookmarks) {
      if (urlMap.has(b.url)) dupIds.push(b.id);
      else urlMap.set(b.url, b.id);
    }
    await Promise.all(
      dupIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            chrome.bookmarks.remove(id, () => resolve());
          }),
      ),
    );
    await loadAll();
    toast.success(t("alert_clean_done", [dupIds.length]));
  }

  /**
   * 触发后台失效链接检查
   */
  async function checkInvalid() {
    setCheckingInvalid(true);
    setCheckProgress({ current: 0, total: 0 });
    const res = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ action: "checkInvalidBookmarks" }, (r: any) => resolve(r));
    });
    setCheckingInvalid(false);
    setCheckResult(res || { success: false, count: 0 });
    await loadAll();
  }

  /**
   * 构建文件夹映射表（folderId -> folderTitle）
   */
  async function buildFolderMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const tree = await browser.bookmarks.getTree();
      function walk(node: any) {
        if (!node.url) {
          map.set(node.id, node.title || "");
        }
        if (node.children) node.children.forEach(walk);
      }
      walk(tree[0]);
    } catch {}
    return map;
  }

  /**
   * 查找当前页面是否已在书签中（按规范化 URL 比较）
   */
  function findBookmarkByUrl(url: string): { id: string; title: string; url: string } | null {
    const norm = (u: string) => {
      try {
        const x = new URL(u);
        x.hash = "";
        return x.toString().replace(/\/$/, "");
      } catch {
        return String(u || "").replace(/\/$/, "");
      }
    };
    const key = norm(url || "");
    for (const b of bookmarks) {
      if (norm(b.url) === key) return { id: b.id, title: b.title, url: b.url };
    }
    return null;
  }

  /**
   * 将当前页面添加到书签（默认分类/文件夹）
   */
  async function addCurrentPageToBookmarks() {
    if (!currentPage || !currentPage.url) return;
    try {
      const settings = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
      });
      const cat = settings?.defaultCategory || "其他";
      let parentId: string | undefined;
      if (cat) {
        try {
          parentId = await ensureFolder(cat);
        } catch {}
      }
      await browser.bookmarks.create(
        parentId
          ? { title: currentPage.title || currentPage.url, url: currentPage.url, parentId }
          : { title: currentPage.title || currentPage.url, url: currentPage.url },
      );
      toast.success(t("alert_added") || "已添加到书签");
      await loadAll();
      await loadRecommendationsStream();
    } catch (e) {
      toast.error(String(e));
    }
  }

  /**
   * 确保存在指定名称的文件夹并返回其ID（位于书签栏下）
   */
  async function ensureFolder(name: string): Promise<string> {
    try {
      const tree = await browser.bookmarks.getTree();
      const bar = tree?.[0]?.children?.[0];
      if (!bar) return "1";
      let folder = bar.children?.find((n: any) => !n.url && n.title === name);
      if (!folder) {
        folder = await browser.bookmarks.create({ title: name, parentId: bar.id });
      }
      return folder.id;
    } catch {
      return "1";
    }
  }

  /**
   * 导出书签为 JSON 文件（包含类别名）
   */
  async function exportBookmarks() {
    try {
      const all = await getAllBookmarks();
      const folderMap = await buildFolderMap();
      const payload = all.map((b) => ({
        title: b.title,
        url: b.url,
        category: b.parentId ? folderMap.get(b.parentId) || "" : "",
      }));
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rainmark-bookmarks.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("alert_export_success"));
    } catch (e) {
      toast.error(t("alert_export_failed", [String(e)]));
    }
  }

  /**
   * 导入 JSON 书签，支持 {title,url} 或 {title,url,category}
   */
  async function importBookmarks() {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        let data: Array<{ title: string; url: string; category?: string; folder?: string }> = [];
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) data = parsed as any;
          else throw new Error("Invalid JSON structure");
        } catch (err) {
          throw new Error("JSON parse error");
        }
        const settings = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
        });
        let count = 0;
        for (const item of data) {
          const title = item.title || "";
          const url = item.url || "";
          if (!url) continue;
          const cat = item.category || item.folder || settings?.defaultCategory || "其他";
          let parentId: string | undefined;
          if (cat) {
            try {
              parentId = await ensureFolder(cat);
            } catch {}
          }
          await browser.bookmarks.create(parentId ? { title, url, parentId } : { title, url });
          count++;
        }
        await loadAll();
        toast.success(t("alert_import_success", [count]));
      };
      input.click();
    } catch (e) {
      toast.error(t("alert_import_failed", [String(e)]));
    }
  }

  return (
    <>
    <div className="rm-app rm-container" style={{ padding: 12 }}>
      <div className="toolbar">
        <button className={`tab-btn ${tab === "recommendations" ? "active" : ""}`} onClick={() => setTab("recommendations")}>
          {t("tab_recommendations")}
        </button>
        <button className={`tab-btn ${tab === "bookmarks" ? "active" : ""}`} onClick={() => setTab("bookmarks")}>
          {t("tab_bookmarks")}
        </button>
        <button className={`tab-btn ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>
          {t("tab_stats")}
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => {
              try {
                const url = chrome?.runtime?.getURL?.("manage.html");
                if (url) chrome.tabs?.create?.({ url });
              } catch {}
            }}
            aria-label={t("btn_manage")}
            title={t("btn_manage")}
            style={{ border: "none", background: "transparent", padding: 4, cursor: "pointer", color: "var(--rm-muted)" }}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={cycleAccent}
            aria-label={t("btn_theme")}
            title={t("btn_theme")}
            style={{ border: "none", background: "transparent", padding: 4, cursor: "pointer", color: "var(--rm-muted)" }}
          >
            <Palette size={16} />
          </button>
        </div>
      </div>

      {tab === "recommendations" && (
        <div>
          <input
            className="search"
            placeholder={t("search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "calc(100% - 32px)",
              maxWidth: 360,
              display: "block",
              margin: "12px auto",
              padding: "10px 14px",
              border: "1.5px solid var(--rm-primary, rgba(0, 186, 189, 1))",
              borderRadius: 999,
              background: "var(--rm-surface)",
              color: "var(--rm-text)",
              boxSizing: "border-box",
              WebkitAppearance: "none",
              appearance: "none",
            }}
          />
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>{t("section_recommend")}</h3>
              <div className="segmented" title="推荐方式">
                <span style={{ fontSize: 13, color: "var(--rm-muted)" }}>推荐方式</span>
                <button
                  onClick={() => toggleRecommendationMode("local")}
                  aria-label={t("seg_local")}
                  title={t("seg_local")}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 4,
                    cursor: "pointer",
                    color: recMode === "local" ? "var(--rm-primary)" : "var(--rm-muted)",
                  }}
                >
                  <Cpu size={16} />
                </button>
                <button
                  onClick={() => toggleRecommendationMode("ai")}
                  aria-label={t("seg_ai")}
                  title={t("seg_ai")}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 4,
                    cursor: "pointer",
                    color: recMode === "ai" ? "var(--rm-primary)" : "var(--rm-muted)",
                  }}
                >
                  <Sparkles size={16} />
                </button>
                <span style={{ fontSize: 12, color: serverConnected ? "#10b981" : "#ef4444", marginLeft: 8 }}>
                  {serverConnected === null ? "连接: 未知" : serverConnected ? "连接: 已连接" : "连接: 未连接"}
                </span>
                <span style={{ fontSize: 12, color: "var(--rm-muted)", marginLeft: 8 }}>
                  模式: {recMode === "ai" ? "AI" : "本地"}
                </span>
              </div>
            </div>
            {loading && <div className="loading-text">{loadingText}</div>}
            <ul className="list">
              {currentPage && (
                <li
                  className="hover-primary"
                  onClick={() => window.open(currentPage.url, "_blank")}
                  style={{
                    position: "relative",
                    zIndex: openMenu && openMenu.list === "current" ? 200 : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {currentPage.title || currentPage.url}
                    </strong>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {!findBookmarkByUrl(currentPage.url) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addCurrentPageToBookmarks();
                          }}
                          aria-label={t("btn_add_bookmark") || "添加到书签"}
                          title={t("btn_add_bookmark") || "添加到书签"}
                          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#111" }}
                        >
                          <Star size={16} />
                        </button>
                      )}
                      <button
                        className="menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu((prev) => (prev && prev.list === "current" ? null : { list: "current", id: "current" }));
                        }}
                        aria-label={t("menu_more_actions")}
                        title={t("menu_more_actions")}
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                  <small style={{ color: "#6b7280" }}>{currentPage.url}</small>
                  {openMenu && openMenu.list === "current" && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const match = findBookmarkByUrl(currentPage.url);
                        return (
                          <>
                            {match && (
                              <>
                                <div className="menu-item" onClick={() => removeBookmark(match.id)}>{t("menu_remove")}</div>
                                <div className="menu-item" onClick={() => openEdit(match.id, match.title, match.url)}>{t("menu_update")}</div>
                              </>
                            )}
                            <div className="menu-item" onClick={() => copyBookmark(currentPage.title || "", currentPage.url)}>{t("menu_copy")}</div>
                            <div className="menu-item" onClick={() => shareToX(currentPage.title || "", currentPage.url)}>{t("menu_share_x")}</div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </li>
              )}
              {recs.length === 0 && !loading && (
                <li>
                  {bookmarks.length === 0 ? (t("no_bookmarks") + "，点击五角星可添加当前页") : t("no_recommendations")}
                </li>
              )}
              {recs.map((b, i) => (
                <li
                  className="hover-primary"
                  key={b.id}
                  onClick={() => window.open(b.url, "_blank")}
                  style={{
                    opacity: 0,
                    transform: "translateY(8px)",
                    animation: "fadeInUp 240ms ease-out forwards",
                    animationDelay: `${Math.min(i, 8) * 60}ms`,
                    position: "relative",
                    zIndex: openMenu && openMenu.list === "recs" && openMenu.id === b.id ? 200 : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.title}
                    </strong>
                    {b.source && (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          fontSize: 12,
                          background: b.source === "AI" ? "#10b981" : "#9ca3af",
                          color: "#fff",
                          marginLeft: 8,
                        }}
                      >
                        {b.source === "AI" ? t("label_ai_recommend") : t("label_local_recommend")}
                      </span>
                    )}
                    <div style={{ marginLeft: 8 }}>
                      <button
                        className="menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu("recs", b.id);
                        }}
                        aria-label={t("menu_more_actions")}
                        title={t("menu_more_actions")}
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                  <small style={{ color: "#6b7280" }}>{b.url}</small>
                  {openMenu && openMenu.list === "recs" && openMenu.id === b.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <div className="menu-item" onClick={() => removeBookmark(b.id)}>{t("menu_remove")}</div>
                      <div className="menu-item" onClick={() => openEdit(b.id, b.title, b.url)}>{t("menu_update")}</div>
                      <div className="menu-item" onClick={() => copyBookmark(b.title, b.url)}>{t("menu_copy")}</div>
                      <div className="menu-item" onClick={() => shareToX(b.title, b.url)}>{t("menu_share_x")}</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="toolbar">
            <button className="btn icon" onClick={cleanDuplicates}>
              <Trash2 size={16} />
              {t("btn_clean_duplicates")}
            </button>
            <button className="btn icon" disabled={checkingInvalid} onClick={checkInvalid}>
              <Unlink size={16} />
              {t("btn_check_invalid")}
            </button>
            <button
              className="btn icon"
              onClick={() => {
                try {
                  const url = chrome?.runtime?.getURL?.("options.html");
                  if (url) chrome.tabs?.create?.({ url });
                  else chrome.runtime.openOptionsPage?.();
                } catch {
                  chrome.runtime.openOptionsPage?.();
                }
              }}
            >
              <Settings size={16} />
              {t("btn_open_settings")}
            </button>
          </div>
          {checkingInvalid && (
            <div className="progress">
              <div className="progress-title">
                {t("progress_checking", [checkProgress.current, checkProgress.total || "?"])}
              </div>
              <div className="progress-line">
                <span style={{ width: `${checkProgress.total ? Math.round((checkProgress.current / checkProgress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "bookmarks" && (
        <div>
          <input
            className="search"
            placeholder={t("search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="list">
            {filtered.length === 0 && <li>{t("no_bookmarks")}</li>}
            {filtered.map((b) => (
              <li
                className="hover-primary"
                key={b.id}
                onClick={() => window.open(b.url, "_blank")}
                style={{
                  position: "relative",
                  zIndex: openMenu && openMenu.list === "bookmarks" && openMenu.id === b.id ? 200 : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{b.title}</strong>
                    <br />
                    <small>{b.url}</small>
                  </div>
                  <button
                    className="menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMenu("bookmarks", b.id);
                    }}
                    aria-label={t("menu_more_actions")}
                    title={t("menu_more_actions")}
                  >
                    ⋯
                  </button>
                </div>
                {openMenu && openMenu.list === "bookmarks" && openMenu.id === b.id && (
                  <div className="menu" onClick={(e) => e.stopPropagation()}>
                    <div className="menu-item" onClick={() => removeBookmark(b.id)}>{t("menu_remove")}</div>
                    <div className="menu-item" onClick={() => openEdit(b.id, b.title, b.url)}>{t("menu_update")}</div>
                    <div className="menu-item" onClick={() => copyBookmark(b.title, b.url)}>{t("menu_copy")}</div>
                    <div className="menu-item" onClick={() => shareToX(b.title, b.url)}>{t("menu_share_x")}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {search.trim().length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>{t("section_recommend")}</h3>
                {queryLoading && <div className="loading-text">{queryLoadingText}</div>}
              </div>
              <ul className="list">
                {queryRecs.length === 0 && !queryLoading && <li>{t("no_recommendations")}</li>}
                {queryRecs.map((b, i) => (
                  <li
                    className="hover-primary"
                    key={`q-${b.id}`}
                    onClick={() => window.open(b.url, "_blank")}
                    style={{
                      opacity: 0,
                      transform: "translateY(8px)",
                      animation: "fadeInUp 240ms ease-out forwards",
                      animationDelay: `${Math.min(i, 8) * 60}ms`,
                      position: "relative",
                      zIndex: openMenu && openMenu.list === "query" && openMenu.id === b.id ? 200 : undefined,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.title}
                      </strong>
                      {b.source && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 6,
                            fontSize: 12,
                            background: b.source === "AI" ? "#10b981" : "#9ca3af",
                            color: "#fff",
                            marginLeft: 8,
                          }}
                        >
                          {b.source === "AI" ? t("label_ai_recommend") : t("label_local_recommend")}
                        </span>
                      )}
                      <div style={{ marginLeft: 8 }}>
                        <button
                          className="menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMenu("query", b.id);
                          }}
                          aria-label={t("menu_more_actions")}
                          title={t("menu_more_actions")}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                    <small style={{ color: "#6b7280" }}>{b.url}</small>
                    {openMenu && openMenu.list === "query" && openMenu.id === b.id && (
                      <div className="menu" onClick={(e) => e.stopPropagation()}>
                        <div className="menu-item" onClick={() => removeBookmark(b.id)}>{t("menu_remove")}</div>
                        <div className="menu-item" onClick={() => openEdit(b.id, b.title, b.url)}>{t("menu_update")}</div>
                        <div className="menu-item" onClick={() => copyBookmark(b.title, b.url)}>{t("menu_copy")}</div>
                        <div className="menu-item" onClick={() => shareToX(b.title, b.url)}>{t("menu_share_x")}</div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div>
          <div className="stat">
            <div>
              <div>{t("stat_total_bookmarks")}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
            </div>
            <div>
              <div>{t("stat_categories")}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.categories}</div>
            </div>
            <div>
              <div>{t("stat_duplicates")}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.duplicates}</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("stat_recent_title")}</div>
            {recent.length === 0 && <div style={{ color: "var(--rm-muted)" }}>{t("stat_recent_empty")}</div>}
            {recent.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {recent.map((r) => (
                  <div
                    key={r.id + r.lastVisitTime}
                    className="hover-primary"
                    onClick={() => window.open(r.url, "_blank")}
                    style={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "center", gap: 8, cursor: "pointer" }}
                    title={`${r.title}\n${r.url}`}
                  >
                    <LinkIcon size={16} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.title}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <small style={{ color: "var(--rm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.url}
                        </small>
                        <small style={{ color: "var(--rm-muted)" }}>
                          {new Date(r.lastVisitTime).toLocaleString()}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    {checkResult && (
      <div className="modal-backdrop" onClick={() => setCheckResult(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{t("modal_check_done_title")}</div>
          <div className="modal-desc">
            {t("modal_check_done_desc", [checkResult.count ?? 0])}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setCheckResult(null)}>{t("btn_close")}</button>
          </div>
        </div>
      </div>
    )}
    {editTarget && (
      <div className="modal-backdrop" onClick={() => setEditTarget(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{t("modal_update_title")}</div>
          <div className="modal-desc">
            <div style={{ display: "grid", gap: 8 }}>
              <input className="search" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder={t("placeholder_title")} />
              <input className="search" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder={t("placeholder_url")} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditTarget(null)}>{t("btn_cancel")}</button>
            <button className="btn primary" onClick={saveEdit}>{t("btn_save")}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PopupApp />);
