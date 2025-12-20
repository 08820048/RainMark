/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, setSettings, Settings } from "@shared/storage";
import { toast } from "@shared/ui/toast";
import { Switch } from "@shared/ui/switch";
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

  /**
   * 加载设置
   */
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setLocalSettings(s);
    })();
  }, []);

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
    <div>
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
                  onChange={(e) => setLocalSettings({ ...settings, aiProvider: e.target.value as any })}
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
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
                <div>{t("opt_ai_model")}</div>
                <input
                  className="input"
                  value={settings.aiModel || ""}
                  onChange={(e) => setLocalSettings({ ...settings, aiModel: e.target.value })}
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
                <button className="btn" onClick={addRule}>
                  {t("btn_add_rule")}
                </button>
              </div>
              {(settings.userClassificationRules ?? []).length === 0 && <div>{t("no_custom_rules")}</div>}
              {(settings.userClassificationRules ?? []).map((r, i) => (
                <div key={i} className="row">
                  <div>
                    <strong>{t("label_pattern")}</strong> {r.pattern}；<strong>{t("label_category")}</strong> {r.category}
                  </div>
                  <button className="btn" onClick={() => deleteRule(i)}>
                    {t("btn_delete")}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section id="actions" className="section">
            <div className="btns">
              <button className="btn primary" onClick={save}>
                {t("btn_save_settings")}
              </button>
              <button className="btn" onClick={reset}>
                {t("btn_restore_defaults")}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<OptionsApp />);
