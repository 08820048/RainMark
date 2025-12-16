// 测试RainMark扩展的基本功能
console.log("Testing RainMark extension...");

// 测试1: 检查Chrome API是否可用
if (typeof chrome === "undefined" || !chrome.runtime) {
  console.error("❌ Chrome extension API not available");
} else {
  console.log("✅ Chrome extension API available");
}

// 测试2: 检查扩展是否已安装
if (chrome.runtime && chrome.runtime.id) {
  console.log("✅ Extension installed with ID:", chrome.runtime.id);
} else {
  console.error("❌ Extension not installed or not enabled");
}

// 测试3: 检查必要权限
chrome.permissions.contains({
  permissions: ["bookmarks", "storage"]
}, (result) => {
  if (result) {
    console.log("✅ Required permissions granted");
  } else {
    console.error("❌ Required permissions not granted");
  }
});

// 测试4: 测试书签API
chrome.bookmarks.getTree((tree) => {
  if (chrome.runtime.lastError) {
    console.error("❌ Bookmarks API error:", chrome.runtime.lastError.message);
  } else {
    console.log("✅ Bookmarks API working, found tree structure");
  }
});

// 测试5: 测试存储API
chrome.storage.sync.set({ test: "value" }, () => {
  if (chrome.runtime.lastError) {
    console.error("❌ Storage API error:", chrome.runtime.lastError.message);
  } else {
    console.log("✅ Storage API working");
  }
});

console.log("Test completed");
