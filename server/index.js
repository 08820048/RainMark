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
 * 使用 LLM 进行分类（支持 DeepSeek / OpenAI）
 * 根据环境变量自动选择提供商，不会记录任何密钥
 */
/**
 * 分类（AI）：支持从请求提供的选项或环境变量读取配置
 */
async function classifyWithAI(title, url, opts = {}) {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  const deepseekKey = opts.apiKey || process.env.DEEPSEEK_API_KEY;
  const openaiKey = opts.apiKey || process.env.OPENAI_API_KEY;
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
    // DeepSeek 优先（若 AI_PROVIDER=deepseek 或提供了 DEEPSEEK_API_KEY）
    if ((opts.provider === "deepseek") || provider === "deepseek" || deepseekKey) {
      const urlBase = opts.apiUrl || process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
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
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (allowed.has(text)) return text;
      return "其他";
    }
    // OpenAI 作为后备
    if ((opts.provider === "openai") || openaiKey) {
      const model = opts.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({ ...payload, model }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      if (allowed.has(text)) return text;
      return "其他";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * AI 重排候选推荐
 */
async function aiRerankCandidates(candidates, current, opts = {}) {
  const provider = (opts.provider || "").toLowerCase();
  const apiKey = opts.apiKey;
  const model = opts.model || (provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");
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
    if (provider === "deepseek") {
      const base = opts.apiUrl || "https://api.deepseek.com";
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "[]";
      const parsed = safeParseArray(text);
      if (parsed) return parsed;
      return null;
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "[]";
      const parsed = safeParseArray(text);
      if (parsed) return parsed;
      return null;
    }
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
    const useAI = !!apiKey && (provider === "deepseek" || provider === "openai");
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

fastify.options("/recommend/stream", async (request, reply) => {
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
