import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Writable } from "node:stream";

const runtimeDir = join(tmpdir(), `baijiaxing-prod-${Date.now()}`);
process.env.DATA_DIR = runtimeDir;
process.env.NODE_ENV = "production";
delete process.env.ADMIN_TOKEN;
delete process.env.AI_ENDPOINT;
delete process.env.AI_API_KEY;

function createMockRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    }
  });
  req.method = method;
  req.url = url;
  req.headers = { host: "prod.local", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function callRoute(handleRequest, options) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const res = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    res.writeHead = (statusCode, headers) => {
      res.statusCode = statusCode;
      res.headers = headers;
      return res;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      resolve({ status: res.statusCode, headers: res.headers || {}, text, json });
    };
    handleRequest(createMockRequest(options), res).catch(reject);
  });
}

function expectOk(name, condition) {
  if (!condition) throw new Error(`未满足检查项：${name}`);
}

const { handleRequest: handleMissingAdmin } = await import(`./server.js?prod-missing-admin=${Date.now()}`);

const health = await callRoute(handleMissingAdmin, { url: "/api/health" });
expectOk("生产缺令牌健康检查失败", health.status === 503 && health.json?.ok === false && health.json?.configReady === false);
expectOk("生产缺令牌健康检查不泄漏配置名", !/ADMIN_TOKEN|AI_ENDPOINT|AI_API_KEY/.test(health.text));

const publicList = await callRoute(handleMissingAdmin, { url: "/api/surnames?limit=1" });
expectOk("生产缺令牌仍允许公开查询", publicList.status === 200 && publicList.json?.surnames?.length === 1);

const workspaceWrite = await callRoute(handleMissingAdmin, {
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: { "安": { char: "安" } } })
});
expectOk("生产缺令牌拒绝工作区写入", workspaceWrite.status === 503 && /ADMIN_TOKEN/.test(workspaceWrite.json?.error || ""));

const auditRead = await callRoute(handleMissingAdmin, { url: "/api/audit" });
expectOk("生产缺令牌拒绝审计读取", auditRead.status === 503 && /ADMIN_TOKEN/.test(auditRead.json?.error || ""));

const aiDraft = await callRoute(handleMissingAdmin, {
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [] })
});
expectOk("生产缺令牌拒绝 AI 代理", aiDraft.status === 503 && /ADMIN_TOKEN/.test(aiDraft.json?.error || ""));

const runtimeDirBlankAdmin = join(tmpdir(), `baijiaxing-prod-blank-admin-${Date.now()}`);
process.env.DATA_DIR = runtimeDirBlankAdmin;
process.env.ADMIN_TOKEN = "   ";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";

const { handleRequest: handleBlankAdmin } = await import(`./server.js?prod-blank-admin=${Date.now()}`);

const healthBlankAdmin = await callRoute(handleBlankAdmin, { url: "/api/health" });
expectOk("生产空白令牌健康检查失败", healthBlankAdmin.status === 503 && healthBlankAdmin.json?.ok === false && healthBlankAdmin.json?.configReady === false);
expectOk("生产空白令牌健康检查不泄漏配置名", !/ADMIN_TOKEN|AI_ENDPOINT|AI_API_KEY/.test(healthBlankAdmin.text));

const runtimeDirWithAdmin = join(tmpdir(), `baijiaxing-prod-ai-${Date.now()}`);
process.env.DATA_DIR = runtimeDirWithAdmin;
process.env.ADMIN_TOKEN = "prod-admin-token";
delete process.env.AI_ENDPOINT;
delete process.env.AI_API_KEY;

const { handleRequest: handleMissingAi } = await import(`./server.js?prod-missing-ai=${Date.now()}`);

const healthMissingAi = await callRoute(handleMissingAi, {
  url: "/api/health",
  headers: { "x-admin-token": "prod-admin-token" }
});
expectOk("生产缺 AI 环境配置但允许后台 Harness 配置", healthMissingAi.status === 200 && healthMissingAi.json?.ok === true && healthMissingAi.json?.configReady === true);
expectOk("生产缺 AI 配置健康检查不泄漏配置名", !/ADMIN_TOKEN|AI_ENDPOINT|AI_API_KEY/.test(healthMissingAi.text));

const aiDraftWithPayloadKey = await callRoute(handleMissingAi, {
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json", "x-admin-token": "prod-admin-token" },
  body: JSON.stringify({
    endpoint: "https://example.invalid/v1/chat/completions",
    apiKey: "front-end-key",
    model: "debug-model",
    messages: [{ role: "user", content: "test" }]
  })
});
expectOk("生产缺后台 Harness Key 时拒绝 AI 调用", aiDraftWithPayloadKey.status === 400 && /apiKey/.test(aiDraftWithPayloadKey.json?.error || ""));

