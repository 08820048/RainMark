// Fastify 本地服务：可供扩展在开发阶段调用
// - /classify: 根据标题与URL返回类别（支持AI可选）
// - /check: 检查URL是否可访问（服务端绕过CORS）
// - /health: 健康检查

const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");

// 启用 CORS（显式允许常见头与方法，兼容 MV3）
fastify.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
});

// 统一追加 CORS 头，确保所有响应（包含 SSE）包含必要头部
fastify.addHook("onSend", async (request, reply, payload) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  return payload;
});

/**
 * 提取关键词与 Jaccard（服务端版本）
 */
function extractKeywordsServer(text) {
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const stop = new Set([
    "the","and","or","but","in","on","at","to","for","of","with","by","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","should","could","can","may","might","must","this","that","these","those","then","than","from",
  ]);
  return words.filter((w) => !stop.has(w));
}
function jaccardServer(k1, k2) {
  const set1 = new Set(k1);
  const set2 = new Set(k2);
  const inter = [...set1].filter((x) => set2.has(x)).length;
  const union = set1.size + set2.size - inter;
  return union ? inter / union : 0;
}

/**
 * 分类（AI）：仅支持 DeepSeek
 */
async function classifyWithAI(title, url, opts = {}) {
  const deepseekKey = opts.apiKey || process.env.DEEPSEEK_API_KEY;
  function pickBase(p, given) {
    const def = "https://api.deepseek.com";
    if (!given) return def;
    const lower = String(given).toLowerCase();
    if (lower.includes("deepseek")) return given;
    return def;
  }
  function normalizeContent(msg) {
    if (typeof msg === "string") return msg.trim();
    if (Array.isArray(msg)) {
      const s = msg
        .map((p) => (typeof p === "string" ? p : (p && (p.text || p.content)) || ""))
        .join("");
      return String(s).trim();
    }
    return "";
  }
  const prompt = `
你是一个书签分类器，请根据标题与URL将书签归到以下类别之一，并只返回类别名：
- 工作
- 学习
- 娱乐
- 新闻
- 技术
- 购物
- 其他
标题: ${title}
URL: ${url}
请只返回中文类别名。`;
  const payload = {
    messages: [
      { role: "system", content: "你是一个高精度分类器，只返回有效类别名称" },
      { role: "user", content: prompt },
    ],
    temperature: 0,
  };
  const allowed = new Set(["工作", "学习", "娱乐", "新闻", "技术", "购物", "其他"]);
  try {
    const urlBase = pickBase("deepseek", opts.apiUrl || process.env.DEEPSEEK_API_URL);
    const model = opts.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const res = await fetch(`${urlBase}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({ ...payload, model }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = normalizeContent(data?.choices?.[0]?.message?.content);
    if (allowed.has(text)) return text;
    return "其他";
  } catch {
    return null;
  }
}

/**
 * AI 重排候选推荐
 */
async function aiRerankCandidates(candidates, current, opts = {}) {
  const apiKey = opts.apiKey;
  const model = opts.model || "deepseek-chat";
  if (!apiKey) return null;
  const prompt = {
    task: "对候选书签进行相关性排序，返回 JSON 格式：[{id:string, score:number}]，score 范围 0-1，最多返回 5 条。",
    current: { title: current.title || "", url: current.url || "" },
    candidates: candidates.map((c) => ({ id: c.id, title: c.title, url: c.url })),
  };
  const messages = [
    { role: "system", content: "你是一个推荐排序器，只返回严格的 JSON 数组，不要输出其他文本。" },
    { role: "user", content: JSON.stringify(prompt) },
  ];
  function safeParseArray(text) {
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    const cleaned = String(text).replace(/```json|```/g, "").trim();
    try {
      const parsed2 = JSON.parse(cleaned);
      if (Array.isArray(parsed2)) return parsed2;
    } catch {}
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed3 = JSON.parse(m[0]);
        if (Array.isArray(parsed3)) return parsed3;
      } catch {}
    }
    return null;
  }
  try {
    function pickBase(p, given) {
      const def = "https://api.deepseek.com";
      if (!given) return def;
      const lower = String(given).toLowerCase();
      if (lower.includes("deepseek")) return given;
      return def;
    }
    const base = pickBase("deepseek", opts.apiUrl);
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: "json_object" } }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = (function normalizeContentFull(d) {
        if (d?.choices?.[0]?.message?.parsed) {
          try {
            return JSON.stringify(d.choices[0].message.parsed);
          } catch {
            const p = d.choices[0].message.parsed;
            if (Array.isArray(p)) {
              try {
                return JSON.stringify(p);
              } catch {}
            }
          }
        }
        const msg = d?.choices?.[0]?.message?.content;
        if (typeof msg === "string") return msg.trim();
        if (Array.isArray(msg)) {
          const s = msg
            .map((p) => (typeof p === "string" ? p : (p && (p.text || p.content)) || ""))
            .join("");
          return String(s).trim();
        }
        return "";
      })(data) || "[]";
      const parsed = safeParseArray(text);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 分类接口：POST /classify
 */
fastify.post("/classify", async (request, reply) => {
  try {
    const {
      title = "",
      url = "",
      provider,
      apiKey,
      apiUrl,
      model,
    } = request.body || {};
    // 优先使用 AI 分类
    let category = await classifyWithAI(title, url, { provider, apiKey, apiUrl, model });
    if (!category) {
      const text = `${title} ${url}`.toLowerCase();
      category = "其他";
      if (/(work|job|office|company|business|meeting)/.test(text)) category = "工作";
      else if (/(study|learn|course|tutorial|education|school|university)/.test(text)) category = "学习";
      else if (/(entertainment|movie|music|game|fun|video)/.test(text)) category = "娱乐";
      else if (/(news|press|journal|media)/.test(text)) category = "新闻";
      else if (/(tech|development|programming|software|computer)/.test(text)) category = "技术";
      else if (/(shop|buy|store|mall|purchase)/.test(text)) category = "购物";
    }
    return { category };
  } catch (e) {
    reply.code(500);
    return { error: String(e) };
  }
});

/**
 * 链接检查：GET /check?url=...
 */
fastify.get("/check", async (request, reply) => {
  const url = request.query?.url;
  if (!url) return { valid: false };
  try {
    // 简化为发起一个 fetch；某些站点会因 CORS/证书问题返回失败
    const res = await fetch(url, { method: "HEAD" });
    return { valid: res.ok || true };
  } catch {
    return { valid: false };
  }
});

/**
 * 健康检查
 */
fastify.get("/health", async () => {
  return { ok: true, ts: Date.now() };
});

/**
 * 推荐接口：POST /recommend
 * 输入：{ current: {title,url}, candidates: [{id,title,url}], provider?, apiKey?, apiUrl?, model?, limit? }
 */
fastify.post("/recommend", async (request, reply) => {
  try {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    const { current, candidates = [], provider, apiKey, apiUrl, model, limit = 5 } = request.body || {};
    const curK = extractKeywordsServer(`${current?.title || ""} ${current?.url || ""}`);
    // 本地打分
    const scored = (candidates || []).map((c) => {
      const ks = extractKeywordsServer(`${c.title || ""} ${c.url || ""}`);
      const s = jaccardServer(curK, ks);
      return { ...c, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(10, limit * 4));
    // AI 重排（可选）
    let final = top;
    const aiResults = await aiRerankCandidates(top, current || {}, { provider, apiKey, apiUrl, model });
    if (aiResults && Array.isArray(aiResults)) {
      const scoreMap = new Map(aiResults.map((r) => [r.id, Number(r.score) || 0]));
      final = top
        .map((c) => ({ ...c, score: scoreMap.has(c.id) ? scoreMap.get(c.id) : c.score }))
        .sort((a, b) => b.score - a.score);
      fastify.log.info({ provider }, "recommend: AI rerank applied");
    } else {
      fastify.log.info({ provider }, "recommend: fallback to local ranking");
    }
    return { recommendations: final.slice(0, limit) };
  } catch (e) {
    reply.code(500);
    return { error: String(e) };
  }
});

/**
 * 基于查询需求的推荐：POST /recommend/query
 * 输入：{ query: string, candidates: [{id,title,url}], provider?, apiKey?, apiUrl?, model?, limit? }
 */
fastify.post("/recommend/query", async (request, reply) => {
  try {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    const { query = "", candidates = [], provider, apiKey, apiUrl, model, limit = 5 } = request.body || {};
    const curK = extractKeywordsServer(String(query || ""));
    const scored = (candidates || []).map((c) => {
      const ks = extractKeywordsServer(`${c.title || ""} ${c.url || ""}`);
      const s = jaccardServer(curK, ks);
      return { ...c, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(10, limit * 4));
    let final = top;
    const aiResults = await aiRerankCandidates(top, { title: String(query || ""), url: "" }, { provider, apiKey, apiUrl, model });
    if (aiResults && Array.isArray(aiResults)) {
      const scoreMap = new Map(aiResults.map((r) => [r.id, Number(r.score) || 0]));
      final = top
        .map((c) => ({ ...c, score: scoreMap.has(c.id) ? scoreMap.get(c.id) : c.score }))
        .sort((a, b) => b.score - a.score);
      fastify.log.info({ provider }, "recommend/query: AI rerank applied");
    } else {
      fastify.log.info({ provider }, "recommend/query: fallback to local ranking");
    }
    return { recommendations: final.slice(0, limit) };
  } catch (e) {
    reply.code(500);
    return { error: String(e) };
  }
});

fastify.options("/recommend", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  reply.code(204).send();
});

fastify.post("/recommend/stream", async (request, reply) => {
  const { current, candidates = [], provider, apiKey, apiUrl, model, limit = 5 } = request.body || {};
  // do not hijack to allow hooks/plugins to run
  try {
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.raw.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    if (typeof reply.raw.flushHeaders === "function") {
      try {
        reply.raw.flushHeaders();
      } catch {}
    }
  } catch {}
  const send = async (event, data, waitMs = 0) => {
    try {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      // heartbeat to encourage flush in some proxies/buffers
      reply.raw.write(`: ping\n\n`);
    } catch {}
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    } else {
      await new Promise((r) => setImmediate(r));
    }
  };
  try {
    const curK = extractKeywordsServer(`${current?.title || ""} ${current?.url || ""}`);
    const scored = (candidates || []).map((c) => {
      const ks = extractKeywordsServer(`${c.title || ""} ${c.url || ""}`);
      const s = jaccardServer(curK, ks);
      return { ...c, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(10, limit * 4));
    const useAI = !!apiKey && (provider === "deepseek");
    await send("mode", { mode: useAI ? "AI" : "Local" });
    for (const item of top.slice(0, limit)) {
      await send("item", { ...item, source: "Local" }, 40);
    }
    if (useAI) {
      const aiResults = await aiRerankCandidates(top, current || {}, { provider, apiKey, apiUrl, model });
      if (aiResults && Array.isArray(aiResults)) {
        const scoreMap = new Map(aiResults.map((r) => [r.id, Number(r.score) || 0]));
        const final = top
          .map((c) => ({ ...c, score: scoreMap.has(c.id) ? scoreMap.get(c.id) : c.score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        await send("reset", {});
        for (const item of final) {
          await send("item", { ...item, source: "AI" }, 60);
        }
      } else {
        await send("error", { error: "AI rerank returned empty" });
      }
    }
    await send("done", {});
    reply.raw.end();
  } catch (e) {
    try {
      await send("error", { error: String(e) });
      await send("done", {});
    } catch {}
    try {
      reply.raw.end();
    } catch {}
  }
});

// CORS plugin handles OPTIONS preflight globally; no explicit route needed here

/**
 * 基于查询需求的推荐（SSE）：POST /recommend/query/stream
 * 输入：{ query: string, candidates: [{id,title,url}], provider?, apiKey?, apiUrl?, model?, limit? }
 * 事件：mode/item/reset/error/done
 */
fastify.post("/recommend/query/stream", async (request, reply) => {
  const { query = "", candidates = [], provider, apiKey, apiUrl, model, limit = 5 } = request.body || {};
  try {
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.raw.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    if (typeof reply.raw.flushHeaders === "function") {
      try {
        reply.raw.flushHeaders();
      } catch {}
    }
  } catch {}
  const send = async (event, data, waitMs = 0) => {
    try {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      reply.raw.write(`: ping\n\n`);
    } catch {}
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    } else {
      await new Promise((r) => setImmediate(r));
    }
  };
  try {
    const curK = extractKeywordsServer(String(query || ""));
    const scored = (candidates || []).map((c) => {
      const ks = extractKeywordsServer(`${c.title || ""} ${c.url || ""}`);
      const s = jaccardServer(curK, ks);
      return { ...c, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(10, limit * 4));
    const useAI = !!apiKey && (provider === "deepseek");
    await send("mode", { mode: useAI ? "AI" : "Local" });
    for (const item of top.slice(0, limit)) {
      await send("item", { ...item, source: "Local" }, 40);
    }
    if (useAI) {
      const aiResults = await aiRerankCandidates(top, { title: String(query || ""), url: "" }, { provider, apiKey, apiUrl, model });
      if (aiResults && Array.isArray(aiResults)) {
        const scoreMap = new Map(aiResults.map((r) => [r.id, Number(r.score) || 0]));
        const final = top
          .map((c) => ({ ...c, score: scoreMap.has(c.id) ? scoreMap.get(c.id) : c.score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        await send("reset", {});
        for (const item of final) {
          await send("item", { ...item, source: "AI" }, 60);
        }
      } else {
        await send("error", { error: "AI rerank returned empty" });
      }
    }
    await send("done", {});
    reply.raw.end();
  } catch (e) {
    try {
      await send("error", { error: String(e) });
      await send("done", {});
    } catch {}
    try {
      reply.raw.end();
    } catch {}
  }
});

/**
 * 模型列表接口：POST /models
 * 输入：{ provider, apiKey, apiUrl }
 * 输出：{ models: string[] }
 */
fastify.post("/models", async (request, reply) => {
  try {
    const { provider = "", apiKey = "", apiUrl = "" } = request.body || {};
    const p = String(provider || "").toLowerCase();
    const base = (function pickBaseLocal(pp, given) {
      const def = "https://api.deepseek.com";
      if (!given) return def;
      const lower = String(given).toLowerCase();
      if (lower.includes("deepseek")) return given;
      return def;
    })(p, apiUrl);
    let endpoint = "";
    if (p === "deepseek") endpoint = `${base}/v1/models`;
    let models = [];
    try {
      if (endpoint && apiKey) {
        const res = await fetch(endpoint, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
          models = arr
            .map((x) => x?.id || x?.model || x)
            .filter((id) => typeof id === "string");
        }
      }
    } catch {}
    if (!Array.isArray(models) || models.length === 0) {
      const defaults = {
        deepseek: ["deepseek-chat", "deepseek-reasoner"],
      };
      models = defaults[p] || ["deepseek-chat"];
    }
    return { models };
  } catch (e) {
    reply.code(500);
    return { error: String(e) };
  }
});

fastify.post("/validate", async (request, reply) => {
  try {
    const { provider = "", apiKey = "", apiUrl = "", model = "" } = request.body || {};
    const p = String(provider || "").toLowerCase();
    const m = String(model || "").trim();
    const base = (function pickBaseLocal(pp, given) {
      const def = "https://api.deepseek.com";
      if (!given) return def;
      const lower = String(given).toLowerCase();
      if (lower.includes("deepseek")) return given;
      return def;
    })(p, apiUrl);
    const testMsg = [
      { role: "system", content: "check" },
      { role: "user", content: "ping" },
    ];
    const tryChat = async () => {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: m || "deepseek-chat", messages: testMsg, temperature: 0 }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, status: res.status, message: text.slice(0, 300) };
      }
      return { ok: true };
    };
    const result = await tryChat();
    return result;
  } catch (e) {
    reply.code(500);
    return { ok: false, error: String(e) };
  }
});

fastify.options("/recommend/stream", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  reply.code(204).send();
});

/**
 * 解析页面 HTML 元信息（title、description、OG/Twitter 标签）
 */
function extractPageMeta(html = "") {
  const txt = String(html || "");
  function pick(re) {
    const m = txt.match(re);
    return m ? String(m[1] || "").trim() : "";
  }
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const ogTitle =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return { title, description: desc, ogTitle, siteName };
}

/**
 * 生成分享文案（AI，可选）
 */
async function generateShareCopyWithAI(meta, opts = {}) {
  const apiKey = opts.apiKey || process.env.DEEPSEEK_API_KEY;
  const model = opts.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return null;
  const base = opts.apiUrl || process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
  const lang = String(opts.lang || "zh").toLowerCase() === "en" ? "en" : "zh";
  const info = {
    url: meta.url || "",
    domain: (() => {
      try {
        return new URL(meta.url || "").hostname || "";
      } catch {
        return "";
      }
    })(),
    title: meta.title || meta.ogTitle || "",
    description: meta.description || "",
    siteName: meta.siteName || "",
  };
  const prompt =
    lang === "en"
      ? `Generate a short, objective one-sentence English share copy (max 80 characters) for this webpage.
Requirements: briefly describe the site's/page's core function; do not include the URL; avoid marketing buzzwords.
Info:
- Title: ${info.title}
- Description: ${info.description}
- SiteName: ${info.siteName}
- Domain: ${info.domain}`
      : `请为以下网页生成一个简短、客观的中文分享文案（不超过60字），
要求：简要说明该网站/页面的基本功能或核心用途；不要包含URL；避免营销词和夸张语；只返回文案本身。
信息：
- 标题：${info.title}
- 简介：${info.description}
- 站点名：${info.siteName}
- 域名：${info.domain}`;
  const messages =
    lang === "en"
      ? [
          { role: "system", content: "You are a concise copywriter who outputs a single objective English sentence." },
          { role: "user", content: prompt },
        ]
      : [
          { role: "system", content: "你是一个分享文案生成器，输出精炼、客观的中文一句话。" },
          { role: "user", content: prompt },
        ];
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return text.slice(0, 120);
  } catch {
    return null;
  }
}

/**
 * 基于页面元信息生成分享文案（无 AI 的回退）
 */
function composeShareCopyFromMeta(meta = {}, lang = "zh") {
  const site = String(meta.siteName || "").trim();
  const title = String(meta.title || meta.ogTitle || "").trim();
  const desc = String(meta.description || "").trim();
  const domain = (() => {
    try {
      return new URL(meta.url || "").hostname || "";
    } catch {
      return "";
    }
  })();
  const name = site || title || domain;
  const base = desc || title || domain;
  if (String(lang || "zh").toLowerCase() === "en") {
    const ascii = (s) =>
      String(s || "")
        .replace(/[^\x00-\x7F]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const nameEn = ascii(name);
    const baseEn = ascii(base);
    const content = baseEn && baseEn.length > 6 ? baseEn : "A helpful website";
    const titlePart = nameEn || (domain ? domain.split(".")[0] : "");
    const text = `${titlePart ? `${titlePart}: ` : ""}${content}`.slice(0, 100);
    return text;
  } else {
    const text = `${name ? `${name}：` : ""}${base}`.replace(/\s+/g, " ").slice(0, 80);
    return text;
  }
}

/**
 * 从元信息推断标签，包含站点/类别/固定标签（按语言）
 */
function composeTagsFromMeta(meta = {}, lang = "en") {
  const isEn = String(lang || "en").toLowerCase() === "en";
  const fixed = isEn ? ["#RainMarkExtension", "#Bookmarks"] : ["#RainMark插件", "#书签"];
  const domain = (() => {
    try {
      return new URL(meta.url || "").hostname || "";
    } catch {
      return "";
    }
  })();
  const site = String(meta.siteName || "").trim();
  const title = String(meta.title || meta.ogTitle || "").trim();
  function toTag(raw) {
    const s = String(raw || "")
      .replace(/[\u2700-\u27BF]/g, "")
      .replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim()
      .split(/\s+/)[0];
    if (!s) return null;
    return `#${s}`;
  }
  const siteTag = toTag(site) || toTag(title) || (domain ? `#${domain.split(".")[0]}` : null);
  const catTag = (() => {
    const text = `${title} ${domain}`.toLowerCase();
    if (isEn) {
      if (/(tech|development|programming|software|code|engineer)/.test(text)) return "#Tech";
      if (/(study|learn|course|tutorial|education|school|university)/.test(text)) return "#Study";
      if (/(news|press|journal|media)/.test(text)) return "#News";
      if (/(shop|buy|store|mall|purchase)/.test(text)) return "#Shopping";
      if (/(entertainment|movie|music|game|fun|video)/.test(text)) return "#Entertainment";
      if (/(wechat|weixin|公众号|markdown)/i.test(text)) return "#WeChat";
    } else {
      if (/(tech|development|programming|software|code|engineer)/.test(text)) return "#技术";
      if (/(study|learn|course|tutorial|education|school|university)/.test(text)) return "#学习";
      if (/(news|press|journal|media)/.test(text)) return "#新闻";
      if (/(shop|buy|store|mall|purchase)/.test(text)) return "#购物";
      if (/(entertainment|movie|music|game|fun|video)/.test(text)) return "#娱乐";
      if (/(wechat|weixin|公众号|markdown)/i.test(text)) return "#公众号";
    }
    return null;
  })();
  const tags = [...fixed, siteTag, catTag].filter(Boolean);
  return tags.slice(0, 4);
}

/**
 * 分享文案生成：POST /share/summarize
 * 输入：{ url, title?, provider?, apiKey?, apiUrl?, model? }
 * 返回：{ text }
 */
fastify.post("/share/summarize", async (request, reply) => {
  try {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
    const { url, title = "", provider, apiKey, apiUrl, model, lang = "zh" } = request.body || {};
    let html = "";
    try {
      if (url) {
        const r = await fetch(url, { method: "GET" });
        html = await r.text();
      }
    } catch {}
    const meta = { url, title, ...extractPageMeta(html) };
    const aiText = await generateShareCopyWithAI(meta, { provider, apiKey, apiUrl, model, lang });
    const nonAi = composeShareCopyFromMeta(meta, lang);
    const tags = composeTagsFromMeta(meta, lang);
    return { text: aiText || nonAi, tags };
  } catch (e) {
    reply.code(500);
    return { error: String(e) };
  }
});

fastify.options("/share/summarize", async (request, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
  reply.code(204).send();
});

/**
 * 启动服务
 */
async function start() {
  try {
    const port = process.env.PORT ? Number(process.env.PORT) : 5175;
    await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info(`Fastify server listening on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
