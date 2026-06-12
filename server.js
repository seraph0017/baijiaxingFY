import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const currentFile = fileURLToPath(import.meta.url);
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(rootDir, "data");
const assetsDir = resolve(rootDir, "assets");
const backupDir = join(dataDir, "backups");
const workspacePath = join(dataDir, "workspace.json");
const seedWorkspacePath = join(rootDir, "data", "seed-workspace.json");
const auditPath = join(dataDir, "audit.log");
const feedbackPath = join(dataDir, "feedback.jsonl");
const readEnvText = (name) => String(process.env[name] || "").trim();
const readPositiveIntegerEnv = (name, fallback) => {
  const value = Number.parseInt(readEnvText(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const readPortEnv = (name, fallback) => {
  const value = readPositiveIntegerEnv(name, fallback);
  return value <= 65_535 ? value : fallback;
};
const port = readPortEnv("PORT", 8765);
const host = readEnvText("HOST") || "127.0.0.1";
const defaultSiteOrigin = `http://${host}:${port}`;
const readSiteOriginEnv = (fallback) => {
  const configured = readEnvText("SITE_ORIGIN");
  if (!configured) return fallback;
  try {
    const parsed = new URL(configured);
    if (!["http:", "https:"].includes(parsed.protocol)) return fallback;
    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
};
const isProduction = process.env.NODE_ENV === "production";
const adminToken = readEnvText("ADMIN_TOKEN");
const defaultAiEndpoint = readEnvText("AI_ENDPOINT");
const defaultAiApiKey = readEnvText("AI_API_KEY");
const configuredAiModel = readEnvText("AI_MODEL");
const defaultAiModel = configuredAiModel || "gpt-4.1-mini";
const AI_TIMEOUT_MS = readPositiveIntegerEnv("AI_TIMEOUT_MS", 30_000);
const REQUEST_TIMEOUT_MS = readPositiveIntegerEnv("REQUEST_TIMEOUT_MS", 30_000);
const BACKUP_RETENTION = readPositiveIntegerEnv("BACKUP_RETENTION", 20);
const siteOrigin = readSiteOriginEnv(defaultSiteOrigin);
const trustProxy = readEnvText("TRUST_PROXY").toLowerCase() === "true";
const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const WRITE_LIMIT_PER_MINUTE = readPositiveIntegerEnv("WRITE_LIMIT_PER_MINUTE", 60);
const AI_LIMIT_PER_MINUTE = readPositiveIntegerEnv("AI_LIMIT_PER_MINUTE", 12);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function securityHeaders(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'self'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer"
  };
}

function send(res, status, body, contentType = "application/json; charset=utf-8", extraHeaders = {}) {
  const requestId = res.requestId || "";
  const headers = requestId ? { "x-request-id": requestId, ...extraHeaders } : extraHeaders;
  const payload = !(Buffer.isBuffer(body) || typeof body === "string") && requestId && body?.ok === false && body?.error
    ? { ...body, requestId }
    : body;
  const responseBody = Buffer.isBuffer(payload) || typeof payload === "string"
    ? payload
    : JSON.stringify(payload);
  const contentLength = Buffer.isBuffer(responseBody)
    ? responseBody.length
    : Buffer.byteLength(responseBody, "utf8");
  res.writeHead(status, {
    ...securityHeaders(contentType),
    "content-length": String(contentLength),
    ...headers
  });
  res.end(responseBody);
}

function assignRequestId(req, res) {
  const inbound = String(req.headers["x-request-id"] || "").trim();
  const requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(inbound) ? inbound : `req-${randomUUID()}`;
  req.requestId = requestId;
  res.requestId = requestId;
}

const apiAllowedMethods = new Map([
  ["/api/health", "GET, HEAD"],
  ["/api/bootstrap", "GET"],
  ["/api/surnames", "GET"],
  ["/api/surname", "GET"],
  ["/api/workspace", "GET, POST, DELETE"],
  ["/api/audit", "GET"],
  ["/api/feedback", "GET, POST, PATCH"],
  ["/api/ai-draft", "POST"]
]);

function createStaticEtag(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  return `"sha256-${createHash("sha256").update(buffer).digest("base64url").slice(0, 24)}"`;
}

function getStaticCacheControl(requested) {
  if (requested.startsWith("/assets/")) {
    return "public, max-age=300, must-revalidate";
  }
  return "no-store";
}

function httpError(message, statusCode = 500, headers = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.headers = headers;
  return error;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function rateLimitKey(req, scope) {
  const forwarded = trustProxy ? req.headers["x-forwarded-for"] : "";
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.socket.remoteAddress || "local");
  return `${scope}:${ip.split(",")[0].trim()}`;
}

function cleanupRateBuckets(now) {
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

export function getRateBucketCount() {
  return rateBuckets.size;
}

function enforceRateLimit(req, scope, limit) {
  const key = rateLimitKey(req, scope);
  const now = Date.now();
  cleanupRateBuckets(now);
  const bucket = rateBuckets.get(key) || { resetAt: now + RATE_LIMIT_WINDOW_MS, count: 0 };
  if (bucket.resetAt <= now) {
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw httpError("请求过于频繁，请稍后再试", 429, { "retry-after": String(retryAfter) });
  }
}

function requireAdmin(req) {
  if (!adminToken && isProduction) {
    throw httpError("生产环境必须设置 ADMIN_TOKEN", 503);
  }
  if (!adminToken) return;
  const provided = req.headers["x-admin-token"];
  if (provided !== adminToken) {
    throw httpError("缺少或错误的管理令牌", 401);
  }
}

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    let size = 0;
    let settled = false;
    function finishBody(error, value) {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolveBody(value);
    }
    req.on("data", chunk => {
      if (settled) return;
      size += Buffer.byteLength(chunk);
      if (size > 5_000_000) {
        finishBody(httpError("请求体过大", 413));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (settled) return;
      try {
        finishBody(null, raw ? JSON.parse(raw) : {});
      } catch {
        finishBody(validationError("JSON 格式不正确"));
      }
    });
    req.on("error", error => finishBody(error));
  });
}

function ensureDataDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!statSync(dataDir).isDirectory()) {
    throw new Error("运行数据路径不是目录");
  }
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  if (!statSync(backupDir).isDirectory()) {
    throw new Error("备份路径不是目录");
  }
}

