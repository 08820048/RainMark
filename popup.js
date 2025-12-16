// RainMark - 智能书签管理插件弹出窗口脚本
document.addEventListener("DOMContentLoaded", function () {
  console.log("RainMark popup loaded");

  // 等待DOM完全加载
  setTimeout(init, 100);
});

function init() {
  console.log("Initializing RainMark popup...");

  // 获取DOM元素
  const elements = {
    searchInput: document.getElementById("searchInput"),
    recommendationsGrid: document.getElementById("recommendationsGrid"),
    recentBookmarks: document.getElementById("recentBookmarks"),
    allBookmarks: document.getElementById("allBookmarks"),
    cleanDuplicatesBtn: document.getElementById("cleanDuplicatesBtn"),
    exportBtn: document.getElementById("exportBtn"),
    totalBookmarks: document.getElementById("totalBookmarks"),
    categoriesCount: document.getElementById("categoriesCount"),
    duplicatesCount: document.getElementById("duplicatesCount"),
    checkInvalidBtn: document.getElementById("checkInvalidBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    tabBtns: document.querySelectorAll(".tab-btn"),
    tabs: document.querySelectorAll(".tab"),
  };

  // 检查元素是否存在
  for (const [key, element] of Object.entries(elements)) {
    if (!element && key !== "tabBtns" && key !== "tabs") {
      console.warn(`Element not found: ${key}`);
    }
  }

  // 初始化标签页
  if (elements.tabBtns && elements.tabBtns.length > 0) {
    elements.tabBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        // 移除所有active类
        elements.tabBtns.forEach((b) => b.classList.remove("active"));
        elements.tabs.forEach((t) => t.classList.remove("active"));

        // 添加active类
        this.classList.add("active");
        const tabId = this.getAttribute("data-tab") + "-tab";
        const tabElement = document.getElementById(tabId);
        if (tabElement) {
          tabElement.classList.add("active");
        }

        // 加载对应标签页数据
        loadTabData(this.getAttribute("data-tab"));
      });
    });
  }

  // 设置事件监听器
  setupEventListeners(elements);

  // 加载初始数据
  loadTabData("recommendations");

  console.log("RainMark popup initialized");
}

function setupEventListeners(elements) {
  // 搜索功能
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", function (e) {
      const query = e.target.value.trim();
      if (query) {
        searchBookmarks(query, elements);
      } else {
        loadAllBookmarks(elements);
      }
    });
  }

  // 清理重复书签
  if (elements.cleanDuplicatesBtn) {
    elements.cleanDuplicatesBtn.addEventListener("click", function () {
      cleanDuplicateBookmarks(elements);
    });
  }

  // 导出书签
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener("click", function () {
      exportBookmarks(elements);
    });
  }

  // 检查失效链接
  if (elements.checkInvalidBtn) {
    elements.checkInvalidBtn.addEventListener("click", function () {
      checkInvalidBookmarks(elements);
    });
  }

  // 打开设置页面
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener("click", function () {
      if (chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }
}

function loadTabData(tabName) {
  console.log(`Loading tab: ${tabName}`);

  switch (tabName) {
    case "recommendations":
      loadRecommendations();
      loadRecentBookmarks();
      break;
    case "bookmarks":
      loadAllBookmarks();
      break;
    case "stats":
      loadStatistics();
      break;
  }
}

function loadRecommendations() {
  const recommendationsGrid = document.getElementById("recommendationsGrid");
  if (!recommendationsGrid) return;

  recommendationsGrid.innerHTML = "<p>加载推荐中...</p>";

  // 尝试从后台获取推荐
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      { action: "getRecommendations" },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error getting recommendations:",
            chrome.runtime.lastError,
          );
          recommendationsGrid.innerHTML = "<p>获取推荐失败</p>";
          return;
        }

        if (response && Array.isArray(response) && response.length > 0) {
          let html = "<ul>";
          response.forEach((bookmark) => {
            html += `
                        <li onclick="window.open('${bookmark.url}', '_blank')">
                            <strong>${escapeHtml(bookmark.title)}</strong><br>
                            <small>${escapeHtml(bookmark.url)}</small>
                        </li>
                    `;
          });
          html += "</ul>";
          recommendationsGrid.innerHTML = html;
        } else {
          recommendationsGrid.innerHTML = "<p>暂无推荐</p>";
        }
      },
    );
  } else {
    recommendationsGrid.innerHTML = "<p>扩展API不可用</p>";
  }
}

function loadRecentBookmarks() {
  const recentBookmarks = document.getElementById("recentBookmarks");
  if (!recentBookmarks) return;

  getAllBookmarks()
    .then((bookmarks) => {
      const recent = bookmarks
        .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
        .slice(0, 10);

      if (recent.length > 0) {
        let html = "";
        recent.forEach((bookmark) => {
          html += `
                    <li onclick="window.open('${bookmark.url}', '_blank')">
                        <strong>${escapeHtml(bookmark.title)}</strong><br>
                        <small>${escapeHtml(bookmark.url)}</small>
                    </li>
                `;
        });
        recentBookmarks.innerHTML = html;
      } else {
        recentBookmarks.innerHTML = "<li>暂无书签</li>";
      }
    })
    .catch((error) => {
      console.error("Error loading recent bookmarks:", error);
      recentBookmarks.innerHTML = "<li>加载失败</li>";
    });
}

