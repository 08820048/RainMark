/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getAllBookmarks } from "@shared/bookmarks";
import { browser } from "wxt/browser";

type TabKey = "recommendations" | "bookmarks" | "stats";

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
  const [stats, setStats] = useState({ total: 0, categories: 0, duplicates: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [recMode, setRecMode] = useState<"local" | "ai">("local");
  const [checkingInvalid, setCheckingInvalid] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [checkResult, setCheckResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);
  const [openMenu, setOpenMenu] = useState<{ list: "recs" | "bookmarks"; id: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ id: string; title: string; url: string } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");

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
      setLoadingText("生成推荐中...");
      const settings = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ action: "getSettings" }, (r: any) => resolve(r));
      });
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const t = tabs[0];
      const mode = settings?.recommendationMode || "auto";
      const useAI = mode === "ai" || (mode === "auto" && !!settings?.aiApiKey);
      setRecMode(useAI ? "ai" : "local");
      const server = settings?.serverUrl || "http://localhost:5175";
      const allCandidates = await getAllBookmarks();
      const body: any = {
        current: { title: t?.title || "", url: t?.url || "" },
        candidates: allCandidates.map((b) => ({ id: b.id, title: b.title, url: b.url })),
        limit: 5,
      };
      if (useAI) {
        body.provider = settings?.aiProvider;
        body.apiKey = settings?.aiApiKey;
        body.apiUrl = settings?.aiApiUrl;
        body.model = settings?.aiModel;
      }
      const resp = await fetch(`${server}/recommend/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
      });
      if (!resp.ok || !resp.body) {
        // 回退：调用后台一次性推荐
        const fallback = await new Promise<any>((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getRecommendations" }, (res: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(res);
          });
        });
        setRecs(fallback ?? []);
        setLoading(false);
        setLoadingText("");
        return;
      }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handleEvent = (event: string, data: any) => {
        if (event === "mode") {
          setLoadingText(data?.mode === "AI" ? "AI 推荐生成中..." : "生成推荐中...");
        } else if (event === "reset") {
          setRecs([]);
        } else if (event === "item") {
          setRecs((prev) => [...prev, data]);
        } else if (event === "done") {
          setLoading(false);
          setLoadingText("");
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
      // 流式失败回退一次性推荐，避免界面空白
      try {
        const fallback = await new Promise<any>((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getRecommendations" }, (res: any) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(res);
          });
        });
        setRecs(fallback ?? []);
      } catch (err) {
        console.error("recommend stream fallback failed:", err);
      } finally {
        setLoading(false);
        setLoadingText("");
        console.error("recommend stream failed:", e);
      }
    }
  }

  /**
   * 切换推荐模式并立即刷新列表
   */
  async function toggleRecommendationMode(next: "local" | "ai") {
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
  function toggleMenu(list: "recs" | "bookmarks", id: string) {
    setOpenMenu((prev) => (prev && prev.id === id && prev.list === list ? null : { list, id }));
  }

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
   * 分享到 X（Twitter）
   */
  function shareToX(title: string, url: string) {
    const u = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title || "")}&url=${encodeURIComponent(
      url || "",
    )}`;
    window.open(u, "_blank");
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
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (b: { title: string; url: string }) => (b.title + " " + b.url).toLowerCase().includes(q),
    );
  }, [bookmarks, search]);

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
    alert(`清理完成！移除了 ${dupIds.length} 个重复书签。`);
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

  return (
    <>
    <div style={{ padding: 12 }}>
      <div className="toolbar">
        <button className={`tab-btn ${tab === "recommendations" ? "active" : ""}`} onClick={() => setTab("recommendations")}>
          推荐
        </button>
        <button className={`tab-btn ${tab === "bookmarks" ? "active" : ""}`} onClick={() => setTab("bookmarks")}>
          书签
        </button>
        <button className={`tab-btn ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>
          统计
        </button>
      </div>

      {tab === "recommendations" && (
        <div>
          <input
            className="search"
            placeholder="搜索书签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>智能推荐</h3>
              <div className="segmented" title="推荐模式">
                <button
                  className={`seg-btn ${recMode === "local" ? "active" : ""}`}
                  onClick={() => toggleRecommendationMode("local")}
                >
                  本地
                </button>
                <button
                  className={`seg-btn ${recMode === "ai" ? "active" : ""}`}
                  onClick={() => toggleRecommendationMode("ai")}
                >
                  AI
                </button>
              </div>
            </div>
            {loading && <div className="loading-text">{loadingText}</div>}
            <ul className="list">
              {recs.length === 0 && <li>暂无推荐</li>}
              {recs.map((b, i) => (
                <li
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
                        {b.source === "AI" ? "AI 推荐" : "本地推荐"}
                      </span>
                    )}
                    <div style={{ marginLeft: 8 }}>
                      <button
                        className="menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu("recs", b.id);
                        }}
                        aria-label="更多操作"
                        title="更多操作"
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                  <small style={{ color: "#6b7280" }}>{b.url}</small>
                  {openMenu && openMenu.list === "recs" && openMenu.id === b.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <div className="menu-item" onClick={() => removeBookmark(b.id)}>移除</div>
                      <div className="menu-item" onClick={() => openEdit(b.id, b.title, b.url)}>更新</div>
                      <div className="menu-item" onClick={() => shareToX(b.title, b.url)}>分享到 X</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="toolbar">
            <button className="btn" onClick={cleanDuplicates}>清理重复</button>
            <button className="btn" disabled={checkingInvalid} onClick={checkInvalid}>检查失效链接</button>
            <button className="btn" onClick={() => chrome.runtime.openOptionsPage?.()}>打开设置</button>
          </div>
          {checkingInvalid && (
            <div className="progress">
              <div className="progress-title">
                正在检测失效链接... {checkProgress.current}/{checkProgress.total || "?"}
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
            placeholder="搜索书签..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="list">
            {filtered.length === 0 && <li>暂无书签</li>}
            {filtered.map((b) => (
              <li
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
                    aria-label="更多操作"
                    title="更多操作"
                  >
                    ⋯
                  </button>
                </div>
                {openMenu && openMenu.list === "bookmarks" && openMenu.id === b.id && (
                  <div className="menu" onClick={(e) => e.stopPropagation()}>
                    <div className="menu-item" onClick={() => removeBookmark(b.id)}>移除</div>
                    <div className="menu-item" onClick={() => openEdit(b.id, b.title, b.url)}>更新</div>
                    <div className="menu-item" onClick={() => shareToX(b.title, b.url)}>分享到 X</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "stats" && (
        <div className="stat">
          <div className="card">
            <div>总书签数</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
          </div>
          <div className="card">
            <div>分类数量</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.categories}</div>
          </div>
          <div className="card">
            <div>重复书签</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.duplicates}</div>
          </div>
        </div>
      )}
    </div>
    {checkResult && (
      <div className="modal-backdrop" onClick={() => setCheckResult(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">检测完成</div>
          <div className="modal-desc">
            共发现 <strong>{checkResult.count ?? 0}</strong> 个失效链接，已归档至“失效链接”。
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setCheckResult(null)}>关闭</button>
          </div>
        </div>
      </div>
    )}
    {editTarget && (
      <div className="modal-backdrop" onClick={() => setEditTarget(null)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">更新书签</div>
          <div className="modal-desc">
            <div style={{ display: "grid", gap: 8 }}>
              <input className="search" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="标题" />
              <input className="search" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditTarget(null)}>取消</button>
            <button className="btn primary" onClick={saveEdit}>保存</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PopupApp />);
