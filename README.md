<div align="center">
  <h1>RainMark · 智能书签管理扩展</h1>
  <p>自动分类 · 智能推荐 · 书签清理 · 便捷分享</p>
  <p>
    <a href="./README.en.md">English</a> | <strong>简体中文</strong>
  </p>
</div>

**RainMark** 是一个基于 Chrome MV3 与 React 的书签增强扩展，通过本地算法与可选 AI 服务实现「自动分类、智能推荐、重复/失效清理、便捷分享到 X」等能力，帮助你高效管理书签。

## 亮点特性
- 自动分类：新增书签后按规则或 AI 自动归档到文件夹（后台实现，通知可控）
- 智能推荐：按当前页面或查询词推荐相关书签，支持本地与 AI 排序（含流式）
- 清理优化：重复书签合并、失效链接检测并归档到“失效链接”文件夹
- 分享到 X：一键打开发帖页并后台生成更佳文案，系统通知支持一键复制
- 现代界面：弹窗、管理页、设置页采用简洁现代风格，支持主题色切换

## 快速上手
- 运行开发服务（可选，用于 AI 文案/推荐等接口）
  - `npm run server`（默认端口 `http://localhost:5175`）
- 构建扩展并加载到浏览器
  - `npm run build`
  - 打开 `chrome://extensions` → 开启“开发者模式” → “加载已解压的扩展程序” → 选择 `dist/chrome-mv3`
- 安装依赖与类型检查
  - `npm install`
  - `npm run typecheck`

## 使用指南
- 弹窗页（扩展图标）：搜索书签、查看推荐、清理重复、检查失效、打开设置
- 管理页：综合查看所有书签并按类别分组
- 设置页：切换推荐模式（本地/AI/自动）、配置主题色、通知开关、自定义分类规则
- 分享到 X：
  - 在书签项的“更多”菜单点击“分享到 X”
  - 立即打开 X 发帖界面（默认文案），后台生成更佳文案
  - 生成成功将推送系统通知，点击“复制”按钮即可复制到剪贴板，到 X 粘贴替换
  - 相关实现：`src/entrypoints/popup/main.tsx:697`、`src/entrypoints/background.ts:256`

## 依赖与脚本
- 主要技术栈
  - `wxt`（扩展构建，MV3）
  - `react` / `react-dom`
  - `lucide-react`（图标）
  - `fastify`（本地服务）
- 常用脚本（见 `package.json`）
  - `npm run dev`：开发模式（wxt）
  - `npm run build`：构建扩展
  - `npm run server`：启动本地接口服务
  - `npm run typecheck`：类型检查
  - `npm run release`：打包 Chrome MV3 发行包

## 项目结构
```
src/
├── entrypoints/
│   ├── popup/main.tsx         # 弹窗页
│   ├── manage/main.tsx        # 管理页
│   ├── options/main.tsx       # 设置页
│   └── background.ts          # 后台（分类、推荐、通知等）
├── shared/
│   ├── bookmarks.ts           # 关键词提取/Jaccard 相似度/URL 校验
│   └── ui/                    # 轻量 UI 组件（toast、switch 等）
server/
└── index.js                   # Fastify 服务（分类/推荐/文案）
```

## 权限说明
- `bookmarks`：读取/更新书签
- `storage`：存储设置（包含主题色、推荐模式、用户规则等）
- `tabs` / `history`：读取当前页与浏览历史用于推荐
- `notifications`：系统通知（分类结果、文案生成等）
- `alarms`：定时任务（周期性检查等）
- `clipboardWrite`：复制生成的分享文案到剪贴板

## 设置项概览
- 基础：自动分类、通知开关、启用智能推荐、失效链接检查、主题色
- 推荐模式：`local` / `ai` / `auto`（自动在有 API Key 时启用 AI）
- 分类规则：用户自定义规则优先，其次服务端 AI 分类，最后本地分类
- 服务器：`serverUrl` 默认 `http://localhost:5175`，可配置 `aiProvider`/`aiApiKey`/`aiApiUrl`/`aiModel`

## 隐私与安全
- 所有本地推荐与清理逻辑均在浏览器内执行
- AI 文案/推荐等仅在用户配置 API Key 时启用
- 不会收集或上传书签数据到第三方服务器

## 贡献指南
- 提交 Issue：描述问题现象、复现步骤、期望行为、截图/日志
- 提交代码：Fork → Feature 分支 → 提交 → Pull Request
- 代码要求：通过 `npm run typecheck`，遵循现有风格与模式（React/WXT/MV3）

## 许可证
- 使用 MIT 许可证，详见 `LICENSE`

---

RainMark · 让书签管理更智能、更高效 🚀
