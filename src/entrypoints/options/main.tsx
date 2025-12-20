/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, setSettings, Settings } from "@shared/storage";
import { toast } from "@shared/ui/toast";
import { Switch } from "@shared/ui/switch";
import { Save, RotateCcw, FileDown, FileUp, Plus, Trash, CheckCircle } from "lucide-react";
import { getAllBookmarks } from "@shared/bookmarks";
import { browser } from "wxt/browser";
import "@shared/ui/theme.css";

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
 * Options 主组件
 */
function OptionsApp() {
  const [settings, setLocalSettings] = useState<Settings>({
    autoClassify: true,
    enableNotifications: true,
    enableRecommendations: true,
    checkInvalidBookmarks: true,
    checkFrequency: "60",
    autoCleanDuplicates: false,
    defaultCategory: "其他",
    serverUrl: "http://localhost:5175",
    aiProvider: "deepseek",
    aiApiKey: "",
    aiModel: "deepseek-chat",
    aiApiUrl: "https://api.deepseek.com",
    recommendationMode: "auto",
    userClassificationRules: [],
  });
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const PROVIDER_DEFAULTS: Record<string, { apiUrl: string; model: string }> = {
    deepseek: { apiUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  };
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [validateStatus, setValidateStatus] = useState<string>("");

  /**
   * 加载设置
   */
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setLocalSettings(s);
      try {
        const col = s?.themeAccent || "rgba(0, 186, 189, 1)";
        document.documentElement.style.setProperty("--rm-accent", col);
        document.documentElement.style.setProperty("--rm-primary", col);
        document.documentElement.style.setProperty("--rm-accent-hover", col);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    const p = settings.aiProvider || "deepseek";
    const d = PROVIDER_DEFAULTS[p];
    if (!d) return;
    const next: Partial<Settings> = {};
    if (!settings.aiApiUrl) next.aiApiUrl = d.apiUrl;
    if (!settings.aiModel) next.aiModel = d.model;
    if (Object.keys(next).length) setLocalSettings({ ...settings, ...next });
  }, [settings.aiProvider]);
  useEffect(() => {
    (async () => {
      setModelsError(null);
      setModels([]);
      if (!settings.aiApiKey) return;
      setModelsLoading(true);
      try {
        const base = settings.serverUrl || "http://localhost:5175";
        const resp = await fetch(`${base}/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: settings.aiProvider,
            apiUrl: settings.aiApiUrl,
            apiKey: settings.aiApiKey,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const list = (data?.models ?? []) as string[];
          setModels(list);
          if (list.length && (!settings.aiModel || !list.includes(settings.aiModel))) {
            setLocalSettings({ ...settings, aiModel: list[0] });
          }
        } else {
          setModelsError(`加载模型失败: ${resp.status}`);
        }
      } catch (e: any) {
        setModelsError(String(e));
      } finally {
        setModelsLoading(false);
      }
    })();
  }, [settings.aiProvider, settings.aiApiUrl, settings.aiApiKey]);
  async function validateKey() {
    try {
      setValidateStatus("");
      const base = settings.serverUrl || "http://localhost:5175";
      const resp = await fetch(`${base}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.aiProvider,
          apiUrl: settings.aiApiUrl,
          apiKey: settings.aiApiKey,
          model: settings.aiModel,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data?.ok) {
        toast.success(t("alert_key_valid") || "密钥有效");
        setValidateStatus("ok");
      } else {
        const msg = data?.message || data?.error || `HTTP ${resp.status}`;
        toast.error(t("alert_key_invalid") || `密钥无效：${msg}`);
        setValidateStatus(String(msg));
      }
    } catch (e: any) {
      toast.error(t("alert_key_invalid") || `密钥无效：${String(e)}`);
      setValidateStatus(String(e));
    }
  }

  /**
   * 设置页面标题与语言属性
   */
  useEffect(() => {
    try {
      document.title = t("options_page_title");
      const lang = detectLang();
      document.documentElement.lang = lang;
    } catch {}
  }, []);

  /**
   * 保存设置到 chrome.storage.sync
   */
  async function save() {
    await setSettings(settings);
    toast.success(t("alert_settings_saved"));
  }

  /**
   * 重置为默认值
   */
  async function reset() {
    const def: Settings = {
      autoClassify: true,
      enableNotifications: true,
      enableRecommendations: true,
      checkInvalidBookmarks: true,
      checkFrequency: "60",
      autoCleanDuplicates: false,
      defaultCategory: "其他",
      serverUrl: "http://localhost:5175",
      aiProvider: "deepseek",
      aiApiKey: "",
      aiModel: "deepseek-chat",
      aiApiUrl: "https://api.deepseek.com",
      recommendationMode: "local",
      userClassificationRules: [],
    };
    setLocalSettings(def);
    await setSettings(def);
    toast.success(t("alert_settings_reset"));
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
        const s = await getSettings();
        let count = 0;
        for (const item of data) {
          const title = item.title || "";
          const url = item.url || "";
          if (!url) continue;
          const cat = item.category || item.folder || s?.defaultCategory || "其他";
          let parentId: string | undefined;
          if (cat) {
            try {
              parentId = await ensureFolder(cat);
            } catch {}
          }
          await browser.bookmarks.create(parentId ? { title, url, parentId } : { title, url });
          count++;
        }
        toast.success(t("alert_import_success", [count]));
      };
      input.click();
    } catch (e) {
      toast.error(t("alert_import_failed", [String(e)]));
    }
  }

  /**
   * 添加用户规则
   */
  function addRule() {
    if (!pattern || !category) {
      toast.warning(t("alert_fill_rule"));
      return;
    }
    try {
      // 校验正则
      new RegExp(pattern, "i");
    } catch {
      toast.error(t("alert_regex_invalid"));
      return;
    }
    const next = [
      ...(settings.userClassificationRules ?? []),
      { pattern, category, created: Date.now() },
    ];
    setLocalSettings({ ...settings, userClassificationRules: next });
    setPattern("");
    setCategory("");
  }

  /**
   * 删除某条规则
   */
  function deleteRule(idx: number) {
    const next = [...(settings.userClassificationRules ?? [])];
    next.splice(idx, 1);
    setLocalSettings({ ...settings, userClassificationRules: next });
  }

  /**
   * 导航跳转到对应 section
   */
  function goTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="rm-app rm-container">
      <div className="header">
        <div className="brand">
          <img src="../../icons/icon48.png" width="24" height="24" alt="RainMark" />
          <div>RainMark · {t("options_header_title")}</div>
        </div>
      </div>
      <div className="layout">
        <aside className="sidebar">
          <nav className="nav">
            <a href="#basic" onClick={(e) => { e.preventDefault(); goTo("basic"); }}>{t("options_nav_basic")}</a>
            <a href="#clean" onClick={(e) => { e.preventDefault(); goTo("clean"); }}>{t("options_nav_clean")}</a>
            <a href="#category" onClick={(e) => { e.preventDefault(); goTo("category"); }}>{t("options_nav_category")}</a>
            <a href="#rules" onClick={(e) => { e.preventDefault(); goTo("rules"); }}>{t("options_nav_rules")}</a>
            <a href="#actions" onClick={(e) => { e.preventDefault(); goTo("actions"); }}>{t("options_nav_actions")}</a>
          </nav>
        </aside>
        <main className="content">
          <section id="basic" className="section">
            <div className="card">
              <h3>{t("options_basic_title")}</h3>
              <div className="row">
                <div>{t("opt_auto_classify")}</div>
                <Switch
                  checked={settings.autoClassify}
                  onChange={(v) => setLocalSettings({ ...settings, autoClassify: v })}
                  ariaLabel={t("opt_auto_classify")}
                />
              </div>
              <div className="row">
                <div>{t("opt_enable_notifications")}</div>
                <Switch
                  checked={settings.enableNotifications}
                  onChange={(v) => setLocalSettings({ ...settings, enableNotifications: v })}
                  ariaLabel={t("opt_enable_notifications")}
                />
              </div>
              <div className="row">
                <div>{t("opt_enable_recommendations")}</div>
                <Switch
                  checked={settings.enableRecommendations}
                  onChange={(v) => setLocalSettings({ ...settings, enableRecommendations: v })}
                  ariaLabel={t("opt_enable_recommendations")}
                />
              </div>
            </div>
          </section>

          <section id="clean" className="section">
            <div className="card">
              <h3>{t("options_clean_title")}</h3>
              <div className="row">
                <div>{t("opt_check_invalid")}</div>
                <Switch
                  checked={settings.checkInvalidBookmarks}
                  onChange={(v) => setLocalSettings({ ...settings, checkInvalidBookmarks: v })}
                  ariaLabel={t("opt_check_invalid")}
                />
              </div>
              <div className="row">
                <div>{t("opt_check_frequency")}</div>
                <input
                  className="input"
                  value={settings.checkFrequency}
                  onChange={(e) => setLocalSettings({ ...settings, checkFrequency: e.target.value })}
                />
              </div>
              <div className="row">
                <div>{t("opt_auto_clean_duplicates")}</div>
                <Switch
                  checked={settings.autoCleanDuplicates}
                  onChange={(v) => setLocalSettings({ ...settings, autoCleanDuplicates: v })}
                  ariaLabel={t("opt_auto_clean_duplicates")}
                />
              </div>
            </div>
          </section>

          <section id="category" className="section">
            <div className="card">
              <h3>{t("options_category_title")}</h3>
              <div className="row">
                <div>{t("opt_default_category")}</div>
                <input
                  className="input"
                  value={settings.defaultCategory}
                  onChange={(e) => setLocalSettings({ ...settings, defaultCategory: e.target.value })}
                />
              </div>
              <div className="row">
                <div>{t("opt_server_url")}</div>
                <input
                  className="input"
                  value={settings.serverUrl || ""}
                  onChange={(e) => setLocalSettings({ ...settings, serverUrl: e.target.value })}
                />
              </div>
              <div className="row">
                <div>{t("opt_ai_provider")}</div>
                <select
                  className="input"
                  value={settings.aiProvider || "deepseek"}
                  onChange={(e) => {
                    const p = e.target.value as any;
                    const d = PROVIDER_DEFAULTS[p] || { apiUrl: settings.aiApiUrl || "", model: settings.aiModel || "" };
                    setLocalSettings({ ...settings, aiProvider: p, aiApiUrl: d.apiUrl, aiModel: d.model });
                  }}
                >
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
              <div className="row">
                <div>{t("opt_ai_api_url")}</div>
                <input
                  className="input"
                  value={settings.aiApiUrl || ""}
                  onChange={(e) => setLocalSettings({ ...settings, aiApiUrl: e.target.value })}
                />
              </div>
              <div className="row">
                <div>{t("opt_ai_api_key")}</div>
                <input
                  className="input"
                  type="password"
                  value={settings.aiApiKey || ""}
                  onChange={(e) => setLocalSettings({ ...settings, aiApiKey: e.target.value })}
                />
              </div>
              <div className="row">
                <button className="btn icon" onClick={validateKey}>
                  <CheckCircle size={16} />
                  {t("btn_validate_key") || "验证密钥"}
                </button>
                {validateStatus && <small style={{ color: "var(--rm-muted)" }}>{validateStatus}</small>}
              </div>
              <div className="row">
                <div>{t("opt_ai_model")}</div>
                {modelsLoading ? (
                  <div style={{ color: "var(--rm-muted)" }}>{t("loading_generating") || "加载中..."}</div>
                ) : models.length > 0 ? (
                  <select
                    className="input"
                    value={settings.aiModel || ""}
                    onChange={(e) => setLocalSettings({ ...settings, aiModel: e.target.value })}
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={settings.aiModel || ""}
                    onChange={(e) => setLocalSettings({ ...settings, aiModel: e.target.value })}
                  />
                )}
                {modelsError && <small style={{ color: "var(--rm-muted)" }}>{modelsError}</small>}
              </div>
            </div>
          </section>

          <section id="rules" className="section">
            <div className="card">
              <h3>{t("options_rules_title")}</h3>
              <div className="row">
                <input
                  className="input"
                  placeholder={t("placeholder_regex_pattern")}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                />
                <input
                  className="input"
                  placeholder={t("placeholder_category_name")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <button className="btn icon" onClick={addRule}>
                  <Plus size={16} />
                  {t("btn_add_rule")}
                </button>
              </div>
              {(settings.userClassificationRules ?? []).length === 0 && <div>{t("no_custom_rules")}</div>}
              {(settings.userClassificationRules ?? []).map((r, i) => (
                <div key={i} className="row">
                  <div>
                    <strong>{t("label_pattern")}</strong> {r.pattern}；<strong>{t("label_category")}</strong> {r.category}
                  </div>
                  <button className="btn icon" onClick={() => deleteRule(i)}>
                    <Trash size={16} />
                    {t("btn_delete")}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section id="actions" className="section">
            <div className="btns">
              <button className="btn icon primary" onClick={save}>
                <Save size={16} />
                {t("btn_save_settings")}
              </button>
              <button className="btn icon" onClick={reset}>
                <RotateCcw size={16} />
                {t("btn_restore_defaults")}
              </button>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>{t("options_actions_title") || "数据备份"}</h3>
              <div className="row">
                <div className="btns">
                  <button className="btn icon" onClick={importBookmarks}>
                    <FileDown size={16} />
                    {t("btn_import")}
                  </button>
                  <button className="btn icon" onClick={exportBookmarks}>
                    <FileUp size={16} />
                    {t("btn_export")}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<OptionsApp />);
