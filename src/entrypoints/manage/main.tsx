/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@shared/ui/theme.css";
import { getAllBookmarks } from "@shared/bookmarks";
import { getSettings } from "@shared/storage";
import { browser } from "wxt/browser";
import { toast } from "@shared/ui/toast";
import { Folder, Link, Search, ChevronRight, ChevronDown } from "lucide-react";

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
 * 将全部书签按分类（文件夹名）分组
 */
function groupByCategory(
  bookmarks: Array<{ id: string; title: string; url: string; parentId?: string }>,
  folderMap: Map<string, string>,
): Map<string, Array<{ id: string; title: string; url: string }>> {
  const map = new Map<string, Array<{ id: string; title: string; url: string }>>();
  for (const b of bookmarks) {
    const cat = b.parentId ? folderMap.get(b.parentId || "") || t("manage_uncategorized") : t("manage_uncategorized");
    const list = map.get(cat) || [];
    list.push({ id: b.id, title: b.title, url: b.url });
    map.set(cat, list);
  }
  return map;
}

/**
 * 截断字符串为指定长度，末尾使用“...”省略
 */
function truncate(text: string, max: number): string {
  const s = String(text || "");
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 3)) + "...";
}

/**
 * 管理页面主组件：按分类卡片展示全部书签
 */
function ManageApp() {
  const [search, setSearch] = useState("");
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; title: string; url: string; parentId?: string }>>([]);
  const [folderMap, setFolderMap] = useState<Map<string, string>>(new Map());
  const [expanded, setExpanded] = useState<string | null>(null);
  const MAX_TITLE = 36;
  const MAX_URL = 64;

  /**
   * 加载数据并设置页面语言与标题
   */
  useEffect(() => {
    (async () => {
      const lang = detectLang();
      try {
        document.documentElement.lang = lang;
        document.title = t("manage_page_title");
      } catch {}
      try {
        const s = await getSettings();
        const col = s?.themeAccent || "rgba(0, 186, 189, 1)";
        document.documentElement.style.setProperty("--rm-accent", col);
        document.documentElement.style.setProperty("--rm-primary", col);
        document.documentElement.style.setProperty("--rm-accent-hover", col);
      } catch {}
      const all = await getAllBookmarks();
      const fm = await buildFolderMap();
      setBookmarks(all);
      setFolderMap(fm);
    })();
  }, []);

  /**
   * 过滤后分组（按分类）
   */
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? bookmarks.filter((b) => (b.title + " " + b.url).toLowerCase().includes(q))
      : bookmarks;
    return groupByCategory(base, folderMap);
  }, [bookmarks, folderMap, search]);

  /**
   * 跳转到对应分类卡片
   */
  function goTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * 切换某分类卡片的展开/收起状态
   */
  function toggleCategory(cat: string) {
    setExpanded((prev) => (prev === cat ? null : cat));
  }

  return (
    <div className="rm-app rm-container">
      <div className="header">
        <div className="brand">
          <img src="../../icons/icon48.png" width="24" height="24" alt="RainMark" />
          <div>RainMark · {t("manage_header_title")}</div>
        </div>
        <div className="toolbar" style={{ width: 400 }}>
          <input
            className="search"
            placeholder={t("search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="layout">
        <main className="content">
          <section className="section">
            <div className="grid">
              {[...grouped.entries()].map(([cat, list]) => (
                <div key={cat} className="card" id={cat}>
                  <div className="card-title" style={{ cursor: "pointer" }} onClick={() => toggleCategory(cat)}>
                    {expanded === cat ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Folder size={18} />
                    <span>{cat}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--rm-muted)" }}>
                      {t("stat_total_bookmarks")}: {list.length}
                    </span>
                  </div>
                  {expanded === cat && (
                    <div className="card-list">
                      {list.map((b) => (
                        <div
                          key={b.id}
                          className="item hover-primary"
                          onClick={() => window.open(b.url, "_blank")}
                          title={b.title}
                        >
                          <Link size={16} />
                          <div className="text">
                            <div className="truncate">{truncate(b.title, MAX_TITLE)}</div>
                            <small className="truncate">{truncate(b.url, MAX_URL)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<ManageApp />);