function getStorageStatus() {
  try {
    ensureDataDir();
    const probePath = join(dataDir, `.health-${randomUUID()}.tmp`);
    writeFileSync(probePath, "ok");
    unlinkSync(probePath);
    return {
      runtimeDirConfigured: Boolean(process.env.DATA_DIR),
      storageWritable: true
    };
  } catch (error) {
    return {
      runtimeDirConfigured: Boolean(process.env.DATA_DIR),
      storageWritable: false,
      storageError: "运行数据目录不可用"
    };
  }
}

function getMissingProductionConfig() {
  const missing = [];
  if (isProduction && !adminToken) missing.push("ADMIN_TOKEN");
  if (isProduction && (!defaultAiEndpoint || !defaultAiApiKey)) missing.push("AI_ENDPOINT 和 AI_API_KEY");
  return missing;
}

function getConfigStatus() {
  const missing = getMissingProductionConfig();
  let invalid = false;
  if (isProduction && !missing.length) {
    try {
      validateAiConfigValue({
        endpoint: defaultAiEndpoint,
        apiKey: defaultAiApiKey,
        model: defaultAiModel
      });
    } catch {
      invalid = true;
    }
  }
  return {
    configReady: missing.length === 0 && !invalid,
    configError: missing.length || invalid ? "生产配置未就绪" : ""
  };
}

function validateAiConfigValue(config) {
  if (typeof config.endpoint !== "string" || !config.endpoint.trim()) {
    throw validationError("AI endpoint 必须是 HTTP(S) URL");
  }
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(config.endpoint);
  } catch {
    throw validationError("AI endpoint 必须是 HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(parsedEndpoint.protocol)) {
    throw validationError("AI endpoint 必须是 HTTP(S) URL");
  }
  if (typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw validationError("AI apiKey 必须是非空字符串");
  }
  if (typeof config.model !== "string" || !config.model.trim()) {
    throw validationError("AI model 必须是非空字符串");
  }
}

