import { existsSync, readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const adminHtmlUrl = new URL("./admin.html", import.meta.url);
const adminHtml = existsSync(adminHtmlUrl) ? readFileSync(adminHtmlUrl, "utf8") : "";
const loginHtmlUrl = new URL("./login.html", import.meta.url);
const loginHtml = existsSync(loginHtmlUrl) ? readFileSync(loginHtmlUrl, "utf8") : "";
const readmeUrl = new URL("./README.md", import.meta.url);
const readme = existsSync(readmeUrl) ? readFileSync(readmeUrl, "utf8") : "";
const serverUrl = new URL("./server.js", import.meta.url);
const server = existsSync(serverUrl) ? readFileSync(serverUrl, "utf8") : "";
const packageUrl = new URL("./package.json", import.meta.url);
const pkg = existsSync(packageUrl) ? readFileSync(packageUrl, "utf8") : "";
const serverVerifyUrl = new URL("./verify-server.mjs", import.meta.url);
const serverVerify = existsSync(serverVerifyUrl) ? readFileSync(serverVerifyUrl, "utf8") : "";
const logicVerifyUrl = new URL("./verify-server-logic.mjs", import.meta.url);
const logicVerify = existsSync(logicVerifyUrl) ? readFileSync(logicVerifyUrl, "utf8") : "";
const authVerifyUrl = new URL("./verify-server-auth.mjs", import.meta.url);
const authVerify = existsSync(authVerifyUrl) ? readFileSync(authVerifyUrl, "utf8") : "";
const productionVerifyUrl = new URL("./verify-server-production.mjs", import.meta.url);
const productionVerify = existsSync(productionVerifyUrl) ? readFileSync(productionVerifyUrl, "utf8") : "";
const uiVerifyUrl = new URL("./verify-ui.mjs", import.meta.url);
const uiVerify = existsSync(uiVerifyUrl) ? readFileSync(uiVerifyUrl, "utf8") : "";
const releaseVerifyUrl = new URL("./verify-release.mjs", import.meta.url);
const releaseVerify = existsSync(releaseVerifyUrl) ? readFileSync(releaseVerifyUrl, "utf8") : "";
const launchReviewUrl = new URL("./上线Review报告.md", import.meta.url);
const launchReview = existsSync(launchReviewUrl) ? readFileSync(launchReviewUrl, "utf8") : "";
const envExampleUrl = new URL("./.env.example", import.meta.url);
const envExample = existsSync(envExampleUrl) ? readFileSync(envExampleUrl, "utf8") : "";
const gitignoreUrl = new URL("./.gitignore", import.meta.url);
const gitignore = existsSync(gitignoreUrl) ? readFileSync(gitignoreUrl, "utf8") : "";
const dockerfileUrl = new URL("./Dockerfile", import.meta.url);
const dockerfile = existsSync(dockerfileUrl) ? readFileSync(dockerfileUrl, "utf8") : "";
const dockerignoreUrl = new URL("./.dockerignore", import.meta.url);
const dockerignore = existsSync(dockerignoreUrl) ? readFileSync(dockerignoreUrl, "utf8") : "";
const stylesUrl = new URL("./assets/styles.css", import.meta.url);
const styles = existsSync(stylesUrl) ? readFileSync(stylesUrl, "utf8") : "";
const appUrl = new URL("./assets/app.js", import.meta.url);
const app = existsSync(appUrl) ? readFileSync(appUrl, "utf8") : "";
const iconUrl = new URL("./assets/icon.svg", import.meta.url);
const icon = existsSync(iconUrl) ? readFileSync(iconUrl, "utf8") : "";
const seedUrl = new URL("./data/seed-workspace.json", import.meta.url);
const seed = existsSync(seedUrl) ? readFileSync(seedUrl, "utf8") : "";
const runtimeWorkspaceUrl = new URL("./data/workspace.json", import.meta.url);
const runtimeAuditUrl = new URL("./data/audit.log", import.meta.url);
const runtimeFeedbackUrl = new URL("./data/feedback.jsonl", import.meta.url);
const runtimeBackupsUrl = new URL("./data/backups", import.meta.url);
const robotsUrl = new URL("./robots.txt", import.meta.url);
const robots = existsSync(robotsUrl) ? readFileSync(robotsUrl, "utf8") : "";
const sitemapUrl = new URL("./sitemap.xml", import.meta.url);
const sitemap = existsSync(sitemapUrl) ? readFileSync(sitemapUrl, "utf8") : "";
const manifestUrl = new URL("./manifest.webmanifest", import.meta.url);
const manifest = existsSync(manifestUrl) ? readFileSync(manifestUrl, "utf8") : "";
const bannedTerms = ["上" + "链", "存" + "证", "公" + "链", "联盟" + "链", "区" + "块", "确" + "权", "司" + "法"];
const hasBannedTerms = (text) => bannedTerms.some(term => text.includes(term));
const parsedManifest = manifest ? JSON.parse(manifest) : null;

const checks = [
  ["Node.js 项目骨架", /"scripts"/.test(pkg) && /"start":\s*"node server\.js"/.test(pkg) && /"verify:server"/.test(pkg) && /"verify:logic"/.test(pkg) && /"verify:auth"/.test(pkg) && /"verify:production"/.test(pkg) && /"verify:ui"/.test(pkg) && /"verify:release"/.test(pkg) && /createServer/.test(server)],
  ["MySQL 持久化配置", /"mysql2"/.test(pkg) && /DATABASE_URL/.test(envExample) && /MYSQL_HOST/.test(envExample) && /mysqlConfigured/.test(server) && /app_kv/.test(server) && /readMysqlJson\("workspace"/.test(server) && /readMysqlJson\("feedback"/.test(server) && /readMysqlJson\("audit"/.test(server) && /persistMysqlRuntimeState\("workspace"/.test(server) && /persistMysqlRuntimeState\("feedback"/.test(server) && /persistMysqlRuntimeState\("audit"/.test(server) && /users\.json/.test(gitignore) && /sessions\.json/.test(gitignore) && /harness-config\.json/.test(gitignore) && /MySQL/.test(readme) && /CREATE DATABASE/.test(readme)],
  ["用户体系与会话 API", /\/api\/auth\/login/.test(server) && /\/api\/auth\/me/.test(server) && /\/api\/auth\/logout/.test(server) && /AUTH_BOOTSTRAP_USER/.test(envExample) && /AUTH_BOOTSTRAP_PASSWORD/.test(envExample) && /bjx_session/.test(server)],
  ["Harness 后台配置 API", /\/api\/harness-config/.test(server) && /harness-config\.json/.test(server) && /function saveHarnessConfig/.test(server) && /hasApiKey/.test(server) && /secret-key/.test(server) === false],
  ["首页后台登录页分离", existsSync(new URL("./admin.html", import.meta.url)) && existsSync(new URL("./login.html", import.meta.url)) && /\/admin\.html/.test(html) && !/id="opsView"/.test(html)],
  ["前端资源工程化拆分", /<link rel="stylesheet" href="assets\/styles\.css">/.test(html) && /<script src="assets\/app\.js" defer><\/script>/.test(html) && !/<style>/.test(html) && !/<script>\s*const surnames/.test(html)],
  ["服务端种子资料库", /seed-workspace\.json/.test(server) && /\/api\/bootstrap/.test(server) && /"surnames"/.test(seed) && /"markdownCorpus"/.test(seed) && /"reviewState"/.test(seed)],
  ["交付目录不包含运行态数据", !existsSync(runtimeWorkspaceUrl) && !existsSync(runtimeAuditUrl) && !existsSync(runtimeFeedbackUrl) && !existsSync(runtimeBackupsUrl)],
  ["运行数据目录可配置", /process\.env\.DATA_DIR/.test(server) && /join\(rootDir, "data", "seed-workspace\.json"\)/.test(server) && /DATA_DIR=\/app\/runtime/.test(dockerfile) && /DATA_DIR=\.\/data/.test(envExample) && /NODE_ENV=production/.test(envExample)],
  ["Node 服务监听配置", /const readPortEnv/.test(server) && /const port = readPortEnv\("PORT", 8765\)/.test(server) && /value <= 65_535/.test(server) && /const host = readEnvText\("HOST"\) \|\| "127\.0\.0\.1"/.test(server) && /const readSiteOriginEnv/.test(server) && /const siteOrigin = readSiteOriginEnv\(defaultSiteOrigin\)/.test(server) && /server\.on\("error"/.test(server)],
  ["管理令牌鉴权", /const readEnvText = \(name\) => String\(process\.env\[name\] \|\| ""\)\.trim\(\)/.test(server) && /const adminToken = readEnvText\("ADMIN_TOKEN"\)/.test(server) && /const isProduction = process\.env\.NODE_ENV === "production"/.test(server) && /function getConfigStatus/.test(server) && /生产环境必须设置/.test(server) && /function requireAdmin/.test(server) && /x-admin-token/.test(server)],
  ["错误响应请求 ID", /function assignRequestId/.test(server) && /x-request-id/.test(server) && /requestId && body\?\.ok === false/.test(server) && /req\.requestId = requestId/.test(server) && /requestId: req\.requestId/.test(server) && /assignRequestId\(req, res\)/.test(server)],
  ["服务端 AI 环境变量", /AI_ENDPOINT/.test(server) && /AI_API_KEY/.test(server) && /AI_MODEL/.test(server)],
  ["服务端 AI 后台配置优先", /const defaultAiEndpoint = readEnvText\("AI_ENDPOINT"\)/.test(server) && /const defaultAiApiKey = readEnvText\("AI_API_KEY"\)/.test(server) && /const configuredAiModel = readEnvText\("AI_MODEL"\)/.test(server) && /function resolveAiConfig/.test(server) && /readHarnessConfigRaw/.test(server) && /endpoint: defaultAiEndpoint \|\| harnessConfig\.endpoint \|\| payload\.endpoint/.test(server) && /apiKey: defaultAiApiKey \|\| harnessConfig\.apiKey \|\| \(isProduction \? "" : payload\.apiKey\)/.test(server) && /model: configuredAiModel \|\| harnessConfig\.model \|\| payload\.model \|\| defaultAiModel/.test(server)],
  ["请求入口 URL 解析防护", /function parseRequestUrl/.test(server) && /throw validationError\("请求 URL 不正确"\)/.test(server) && /const url = parseRequestUrl\(req\)/.test(server) && !/export async function handleRequest\(req, res\) \{\n  const url = new URL/.test(server)],
  ["工作区读取鉴权", /\/api\/workspace" && req\.method === "GET"/.test(server) && /requireAdmin\(req\);[\s\S]*?readRuntimeWorkspaceStrict/.test(server) && /工作区读取拒绝无令牌/.test(authVerify)],
  ["Node API 工作区持久化", /\/api\/workspace/.test(server) && /workspace\.json/.test(server)],
  ["工作区原子写入", /function writeJsonFileAtomic/.test(server) && /renameSync/.test(server) && /\.tmp-/.test(server) && /writeJsonFileAtomic\(workspacePath/.test(server)],
  ["原子写入失败清理临时文件", /function removeTempFile/.test(server) && /catch \(error\)[\s\S]*?removeTempFile\(tempPath\)[\s\S]*?throw error/.test(server) && /function writeJsonFileAtomic[\s\S]*?function writeTextFileAtomic/.test(server)],
  ["Node API 公开姓氏查询", /\/api\/surnames/.test(server) && /\/api\/surname/.test(server) && /function getSurnameSummaries/.test(server) && /function filterSurnameSummaries/.test(server) && /function resolveWorkspaceSurnameKey/.test(server) && /function compactLookupText/.test(server) && /function normalizeLimit\(value, fallback = 50, max = 500\)/.test(server) && /function normalizePublicSurnameProfile/.test(server) && /function readPublicWorkspace/.test(server) && /return readSeedWorkspace\(\)/.test(server)],
  ["Node API 反馈管理", /\/api\/feedback/.test(server) && /feedback\.jsonl/.test(server) && /feedback\.create/.test(server) && /feedback\.update/.test(server) && /randomUUID/.test(server) && /createHash/.test(server) && /反馈姓氏不能为空/.test(server) && /反馈姓氏格式不正确/.test(server) && /function isLatinLikeName/.test(server) && /const feedbackStatuses/.test(server) && /function stableFeedbackId/.test(server) && /function normalizeFeedbackItem/.test(server) && /function normalizeFeedbackContent/.test(server) && /function readJsonLines/.test(server) && /function writeTextFileAtomic/.test(server) && /writeTextFileAtomic\(feedbackPath/.test(server) && /function readFeedbackList/.test(server) && /function updateFeedbackStatus/.test(server)],
  ["Node API AI 代理", /\/api\/ai-draft/.test(server) && /function resolveAiConfig/.test(server) && /function validateAiConfigValue/.test(server) && /function validateAiMessages/.test(server) && /AI 请求必须是 JSON 对象/.test(server) && /AI endpoint 必须是 HTTP\(S\) URL/.test(server) && /AI messages 条目必须包含 role 和 content/.test(server) && /callCompatibleAi/.test(server) && /model: aiConfig\.model/.test(server)],
  ["API 前缀路由边界", /const apiAllowedMethods = new Map/.test(server) && /\["\/api\/health", "GET, HEAD"\]/.test(server) && /url\.pathname\.startsWith\("\/api\/"\)/.test(server) && /apiAllowedMethods\.get\(url\.pathname\)/.test(server) && /allow \? 405 : 404/.test(server) && /req\.method === "HEAD" \? "" : body/.test(server) && /allow \? \{ allow \} : \{\}/.test(server) && /API not found/.test(server) && /url\.pathname === "\/api\/health" && \["GET", "HEAD"\]\.includes\(req\.method \|\| "GET"\)/.test(server)],
  ["服务端静态文件正确响应", /Buffer\.isBuffer/.test(server) && /readFileSync\(filePath\)/.test(server) && /statSync\(filePath\)\.isFile\(\)/.test(server)],
  ["静态资源方法边界", /\["GET", "HEAD"\]\.includes\(req\.method \|\| "GET"\)/.test(server) && /req\.method === "HEAD" \? "" : body/.test(server)],
  ["静态资源缓存策略", /function createStaticEtag/.test(server) && /function getStaticCacheControl/.test(server) && /public, max-age=300, must-revalidate/.test(server) && /cacheControl !== "no-store" && req\.headers\["if-none-match"\] === etag/.test(server) && /send\(res, 304/.test(server)],
  ["公开站静态资产白名单", /requested === "\/robots\.txt"/.test(server) && /requested === "\/sitemap\.xml"/.test(server) && /requested === "\/manifest\.webmanifest"/.test(server)],
  ["公开站资源 MIME", /\.txt/.test(server) && /\.xml/.test(server) && /\.webmanifest/.test(server)],
  ["上线安全响应头", /content-security-policy/.test(server) && /permissions-policy/.test(server) && /script-src 'self'/.test(server) && /style-src 'self'/.test(server) && !/unsafe-inline/.test(server)],
  ["服务端请求限流", /const rateBuckets = new Map/.test(server) && /function enforceRateLimit/.test(server) && /rateLimitKey/.test(server) && /readPositiveIntegerEnv/.test(server) && /function cleanupRateBuckets/.test(server) && /export function getRateBucketCount/.test(server) && /const trustProxy = readEnvText\("TRUST_PROXY"\)\.toLowerCase\(\) === "true"/.test(server) && /trustProxy \? req\.headers\["x-forwarded-for"\] : ""/.test(server) && /retry-after/.test(server) && /Math\.ceil\(\(bucket\.resetAt - now\) \/ 1000\)/.test(server)],
  ["服务端超时控制", /const AI_TIMEOUT_MS = readPositiveIntegerEnv\("AI_TIMEOUT_MS", 30_000\)/.test(server) && /const REQUEST_TIMEOUT_MS = readPositiveIntegerEnv\("REQUEST_TIMEOUT_MS", 30_000\)/.test(server) && /AbortSignal\.timeout/.test(server) && /server\.requestTimeout/.test(server)],
  ["请求体解析一次性收敛", /function readJsonBody/.test(server) && /let settled = false/.test(server) && /function finishBody/.test(server) && /if \(settled\) return/.test(server) && /finishBody\(httpError\("请求体过大", 413\)\)/.test(server) && /if \(settled\) return;[\s\S]*?raw \+= chunk/.test(server)],
  ["健康检查存储状态", /function getStorageStatus/.test(server) && /const probePath = join\(dataDir, `\.health-\$\{randomUUID\(\)\}\.tmp`\)/.test(server) && /const healthy = configStatus\.configReady && storageStatus\.storageWritable/.test(server) && /storageWritable/.test(server) && /runtimeDirConfigured/.test(server) && /configReady/.test(server) && /configError/.test(server) && /validateAiConfigValue/.test(server) && /mysqlConfigured/.test(server) && /statSync\(dataDir\)\.isDirectory\(\)/.test(server) && /statSync\(backupDir\)\.isDirectory\(\)/.test(server)],
  ["服务端审计日志", /audit\.log/.test(server) && /function appendAudit/.test(server) && /console\.warn\(`审计日志写入失败/.test(server) && /function readJsonLines/.test(server) && /function readAuditList/.test(server) && /\/api\/audit/.test(server) && /workspace\.save/.test(server) && /workspace\.delete/.test(server) && /ai\.draft/.test(server)],
  ["校验错误返回 400", /error\.statusCode = 400/.test(server) && /saveWorkspace\(body\)/.test(server) && /surnames 条目必须是对象/.test(server)],
  ["服务端静态暴露面收敛", /requested === "\/index\.html"/.test(server) && /requested\.startsWith\("\/assets\/"\)/.test(server) && /const assetsDir = resolve\(rootDir, "assets"\)/.test(server) && /filePath !== assetsDir/.test(server)],
  ["服务端数据安全边界", /requested\.startsWith\("\/data\/"\)/.test(server) && /x-content-type-options/.test(server)],
  ["工作区校验与备份", /function assertWorkspaceShape/.test(server) && /const isNonEmptyString/.test(server) && /工作区必须包含 surnames/.test(server) && /surnames 至少需要包含一个姓氏档案/.test(server) && /工作区姓氏格式不正确/.test(server) && /工作区资料姓氏格式不正确/.test(server) && /工作区审核姓氏格式不正确/.test(server) && /markdownCorpus 条目必须包含 surname、title、content/.test(server) && /reviewState 条目必须包含 surname、title、status/.test(server) && /function backupWorkspace/.test(server) && /function pruneWorkspaceBackups/.test(server) && /BACKUP_RETENTION/.test(server) && /copyFileSync/.test(server)],
  ["服务端集成验收", /服务端集成检查通过/.test(serverVerify) && /\/api\/health/.test(serverVerify) && /data 目录禁止访问/.test(serverVerify)],
  ["服务端集成验收隔离运行数据", /tmpdir/.test(serverVerify) && /runtimeDir/.test(serverVerify) && /DATA_DIR/.test(serverVerify) && /rmSync\(runtimeDir/.test(serverVerify)],
  ["服务端无端口逻辑验收", /服务端逻辑检查通过/.test(logicVerify) && /107\/107/.test(logicVerify) && /createMockRequest/.test(logicVerify) && /handleRequest/.test(logicVerify) && /API JSON 返回内容长度/.test(logicVerify) && /HEAD 健康检查兼容部署探针/.test(logicVerify) && /API 方法不匹配不落静态服务/.test(logicVerify) && /API 405 返回 Allow 头/.test(logicVerify) && /未知 API 返回 404/.test(logicVerify) && /非法 Host 返回 400/.test(logicVerify) && /错误响应带请求 ID/.test(logicVerify) && /健康检查探针文件名冲突不误报/.test(logicVerify) && /限流桶计数测试接口/.test(logicVerify) && /限流桶清理测试请求成功/.test(logicVerify) && /限流桶写入多个来源/.test(logicVerify) && /限流桶过期后自动清理/.test(logicVerify) && /首页不缓存/.test(logicVerify) && /首页 no-store 忽略 ETag 条件请求/.test(logicVerify) && /静态页面拒绝非 GET HEAD 方法/.test(logicVerify) && /静态资源 405 返回 Allow 头/.test(logicVerify) && /静态资源短缓存与 ETag/.test(logicVerify) && /静态资源 GET 返回内容长度/.test(logicVerify) && /静态资源 ETag 命中返回 304/.test(logicVerify) && /静态资源 HEAD 只返回响应头/.test(logicVerify) && /静态资源 HEAD 返回 GET 内容长度/.test(logicVerify) && /静态目录请求不泄漏服务器路径/.test(logicVerify) && /工作区清空前自动备份/.test(logicVerify) && /工作区备份自动保留上限/.test(logicVerify) && /资料库字段类型错误返回 400/.test(logicVerify) && /审核队列字段类型错误返回 400/.test(logicVerify) && /工作区拒绝拉丁混合姓氏档案/.test(logicVerify) && /工作区拒绝拉丁混合资料姓氏/.test(logicVerify) && /工作区拒绝拉丁混合审核姓氏/.test(logicVerify) && /空姓氏工作区返回 400/.test(logicVerify) && /缺少姓氏工作区返回 400/.test(logicVerify) && /超大多字节请求体返回 413/.test(logicVerify) && /复姓详情接口/.test(logicVerify) && /复姓详情接口兼容拼音/.test(logicVerify) && /公开详情补齐可渲染档案结构/.test(logicVerify) && /公开迁徙坐标夹紧/.test(logicVerify) && /公开姓氏详情兼容姓后缀/.test(logicVerify) && /公开姓氏详情兼容氏后缀/.test(logicVerify) && /公开姓氏详情兼容姓氏后缀/.test(logicVerify) && /公开姓氏详情兼容拼音/.test(logicVerify) && /公开姓氏详情兼容繁体/.test(logicVerify) && /复姓列表搜索兼容姓后缀/.test(logicVerify) && /复姓列表搜索兼容氏后缀/.test(logicVerify) && /复姓列表搜索兼容姓氏后缀/.test(logicVerify) && /公开姓氏列表支持沉淀库上限/.test(logicVerify) && /公开 API 坏工作区回退/.test(logicVerify) && /后台读取坏工作区返回明确错误/.test(logicVerify) && /工作区文件不可写时返回脱敏错误/.test(logicVerify) && /工作区清空失败时返回脱敏错误/.test(logicVerify) && /反馈必须绑定姓氏/.test(logicVerify) && /反馈拒绝拉丁混合姓氏/.test(logicVerify) && /反馈联系方式清洗为单行/.test(logicVerify) && /反馈状态写回失败时返回脱敏错误/.test(logicVerify) && /反馈状态写回不可写时返回脱敏错误/.test(logicVerify) && /反馈文件不可读时返回明确错误/.test(logicVerify) && /反馈文件不可写时返回脱敏错误/.test(logicVerify) && /反馈坏状态归一化/.test(logicVerify) && /历史反馈内容清洗限长/.test(logicVerify) && /历史反馈缺 ID 生成稳定 ID/.test(logicVerify) && /反馈姓氏后缀归一化/.test(logicVerify) && /同毫秒反馈 ID 不重复/.test(logicVerify) && /编码斜杠禁止穿越静态目录/.test(logicVerify) && /审计日志包含请求 ID/.test(logicVerify) && /审计写入失败不阻断工作区保存/.test(logicVerify) && /审计文件不可读时降级为空列表/.test(logicVerify) && /审计坏行容错/.test(logicVerify) && /坏 URL 编码返回 400/.test(logicVerify) && /AI 非对象请求返回 400/.test(logicVerify) && /AI 消息结构错误返回 400/.test(logicVerify) && /AI Endpoint 协议错误返回 400/.test(logicVerify) && /AI 上游错误不泄漏响应正文/.test(logicVerify) && /AI 网络异常不泄漏错误正文/.test(logicVerify)],
  ["服务端无端口鉴权验收", /服务端鉴权检查通过/.test(authVerify) && /13\/13/.test(authVerify) && /ADMIN_TOKEN/.test(authVerify) && /审计接口拒绝无令牌/.test(authVerify) && /工作区读取接受正确令牌/.test(authVerify) && /工作区写入接受正确令牌/.test(authVerify) && /无令牌请求不消耗后台写入限流/.test(authVerify) && /默认不信任转发头绕过限流/.test(authVerify) && /限流响应返回 Retry-After/.test(authVerify)],
  ["服务端生产安全验收", /生产安全检查通过/.test(productionVerify) && /22\/22/.test(productionVerify) && /生产缺令牌健康检查失败/.test(productionVerify) && /生产缺令牌健康检查不泄漏配置名/.test(productionVerify) && /生产空白令牌健康检查失败/.test(productionVerify) && /生产空白令牌健康检查不泄漏配置名/.test(productionVerify) && /生产缺 AI 环境配置但允许后台 Harness 配置/.test(productionVerify) && /生产缺 AI 配置健康检查不泄漏配置名/.test(productionVerify) && /生产缺后台 Harness Key 时拒绝 AI 调用/.test(productionVerify) && /生产 AI Endpoint 格式错误健康检查失败/.test(productionVerify) && /生产 AI Endpoint 格式错误健康检查不泄漏配置名/.test(productionVerify) && /生产运行目录不可写健康检查失败/.test(productionVerify) && /生产运行目录健康检查不泄漏路径/.test(productionVerify) && /生产备份目录不可用健康检查失败/.test(productionVerify) && /生产备份目录健康检查不泄漏路径/.test(productionVerify) && /无效写入限流配置回退默认值/.test(productionVerify) && /空白 SITE_ORIGIN 回退默认公开地址/.test(productionVerify) && /非法 SITE_ORIGIN 回退默认公开地址/.test(productionVerify) && /无效 PORT 回退默认公开地址/.test(productionVerify) && /空白 HOST 回退默认公开地址/.test(productionVerify)],
  ["UI 结构验收", /UI 结构检查通过/.test(uiVerify) && /56\/56/.test(uiVerify) && /无重复 ID/.test(uiVerify) && /前台后台页面分区/.test(uiVerify) && /公开 API 初始化支持沉淀型姓氏库/.test(uiVerify) && /复姓输入支持/.test(uiVerify) && /前台拼音查询支持/.test(uiVerify) && /当前姓氏复用拼音解析/.test(uiVerify) && /未命中拼音不污染姓氏库/.test(uiVerify) && /批量补充过滤拉丁脏输入/.test(uiVerify) && /姓氏双字后缀归一化/.test(uiVerify) && /工作区清空失败提示/.test(uiVerify) && /工作区读取异常提示/.test(uiVerify) && /运营令牌验证/.test(uiVerify) && /种子资料结构完整/.test(uiVerify) && /前端迁徙坐标夹紧/.test(uiVerify) && /前端迁徙空坐标回退/.test(uiVerify) && /迁徙节点不依赖内联样式/.test(uiVerify) && /AI Harness 服务端代理优先/.test(uiVerify) && /工作区导入覆盖旧姓氏/.test(uiVerify) && /工作区导入清空缺省队列/.test(uiVerify) && /工作区后端保存串行化/.test(uiVerify) && /工作区导入必须包含姓氏档案/.test(uiVerify) && /工作区导入校验姓氏条目/.test(uiVerify) && /工作区导入校验资料审核条目/.test(uiVerify) && /工作区导入拒绝拉丁混合姓氏/.test(uiVerify) && /工作区快照恢复过滤脏数据/.test(uiVerify) && /工作区导入不回灌旧姓氏/.test(uiVerify) && /工作区导入半成品档案可渲染/.test(uiVerify) && /热门姓氏宫格单字展示/.test(uiVerify) && /详情姓氏水印绑定身份卡/.test(uiVerify) && /详情身份卡可信信息胶囊/.test(uiVerify) && /详情状态胶囊区分沉淀阶段/.test(uiVerify) && /审核队列稳定 ID/.test(uiVerify) && /批量待收录姓氏/.test(uiVerify) && /审计请求 ID 可见/.test(uiVerify) && /AI Harness 页面文案同步/.test(uiVerify)],
  ["Release 一键验收", /Release 检查通过/.test(releaseVerify) && /verify-site\.mjs/.test(releaseVerify) && /verify-ui/.test(releaseVerify) && /verify:logic/.test(releaseVerify) && /verify:auth/.test(releaseVerify) && /verify:production/.test(releaseVerify)],
  ["前端接入 Node API", /\/api\/workspace/.test(app) && /\/api\/ai-draft/.test(app) && /\/api\/bootstrap/.test(app) && /\/api\/surnames\?limit=500/.test(app) && /payload\.workspace/.test(app)],
  ["前台后台页面分区", /id="publicView"/.test(html) && /admin\.html/.test(html) && /id="adminApp"/.test(adminHtml) && /login\.html/.test(app) && /function requireAdminSession/.test(app)],
  ["前端管理令牌配置", /id="adminToken"/.test(adminHtml) && /function getAdminHeaders/.test(app) && /X-Admin-Token/.test(app)],
  ["运营令牌验证交互", /id="verifyAdminBtn"/.test(adminHtml) && /id="adminStatus"/.test(adminHtml) && /function verifyAdminAccess/.test(app) && /管理令牌可用/.test(app)],
  ["产品名称与网站定位", /百家姓溯源录/.test(html) && /中华姓氏文化科普数据库/.test(html)],
  ["首页 SEO 与分享元信息", /<link rel="canonical"/.test(html) && /<link rel="manifest" href="manifest\.webmanifest">/.test(html) && /name="theme-color"/.test(html) && /property="og:title"/.test(html) && /property="og:description"/.test(html) && /property="og:type"/.test(html) && /property="og:url"/.test(html) && /name="twitter:card"/.test(html)],
  ["公开站品牌图标", /<link rel="icon" href="assets\/icon\.svg" type="image\/svg\+xml">/.test(html) && parsedManifest?.icons?.some(item => item.src === "/assets/icon.svg" && item.type === "image/svg+xml") && /<svg/.test(icon) && /百家姓溯源录/.test(icon)],
  ["Robots 与 Sitemap", /User-agent: \*/.test(robots) && /Allow: \//.test(robots) && /Sitemap:/.test(robots) && /<urlset/.test(sitemap) && /<loc>/.test(sitemap) && /index\.html/.test(sitemap)],
  ["Web App Manifest", parsedManifest?.name === "百家姓溯源录" && parsedManifest?.short_name === "溯源录" && parsedManifest?.start_url === "/index.html" && parsedManifest?.display === "standalone" && parsedManifest?.theme_color === "#C81623" && parsedManifest?.background_color === "#F9F6EF"],
  ["红金米白视觉配置", /--red:\s*#C81623/.test(styles) && /--gold:\s*#D4AF37/.test(styles) && /--paper:\s*#F9F6EF/.test(styles) && /--bg:\s*#080C12/.test(styles) && /--teal:\s*#20C4BE/.test(styles)],
  ["首页姓氏查询", /id="surnameInput"/.test(html) && /id="searchBtn"/.test(html) && /function renderSurname/.test(app)],
  ["复姓查询支持", /function normalizeSurnameInput/.test(app) && app.includes('replace(/(姓氏|姓|氏)$/, "")') && /function normalizeSurnameName/.test(server) && server.includes('replace(/(姓氏|姓|氏)$/, "")') && /slice\(0, 4\)/.test(app) && /slice\(0, 4\)/.test(server)],
  ["前台拼音查询支持", /function resolveSurnameQuery/.test(app) && /function isLatinLikeQuery/.test(app) && /\^\[a-z0-9\\s\._-/.test(app) && /if \(isLatinLikeQuery\(raw\)\) return "陈";/.test(app) && /item\.pinyin/.test(app) && /item\.info\?\.\["拼音"\]/.test(app) && /resolveSurnameQuery\(byId\("surnameInput"\)\.value\)/.test(app) && /function getCurrentSurname\(\) \{\s*return resolveSurnameQuery\(byId\("surnameInput"\)\.value\);\s*\}/.test(app)],
  ["姓氏基础档案字段", /"繁体"/.test(seed) && /"拼音"/.test(seed) && /"起源朝代"/.test(seed) && /"得姓始祖"/.test(seed) && /"郡望"/.test(seed) && /"堂号"/.test(seed)],
  ["五个详情页签", /data-tab="origin"/.test(html) && /data-tab="migration"/.test(html) && /data-tab="branches"/.test(html) && /data-tab="visuals"/.test(html) && /data-tab="sources"/.test(html)],
  ["多源流分支展示", /"origins"\s*:\s*\[/.test(seed) && /多源流|多源/.test(html)],
  ["历史名人典故家风", /id="cultureGrid"/.test(html) && /历史名人/.test(html) && /典故/.test(html) && /家风/.test(html)],
  ["收藏分享导出", /id="favoriteBtn"/.test(html) && /id="shareBtn"/.test(html) && /id="exportBtn"/.test(html) && /window\.print/.test(app)],
  ["纠错反馈闭环", /id="feedbackText"/.test(html) && /id="feedbackContact"/.test(html) && /id="feedbackBtn"/.test(html) && /feedbackResult/.test(html) && /\/api\/feedback/.test(app) && /contact/.test(app)],
  ["运营反馈工单台", /id="feedbackQueue"/.test(adminHtml) && /id="refreshFeedbackBtn"/.test(adminHtml) && /function renderFeedbackQueue/.test(app) && /function updateFeedbackStatus/.test(app)],
  ["运营审计事件台", /id="auditTrail"/.test(adminHtml) && /id="refreshAuditBtn"/.test(adminHtml) && /function renderAuditTrail/.test(app) && /function loadAuditTrail/.test(app)],
  ["审计请求 ID 前端可见", /class="audit-request-id"/.test(app) && /请求 ID/.test(app) && /item\.requestId/.test(app) && /\.audit-request-id/.test(styles) && /word-break:\s*break-all/.test(styles)],
  ["AI API 配置区", /id="harnessEndpoint"/.test(adminHtml) && /id="harnessApiKey"/.test(adminHtml) && /id="harnessModel"/.test(adminHtml)],
  ["Markdown 资料库检索", /markdownCorpus|function retrieveMarkdownContext/.test(app)],
  ["OpenAI-compatible 调用", /async function callAiModel|chat\/completions/.test(app)],
  ["离线降级初稿", /function buildOfflineDraft/.test(app)],
  ["AI 初稿输出区", /id="aiDraft"/.test(adminHtml) && /生成当前姓氏 AI 初稿/.test(adminHtml)],
  ["审核队列渲染", /id="reviewQueue"/.test(adminHtml) && /function renderReviewQueue/.test(app)],
  ["资料沉淀指标", /id="repositoryStats"/.test(adminHtml) && /function renderRepositoryStats/.test(app)],
  ["姓氏档案编辑器", /id="profileEditor"/.test(adminHtml) && /id="saveProfileBtn"/.test(adminHtml) && /id="profileEditStatus"/.test(adminHtml) && /function syncProfileEditor/.test(app) && /function saveProfileEdits/.test(app)],
  ["未知姓氏待收录", /function createPendingSurname/.test(app) && /function parseBatchSurnames/.test(app) && /filter\(name => !isLatinLikeQuery\(name\)\)/.test(app) && /待收录/.test(app)],
  ["资料新增入库", /id="sourceTitle"/.test(adminHtml) && /id="sourceContent"/.test(adminHtml) && /function addCorpusSource/.test(app)],
  ["审核批准驳回动作", /data-action="approve"/.test(app) && /data-action="reject"/.test(app) && /data-review-id/.test(app) && /function updateReviewStatus/.test(app) && /entry\.id === id/.test(app) && !/data-title=/.test(app)],
  ["本地持久化", /localStorage/.test(app) && /function persistWorkspace/.test(app) && /function hydrateWorkspace/.test(app) && /function normalizeClientSurnameProfile/.test(app)],
  ["资料导出导入", /id="exportDataBtn"/.test(adminHtml) && /id="importDataText"/.test(adminHtml) && /function exportWorkspace/.test(app) && /function importWorkspace/.test(app)],
  ["演示验收入口", /function runDemoScenario/.test(app) && /demo"\) !== "pending/.test(app)],
  ["迁徙路线可视化", /class="migration-map"/.test(app) && /function renderMigrationMap/.test(app) && /function clampMapCoordinate/.test(app) && /data-route-node/.test(app)],
  ["参考图深色可信资料库视觉", /class="app-shell"/.test(html) && /class="hero-panel"/.test(html) && /class="ops-panel"/.test(html) && /section-band/.test(html) && /id="profileMeta"/.test(html) && /AI 可信资料库/.test(html) && /AI 可信资料网络/.test(styles) && /class="back-home"/.test(html) && /\.hot-list[\s\S]*?repeat\(10/.test(styles) && /\.profile-head:after/.test(styles) && /content: attr\(data-surname\)/.test(styles) && /\.profile-meta/.test(styles) && /\.meta-pill/.test(styles) && /function resolveProfileReviewStatus/.test(app) && /来源待核/.test(app) && /\.app-shell/.test(styles) && /\.ops-panel/.test(styles)],
  ["交付 README", /百家姓溯源录网站 MVP/.test(readme) && /node verify-site\.mjs/.test(readme) && /npm run verify:server/.test(readme) && /npm start/.test(readme) && /ADMIN_TOKEN/.test(readme)],
  ["公开站上线资产说明", /robots\.txt/.test(readme) && /sitemap\.xml/.test(readme) && /manifest\.webmanifest/.test(readme) && /SITE_ORIGIN/.test(readme) && /readSiteOriginEnv/.test(server) && /-e SITE_ORIGIN=/.test(readme) && /SITE_ORIGIN/.test(envExample) && /公开站上线资产/.test(launchReview)],
  ["环境与忽略文件", /ADMIN_TOKEN/.test(envExample) && /AI_API_KEY/.test(envExample) && /TRUST_PROXY=false/.test(envExample) && /BACKUP_RETENTION=20/.test(envExample) && /data\/workspace\.json/.test(gitignore) && /data\/audit\.log/.test(gitignore) && /\.env/.test(gitignore)],
  ["容器化部署文件", /FROM node:20-alpine/.test(dockerfile) && /USER node/.test(dockerfile) && /CMD \["node", "server\.js"\]/.test(dockerfile) && /\/app\/runtime/.test(dockerfile) && /robots\.txt/.test(dockerfile) && /sitemap\.xml/.test(dockerfile) && /manifest\.webmanifest/.test(dockerfile) && /verify-\*\.mjs/.test(dockerfile) && /node_modules/.test(dockerignore) && /data\/workspace\.json/.test(dockerignore)],
  ["容器健康检查", /HEALTHCHECK/.test(dockerfile) && /\/api\/health/.test(dockerfile) && /process\.env\.PORT/.test(dockerfile)],
  ["容器内 Release 自检说明", /docker run --rm/.test(readme) && /npm run verify:release/.test(readme) && /-e ADMIN_TOKEN=/.test(readme) && /-e AI_ENDPOINT=/.test(readme) && /-e AI_API_KEY=/.test(readme) && /baijiaxing-suyuanlu npm run verify:release/.test(readme)],
  ["上线部署说明", /Docker/.test(readme) && /ADMIN_TOKEN/.test(readme) && /生产部署/.test(readme) && /健康检查/.test(readme) && /NODE_ENV=production HOST=0\.0\.0\.0 PORT=8765/.test(readme) && /生产环境缺少 `ADMIN_TOKEN`/.test(readme) && !/否则写接口会保持本地演示模式/.test(readme) && /GET \/api\/workspace` 需管理令牌/.test(readme)],
  ["上线 Review 报告", /上线 Review 报告/.test(launchReview) && /当前验证结果/.test(launchReview) && /npm run verify:release/.test(launchReview) && /服务端集成检查通过：13\/13/.test(launchReview) && /内置浏览器真实页面检查/.test(launchReview) && /截图非空/.test(launchReview) && /EPERM/.test(launchReview)],
  ["AI Harness 技术口径", /OpenAI-compatible/.test(readme) && /Markdown/.test(readme) && /RAG/.test(readme) && /优先调用服务端 AI 代理/.test(readme) && /失败时回退/.test(readme)],
  ["后续小程序复用说明", /小程序/.test(readme) && /共用数据模型/.test(readme) && /\/api\/surnames\?limit=500/.test(readme) && /\/api\/surnames\?q=chen&limit=20/.test(readme) && /\/api\/surname\?name=陈/.test(readme) && /\/api\/surname\?name=chen/.test(readme) && /\/api\/surname\?name=陳/.test(readme)],
  ["禁用特定后置能力表述", !hasBannedTerms(`${html}\n${readme}\n${server}\n${serverVerify}\n${logicVerify}\n${authVerify}\n${productionVerify}\n${styles}\n${app}\n${seed}\n${dockerfile}\n${dockerignore}\n${launchReview}\n${robots}\n${sitemap}\n${manifest}`)]
];

const failed = checks.filter(([, rule]) => {
  if (typeof rule === "boolean") return !rule;
  return !rule.test(html);
});

if (failed.length) {
  console.error("未满足检查项：");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`检查通过：${checks.length}/${checks.length}`);
