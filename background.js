// RainMark - 智能书签管理插件后台脚本
console.log("RainMark background script loading...");

// 检查Chrome API是否可用
if (typeof chrome === "undefined" || !chrome.runtime) {
  console.error("Chrome extension API not available");
} else {
  console.log(
    "Chrome extension API available, extension ID:",
    chrome.runtime.id,
  );
}

// 简单的分类函数
function classifyBookmark(title, url) {
  const text = (title + " " + url).toLowerCase();

  // 工作相关
  if (/(work|job|office|company|business|meeting)/.test(text)) return "工作";

  // 学习相关
  if (/(study|learn|course|tutorial|education|school|university)/.test(text))
    return "学习";

  // 娱乐相关
  if (/(entertainment|movie|music|game|fun|video)/.test(text)) return "娱乐";

  // 新闻相关
  if (/(news|press|journal|media)/.test(text)) return "新闻";

  // 技术相关
  if (/(tech|development|programming|software|computer)/.test(text))
    return "技术";

  // 购物相关
  if (/(shop|buy|store|mall|purchase)/.test(text)) return "购物";

  return "其他";
}

// 获取或创建分类文件夹
async function getCategoryFolderId(category) {
  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarksBar = tree[0].children[0];

    // 在书签栏中查找分类文件夹
    let folder = bookmarksBar.children.find((node) => node.title === category);
    if (!folder) {
      folder = await chrome.bookmarks.create({
        title: category,
        parentId: bookmarksBar.id,
      });
    }
    return folder.id;
  } catch (error) {
    console.error("Error getting category folder:", error);
    return "1"; // 默认返回书签栏ID
  }
}

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log("Bookmark created:", bookmark.title, bookmark.url);

  try {
    // 检查是否启用了自动分类
    const settings = await chrome.storage.sync.get(["autoClassify"]);
    const autoClassify = settings.autoClassify !== false; // 默认开启

    if (autoClassify && bookmark.url) {
      const category = classifyBookmark(bookmark.title, bookmark.url);
      const folderId = await getCategoryFolderId(category);

      // 移动书签到分类文件夹
      await chrome.bookmarks.move(id, { parentId: folderId });

      console.log(`Bookmark "${bookmark.title}" classified to "${category}"`);

      // 发送通知
      const notificationSettings = await chrome.storage.sync.get([
        "enableNotifications",
      ]);
      if (notificationSettings.enableNotifications !== false) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "RainMark 书签分类",
          message: `已将 "${bookmark.title}" 分类到 "${category}"`,
        });
      }
    }
  } catch (error) {
    console.error("Error processing bookmark creation:", error);
  }
});

// 获取所有书签
async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const bookmarks = [];

      function traverse(node) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            title: node.title || "无标题",
            url: node.url,
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

// 检查URL是否有效
async function isUrlValid(url) {
  try {
    const response = await fetch(url, { method: "HEAD", mode: "no-cors" });
    return true; // 简化检查，no-cors模式下无法读取响应状态
  } catch (error) {
    return false;
  }
}

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received:", request.action);

  switch (request.action) {
    case "getRecommendations":
      getRecommendedBookmarks().then(sendResponse);
      return true; // 表示异步响应

    case "checkInvalidBookmarks":
      checkInvalidBookmarksNow().then(sendResponse);
      return true;

    case "getAllBookmarks":
      getAllBookmarks().then(sendResponse);
      return true;

    case "ping":
      sendResponse({ status: "ok", version: "1.0.0" });
      break;

    default:
      sendResponse({ error: "Unknown action" });
  }
});