function resolveAiConfig(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("AI 请求必须是 JSON 对象");
  }
  if (isProduction && (!defaultAiEndpoint || !defaultAiApiKey)) {
    throw httpError(`生产环境必须设置 ${getMissingProductionConfig().join("、")}`, 503);
  }
  const config = {
    endpoint: defaultAiEndpoint || payload.endpoint,
    apiKey: defaultAiApiKey || payload.apiKey,
    model: configuredAiModel || payload.model || defaultAiModel
  };
  validateAiConfigValue(config);
  return config;
}

function validateAiMessages(messages) {
  const allowedRoles = new Set(["system", "user", "assistant"]);
  if (!Array.isArray(messages) || !messages.length) {
    throw validationError("AI messages 必须是非空数组");
  }
  if (messages.some(message => (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    !allowedRoles.has(String(message.role || "")) ||
    typeof message.content !== "string" ||
    !message.content.trim()
  ))) {
    throw validationError("AI messages 条目必须包含 role 和 content");
  }
}

function assertWorkspaceShape(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("工作区必须是 JSON 对象");
  }
  const isNonEmptyString = (value) => typeof value === "string" && value.trim();
  if (payload.surnames !== undefined && (typeof payload.surnames !== "object" || Array.isArray(payload.surnames))) {
    throw validationError("surnames 必须是对象");
  }
  if (payload.surnames !== undefined && !Object.keys(payload.surnames).length) {
    throw validationError("surnames 至少需要包含一个姓氏档案");
  }
  if (payload.surnames && Object.entries(payload.surnames).some(([key, item]) => (
    !item || typeof item !== "object" || Array.isArray(item) || typeof item.char !== "string" || !item.char.trim() || item.char.trim() !== key
  ))) {
    throw validationError("surnames 条目必须是对象，且 char 必须与键名一致");
  }
  if (payload.surnames && Object.entries(payload.surnames).some(([key, item]) => isLatinLikeName(key) || isLatinLikeName(item.char))) {
    throw validationError("工作区姓氏格式不正确");
  }
  if (payload.markdownCorpus !== undefined && !Array.isArray(payload.markdownCorpus)) {
    throw validationError("markdownCorpus 必须是数组");
  }
  if (payload.reviewState !== undefined && !Array.isArray(payload.reviewState)) {
    throw validationError("reviewState 必须是数组");
  }
  if (payload.markdownCorpus?.some(item => (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    !isNonEmptyString(item.surname) ||
    !isNonEmptyString(item.title) ||
    !isNonEmptyString(item.content)
  ))) {
    throw validationError("markdownCorpus 条目必须包含 surname、title、content");
  }
  if (payload.markdownCorpus?.some(item => isLatinLikeName(item.surname))) {
    throw validationError("工作区资料姓氏格式不正确");
  }
  if (payload.reviewState?.some(item => (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    !isNonEmptyString(item.surname) ||
    !isNonEmptyString(item.title) ||
    !isNonEmptyString(item.status)
  ))) {
    throw validationError("reviewState 条目必须包含 surname、title、status");
  }
  if (payload.reviewState?.some(item => isLatinLikeName(item.surname))) {
    throw validationError("工作区审核姓氏格式不正确");
  }
}

function appendAudit(event, req, details = {}) {
  try {
    ensureDataDir();
    appendFileSync(auditPath, `${JSON.stringify({
      event,
      at: new Date().toISOString(),
      method: req.method,
      path: req.url,
      ip: req.socket.remoteAddress,
      requestId: req.requestId || "",
      details
    })}\n`);
  } catch (error) {
    console.warn(`审计日志写入失败：${error.message}`);
  }
}

function readJsonLines(filePath, { failMessage = "" } = {}) {
  if (!existsSync(filePath)) return [];
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if (failMessage) {
      throw httpError(failMessage, 503);
    }
    return [];
  }
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readAuditList(limit = 80) {
  return readJsonLines(auditPath)
    .slice(-limit)
    .reverse();
}