const runtimeDirInvalidAiEndpoint = join(tmpdir(), `baijiaxing-prod-invalid-ai-endpoint-${Date.now()}`);
process.env.DATA_DIR = runtimeDirInvalidAiEndpoint;
process.env.ADMIN_TOKEN = "prod-admin-token";

const { handleRequest: handleInvalidAiEndpoint } = await import(`./server.js?prod-invalid-ai-endpoint=${Date.now()}`);

const healthInvalidAiEndpoint = await callRoute(handleInvalidAiEndpoint, { url: "/api/health" });
expectOk("生产 AI Endpoint 格式错误健康检查失败", healthInvalidAiEndpoint.status === 200
  && healthInvalidAiEndpoint.json?.ok === true
  && healthInvalidAiEndpoint.json?.configReady === true);
const invalidHarnessEndpoint = await callRoute(handleInvalidAiEndpoint, {
  method: "PUT",
  url: "/api/harness-config",
  headers: { "content-type": "application/json", "x-admin-token": "prod-admin-token" },
  body: JSON.stringify({
    endpoint: "ftp://example.invalid/v1/chat/completions",
    apiKey: "prod-ai-key",
    model: "prod-model",
    systemPrompt: "只整理可信资料。",
    temperature: 0.3,
    retrievalQuery: "源流"
  })
});
expectOk("生产 AI Endpoint 格式错误健康检查不泄漏配置名", invalidHarnessEndpoint.status === 400 && !/ADMIN_TOKEN|AI_ENDPOINT|AI_API_KEY/.test(invalidHarnessEndpoint.text));

const blockedRuntimePath = join(tmpdir(), `baijiaxing-prod-blocked-${Date.now()}`);
writeFileSync(blockedRuntimePath, "not-a-directory");
process.env.DATA_DIR = blockedRuntimePath;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";

const { handleRequest: handleBlockedStorage } = await import(`./server.js?prod-blocked-storage=${Date.now()}`);

const healthBlockedStorage = await callRoute(handleBlockedStorage, {
  url: "/api/health",
  headers: { "x-admin-token": "prod-admin-token" }
});
expectOk("生产运行目录不可写健康检查失败", healthBlockedStorage.status === 503 && healthBlockedStorage.json?.ok === false && healthBlockedStorage.json?.storageWritable === false);
expectOk("生产运行目录健康检查不泄漏路径", !healthBlockedStorage.text.includes(blockedRuntimePath));

const runtimeDirBlockedBackups = join(tmpdir(), `baijiaxing-prod-blocked-backups-${Date.now()}`);
mkdirSync(runtimeDirBlockedBackups, { recursive: true });
writeFileSync(join(runtimeDirBlockedBackups, "backups"), "not-a-directory");
process.env.DATA_DIR = runtimeDirBlockedBackups;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";

const { handleRequest: handleBlockedBackups } = await import(`./server.js?prod-blocked-backups=${Date.now()}`);

const healthBlockedBackups = await callRoute(handleBlockedBackups, {
  url: "/api/health",
  headers: { "x-admin-token": "prod-admin-token" }
});
expectOk("生产备份目录不可用健康检查失败", healthBlockedBackups.status === 503 && healthBlockedBackups.json?.ok === false && healthBlockedBackups.json?.storageWritable === false);
expectOk("生产备份目录健康检查不泄漏路径", !healthBlockedBackups.text.includes(runtimeDirBlockedBackups));

const runtimeDirZeroWriteLimit = join(tmpdir(), `baijiaxing-prod-zero-write-limit-${Date.now()}`);
process.env.DATA_DIR = runtimeDirZeroWriteLimit;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";
process.env.WRITE_LIMIT_PER_MINUTE = "0";

const { handleRequest: handleZeroWriteLimit } = await import(`./server.js?prod-zero-write-limit=${Date.now()}`);

const feedbackWithZeroWriteLimit = await callRoute(handleZeroWriteLimit, {
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "写入限流配置为 0 时应回退默认值。" })
});
expectOk("无效写入限流配置回退默认值", feedbackWithZeroWriteLimit.status === 200 && feedbackWithZeroWriteLimit.json?.feedback?.id);

const runtimeDirBlankSiteOrigin = join(tmpdir(), `baijiaxing-prod-blank-site-origin-${Date.now()}`);
process.env.DATA_DIR = runtimeDirBlankSiteOrigin;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";
process.env.SITE_ORIGIN = "   ";

const { handleRequest: handleBlankSiteOrigin } = await import(`./server.js?prod-blank-site-origin=${Date.now()}`);

