/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, setSettings, Settings } from "@shared/storage";

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
   * 保存设置到 chrome.storage.sync
   */
  async function save() {
    await setSettings(settings);
    alert("设置保存成功");
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
    alert("设置已重置为默认值");
  }

  /**
   * 添加用户规则
   */
  function addRule() {
    if (!pattern || !category) {
      alert("请填写完整的规则信息");
      return;
    }
    try {
      // 校验正则
      new RegExp(pattern, "i");
    } catch {
      alert("正则表达式格式错误");
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

  return (
    <div>
      <div className="card">
        <h3>基本设置</h3>
        <div className="row">
          <div>自动分类书签</div>
          <input
            type="checkbox"
            checked={settings.autoClassify}
            onChange={(e) => setLocalSettings({ ...settings, autoClassify: e.target.checked })}
          />
        </div>
        <div className="row">
          <div>启用通知</div>
          <input
            type="checkbox"
            checked={settings.enableNotifications}
            onChange={(e) =>
              setLocalSettings({ ...settings, enableNotifications: e.target.checked })
            }
          />
        </div>
        <div className="row">
          <div>智能推荐</div>
          <input
            type="checkbox"
            checked={settings.enableRecommendations}
            onChange={(e) =>
              setLocalSettings({ ...settings, enableRecommendations: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3>清理设置</h3>
        <div className="row">
          <div>检查失效书签</div>
          <input
            type="checkbox"
            checked={settings.checkInvalidBookmarks}
            onChange={(e) =>
              setLocalSettings({ ...settings, checkInvalidBookmarks: e.target.checked })
            }
          />
        </div>
        <div className="row">
          <div>检查频率（分钟）</div>
          <input
            className="input"
            value={settings.checkFrequency}
            onChange={(e) => setLocalSettings({ ...settings, checkFrequency: e.target.value })}
          />
        </div>
        <div className="row">
          <div>自动清理重复书签</div>
          <input
            type="checkbox"
            checked={settings.autoCleanDuplicates}
            onChange={(e) =>
              setLocalSettings({ ...settings, autoCleanDuplicates: e.target.checked })
            }
          />
        </div>
      </div>

      <div className="card">
        <h3>分类设置</h3>
        <div className="row">
          <div>默认分类</div>
          <input
            className="input"
            value={settings.defaultCategory}
            onChange={(e) => setLocalSettings({ ...settings, defaultCategory: e.target.value })}
          />
        </div>
        <div className="row">
          <div>服务器地址</div>
          <input
            className="input"
            value={settings.serverUrl || ""}
            onChange={(e) => setLocalSettings({ ...settings, serverUrl: e.target.value })}
          />
        </div>
        <div className="row">
          <div>AI 提供商</div>
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
          <div>AI API 地址</div>
          <input
            className="input"
            value={settings.aiApiUrl || ""}
            onChange={(e) => setLocalSettings({ ...settings, aiApiUrl: e.target.value })}
          />
        </div>
        <div className="row">
          <div>AI 模型</div>
          <input
            className="input"
            value={settings.aiModel || ""}
            onChange={(e) => setLocalSettings({ ...settings, aiModel: e.target.value })}
          />
        </div>
        <div className="row">
          <div>AI API Key</div>
          <input
            className="input"
            type="password"
            value={settings.aiApiKey || ""}
            onChange={(e) => setLocalSettings({ ...settings, aiApiKey: e.target.value })}
          />
        </div>
      </div>

      <div className="card">
        <h3>自定义分类规则</h3>
        <div className="row">
          <input
            className="input"
            placeholder="正则模式"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
          />
          <input
            className="input"
            placeholder="分类名"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <button className="btn" onClick={addRule}>
            添加规则
          </button>
        </div>
        {(settings.userClassificationRules ?? []).length === 0 && <div>暂无自定义规则</div>}
        {(settings.userClassificationRules ?? []).map((r, i) => (
          <div key={i} className="row">
            <div>
              <strong>模式:</strong> {r.pattern}；<strong>分类:</strong> {r.category}
            </div>
            <button className="btn" onClick={() => deleteRule(i)}>
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="btns">
        <button className="btn primary" onClick={save}>
          保存设置
        </button>
        <button className="btn" onClick={reset}>
          恢复默认
        </button>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<OptionsApp />);