// 智能推荐：基于当前页面和历史记录推荐相关书签
async function getRecommendedBookmarks() {
  try {
    // 获取当前标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return [];

    const currentTab = tabs[0];
    const currentUrl = currentTab.url;
    const currentTitle = currentTab.title;

    // 获取所有书签
    const allBookmarks = await getAllBookmarks();

    // 提取当前页面的关键词
    const currentKeywords = extractKeywords(currentTitle + " " + currentUrl);

    // 计算每个书签的相关性得分
    const scoredBookmarks = allBookmarks.map((bookmark) => {
      const bookmarkKeywords = extractKeywords(
        bookmark.title + " " + bookmark.url,
      );
      const similarity = calculateSimilarity(currentKeywords, bookmarkKeywords);

      return {
        ...bookmark,
        score: similarity,
        similarity: similarity,
      };
    });

    // 按得分排序，返回前5个推荐
    return scoredBookmarks
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter((bookmark) => bookmark.score > 0.3);
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return [];
  }
}

// 提取文本关键词
function extractKeywords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // 移除标点
    .split(/\s+/)
    .filter((word) => word.length > 2); // 过滤短词

  // 移除常见停用词
  const stopWords = new Set([
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "could",
    "can",
    "may",
    "might",
    "must",
    "this",
    "that",
    "these",
    "those",
    "then",
    "than",
    "from",
  ]);

  return words.filter((word) => !stopWords.has(word));
}

// 计算关键词相似度（简单的Jaccard相似度）
function calculateSimilarity(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  const intersection = [...set1].filter((x) => set2.has(x)).length;
  const union = set1.size + set2.size - intersection;

  return intersection / union;
}

// 立即检查失效链接
async function checkInvalidBookmarksNow() {
  try {
    const allBookmarks = await getAllBookmarks();
    const invalidBookmarks = [];

    // 简化检查：只检查前10个书签
    const bookmarksToCheck = allBookmarks.slice(0, 10);

    for (const bookmark of bookmarksToCheck) {
      if (bookmark.url && !(await isUrlValid(bookmark.url))) {
        invalidBookmarks.push(bookmark);
      }
    }

    if (invalidBookmarks.length > 0) {
      // 创建失效链接文件夹
      let invalidFolder = (
        await chrome.bookmarks.search({ title: "失效链接" })
      )[0];
      if (!invalidFolder) {
        invalidFolder = await chrome.bookmarks.create({
          title: "失效链接",
          parentId: "1", // 书签栏ID
        });
      }

      // 移动失效链接
      for (const bookmark of invalidBookmarks) {
        try {
          await chrome.bookmarks.move(bookmark.id, {
            parentId: invalidFolder.id,
          });
        } catch (error) {
          console.error("Error moving invalid bookmark:", error);
        }
      }

      // 发送通知
      const notificationSettings = await chrome.storage.sync.get([
        "enableNotifications",
      ]);
      if (notificationSettings.enableNotifications !== false) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "RainMark 书签检查",
          message: `发现 ${invalidBookmarks.length} 个失效链接，已移至"失效链接"文件夹`,
        });
      }

      return { success: true, count: invalidBookmarks.length };
    }

    return { success: true, count: 0 };
  } catch (error) {
    console.error("Error checking invalid bookmarks:", error);
    return { success: false, error: error.message };
  }
}

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log("RainMark extension installed/updated");

  // 设置默认值
  chrome.storage.sync.set({
    autoClassify: true,
    enableNotifications: true,
    enableRecommendations: true,
    checkInvalidBookmarks: true,
    checkFrequency: "60",
    autoCleanDuplicates: false,
    defaultCategory: "其他",
  });

  // 创建定时检查任务（如果启用了alarms权限）
  if (chrome.alarms) {
    chrome.alarms.create("checkInvalidBookmarks", {
      periodInMinutes: 60, // 每小时检查一次
    });

    // 监听定时任务
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === "checkInvalidBookmarks") {
        const settings = await chrome.storage.sync.get([
          "checkInvalidBookmarks",
        ]);
        if (settings.checkInvalidBookmarks !== false) {
          await checkInvalidBookmarksNow();
        }
      }
    });
  } else {
    console.log("Alarms API not available");
  }
});

console.log("RainMark background script loaded successfully");
