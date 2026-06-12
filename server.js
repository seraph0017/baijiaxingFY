import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
const usersPath = join(dataDir, "users.json");
const sessionsPath = join(dataDir, "sessions.json");
const harnessConfigPath = join(dataDir, "harness-config.json");
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
const authBootstrapUser = readEnvText("AUTH_BOOTSTRAP_USER") || "admin";
const authBootstrapPassword = readEnvText("AUTH_BOOTSTRAP_PASSWORD");
const authSessionCookie = "bjx_session";
const authSessionTtlMs = readPositiveIntegerEnv("AUTH_SESSION_TTL_HOURS", 24) * 60 * 60 * 1000;
const defaultAiEndpoint = readEnvText("AI_ENDPOINT");
const defaultAiApiKey = readEnvText("AI_API_KEY");
const configuredAiModel = readEnvText("AI_MODEL");
const defaultAiModel = configuredAiModel || "gpt-4.1-mini";
const AI_TIMEOUT_MS = readPositiveIntegerEnv("AI_TIMEOUT_MS", 120_000);
const REQUEST_TIMEOUT_MS = readPositiveIntegerEnv("REQUEST_TIMEOUT_MS", 130_000);
const BACKUP_RETENTION = readPositiveIntegerEnv("BACKUP_RETENTION", 20);
const siteOrigin = readSiteOriginEnv(defaultSiteOrigin);
const trustProxy = readEnvText("TRUST_PROXY").toLowerCase() === "true";
const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const WRITE_LIMIT_PER_MINUTE = readPositiveIntegerEnv("WRITE_LIMIT_PER_MINUTE", 60);
const AI_LIMIT_PER_MINUTE = readPositiveIntegerEnv("AI_LIMIT_PER_MINUTE", 12);
const mysqlConfigured = Boolean(readEnvText("DATABASE_URL") || readEnvText("MYSQL_HOST"));
let mysqlPoolPromise = null;

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
  ["/api/auth/login", "POST"],
  ["/api/auth/me", "GET"],
  ["/api/auth/logout", "POST"],
  ["/api/harness-config", "GET, PUT"],
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

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return Object.fromEntries(raw.split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      if (index === -1) return [part, ""];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function createCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function getMysqlPool() {
  if (!mysqlConfigured) return null;
  if (!mysqlPoolPromise) {
    mysqlPoolPromise = import("mysql2/promise").then(({ createPool }) => {
      const databaseUrl = readEnvText("DATABASE_URL");
      if (databaseUrl) {
        return createPool({
          uri: databaseUrl,
          waitForConnections: true,
          connectionLimit: readPositiveIntegerEnv("MYSQL_CONNECTION_LIMIT", 10)
        });
      }
      return createPool({
        host: readEnvText("MYSQL_HOST") || "127.0.0.1",
        port: readPortEnv("MYSQL_PORT", 3306),
        database: readEnvText("MYSQL_DATABASE") || "baijiaxingfy",
        user: readEnvText("MYSQL_USER") || "baijiaxing",
        password: readEnvText("MYSQL_PASSWORD"),
        waitForConnections: true,
        connectionLimit: readPositiveIntegerEnv("MYSQL_CONNECTION_LIMIT", 10)
      });
    });
  }
  return mysqlPoolPromise;
}

async function ensureMysqlSchema() {
  const pool = await getMysqlPool();
  if (!pool) return null;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_kv (
      name VARCHAR(128) PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  return pool;
}

async function readMysqlJson(name, fallback) {
  const pool = await ensureMysqlSchema();
  if (!pool) return fallback;
  const [rows] = await pool.query("SELECT payload FROM app_kv WHERE name = ? LIMIT 1", [name]);
  if (!rows.length) return fallback;
  return typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
}

async function writeMysqlJson(name, payload) {
  const pool = await ensureMysqlSchema();
  if (!pool) return false;
  await pool.query(
    "INSERT INTO app_kv (name, payload) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE payload = VALUES(payload)",
    [name, JSON.stringify(payload)]
  );
  return true;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `sha256:${salt}:${digest}`;
}

function verifyPassword(password, encoded) {
  const parts = String(encoded || "").split(":");
  if (parts.length !== 3 || parts[0] !== "sha256") return false;
  const expected = hashPassword(password, parts[1]);
  const actualBuffer = Buffer.from(String(encoded));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(user) {
  return user ? {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName || user.username
  } : null;
}

function readUsers() {
  ensureDataDir();
  const payload = readJsonFile(usersPath, { users: [] });
  const users = Array.isArray(payload.users) ? payload.users : [];
  if (!users.length && authBootstrapPassword) {
    const bootstrap = {
      id: "user-admin",
      username: authBootstrapUser,
      displayName: "系统管理员",
      role: "admin",
      passwordHash: hashPassword(authBootstrapPassword),
      createdAt: new Date().toISOString()
    };
    writeJsonFileAtomic(usersPath, { users: [bootstrap] });
    return [bootstrap];
  }
  return users;
}

function writeUsers(users) {
  ensureDataDir();
  writeJsonFileAtomic(usersPath, { users });
}

async function hydrateMysqlRuntimeState() {
  if (!mysqlConfigured) return;
  ensureDataDir();
  const [usersPayload, sessionsPayload, harnessPayload, workspacePayload, feedbackPayload, auditPayload] = await Promise.all([
    readMysqlJson("users", null),
    readMysqlJson("sessions", null),
    readMysqlJson("harness-config", null),
    readMysqlJson("workspace", null),
    readMysqlJson("feedback", null),
    readMysqlJson("audit", null)
  ]);
  if (usersPayload) writeJsonFileAtomic(usersPath, usersPayload);
  if (sessionsPayload) writeJsonFileAtomic(sessionsPath, sessionsPayload);
  if (harnessPayload) writeJsonFileAtomic(harnessConfigPath, harnessPayload);
  if (workspacePayload) writeJsonFileAtomic(workspacePath, workspacePayload);
  if (feedbackPayload?.items) writeTextFileAtomic(feedbackPath, `${feedbackPayload.items.map(item => JSON.stringify(item)).join("\n")}${feedbackPayload.items.length ? "\n" : ""}`);
  if (auditPayload?.items) writeTextFileAtomic(auditPath, `${auditPayload.items.map(item => JSON.stringify(item)).join("\n")}${auditPayload.items.length ? "\n" : ""}`);
}

async function persistMysqlRuntimeState(name, payload) {
  if (!mysqlConfigured) return;
  await writeMysqlJson(name, payload);
}

function readSessions() {
  ensureDataDir();
  const payload = readJsonFile(sessionsPath, { sessions: [] });
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const now = Date.now();
  const active = sessions.filter(item => Date.parse(item.expiresAt || "") > now);
  if (active.length !== sessions.length) writeJsonFileAtomic(sessionsPath, { sessions: active });
  return active;
}

function writeSessions(sessions) {
  ensureDataDir();
  writeJsonFileAtomic(sessionsPath, { sessions });
}

function findSessionUser(req) {
  const sid = parseCookies(req)[authSessionCookie];
  if (!sid) return null;
  const sessions = readSessions();
  const session = sessions.find(item => item.id === sid);
  if (!session) return null;
  const user = readUsers().find(item => item.id === session.userId);
  return user || null;
}

function requireSession(req, roles = []) {
  const user = findSessionUser(req);
  if (!user) throw httpError("请先登录", 401);
  if (roles.length && !roles.includes(user.role)) throw httpError("当前用户无权限", 403);
  return user;
}

function requireAdmin(req) {
  const sessionUser = findSessionUser(req);
  if (sessionUser && ["admin", "editor"].includes(sessionUser.role)) return sessionUser;
  if (!adminToken && isProduction) {
    throw httpError("生产环境必须设置 ADMIN_TOKEN", 503);
  }
  if (!adminToken) return;
  const provided = req.headers["x-admin-token"];
  if (provided !== adminToken) {
    throw httpError("缺少或错误的管理令牌", 401);
  }
  return { id: "admin-token", username: "admin-token", role: "admin", displayName: "管理令牌" };
}

function requireHarnessAdmin(req) {
  const sessionUser = findSessionUser(req);
  if (sessionUser) {
    if (sessionUser.role !== "admin") throw httpError("只有管理员可配置 Harness", 403);
    return sessionUser;
  }
  return requireAdmin(req);
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
  return missing;
}

function getConfigStatus() {
  const missing = getMissingProductionConfig();
  let invalid = false;
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

function defaultHarnessConfig() {
  return {
    endpoint: defaultAiEndpoint || "https://api.openai.com/v1/chat/completions",
    model: defaultAiModel,
    apiKey: defaultAiApiKey || "",
    systemPrompt: "你是中华姓氏文化资料整理助手。只输出科普初稿，不做定论。必须区分多源流、民间传说、待核来源。",
    temperature: 0.3,
    retrievalQuery: "源流 始祖 郡望 迁徙 名人 家风 来源",
    sourceTypes: ["classic", "local"],
    updatedAt: ""
  };
}

function readHarnessConfigRaw() {
  ensureDataDir();
  const saved = readJsonFile(harnessConfigPath, {});
  return { ...defaultHarnessConfig(), ...saved };
}

function sanitizeHarnessConfig(config) {
  return {
    endpoint: config.endpoint,
    model: config.model,
    systemPrompt: config.systemPrompt,
    temperature: config.temperature,
    retrievalQuery: config.retrievalQuery,
    sourceTypes: Array.isArray(config.sourceTypes) ? config.sourceTypes : ["classic", "local"],
    hasApiKey: Boolean(config.apiKey),
    updatedAt: config.updatedAt || ""
  };
}

function normalizeHarnessConfigPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("Harness 配置必须是 JSON 对象");
  }
  const current = readHarnessConfigRaw();
  const next = {
    ...current,
    endpoint: String(payload.endpoint || current.endpoint || "").trim(),
    model: String(payload.model || current.model || defaultAiModel).trim(),
    apiKey: payload.apiKey === undefined ? current.apiKey : String(payload.apiKey || "").trim(),
    systemPrompt: String(payload.systemPrompt || current.systemPrompt || "").trim(),
    temperature: Number(payload.temperature ?? current.temperature ?? 0.3),
    retrievalQuery: String(payload.retrievalQuery || current.retrievalQuery || "").trim(),
    sourceTypes: Array.isArray(payload.sourceTypes) && payload.sourceTypes.length
      ? payload.sourceTypes.map(item => String(item).trim()).filter(Boolean)
      : current.sourceTypes
  };
  validateAiConfigValue({
    endpoint: next.endpoint,
    apiKey: next.apiKey || "placeholder-key",
    model: next.model
  });
  if (!next.systemPrompt) throw validationError("Harness systemPrompt 不能为空");
  if (!Number.isFinite(next.temperature) || next.temperature < 0 || next.temperature > 2) {
    throw validationError("Harness temperature 必须在 0 到 2 之间");
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function saveHarnessConfig(payload) {
  const config = normalizeHarnessConfigPayload(payload);
  ensureDataDir();
  writeJsonFileAtomic(harnessConfigPath, config);
  return config;
}

function resolveAiConfig(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("AI 请求必须是 JSON 对象");
  }
  const harnessConfig = readHarnessConfigRaw();
  const config = {
    endpoint: defaultAiEndpoint || harnessConfig.endpoint || payload.endpoint,
    apiKey: defaultAiApiKey || harnessConfig.apiKey || (isProduction ? "" : payload.apiKey),
    model: configuredAiModel || harnessConfig.model || payload.model || defaultAiModel,
    temperature: harnessConfig.temperature
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

async function appendAuditAsync(event, req, details = {}) {
  appendAudit(event, req, details);
  if (mysqlConfigured) {
    await persistMysqlRuntimeState("audit", { items: readAuditList().slice().reverse() });
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
  const routeAliases = new Map([
    ["/", "/index.html"],
    ["/admin", "/admin.html"],
    ["/login", "/login.html"]
  ]);
  const requested = routeAliases.get(pathname) || pathname;
  const isRootStatic = requested === "/index.html" || requested === "/admin.html" || requested === "/login.html" || requested === "/robots.txt" || requested === "/sitemap.xml" || requested === "/manifest.webmanifest";
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
  const aiConfig = resolveAiConfig(payload);
  const { messages } = payload;
  validateAiMessages(messages);
  if (!aiConfig.endpoint || !aiConfig.apiKey || !aiConfig.model) {
    throw validationError("缺少 endpoint、apiKey、model 或 messages");
  }
  let response;
  try {
    response = await fetch(aiConfig.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages,
        temperature: aiConfig.temperature
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
    await hydrateMysqlRuntimeState();
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
        mysqlConfigured,
        ...configStatus,
        ...storageStatus
      };
      send(res, healthy ? 200 : 503, req.method === "HEAD" ? "" : payload);
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const user = readUsers().find(item => item.username === username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw httpError("用户名或密码不正确", 401);
      }
      const session = {
        id: randomBytes(32).toString("hex"),
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + authSessionTtlMs).toISOString()
      };
      const sessions = readSessions();
      sessions.push(session);
      writeSessions(sessions);
      await persistMysqlRuntimeState("sessions", { sessions });
      await persistMysqlRuntimeState("users", { users: readUsers() });
      await appendAuditAsync("auth.login", req, { username: user.username, role: user.role });
      send(res, 200, { ok: true, user: publicUser(user) }, "application/json; charset=utf-8", {
        "set-cookie": createCookie(authSessionCookie, session.id, { maxAge: Math.floor(authSessionTtlMs / 1000) })
      });
      return;
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = requireSession(req);
      send(res, 200, { ok: true, user: publicUser(user) });
      return;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const sid = parseCookies(req)[authSessionCookie];
      if (sid) {
        const sessions = readSessions().filter(item => item.id !== sid);
        writeSessions(sessions);
        await persistMysqlRuntimeState("sessions", { sessions });
      }
      send(res, 200, { ok: true }, "application/json; charset=utf-8", {
        "set-cookie": createCookie(authSessionCookie, "", { maxAge: 0 })
      });
      return;
    }

    if (url.pathname === "/api/harness-config" && req.method === "GET") {
      requireAdmin(req);
      send(res, 200, { ok: true, config: sanitizeHarnessConfig(readHarnessConfigRaw()) });
      return;
    }

    if (url.pathname === "/api/harness-config" && req.method === "PUT") {
      requireHarnessAdmin(req);
      enforceRateLimit(req, "harness.config", WRITE_LIMIT_PER_MINUTE);
      const body = await readJsonBody(req);
      const config = saveHarnessConfig(body);
      await persistMysqlRuntimeState("harness-config", config);
      await appendAuditAsync("harness.config.save", req, {
        endpoint: config.endpoint,
        model: config.model,
        hasApiKey: Boolean(config.apiKey)
      });
      send(res, 200, { ok: true, config: sanitizeHarnessConfig(config) });
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
      await persistMysqlRuntimeState("workspace", { ...body, savedAt: new Date().toISOString() });
      await appendAuditAsync("workspace.save", req, {
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
        await persistMysqlRuntimeState("workspace", null);
      } catch {
        throw httpError("工作区文件无法清空，请检查运行数据目录", 503);
      }
      await appendAuditAsync("workspace.delete", req);
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
      await persistMysqlRuntimeState("feedback", { items: readFeedbackList().slice().reverse() });
      await appendAuditAsync("feedback.create", req, {
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
      await persistMysqlRuntimeState("feedback", { items: readFeedbackList().slice().reverse() });
      await appendAuditAsync("feedback.update", req, {
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
      await appendAuditAsync("ai.draft", req, {
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