const homeWithBlankSiteOrigin = await callRoute(handleBlankSiteOrigin, { url: "/" });
expectOk("空白 SITE_ORIGIN 回退默认公开地址", homeWithBlankSiteOrigin.status === 200
  && homeWithBlankSiteOrigin.text.includes("http://127.0.0.1:8765/")
  && !homeWithBlankSiteOrigin.text.includes('__SITE_ORIGIN__')
  && !/href="\s+\/index\.html"/.test(homeWithBlankSiteOrigin.text));

const runtimeDirInvalidSiteOrigin = join(tmpdir(), `baijiaxing-prod-invalid-site-origin-${Date.now()}`);
process.env.DATA_DIR = runtimeDirInvalidSiteOrigin;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";
process.env.HOST = "127.0.0.1";
process.env.PORT = "8765";
process.env.SITE_ORIGIN = "javascript:alert(1)";

const { handleRequest: handleInvalidSiteOrigin } = await import(`./server.js?prod-invalid-site-origin=${Date.now()}`);

const homeWithInvalidSiteOrigin = await callRoute(handleInvalidSiteOrigin, { url: "/" });
const robotsWithInvalidSiteOrigin = await callRoute(handleInvalidSiteOrigin, { url: "/robots.txt" });
const sitemapWithInvalidSiteOrigin = await callRoute(handleInvalidSiteOrigin, { url: "/sitemap.xml" });
expectOk("非法 SITE_ORIGIN 回退默认公开地址", homeWithInvalidSiteOrigin.status === 200
  && robotsWithInvalidSiteOrigin.status === 200
  && sitemapWithInvalidSiteOrigin.status === 200
  && homeWithInvalidSiteOrigin.text.includes("http://127.0.0.1:8765/")
  && robotsWithInvalidSiteOrigin.text.includes("Sitemap: http://127.0.0.1:8765/sitemap.xml")
  && sitemapWithInvalidSiteOrigin.text.includes("<loc>http://127.0.0.1:8765/</loc>")
  && !/javascript:alert/.test(`${homeWithInvalidSiteOrigin.text}\n${robotsWithInvalidSiteOrigin.text}\n${sitemapWithInvalidSiteOrigin.text}`));

const runtimeDirInvalidPort = join(tmpdir(), `baijiaxing-prod-invalid-port-${Date.now()}`);
process.env.DATA_DIR = runtimeDirInvalidPort;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";
process.env.PORT = "abc";
process.env.SITE_ORIGIN = "   ";

const { handleRequest: handleInvalidPort } = await import(`./server.js?prod-invalid-port=${Date.now()}`);

const homeWithInvalidPort = await callRoute(handleInvalidPort, { url: "/" });
expectOk("无效 PORT 回退默认公开地址", homeWithInvalidPort.status === 200
  && homeWithInvalidPort.text.includes("http://127.0.0.1:8765/")
  && !homeWithInvalidPort.text.includes("NaN"));

const runtimeDirBlankHost = join(tmpdir(), `baijiaxing-prod-blank-host-${Date.now()}`);
process.env.DATA_DIR = runtimeDirBlankHost;
process.env.ADMIN_TOKEN = "prod-admin-token";
process.env.AI_ENDPOINT = "https://example.invalid/v1/chat/completions";
process.env.AI_API_KEY = "prod-ai-key";
process.env.HOST = "   ";
process.env.PORT = "8765";
process.env.SITE_ORIGIN = "   ";

const { handleRequest: handleBlankHost } = await import(`./server.js?prod-blank-host=${Date.now()}`);

const homeWithBlankHost = await callRoute(handleBlankHost, { url: "/" });
expectOk("空白 HOST 回退默认公开地址", homeWithBlankHost.status === 200
  && homeWithBlankHost.text.includes("http://127.0.0.1:8765/")
  && !/https?:\/\/\s+:/.test(homeWithBlankHost.text));

rmSync(runtimeDir, { recursive: true, force: true });
rmSync(runtimeDirBlankAdmin, { recursive: true, force: true });
rmSync(runtimeDirWithAdmin, { recursive: true, force: true });
rmSync(runtimeDirInvalidAiEndpoint, { recursive: true, force: true });
rmSync(blockedRuntimePath, { force: true });
rmSync(runtimeDirBlockedBackups, { recursive: true, force: true });
rmSync(runtimeDirZeroWriteLimit, { recursive: true, force: true });
rmSync(runtimeDirBlankSiteOrigin, { recursive: true, force: true });
rmSync(runtimeDirInvalidSiteOrigin, { recursive: true, force: true });
rmSync(runtimeDirInvalidPort, { recursive: true, force: true });
rmSync(runtimeDirBlankHost, { recursive: true, force: true });

console.log("生产安全检查通过：22/22");
