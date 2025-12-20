<div align="center">
  <h1>RainMark · Smart Bookmark Manager</h1>
  <p>Auto Categorization · Intelligent Recommendations · Cleanup · Share to X</p>
  <p>
    <strong>English</strong> | <a href="./README.md">简体中文</a>
  </p>
</div>

RainMark is a Chrome MV3 + React extension that enhances bookmark management with local algorithms and optional AI services. It provides auto categorization, intelligent recommendations, duplicate/invalid cleanup, and a streamlined “Share to X” experience.

## Highlights
- Auto categorize new bookmarks into folders via rules or AI (with notifications)
- Recommendations based on current page or query, local and AI ranking (including streaming)
- Cleanup tools for duplicates and invalid links (move to an “Invalid Links” folder)
- Share to X: open the posting page instantly, generate better copy in background with system notifications and one-click copy
- Modern UI for popup, management, and settings pages with theme accent switching

## Quick Start
- Start optional local service (for AI copy/recommend endpoints)
  - `npm run server` (default `http://localhost:5175`)
- Build and load the extension into Chrome
  - `npm run build`
  - Open `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select `dist/chrome-mv3`
- Install deps and typecheck
  - `npm install`
  - `npm run typecheck`

## Usage
- Popup: search, recommendations, cleanup duplicates, check invalid links, open settings
- Manage: overview all bookmarks grouped by category
- Settings: switch recommendation mode (local/AI/auto), theme accent, notifications, user rules
- Share to X:
  - Click “Share to X” in a bookmark’s “More” menu
  - Opens X posting page immediately (with default copy), generates improved copy in background
  - A system notification appears when ready; click “Copy” to paste into X
  - See implementation: `src/entrypoints/popup/main.tsx:697`, `src/entrypoints/background.ts:256`

## Stack & Scripts
- Stack: `wxt` (MV3), `react`, `react-dom`, `lucide-react`, `fastify`
- Scripts (see `package.json`)
  - `npm run dev`: dev mode (wxt)
  - `npm run build`: build
  - `npm run server`: start local service
  - `npm run typecheck`: TypeScript check
  - `npm run release`: package Chrome MV3 zip

## Structure
```
src/
├── entrypoints/
│   ├── popup/main.tsx         # Popup
│   ├── manage/main.tsx        # Manage page
│   ├── options/main.tsx       # Settings page
│   └── background.ts          # Background (classification, recommendations, notifications)
├── shared/
│   ├── bookmarks.ts           # Keywords/Jaccard/URL validation
│   └── ui/                    # Lightweight UI (toast, switch)
server/
└── index.js                   # Fastify service (classify/recommend/copy)
```

## Permissions
- `bookmarks`, `storage`, `tabs`, `history`
- `notifications` for user-visible events
- `alarms` for periodic tasks
- `clipboardWrite` for copying generated share copy

## Settings Overview
- Basics: auto categorize, notifications, recommendations, invalid link check, theme accent
- Recommendation mode: `local` / `ai` / `auto` (auto enables AI when API key provided)
- Classification priority: user rules → server AI → local fallback
- Server settings: `serverUrl` (default `http://localhost:5175`), `aiProvider`/`aiApiKey`/`aiApiUrl`/`aiModel`

## Privacy & Security
- Local recommendation/cleanup run entirely in the browser
- AI endpoints only used when user provides API key
- No bookmark data is collected or uploaded to third-party servers

## Contributing
- Issues: describe the problem, reproduction steps, expected behavior, screenshots/logs
- PRs: Fork → feature branch → commit → pull request
- Requirements: pass `npm run typecheck`, follow existing patterns (React/WXT/MV3)

## License
- MIT — see `LICENSE`

---

RainMark · Make bookmark management smarter and faster 🚀