function backupWorkspace() {
  ensureDataDir();
  if (!existsSync(workspacePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(workspacePath, join(backupDir, `workspace-${stamp}-${Math.random().toString(16).slice(2, 8)}.json`));
  pruneWorkspaceBackups();
}

function pruneWorkspaceBackups() {
  const files = readdirSync(backupDir)
    .filter(name => /^workspace-.+\.json$/.test(name))
    .sort();
  const removable = files.slice(0, Math.max(0, files.length - BACKUP_RETENTION));
  removable.forEach(name => {
    rmSync(join(backupDir, name), { force: true });
  });
}

function removeTempFile(tempPath) {
  try {
    rmSync(tempPath, { force: true });
  } catch {
    // Keep the original write/rename error as the one reported to callers.
  }
}

function writeJsonFileAtomic(filePath, payload) {
  const tempPath = join(dirname(filePath), `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  try {
    writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    renameSync(tempPath, filePath);
  } catch (error) {
    removeTempFile(tempPath);
    throw error;
  }
}

function writeTextFileAtomic(filePath, text) {
  const tempPath = join(dirname(filePath), `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  try {
    writeFileSync(tempPath, text);
    renameSync(tempPath, filePath);
  } catch (error) {
    removeTempFile(tempPath);
    throw error;
  }
}

function saveWorkspace(payload) {
  assertWorkspaceShape(payload);
  if (payload.surnames === undefined) {
    throw validationError("工作区必须包含 surnames");
  }
  try {
    ensureDataDir();
    backupWorkspace();
    writeJsonFileAtomic(workspacePath, {
      ...payload,
      savedAt: new Date().toISOString()
    });
  } catch {
    throw httpError("工作区文件不可写，请检查运行数据目录", 503);
  }
}

const feedbackStatuses = new Set(["待处理", "处理中", "已处理", "已关闭"]);

function cleanFeedbackContent(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFeedbackContent(value) {
  return cleanFeedbackContent(value).slice(0, 2000);
}

function stableFeedbackId(source) {
  const fingerprint = [
    normalizeSurnameName(source.surname),
    normalizeFeedbackContent(source.content),
    String(source.createdAt || "").trim()
  ].join("|");
  return `fb-imported-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 12)}`;
}

function normalizeFeedbackContact(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function isLatinLikeName(value) {
  return /^[a-z0-9\s._-]+$/i.test(String(value || "").trim());
}

function normalizeFeedbackItem(item) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const id = String(source.id || "").trim() || stableFeedbackId(source);
  const surname = normalizeSurnameName(source.surname) || "未指定";
  const content = normalizeFeedbackContent(source.content) || "历史反馈内容缺失。";
  const status = feedbackStatuses.has(String(source.status || "").trim()) ? String(source.status).trim() : "待处理";
  return {
    ...source,
    id,
    surname,
    content,
    contact: normalizeFeedbackContact(source.contact),
    status,
    createdAt: String(source.createdAt || "").trim() || new Date(0).toISOString()
  };
}

function saveFeedback(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("反馈必须是 JSON 对象");
  }
  const surname = normalizeSurnameName(payload.surname);
  const content = cleanFeedbackContent(payload.content);
  const contact = normalizeFeedbackContact(payload.contact);
  if (!surname) {
    throw validationError("反馈姓氏不能为空");
  }
  if (isLatinLikeName(payload.surname)) {
    throw validationError("反馈姓氏格式不正确");
  }
  if (!content || content.length < 4) {
    throw validationError("反馈内容过短");
  }
  if (content.length > 2000) {
    throw validationError("反馈内容过长");
  }
  ensureDataDir();
  const item = {
    id: `fb-${Date.now()}-${randomUUID().slice(0, 8)}`,
    surname,
    content,
    contact,
    status: "待处理",
    createdAt: new Date().toISOString()
  };
  try {
    appendFileSync(feedbackPath, `${JSON.stringify(item)}\n`);
  } catch {
    throw httpError("反馈文件不可写，请检查运行数据目录", 503);
  }
  return item;
}

function readFeedbackList() {
  return readJsonLines(feedbackPath, { failMessage: "反馈文件不可读，请检查运行数据目录" })
    .map(normalizeFeedbackItem)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function writeFeedbackList(items) {
  ensureDataDir();
  try {
    writeTextFileAtomic(feedbackPath, `${items.map(item => JSON.stringify(item)).join("\n")}${items.length ? "\n" : ""}`);
  } catch {
    throw httpError("反馈文件不可写，请检查运行数据目录", 503);
  }
}

function updateFeedbackStatus(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("反馈状态更新必须是 JSON 对象");
  }
  const id = String(payload.id || "").trim();
  const status = String(payload.status || "").trim();
  if (!id || !feedbackStatuses.has(status)) {
    throw validationError("反馈 ID 或状态不正确");
  }
  const items = readFeedbackList();
  const item = items.find(entry => entry.id === id);
  if (!item) throw httpError("反馈不存在", 404);
  item.status = status;
  item.updatedAt = new Date().toISOString();
  writeFeedbackList(items);
  return item;
}

function readSeedWorkspace() {
  if (!existsSync(seedWorkspacePath)) {
    return { version: 1, surnames: {}, markdownCorpus: [], reviewState: [] };
  }
  const payload = JSON.parse(readFileSync(seedWorkspacePath, "utf8"));
  assertWorkspaceShape(payload);
  return payload;
}

function readPublicWorkspace() {
  if (!existsSync(workspacePath)) return readSeedWorkspace();
  try {
    const payload = JSON.parse(readFileSync(workspacePath, "utf8"));
    assertWorkspaceShape(payload);
    return payload;
  } catch {
    return readSeedWorkspace();
  }
}

function readRuntimeWorkspaceStrict() {
  try {
    const payload = JSON.parse(readFileSync(workspacePath, "utf8"));
    assertWorkspaceShape(payload);
    return payload;
  } catch {
    throw httpError("工作区文件损坏，请从备份恢复", 503);
  }
}

function getSurnameSummaries(workspace) {
  return Object.values(workspace.surnames || {})
    .map(item => normalizePublicSurnameProfile(item, item.char))
    .map(profile => ({
      char: profile.char,
      traditional: profile.traditional,
      pinyin: profile.pinyin,
      dynasty: profile.dynasty,
      ancestor: profile.ancestor,
      tags: profile.tags.slice(0, 4),
      sourceCount: profile.sources.length,
      summary: profile.summary
    }))
    .sort((a, b) => String(a.char).localeCompare(String(b.char), "zh-Hans-CN"));
}

function filterSurnameSummaries(summaries, query) {
  const keyword = String(query || "").trim().toLowerCase();
  if (!keyword) return summaries;
  const surnameKeyword = normalizeSurnameName(keyword).toLowerCase();
  const keywords = Array.from(new Set([keyword, surnameKeyword].filter(Boolean)));
  return summaries.filter(item => [
    item.char,
    item.traditional,
    item.pinyin,
    item.dynasty,
    item.ancestor,
    item.summary,
    ...(item.tags || [])
  ].some(value => {
    const text = String(value || "").toLowerCase();
    return keywords.some(term => text.includes(term));
  }));
}

function compactLookupText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function resolveWorkspaceSurnameKey(workspace, query) {
  const raw = String(query || "").trim();
  const normalized = normalizeSurnameName(raw);
  if (normalized && workspace.surnames?.[normalized]) return normalized;
  const candidates = Array.from(new Set([raw, normalized].map(compactLookupText).filter(Boolean)));
  if (!candidates.length) return "";
  const matched = Object.entries(workspace.surnames || {}).find(([key, item]) => {
    const profile = normalizePublicSurnameProfile(item, key);
    return [
      profile.char,
      profile.traditional,
      profile.info?.["繁体"],
      profile.pinyin,
      profile.info?.["拼音"]
    ].some(field => candidates.includes(compactLookupText(field)));
  });
  return matched?.[0] || "";
}

function normalizeLimit(value, fallback = 50, max = 500) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeSurnameName(value) {
  return String(value || "").trim().replace(/(姓氏|姓|氏)$/, "").slice(0, 4);
}

function normalizePublicText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clampMapCoordinate(value, fallback) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

function normalizeMigrationRows(rows, char) {
  const defaults = [
    ["秦汉", `${char}姓秦汉迁徙线索待补充。`],
    ["魏晋南北朝", `${char}姓魏晋南北朝迁徙线索待补充。`],
    ["唐宋元明清", `${char}姓唐宋元明清迁徙线索待补充。`],
    ["近现代", `${char}姓近现代分布线索待补充。`]
  ];
  if (!Array.isArray(rows) || rows.length < 4) return defaults;
  return rows.slice(0, 4).map((row, index) => {
    if (!Array.isArray(row)) return defaults[index];
    return [
      normalizePublicText(row[0], defaults[index][0]),
      normalizePublicText(row[1], defaults[index][1])
    ];
  });
}

function normalizeRouteRows(rows, char) {
  const defaults = [
    { phase: "待补", place: "发源地待考", reason: "需补充来源资料", x: 12, y: 50 },
    { phase: "待补", place: "郡望待考", reason: "需文史编辑审核", x: 36, y: 38 },
    { phase: "待补", place: "迁徙节点待补", reason: "需地方志或族谱线索", x: 62, y: 56 },
    { phase: "待补", place: "现状分布待补", reason: "需人口与公开资料", x: 84, y: 34 }
  ];
  if (!Array.isArray(rows) || rows.length < 4) return defaults.map(item => ({ ...item, place: item.place.replace("待", `${char}姓待`) }));
  return rows.slice(0, 4).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return defaults[index];
    return {
      phase: normalizePublicText(item.phase, defaults[index].phase),
      place: normalizePublicText(item.place, defaults[index].place),
      reason: normalizePublicText(item.reason, defaults[index].reason),
      x: clampMapCoordinate(item.x, defaults[index].x),
      y: clampMapCoordinate(item.y, defaults[index].y)
    };
  });
}

function normalizePublicSurnameProfile(item, fallbackName = "") {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  const char = normalizeSurnameName(source.char || fallbackName) || "未";
  const info = source.info && typeof source.info === "object" && !Array.isArray(source.info) ? source.info : {};
  const traditional = normalizePublicText(source.traditional || info["繁体"], char);
  const pinyin = normalizePublicText(source.pinyin || info["拼音"], "待补充");
  const dynasty = normalizePublicText(source.dynasty || info["起源朝代"], "待考");
  const ancestor = normalizePublicText(source.ancestor || info["得姓始祖"], "待考");
  const defaultOrigins = [{ title: `${char}姓源流待补`, text: "当前档案处于资料沉淀阶段，需补充典籍、地方志或公开资料摘录。", level: "待补来源" }];
  const defaultFigures = [{ name: `${char}姓名人典故待补`, desc: "新增资料后由 AI 抽取人物、典故和家风线索，编辑审核后发布。", type: "待审核" }];
  const visuals = source.visuals && typeof source.visuals === "object" && !Array.isArray(source.visuals) ? source.visuals : {};
  return {
    ...source,
    char,
    traditional,
    pinyin,
    dynasty,
    ancestor,
    summary: normalizePublicText(source.summary, `${char}姓档案正在沉淀中，需补充权威来源、迁徙线索、人物典故和家风资料。`),
    tags: Array.isArray(source.tags) && source.tags.length ? source.tags.map(tag => normalizePublicText(tag, "待补来源")) : ["待补来源", "人工审核"],
    info: {
      ...info,
      "繁体": traditional,
      "拼音": pinyin,
      "起源朝代": dynasty,
      "得姓始祖": ancestor,
      "郡望": normalizePublicText(info["郡望"], "待补充"),
      "堂号": normalizePublicText(info["堂号"], "待补充")
    },
    origins: Array.isArray(source.origins) && source.origins.length ? source.origins.map(origin => ({
      title: normalizePublicText(origin?.title, `${char}姓源流待补`),
      text: normalizePublicText(origin?.text, "需补充来源资料。"),
      level: normalizePublicText(origin?.level, "待补来源")
    })) : defaultOrigins,
    migrations: normalizeMigrationRows(source.migrations, char),
    route: normalizeRouteRows(source.route, char),
    branches: Array.isArray(source.branches) && source.branches.length ? source.branches.map(item => normalizePublicText(item, "待补充分支线索。")) : [`${char}姓分支脉络待补充。`],
    visuals: {
      totem: normalizePublicText(visuals.totem, `${char}姓图腾说明待设计确认。`),
      glyph: normalizePublicText(visuals.glyph, `${char}姓字形演变资料待补充。`),
      stages: Array.isArray(visuals.stages) && visuals.stages.length ? visuals.stages.map(stage => normalizePublicText(stage, char)) : ["待", "补", "字", char]
    },
    figures: Array.isArray(source.figures) && source.figures.length ? source.figures.map(figure => ({
      name: normalizePublicText(figure?.name, `${char}姓人物待补`),
      desc: normalizePublicText(figure?.desc, "需补充生平、功绩、来源和可信等级。"),
      type: normalizePublicText(figure?.type, "待审核")
    })) : defaultFigures,
    sources: Array.isArray(source.sources) && source.sources.length ? source.sources.map(sourceName => normalizePublicText(sourceName, "待补来源")) : ["待补来源"]
  };
}

function serveStatic(req, res, pathname) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    send(res, 405, { ok: false, error: "Method not allowed" }, "application/json; charset=utf-8", { allow: "GET, HEAD" });
    return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const isRootStatic = requested === "/index.html" || requested === "/robots.txt" || requested === "/sitemap.xml" || requested === "/manifest.webmanifest";
  const isAssetStatic = requested.startsWith("/assets/");
  const isAllowedStatic = isRootStatic || isAssetStatic;
  if (!isAllowedStatic || requested.startsWith("/data/")) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  let decodedRequested = "";
  try {
    decodedRequested = decodeURIComponent(requested);
  } catch {
    throw validationError("URL 编码不正确");
  }
  const filePath = normalize(resolve(rootDir, `.${decodedRequested}`));
  if (!filePath.startsWith(resolve(rootDir)) || (isAssetStatic && filePath !== assetsDir && !filePath.startsWith(`${assetsDir}/`))) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  if (!existsSync(filePath)) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  if (!statSync(filePath).isFile()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const ext = extname(filePath);
  const body = ext === ".html" || ext === ".xml" || ext === ".txt"
    ? readFileSync(filePath, "utf8").replaceAll("__SITE_ORIGIN__", siteOrigin)
    : readFileSync(filePath);
  const etag = createStaticEtag(body);
  const cacheControl = getStaticCacheControl(requested);
  const contentLength = Buffer.isBuffer(body)
    ? body.length
    : Buffer.byteLength(body, "utf8");
  const headers = {
    "cache-control": cacheControl,
    etag,
    "content-length": String(contentLength)
  };
  if (cacheControl !== "no-store" && req.headers["if-none-match"] === etag) {
    send(res, 304, "", mimeTypes[ext] || "application/octet-stream", headers);
    return;
  }
  send(res, 200, req.method === "HEAD" ? "" : body, mimeTypes[ext] || "application/octet-stream", headers);
}

async function callCompatibleAi(payload) {
  const { endpoint, apiKey, model } = resolveAiConfig(payload);
  const { messages } = payload;
  validateAiMessages(messages);
  if (!endpoint || !apiKey || !model) {
    throw validationError("缺少 endpoint、apiKey、model 或 messages");
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3
      })
    });
  } catch {
    throw httpError("AI 接口网络异常", 502);
  }
  const text = await response.text();
  if (!response.ok) {
    throw httpError(`AI 接口调用失败 ${response.status}`, 502);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw httpError("AI 接口返回格式不正确", 502);
  }
}

