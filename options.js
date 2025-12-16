// RainMark - 简化版选项页面脚本
document.addEventListener("DOMContentLoaded", async () => {
  console.log("RainMark options page loaded");

  // DOM元素引用
  const elements = {
    // 基本设置
    autoClassify: document.getElementById("autoClassify"),
    enableNotifications: document.getElementById("enableNotifications"),
    enableRecommendations: document.getElementById("enableRecommendations"),

    // 清理与优化
    checkInvalidBookmarks: document.getElementById("checkInvalidBookmarks"),
    checkFrequency: document.getElementById("checkFrequency"),
    autoCleanDuplicates: document.getElementById("autoCleanDuplicates"),

    // 分类规则
    newRulePattern: document.getElementById("newRulePattern"),
    newRuleCategory: document.getElementById("newRuleCategory"),
    addRuleBtn: document.getElementById("addRuleBtn"),
    rulesList: document.getElementById("rulesList"),
    defaultCategory: document.getElementById("defaultCategory"),

    // 操作按钮
    exportBookmarksBtn: document.getElementById("exportBookmarksBtn"),
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    saveBtn: document.getElementById("saveBtn"),

    // 通知
    notification: document.getElementById("notification"),
  };

  // 状态
  let userRules = [];

  // 初始化
  async function init() {
    console.log("Initializing options page...");

    // 检查元素是否存在
    for (const [key, element] of Object.entries(elements)) {
      if (!element) {
        console.warn(`Element not found: ${key}`);
      }
    }

    // 加载设置
    await loadSettings();

    // 加载用户规则
    await loadUserRules();

    // 设置事件监听器
    setupEventListeners();

    console.log("Options page initialized");
  }

  // 加载设置
  async function loadSettings() {
    try {
      const data = await chrome.storage.sync.get([
        "autoClassify",
        "enableNotifications",
        "enableRecommendations",
        "checkInvalidBookmarks",
        "checkFrequency",
        "autoCleanDuplicates",
        "defaultCategory",
      ]);

      // 设置复选框
      if (elements.autoClassify)
        elements.autoClassify.checked = data.autoClassify !== false;
      if (elements.enableNotifications)
        elements.enableNotifications.checked =
          data.enableNotifications !== false;
      if (elements.enableRecommendations)
        elements.enableRecommendations.checked =
          data.enableRecommendations !== false;
      if (elements.checkInvalidBookmarks)
        elements.checkInvalidBookmarks.checked =
          data.checkInvalidBookmarks !== false;
      if (elements.autoCleanDuplicates)
        elements.autoCleanDuplicates.checked =
          data.autoCleanDuplicates || false;

      // 设置下拉框
      if (elements.checkFrequency && data.checkFrequency) {
        elements.checkFrequency.value = data.checkFrequency;
      }

      // 设置默认分类
      if (elements.defaultCategory && data.defaultCategory) {
        elements.defaultCategory.value = data.defaultCategory;
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      showNotification("加载设置失败", "error");
    }
  }

  // 加载用户规则
  async function loadUserRules() {
    try {
      const data = await chrome.storage.sync.get(["userClassificationRules"]);
      userRules = data.userClassificationRules || [];
      renderRulesList();
    } catch (error) {
      console.error("Failed to load user rules:", error);
      userRules = [];
    }
  }

  // 渲染规则列表
  function renderRulesList() {
    if (!elements.rulesList) return;

    if (userRules.length === 0) {
      elements.rulesList.innerHTML = "<p>暂无自定义规则</p>";
      return;
    }

    let html = "";
    userRules.forEach((rule, index) => {
      html += `
                <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                    <div><strong>模式:</strong> ${escapeHtml(rule.pattern)}</div>
                    <div><strong>分类:</strong> ${escapeHtml(rule.category)}</div>
                    <button onclick="deleteRule(${index})" style="margin-top: 5px; padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">删除</button>
                </div>
            `;
    });

    elements.rulesList.innerHTML = html;
  }

  // 删除规则（全局函数，供内联事件使用）
  window.deleteRule = async function (index) {
    if (index >= 0 && index < userRules.length) {
      userRules.splice(index, 1);
      await saveUserRules();
      renderRulesList();
      showNotification("规则删除成功", "success");
    }
  };

  // 保存用户规则
  async function saveUserRules() {
    try {
      await chrome.storage.sync.set({
        userClassificationRules: userRules,
      });
    } catch (error) {
      console.error("Failed to save user rules:", error);
      showNotification("保存规则失败", "error");
    }
  }

  // 设置事件监听器
  function setupEventListeners() {
    // 添加规则按钮
    if (elements.addRuleBtn) {
      elements.addRuleBtn.addEventListener("click", addUserRule);
    }

    // 保存设置按钮
    if (elements.saveBtn) {
      elements.saveBtn.addEventListener("click", saveSettings);
    }

    // 导出书签按钮
    if (elements.exportBookmarksBtn) {
      elements.exportBookmarksBtn.addEventListener("click", exportBookmarks);
    }

    // 重置设置按钮
    if (elements.resetSettingsBtn) {
      elements.resetSettingsBtn.addEventListener("click", resetSettings);
    }
  }

  // 添加用户规则
  async function addUserRule() {
    if (!elements.newRulePattern || !elements.newRuleCategory) return;

    const pattern = elements.newRulePattern.value.trim();
    const category = elements.newRuleCategory.value.trim();

    if (!pattern || !category) {
      showNotification("请填写完整的规则信息", "error");
      return;
    }

    try {
      // 验证正则表达式
      new RegExp(pattern, "i");
    } catch (error) {
      showNotification("正则表达式格式错误", "error");
      return;
    }

    const newRule = {
      pattern: pattern,
      category: category,
      created: Date.now(),
    };

    userRules.push(newRule);

    // 清空输入框
    elements.newRulePattern.value = "";
    elements.newRuleCategory.value = "";

    // 保存并重新渲染
    await saveUserRules();
    renderRulesList();

    showNotification("规则添加成功", "success");
  }

  // 保存设置
  async function saveSettings() {
    try {
      const settings = {
        autoClassify: elements.autoClassify
          ? elements.autoClassify.checked
          : true,
        enableNotifications: elements.enableNotifications
          ? elements.enableNotifications.checked
          : true,
        enableRecommendations: elements.enableRecommendations
          ? elements.enableRecommendations.checked
          : true,
        checkInvalidBookmarks: elements.checkInvalidBookmarks
          ? elements.checkInvalidBookmarks.checked
          : true,
        checkFrequency: elements.checkFrequency
          ? elements.checkFrequency.value
          : "60",
        autoCleanDuplicates: elements.autoCleanDuplicates
          ? elements.autoCleanDuplicates.checked
          : false,
        defaultCategory: elements.defaultCategory
          ? elements.defaultCategory.value.trim() || "其他"
          : "其他",
      };

      await chrome.storage.sync.set(settings);

      showNotification("设置保存成功", "success");

      // 2秒后关闭页面
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      showNotification("保存设置失败", "error");
    }
  }

  // 导出书签
  async function exportBookmarks() {
    try {
      const bookmarks = await getAllBookmarks();

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        totalBookmarks: bookmarks.length,
        bookmarks: bookmarks.map((bookmark) => ({
          title: bookmark.title,
          url: bookmark.url,
          dateAdded: bookmark.dateAdded,
        })),
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });

      // 创建下载链接
      const url = URL.createObjectURL(dataBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `raimark-bookmarks-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification("书签导出成功", "success");
    } catch (error) {
      console.error("Failed to export bookmarks:", error);
      showNotification("导出书签失败", "error");
    }
  }

  // 获取所有书签
  function getAllBookmarks() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        const bookmarks = [];

        function traverse(node) {
          if (node.url) {
            bookmarks.push({
              id: node.id,
              title: node.title || "无标题",
              url: node.url,
              dateAdded: node.dateAdded,
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

  // 重置设置
  async function resetSettings() {
    if (!confirm("确定要重置所有设置吗？此操作不可撤销。")) {
      return;
    }

    try {
      // 重置为默认值
      const defaultSettings = {
        autoClassify: true,
        enableNotifications: true,
        enableRecommendations: true,
        checkInvalidBookmarks: true,
        checkFrequency: "60",
        autoCleanDuplicates: false,
        defaultCategory: "其他",
        userClassificationRules: [],
      };

      await chrome.storage.sync.set(defaultSettings);

      // 更新UI
      await loadSettings();
      userRules = [];
      renderRulesList();

      showNotification("设置已重置为默认值", "success");
    } catch (error) {
      console.error("Failed to reset settings:", error);
      showNotification("重置设置失败", "error");
    }
  }

  // 显示通知
  function showNotification(message, type = "info") {
    if (!elements.notification) return;

    const notification = elements.notification;

    // 设置通知内容和样式
    notification.textContent = message;
    notification.className = `notification ${type}`;

    // 显示通知
    notification.style.display = "block";

    // 3秒后隐藏
    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  }

  // 转义HTML特殊字符
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 启动初始化
  init();
});