function loadAllBookmarks() {
  const allBookmarks = document.getElementById("allBookmarks");
  if (!allBookmarks) return;

  allBookmarks.innerHTML = "<li>加载中...</li>";

  getAllBookmarks()
    .then((bookmarks) => {
      if (bookmarks.length > 0) {
        let html = "";
        bookmarks.forEach((bookmark) => {
          html += `
                    <li onclick="window.open('${bookmark.url}', '_blank')">
                        <strong>${escapeHtml(bookmark.title)}</strong><br>
                        <small>${escapeHtml(bookmark.url)}</small>
                    </li>
                `;
        });
        allBookmarks.innerHTML = html;
      } else {
        allBookmarks.innerHTML = "<li>暂无书签</li>";
      }
    })
    .catch((error) => {
      console.error("Error loading all bookmarks:", error);
      allBookmarks.innerHTML = "<li>加载失败</li>";
    });
}

function loadStatistics() {
  const totalBookmarks = document.getElementById("totalBookmarks");
  const categoriesCount = document.getElementById("categoriesCount");
  const duplicatesCount = document.getElementById("duplicatesCount");

  if (!totalBookmarks || !categoriesCount || !duplicatesCount) return;

  getAllBookmarks()
    .then((bookmarks) => {
      // 总书签数
      totalBookmarks.textContent = bookmarks.length;

      // 分类数量（简化版）
      const categories = new Set();
      bookmarks.forEach((b) => {
        if (b.parentId) categories.add(b.parentId);
      });
      categoriesCount.textContent = categories.size;

      // 重复书签数
      const urlMap = new Map();
      let duplicates = 0;
      bookmarks.forEach((b) => {
        if (urlMap.has(b.url)) {
          duplicates++;
        } else {
          urlMap.set(b.url, true);
        }
      });
      duplicatesCount.textContent = duplicates;
    })
    .catch((error) => {
      console.error("Error loading statistics:", error);
    });
}

function searchBookmarks(query, elements) {
  if (!elements.allBookmarks) return;

  elements.allBookmarks.innerHTML = "<li>搜索中...</li>";

  getAllBookmarks()
    .then((bookmarks) => {
      const results = bookmarks.filter((bookmark) => {
        const searchText = (bookmark.title + " " + bookmark.url).toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      if (results.length > 0) {
        let html = "";
        results.forEach((bookmark) => {
          html += `
                    <li onclick="window.open('${bookmark.url}', '_blank')">
                        <strong>${escapeHtml(bookmark.title)}</strong><br>
                        <small>${escapeHtml(bookmark.url)}</small>
                    </li>
                `;
        });
        elements.allBookmarks.innerHTML = html;
      } else {
        elements.allBookmarks.innerHTML = "<li>未找到相关书签</li>";
      }
    })
    .catch((error) => {
      console.error("Error searching bookmarks:", error);
      elements.allBookmarks.innerHTML = "<li>搜索失败</li>";
    });
}

function cleanDuplicateBookmarks(elements) {
  getAllBookmarks()
    .then((bookmarks) => {
      const urlMap = new Map();
      const duplicates = [];

      // 找出重复的书签
      bookmarks.forEach((bookmark) => {
        if (urlMap.has(bookmark.url)) {
          duplicates.push(bookmark.id);
        } else {
          urlMap.set(bookmark.url, bookmark.id);
        }
      });

      // 删除重复书签
      let deletedCount = 0;
      const deletePromises = duplicates.map((id) => {
        return new Promise((resolve) => {
          chrome.bookmarks.remove(id, () => {
            deletedCount++;
            resolve();
          });
        });
      });

      Promise.all(deletePromises).then(() => {
        alert(`清理完成！移除了 ${deletedCount} 个重复书签。`);
        loadAllBookmarks();
        loadStatistics();
      });
    })
    .catch((error) => {
      console.error("Error cleaning duplicates:", error);
      alert("清理失败");
    });
}

function exportBookmarks(elements) {
  getAllBookmarks()
    .then((bookmarks) => {
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

      alert("书签已导出为JSON文件");
    })
    .catch((error) => {
      console.error("Error exporting bookmarks:", error);
      alert("导出失败");
    });
}

function checkInvalidBookmarks(elements) {
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      { action: "checkInvalidBookmarks" },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error checking invalid bookmarks:",
            chrome.runtime.lastError,
          );
          alert("检查失败");
          return;
        }

        if (response && response.success) {
          alert(`检查完成，发现 ${response.count || 0} 个失效链接`);
        } else {
          alert("检查失败");
        }
      },
    );
  } else {
    alert("扩展API不可用");
  }
}

function getAllBookmarks() {
  return new Promise((resolve, reject) => {
    if (!chrome.bookmarks || !chrome.bookmarks.getTree) {
      reject(new Error("Bookmarks API not available"));
      return;
    }

    chrome.bookmarks.getTree(function (tree) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      const bookmarks = [];

      function traverse(node) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            title: node.title || "无标题",
            url: node.url,
            dateAdded: node.dateAdded,
            parentId: node.parentId,
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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
