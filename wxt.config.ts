import { defineConfig } from "wxt";
import path from "path";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    resolve: {
      alias: {
        "@shared": path.resolve(process.cwd(), "src/shared"),
      },
    },
  }),
  manifest: {
    name: "RainMark - 智能书签管理器",
    description:
      "基于 WXT + React 的现代化智能书签管理扩展，具有自动分类与清理功能",
    permissions: ["bookmarks", "storage", "tabs", "history", "notifications", "alarms"],
    action: {
      // 由 WXT 自动将 src/entrypoints/popup/index.html 构建为 popup.html
      default_popup: "popup.html",
      default_title: "RainMark",
      default_icon: {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    icons: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
    web_accessible_resources: [
      {
        resources: ["icons/*"],
        matches: ["<all_urls>"],
      },
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:* http://192.168.1.4:* https://api.deepseek.com https://api.openai.com;",
    },
  },
});