function parseRequestUrl(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    throw validationError("请求 URL 不正确");
  }
}

export async function handleRequest(req, res) {
  assignRequestId(req, res);
  try {
    const url = parseRequestUrl(req);
    if (url.pathname === "/api/health" && ["GET", "HEAD"].includes(req.method || "GET")) {
      const configStatus = getConfigStatus();
      const storageStatus = getStorageStatus();
      const healthy = configStatus.configReady && storageStatus.storageWritable;
      const payload = {
        ok: healthy,
        service: "baijiaxing-suyuanlu",
        storageReady: existsSync(workspacePath),
        seedReady: existsSync(seedWorkspacePath),
        adminRequired: Boolean(adminToken),
        ...configStatus,
        ...storageStatus
      };
      send(res, healthy ? 200 : 503, req.method === "HEAD" ? "" : payload);
      return;
    }

    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      send(res, 200, { ok: true, workspace: readSeedWorkspace() });
      return;
    }

    if (url.pathname === "/api/surnames" && req.method === "GET") {
      const workspace = readPublicWorkspace();
      const query = String(url.searchParams.get("q") || "").trim();
      const limit = normalizeLimit(url.searchParams.get("limit"));
      const matched = filterSurnameSummaries(getSurnameSummaries(workspace), query);
      send(res, 200, {
        ok: true,
        query,
        limit,
        total: matched.length,
        surnames: matched.slice(0, limit)
      });
      return;
    }

    if (url.pathname === "/api/surname" && req.method === "GET") {
      const rawName = String(url.searchParams.get("name") || "").trim();
      if (!rawName) throw validationError("缺少姓氏 name 参数");
      const workspace = readPublicWorkspace();
      const name = resolveWorkspaceSurnameKey(workspace, rawName);
      const surname = workspace.surnames?.[name];
      if (!surname) throw httpError("姓氏暂未收录", 404);
      send(res, 200, { ok: true, surname: normalizePublicSurnameProfile(surname, name) });
      return;
    }

    if (url.pathname === "/api/workspace" && req.method === "GET") {
      requireAdmin(req);
      if (!existsSync(workspacePath)) {
        send(res, 200, { ok: true, workspace: null });
        return;
      }
      send(res, 200, { ok: true, workspace: readRuntimeWorkspaceStrict() });
      return;
    }

    if (url.pathname === "/api/workspace" && req.method === "POST") {
      requireAdmin(req);
      enforceRateLimit(req, "workspace.write", WRITE_LIMIT_PER_MINUTE);
      const body = await readJsonBody(req);
      saveWorkspace(body);
      appendAudit("workspace.save", req, {
        surnames: body.surnames ? Object.keys(body.surnames).length : 0,
        markdownCorpus: Array.isArray(body.markdownCorpus) ? body.markdownCorpus.length : 0,
        reviewState: Array.isArray(body.reviewState) ? body.reviewState.length : 0
      });
      send(res, 200, { ok: true, savedAt: new Date().toISOString() });
      return;
    }

    if (url.pathname === "/api/workspace" && req.method === "DELETE") {
      requireAdmin(req);
      enforceRateLimit(req, "workspace.delete", WRITE_LIMIT_PER_MINUTE);
      try {
        backupWorkspace();
        if (existsSync(workspacePath)) rmSync(workspacePath);
      } catch {
        throw httpError("工作区文件无法清空，请检查运行数据目录", 503);
      }
      appendAudit("workspace.delete", req);
      send(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/audit" && req.method === "GET") {
      requireAdmin(req);
      send(res, 200, { ok: true, audit: readAuditList() });
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "POST") {
      enforceRateLimit(req, "feedback.create", WRITE_LIMIT_PER_MINUTE);
      const body = await readJsonBody(req);
      const item = saveFeedback(body);
      appendAudit("feedback.create", req, {
        id: item.id,
        surname: item.surname,
        contentLength: item.content.length
      });
      send(res, 200, { ok: true, feedback: { id: item.id, status: item.status } });
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "GET") {
      requireAdmin(req);
      send(res, 200, { ok: true, feedback: readFeedbackList() });
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "PATCH") {
      requireAdmin(req);
      enforceRateLimit(req, "feedback.update", WRITE_LIMIT_PER_MINUTE);
      const body = await readJsonBody(req);
      const item = updateFeedbackStatus(body);
      appendAudit("feedback.update", req, {
        id: item.id,
        status: item.status
      });
      send(res, 200, { ok: true, feedback: { id: item.id, status: item.status } });
      return;
    }

    if (url.pathname === "/api/ai-draft" && req.method === "POST") {
      requireAdmin(req);
      enforceRateLimit(req, "ai.draft", AI_LIMIT_PER_MINUTE);
      const body = await readJsonBody(req);
      const aiConfig = resolveAiConfig(body);
      validateAiMessages(body.messages);
      appendAudit("ai.draft", req, {
        model: aiConfig.model,
        messages: Array.isArray(body.messages) ? body.messages.length : 0
      });
      const payload = await callCompatibleAi(body);
      send(res, 200, { ok: true, payload });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const allow = apiAllowedMethods.get(url.pathname);
      const body = {
        ok: false,
        error: allow ? "Method not allowed" : "API not found"
      };
      send(res, allow ? 405 : 404, req.method === "HEAD" ? "" : body, "application/json; charset=utf-8", allow ? { allow } : {});
      return;
    }

    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      send(res, 405, { ok: false, error: "Method not allowed" }, "application/json; charset=utf-8", { allow: "GET, HEAD" });
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    send(res, error.statusCode || 500, { ok: false, error: error.message }, "application/json; charset=utf-8", error.headers || {});
  }
}

export function createAppServer() {
  const server = createServer(handleRequest);
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.max(REQUEST_TIMEOUT_MS + 5_000, 10_000);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const server = createAppServer();

  server.on("error", error => {
    console.error(`服务启动失败：${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`百家姓溯源录 Node 服务已启动: http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
