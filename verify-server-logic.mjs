import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Writable } from "node:stream";

const runtimeDir = join(tmpdir(), `baijiaxing-logic-${Date.now()}`);
process.env.DATA_DIR = runtimeDir;

const serverModule = await import("./server.js");
const { handleRequest } = serverModule;

function createMockRequest({ method = "GET", url = "/", headers = {}, body = "", remoteAddress = "127.0.0.1" } = {}) {
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    }
  });
  req.method = method;
  req.url = url;
  req.headers = { host: "logic.local", ...headers };
  req.socket = { remoteAddress };
  return req;
}

function callRoute(options) {
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
      resolve({
        status: res.statusCode,
        headers: res.headers || {},
        text,
        json
      });
    };
    handleRequest(createMockRequest(options), res).catch(reject);
  });
}

async function expectOk(name, condition) {
  if (!condition) throw new Error(`未满足检查项：${name}`);
}

const health = await callRoute({ url: "/api/health" });
await expectOk("health", health.status === 200 && health.json?.ok && health.json?.seedReady);
await expectOk("安全响应头", health.headers["content-security-policy"]?.includes("script-src 'self'"));
await expectOk("API JSON 返回内容长度", Number(health.headers["content-length"]) === Buffer.byteLength(health.text, "utf8"));
const headHealth = await callRoute({ method: "HEAD", url: "/api/health" });
await expectOk("HEAD 健康检查兼容部署探针", headHealth.status === 200 && headHealth.text === "" && headHealth.headers["content-type"]?.includes("application/json"));
const postHealth = await callRoute({ method: "POST", url: "/api/health" });
await expectOk("API 方法不匹配不落静态服务", postHealth.status === 405 && /Method not allowed/.test(postHealth.text));
await expectOk("API 405 返回 Allow 头", postHealth.headers.allow === "GET, HEAD");
const unknownApi = await callRoute({ url: "/api/unknown" });
await expectOk("未知 API 返回 404", unknownApi.status === 404 && /API not found/.test(unknownApi.text));
let invalidHostRejected = false;
let invalidHostResponse = null;
try {
  invalidHostResponse = await callRoute({ url: "/api/health", headers: { host: "%%%" } });
} catch {
  invalidHostRejected = true;
}
await expectOk("非法 Host 返回 400", !invalidHostRejected && invalidHostResponse.status === 400 && /请求 URL 不正确/.test(invalidHostResponse.text));
await expectOk("错误响应带请求 ID", /^req-[a-f0-9-]{36}$/.test(invalidHostResponse.headers["x-request-id"] || "")
  && invalidHostResponse.json?.requestId === invalidHostResponse.headers["x-request-id"]);

const originalDateNowForHealth = Date.now;
Date.now = () => 1888888888000;
mkdirSync(join(runtimeDir, ".health-1888888888000.tmp"), { recursive: true });
const healthWithProbeNameCollision = await callRoute({ url: "/api/health" });
Date.now = originalDateNowForHealth;
rmSync(join(runtimeDir, ".health-1888888888000.tmp"), { recursive: true, force: true });
await expectOk("健康检查探针文件名冲突不误报", healthWithProbeNameCollision.status === 200 && healthWithProbeNameCollision.json?.ok === true);

await expectOk("限流桶计数测试接口", typeof serverModule.getRateBucketCount === "function");
const originalDateNowForRateLimit = Date.now;
Date.now = () => 1999999999000;
const initialRateBucketCount = serverModule.getRateBucketCount();
const rateSeedStatuses = [];
for (let index = 1; index <= 5; index += 1) {
  const rateSeed = await callRoute({
    method: "POST",
    url: "/api/feedback",
    remoteAddress: `10.0.0.${index}`,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ surname: "陈", content: `限流桶清理测试 ${index}` })
  });
  rateSeedStatuses.push(rateSeed.status);
}
await expectOk("限流桶清理测试请求成功", rateSeedStatuses.every(status => status === 200));
await expectOk("限流桶写入多个来源", serverModule.getRateBucketCount() >= initialRateBucketCount + 5);
Date.now = () => 1999999999000 + 61_000;
const rateCleanupTrigger = await callRoute({
  method: "POST",
  url: "/api/feedback",
  remoteAddress: "10.0.0.200",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "限流桶过期清理触发请求" })
});
Date.now = originalDateNowForRateLimit;
await expectOk("限流桶过期后自动清理", rateCleanupTrigger.status === 200 && serverModule.getRateBucketCount() <= initialRateBucketCount + 1);

const home = await callRoute({ url: "/" });
await expectOk("首页 HTML", home.status === 200 && home.text.includes("百家姓溯源录") && home.headers["content-type"].includes("text/html"));
await expectOk("首页公开地址渲染", home.text.includes("http://127.0.0.1:8765/") && !home.text.includes("__SITE_ORIGIN__"));
await expectOk("首页不缓存", home.headers["cache-control"] === "no-store");
const homeWithEtag = await callRoute({ url: "/", headers: { "if-none-match": home.headers.etag } });
await expectOk("首页 no-store 忽略 ETag 条件请求", homeWithEtag.status === 200 && homeWithEtag.text.includes("百家姓溯源录"));
const postHome = await callRoute({ method: "POST", url: "/" });
await expectOk("静态页面拒绝非 GET HEAD 方法", postHome.status === 405 && /Method not allowed/.test(postHome.text));
await expectOk("静态资源 405 返回 Allow 头", postHome.headers.allow === "GET, HEAD");

const css = await callRoute({ url: "/assets/styles.css" });
await expectOk("样式资源", css.status === 200 && css.text.includes("--red: #C81623"));
await expectOk("静态资源短缓存与 ETag", css.headers["cache-control"] === "public, max-age=300, must-revalidate" && /^"sha256-[^"]+"$/.test(css.headers.etag || ""));
await expectOk("静态资源 GET 返回内容长度", Number(css.headers["content-length"]) === Buffer.byteLength(css.text, "utf8"));
const cssNotModified = await callRoute({ url: "/assets/styles.css", headers: { "if-none-match": css.headers.etag } });
await expectOk("静态资源 ETag 命中返回 304", cssNotModified.status === 304 && cssNotModified.text === "" && cssNotModified.headers.etag === css.headers.etag);
const headCss = await callRoute({ method: "HEAD", url: "/assets/styles.css" });
await expectOk("静态资源 HEAD 只返回响应头", headCss.status === 200 && headCss.text === "" && headCss.headers.etag === css.headers.etag && headCss.headers["content-type"].includes("text/css"));
await expectOk("静态资源 HEAD 返回 GET 内容长度", headCss.headers["content-length"] === css.headers["content-length"]);

const robots = await callRoute({ url: "/robots.txt" });
await expectOk("robots.txt", robots.status === 200 && robots.headers["content-type"].includes("text/plain") && robots.text.includes("Sitemap:"));

const sitemap = await callRoute({ url: "/sitemap.xml" });
await expectOk("sitemap.xml", sitemap.status === 200 && sitemap.headers["content-type"].includes("application/xml") && sitemap.text.includes("<urlset"));

const manifest = await callRoute({ url: "/manifest.webmanifest" });
await expectOk("manifest.webmanifest", manifest.status === 200 && manifest.headers["content-type"].includes("application/manifest+json") && manifest.json?.name === "百家姓溯源录");

const forbiddenData = await callRoute({ url: "/data/seed-workspace.json" });
await expectOk("data 目录禁止访问", forbiddenData.status === 403);

const sourceLeak = await callRoute({ url: "/server.js" });
await expectOk("服务端源码禁止访问", sourceLeak.status === 403);

const assetDirectoryRequest = await callRoute({ url: "/assets/" });
await expectOk("静态目录请求不泄漏服务器路径", assetDirectoryRequest.status === 404
  && !assetDirectoryRequest.text.includes("baijiaxing-suyuanlu-site")
  && !assetDirectoryRequest.text.includes("/Users/"));

const encodedTraversal = await callRoute({ url: "/assets/%2e%2e/server.js" });
await expectOk("编码路径禁止穿越静态目录", encodedTraversal.status === 403);

const encodedSlashTraversal = await callRoute({ url: "/assets/..%2fserver.js" });
await expectOk("编码斜杠禁止穿越静态目录", encodedSlashTraversal.status === 403);

const badEncodedPath = await callRoute({ url: "/assets/%E0%A4%A.css" });
await expectOk("坏 URL 编码返回 400", badEncodedPath.status === 400 && badEncodedPath.json?.error);

const bootstrap = await callRoute({ url: "/api/bootstrap" });
await expectOk("种子资料接口", bootstrap.status === 200 && bootstrap.json?.workspace?.surnames?.["陈"]?.char === "陈");

const surnameList = await callRoute({ url: "/api/surnames" });
await expectOk("公开姓氏列表接口", surnameList.status === 200 && surnameList.json?.surnames?.some(item => item.char === "陈" && item.pinyin));

const expandedSurnameList = await callRoute({ url: "/api/surnames?limit=500" });
await expectOk("公开姓氏列表支持沉淀库上限", expandedSurnameList.status === 200 && expandedSurnameList.json?.limit === 500);

const filteredSurnames = await callRoute({ url: "/api/surnames?q=chen&limit=1" });
await expectOk("公开姓氏列表搜索分页", filteredSurnames.status === 200 && filteredSurnames.json?.query === "chen" && filteredSurnames.json?.limit === 1 && filteredSurnames.json?.total >= 1 && filteredSurnames.json?.surnames?.length === 1 && filteredSurnames.json?.surnames?.[0]?.char === "陈");

const filteredSurnamesWithSuffix = await callRoute({ url: "/api/surnames?q=陈姓&limit=1" });
await expectOk("公开姓氏列表搜索兼容姓后缀", filteredSurnamesWithSuffix.status === 200 && filteredSurnamesWithSuffix.json?.surnames?.[0]?.char === "陈");

const surnameDetail = await callRoute({ url: "/api/surname?name=陈" });
await expectOk("公开姓氏详情接口", surnameDetail.status === 200 && surnameDetail.json?.surname?.char === "陈" && surnameDetail.json?.surname?.origins?.length);

const surnameDetailWithSuffix = await callRoute({ url: "/api/surname?name=陈姓" });
await expectOk("公开姓氏详情兼容姓后缀", surnameDetailWithSuffix.status === 200 && surnameDetailWithSuffix.json?.surname?.char === "陈");

const surnameDetailWithClanSuffix = await callRoute({ url: "/api/surname?name=陈氏" });
await expectOk("公开姓氏详情兼容氏后缀", surnameDetailWithClanSuffix.status === 200 && surnameDetailWithClanSuffix.json?.surname?.char === "陈");

const surnameDetailWithCompoundSuffix = await callRoute({ url: "/api/surname?name=陈姓氏" });
await expectOk("公开姓氏详情兼容姓氏后缀", surnameDetailWithCompoundSuffix.status === 200 && surnameDetailWithCompoundSuffix.json?.surname?.char === "陈");

const surnameDetailWithPinyin = await callRoute({ url: "/api/surname?name=chen" });
await expectOk("公开姓氏详情兼容拼音", surnameDetailWithPinyin.status === 200 && surnameDetailWithPinyin.json?.surname?.char === "陈");

const surnameDetailWithTraditional = await callRoute({ url: "/api/surname?name=陳" });
await expectOk("公开姓氏详情兼容繁体", surnameDetailWithTraditional.status === 200 && surnameDetailWithTraditional.json?.surname?.char === "陈");

const missingSurname = await callRoute({ url: "/api/surname?name=不存在" });
await expectOk("公开姓氏详情 404", missingSurname.status === 404 && missingSurname.json?.error);

const invalid = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ markdownCorpus: [{ surname: "坏" }] })
});
await expectOk("非法工作区返回 400", invalid.status === 400);

const invalidCorpusFieldTypes = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ markdownCorpus: [{ surname: "坏", title: { text: "对象标题" }, content: "内容" }] })
});
await expectOk("资料库字段类型错误返回 400", invalidCorpusFieldTypes.status === 400);

const invalidReviewFieldTypes = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ reviewState: [{ surname: "坏", title: "标题", status: 1 }] })
});
await expectOk("审核队列字段类型错误返回 400", invalidReviewFieldTypes.status === 400);

const invalidSurnameShape = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: { "坏": "不是对象" } })
});
await expectOk("非法姓氏档案返回 400", invalidSurnameShape.status === 400);

const invalidLatinSurnameWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: { zhan: { char: "zhan" } }, markdownCorpus: [], reviewState: [] })
});
await expectOk("工作区拒绝拉丁混合姓氏档案", invalidLatinSurnameWorkspace.status === 400
  && /姓氏格式不正确/.test(invalidLatinSurnameWorkspace.json?.error || ""));

const invalidLatinCorpusWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: { "测": { char: "测" } }, markdownCorpus: [{ surname: "zhang1", title: "脏资料.md", content: "不应沉淀" }], reviewState: [] })
});
await expectOk("工作区拒绝拉丁混合资料姓氏", invalidLatinCorpusWorkspace.status === 400
  && /姓氏格式不正确/.test(invalidLatinCorpusWorkspace.json?.error || ""));

const invalidLatinReviewWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: { "测": { char: "测" } }, markdownCorpus: [], reviewState: [{ surname: "wang_test", title: "脏审核", status: "AI 初稿" }] })
});
await expectOk("工作区拒绝拉丁混合审核姓氏", invalidLatinReviewWorkspace.status === 400
  && /姓氏格式不正确/.test(invalidLatinReviewWorkspace.json?.error || ""));

const emptySurnamesWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surnames: {}, markdownCorpus: [], reviewState: [] })
});
await expectOk("空姓氏工作区返回 400", emptySurnamesWorkspace.status === 400);

const missingSurnamesWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ markdownCorpus: [], reviewState: [] })
});
await expectOk("缺少姓氏工作区返回 400", missingSurnamesWorkspace.status === 400);

const oversizedBody = JSON.stringify({
  version: 1,
  surnames: { "大": { char: "大" } },
  markdownCorpus: [{ surname: "大", title: "超大资料.md", content: "源".repeat(2_000_000) }],
  reviewState: []
});
await expectOk("超大请求体测试数据超过 5MB", Buffer.byteLength(oversizedBody, "utf8") > 5_000_000 && oversizedBody.length < 5_000_000);
const oversizedWorkspace = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: oversizedBody
});
await expectOk("超大多字节请求体返回 413", oversizedWorkspace.status === 413 && /请求体过大/.test(oversizedWorkspace.json?.error || ""));

const missingAiConfig = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [] })
});
await expectOk("AI 缺配置返回 400", missingAiConfig.status === 400);

const invalidAiBody = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: "null"
});
await expectOk("AI 非对象请求返回 400", invalidAiBody.status === 400);

const invalidAiMessages = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "http://127.0.0.1:9/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    messages: ["bad-message"]
  })
});
await expectOk("AI 消息结构错误返回 400", invalidAiMessages.status === 400);

const invalidAiEndpointProtocol = await callRoute({
  method: "PUT",
  url: "/api/harness-config",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "ftp://example.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    systemPrompt: "只整理可信资料。",
    temperature: 0.3,
    retrievalQuery: "源流"
  })
});
await expectOk("AI Endpoint 协议错误返回 400", invalidAiEndpointProtocol.status === 400
  && /endpoint/.test(invalidAiEndpointProtocol.json?.error || ""));

const invalidAiApiKey = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "https://example.invalid/v1/chat/completions",
    apiKey: "AI 接口调用失败，已回退到离线初稿",
    model: "test-model",
    messages: [{ role: "user", content: "test" }]
  })
});
await expectOk("AI Key 非请求头安全字符返回 400", invalidAiApiKey.status === 400
  && /AI apiKey/.test(invalidAiApiKey.json?.error || ""));

const saveHarnessKey = await callRoute({
  method: "PUT",
  url: "/api/harness-config",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "https://api.example.test/v1/chat/completions",
    apiKey: "persist-key",
    model: "gpt-5.5",
    systemPrompt: "只整理可信资料。",
    temperature: 0.3,
    retrievalQuery: "源流"
  })
});
const keepHarnessKey = await callRoute({
  method: "PUT",
  url: "/api/harness-config",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "https://api.example.test/v1/chat/completions",
    apiKey: "",
    model: "gpt-5.5",
    systemPrompt: "只整理可信资料。",
    temperature: 0.3,
    retrievalQuery: "源流"
  })
});
const harnessConfigAfterBlankKey = JSON.parse(readFileSync(join(runtimeDir, "harness-config.json"), "utf8"));
await expectOk("Harness 空 Key 不覆盖已保存 Key", saveHarnessKey.status === 200
  && keepHarnessKey.status === 200
  && harnessConfigAfterBlankKey.apiKey === "persist-key"
  && keepHarnessKey.json?.config?.hasApiKey === true
  && !keepHarnessKey.text.includes("persist-key"));

const blockedAuditPath = join(runtimeDir, "audit.log");
rmSync(blockedAuditPath, { force: true });
mkdirSync(blockedAuditPath, { recursive: true });
const workspaceWithBlockedAudit = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    version: 1,
    surnames: { "审": { char: "审" } },
    markdownCorpus: [],
    reviewState: []
  })
});
await expectOk("审计写入失败不阻断工作区保存", workspaceWithBlockedAudit.status === 200
  && JSON.parse(readFileSync(join(runtimeDir, "workspace.json"), "utf8")).surnames?.["审"]?.char === "审");
rmSync(blockedAuditPath, { recursive: true, force: true });

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("upstream leaked sk-test-secret", { status: 401 });
const upstreamAiError = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "https://example.invalid/v1/chat/completions",
    apiKey: "front-end-secret",
    model: "test-model",
    messages: [{ role: "user", content: "test" }]
  })
});
globalThis.fetch = originalFetch;
await expectOk("AI 上游错误不泄漏响应正文", upstreamAiError.status === 502
  && /AI 接口调用失败 401/.test(upstreamAiError.json?.error || "")
  && !/sk-test-secret|front-end-secret|upstream leaked/.test(upstreamAiError.text));

globalThis.fetch = async () => {
  throw new Error("network leaked sk-network-secret");
};
const networkAiError = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    endpoint: "https://example.invalid/v1/chat/completions",
    apiKey: "network-front-secret",
    model: "test-model",
    messages: [{ role: "user", content: "test" }]
  })
});
globalThis.fetch = originalFetch;
await expectOk("AI 网络异常不泄漏错误正文", networkAiError.status === 502
  && /AI 接口网络异常/.test(networkAiError.json?.error || "")
  && !/sk-network-secret|network-front-secret|network leaked/.test(networkAiError.text));

const publicAiInvalidBody = await callRoute({
  method: "POST",
  url: "/api/public-ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "不要允许前台传任意 messages" }] })
});
await expectOk("公开 AI 只接受姓氏", publicAiInvalidBody.status === 400 && /姓氏/.test(publicAiInvalidBody.json?.error || ""));

globalThis.fetch = async (endpoint, options) => new Response(JSON.stringify({
  choices: [{ message: { content: `基础档案：\n- 简体：徐\n- 繁体：徐\n- 拼音：Xu\n- 起源朝代线索：周代嬴姓徐国相关待核\n- 得姓始祖线索：徐若木待核\n- 郡望：东海郡待核\n- 堂号：东海堂待核\n\n源流分支：\n- 典籍记载源流：徐国之后，可信等级：待核。\n\n迁徙路线：\n- 先秦：徐国故地向周边迁徙。\n- 秦汉：东海郡望线索待核。\n- 唐宋元明清：江南宗族资料待核。\n- 近现代：公开人口分布资料待核。\n\n望族分支：\n- 东海郡望分支待核。\n\n名人典故：\n- 徐姓名人资料待核。\n\n家风家训：\n- 徐姓家风材料待核。\n\n参考来源：\n- 建议查《通志·氏族略》和地方志。\n\n审核风险：\n- 徐国源流需核对原典。` } }]
}), {
  status: 200,
  headers: { "content-type": "application/json" }
});
const workspaceBeforePublicAi = existsSync(join(runtimeDir, "workspace.json"))
  ? readFileSync(join(runtimeDir, "workspace.json"), "utf8")
  : "";
const publicAiPreview = await callRoute({
  method: "POST",
  url: "/api/public-ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "徐" })
});
globalThis.fetch = originalFetch;
const workspaceAfterPublicAi = existsSync(join(runtimeDir, "workspace.json"))
  ? readFileSync(join(runtimeDir, "workspace.json"), "utf8")
  : "";
await expectOk("公开 AI 生成临时初稿不写工作区", publicAiPreview.status === 200
  && publicAiPreview.json?.draft?.includes("基础档案")
  && publicAiPreview.json?.surname === "徐"
  && workspaceAfterPublicAi === workspaceBeforePublicAi);
const auditAfterPublicAi = existsSync(join(runtimeDir, "audit.log"))
  ? readFileSync(join(runtimeDir, "audit.log"), "utf8")
  : "";
await expectOk("公开 AI 审计不记录初稿正文", auditAfterPublicAi.includes("public.ai.preview")
  && auditAfterPublicAi.includes("\"surname\":\"徐\"")
  && !auditAfterPublicAi.includes("徐国之后")
  && !auditAfterPublicAi.includes("基础档案："));

const feedbackWithoutSurname = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "", content: "这条纠错没有绑定姓氏，运营台无法聚合。" })
});
await expectOk("反馈必须绑定姓氏", feedbackWithoutSurname.status === 400);

const feedbackWithLatinLikeSurname = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "zhang1", content: "拉丁混合姓氏不应进入反馈队列。" })
});
await expectOk("反馈拒绝拉丁混合姓氏", feedbackWithLatinLikeSurname.status === 400 && /反馈姓氏格式不正确/.test(feedbackWithLatinLikeSurname.json?.error || ""));

const feedback = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "迁徙节点来源建议补充地方志出处。", contact: "13800000000" })
});
await expectOk("提交反馈", feedback.status === 200 && feedback.json?.feedback?.id);

const feedbackWithMessyContact = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "联系方式应清洗成运营台可读单行。", contact: "  微信：abc\n\tdef  " })
});
await expectOk("提交含换行联系方式反馈", feedbackWithMessyContact.status === 200 && feedbackWithMessyContact.json?.feedback?.id);

const originalDateNow = Date.now;
Date.now = () => 1888888888888;
const sameTimeFeedbackA = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "同一时间反馈 A。" })
});
const sameTimeFeedbackB = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "同一时间反馈 B。" })
});
Date.now = originalDateNow;
await expectOk("同毫秒反馈 ID 不重复", sameTimeFeedbackA.json?.feedback?.id && sameTimeFeedbackA.json.feedback.id !== sameTimeFeedbackB.json?.feedback?.id);

const feedbackWithClanSuffix = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "欧阳氏", content: "复姓反馈应归一化姓氏。" })
});
await expectOk("提交反馈兼容氏后缀", feedbackWithClanSuffix.status === 200 && feedbackWithClanSuffix.json?.feedback?.id);

const feedbackPath = join(runtimeDir, "feedback.jsonl");
await expectOk("反馈落库", existsSync(feedbackPath) && readFileSync(feedbackPath, "utf8").includes("迁徙节点"));

const listedFeedback = await callRoute({ url: "/api/feedback" });
const listedOriginalFeedback = listedFeedback.json?.feedback?.find(item => item.id === feedback.json.feedback.id);
const listedMessyContactFeedback = listedFeedback.json?.feedback?.find(item => item.id === feedbackWithMessyContact.json.feedback.id);
await expectOk("反馈列表", listedFeedback.status === 200 && listedOriginalFeedback);
await expectOk("反馈联系方式可读", listedOriginalFeedback?.contact === "13800000000");
await expectOk("反馈联系方式清洗为单行", listedMessyContactFeedback?.contact === "微信：abc def");
await expectOk("反馈姓氏后缀归一化", listedFeedback.json?.feedback?.find(item => item.id === feedbackWithClanSuffix.json.feedback.id)?.surname === "欧阳");

const updatedFeedback = await callRoute({
  method: "PATCH",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: feedback.json.feedback.id, status: "已处理" })
});
await expectOk("反馈状态更新", updatedFeedback.status === 200 && updatedFeedback.json?.feedback?.status === "已处理");

rmSync(feedbackPath, { force: true });
mkdirSync(feedbackPath, { recursive: true });
const feedbackStatusUnwritable = await callRoute({
  method: "PATCH",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: feedback.json.feedback.id, status: "已关闭" })
});
await expectOk("反馈状态写回失败时返回脱敏错误", feedbackStatusUnwritable.status === 503
  && /反馈文件不可读/.test(feedbackStatusUnwritable.json?.error || "")
  && !feedbackStatusUnwritable.text.includes(runtimeDir));
rmSync(feedbackPath, { recursive: true, force: true });
writeFileSync(feedbackPath, `${JSON.stringify({ id: feedback.json.feedback.id, surname: "陈", content: "迁徙节点来源建议补充地方志出处。", contact: "13800000000", status: "已处理", createdAt: "2025-01-03T00:00:00.000Z" })}\n`);

let feedbackStatusWriteFailed;
chmodSync(runtimeDir, 0o500);
try {
  feedbackStatusWriteFailed = await callRoute({
    method: "PATCH",
    url: "/api/feedback",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: feedback.json.feedback.id, status: "已关闭" })
  });
} finally {
  chmodSync(runtimeDir, 0o700);
}
await expectOk("反馈状态写回不可写时返回脱敏错误", feedbackStatusWriteFailed.status === 503
  && /反馈文件不可写/.test(feedbackStatusWriteFailed.json?.error || "")
  && !feedbackStatusWriteFailed.text.includes(runtimeDir));

appendFileSync(feedbackPath, "{broken-jsonl\n");
const feedbackWithBadLine = await callRoute({ url: "/api/feedback" });
await expectOk("反馈坏行容错", feedbackWithBadLine.status === 200 && feedbackWithBadLine.json?.feedback?.some(item => item.id === feedback.json.feedback.id));

appendFileSync(feedbackPath, `${JSON.stringify({ id: "fb-bad-status", surname: "陈", content: "历史脏状态应被归一化。", status: "未知状态", createdAt: "2025-01-01T00:00:00.000Z" })}\n`);
const feedbackWithBadStatus = await callRoute({ url: "/api/feedback" });
await expectOk("反馈坏状态归一化", feedbackWithBadStatus.status === 200 && feedbackWithBadStatus.json?.feedback?.find(item => item.id === "fb-bad-status")?.status === "待处理");

appendFileSync(feedbackPath, `${JSON.stringify({ id: "fb-dirty-content", surname: "陈", content: `历史脏反馈\u0000内容\n${"很长".repeat(1200)}`, status: "待处理", createdAt: "2025-01-04T00:00:00.000Z" })}\n`);
const feedbackWithDirtyContent = await callRoute({ url: "/api/feedback" });
const dirtyFeedbackContent = feedbackWithDirtyContent.json?.feedback?.find(item => item.id === "fb-dirty-content")?.content || "";
await expectOk("历史反馈内容清洗限长", feedbackWithDirtyContent.status === 200
  && dirtyFeedbackContent.length <= 2000
  && !/[\u0000-\u001F\u007F]/.test(dirtyFeedbackContent)
  && dirtyFeedbackContent.includes("历史脏反馈 内容 很长"));

appendFileSync(feedbackPath, `${JSON.stringify({ surname: "陈", content: "历史反馈缺少 ID 时也应稳定展示。", status: "待处理", createdAt: "2025-01-02T00:00:00.000Z" })}\n`);
const feedbackWithoutIdFirstRead = await callRoute({ url: "/api/feedback" });
const importedFeedbackId = feedbackWithoutIdFirstRead.json?.feedback?.find(item => item.content === "历史反馈缺少 ID 时也应稳定展示。")?.id;
const feedbackWithoutIdSecondRead = await callRoute({ url: "/api/feedback" });
await expectOk("历史反馈缺 ID 生成稳定 ID", importedFeedbackId && feedbackWithoutIdSecondRead.json?.feedback?.find(item => item.content === "历史反馈缺少 ID 时也应稳定展示。")?.id === importedFeedbackId);

rmSync(feedbackPath, { force: true });
mkdirSync(feedbackPath, { recursive: true });
const feedbackUnavailable = await callRoute({ url: "/api/feedback" });
await expectOk("反馈文件不可读时返回明确错误", feedbackUnavailable.status === 503 && /反馈文件不可读/.test(feedbackUnavailable.json?.error || ""));
const feedbackUnwritable = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "反馈文件不可写时应返回脱敏错误。" })
});
await expectOk("反馈文件不可写时返回脱敏错误", feedbackUnwritable.status === 503
  && /反馈文件不可写/.test(feedbackUnwritable.json?.error || "")
  && !feedbackUnwritable.text.includes(runtimeDir));
rmSync(feedbackPath, { recursive: true, force: true });

const workspace = {
  version: 1,
  surnames: {
    "测": { char: "测" },
    "欧阳": { char: "欧阳", pinyin: "Ouyang", summary: "复姓测试档案", origins: [{ title: "复姓测试", text: "测试复姓详情读取。", level: "测试" }] },
    "越": {
      char: "越",
      route: [
        { phase: "测试", place: "越界节点一", reason: "坐标应被夹紧", x: -20, y: 180 },
        { phase: "测试", place: "越界节点二", reason: "坐标应被夹紧", x: 220, y: -40 },
        { phase: "测试", place: "正常节点", reason: "坐标保持", x: 40, y: 60 },
        { phase: "测试", place: "非数字节点", reason: "坐标回退", x: "bad", y: null }
      ]
    }
  },
  markdownCorpus: [{ surname: "测", title: "测试资料.md", content: "测试内容" }],
  reviewState: [{ surname: "测", title: "测试审核", status: "AI 初稿" }]
};
const save = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(workspace)
});
await expectOk("保存工作区", save.status === 200 && save.json?.ok);

const loaded = await callRoute({ url: "/api/workspace" });
await expectOk("读取工作区", loaded.status === 200 && loaded.json?.workspace?.surnames?.["测"]?.char === "测");

const backupDir = join(runtimeDir, "backups");
rmSync(backupDir, { recursive: true, force: true });
mkdirSync(backupDir, { recursive: true });
const clearedWithBackup = await callRoute({ method: "DELETE", url: "/api/workspace" });
const backupFilesAfterClear = readdirSync(backupDir).filter(name => name.startsWith("workspace-") && name.endsWith(".json"));
await expectOk("工作区清空前自动备份", clearedWithBackup.status === 200
  && backupFilesAfterClear.length === 1
  && JSON.parse(readFileSync(join(backupDir, backupFilesAfterClear[0]), "utf8")).surnames?.["测"]?.char === "测");

const restoredAfterClearBackup = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(workspace)
});
await expectOk("清空备份后恢复工作区", restoredAfterClearBackup.status === 200 && restoredAfterClearBackup.json?.ok);

mkdirSync(backupDir, { recursive: true });
for (let index = 1; index <= 25; index += 1) {
  writeFileSync(join(backupDir, `workspace-2025-01-01T00-00-${String(index).padStart(2, "0")}-000Z.json`), "{}");
}
const saveWithManyBackups = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(workspace)
});
const backupFilesAfterPrune = readdirSync(backupDir).filter(name => name.startsWith("workspace-") && name.endsWith(".json"));
await expectOk("工作区备份自动保留上限", saveWithManyBackups.status === 200 && backupFilesAfterPrune.length <= 20);

const normalizedPartialSurname = await callRoute({ url: "/api/surname?name=测" });
await expectOk("公开详情补齐可渲染档案结构", normalizedPartialSurname.status === 200
  && Array.isArray(normalizedPartialSurname.json?.surname?.tags)
  && normalizedPartialSurname.json.surname.tags.includes("待补来源")
  && normalizedPartialSurname.json.surname.info?.["繁体"] === "测"
  && Array.isArray(normalizedPartialSurname.json.surname.origins)
  && normalizedPartialSurname.json.surname.origins.length
  && Array.isArray(normalizedPartialSurname.json.surname.migrations)
  && normalizedPartialSurname.json.surname.migrations.length === 4
  && Array.isArray(normalizedPartialSurname.json.surname.route)
  && normalizedPartialSurname.json.surname.route.length === 4
  && Array.isArray(normalizedPartialSurname.json.surname.branches)
  && normalizedPartialSurname.json.surname.visuals?.stages?.length
  && Array.isArray(normalizedPartialSurname.json.surname.figures)
  && Array.isArray(normalizedPartialSurname.json.surname.sources));

const clampedRouteSurname = await callRoute({ url: "/api/surname?name=越" });
await expectOk("公开迁徙坐标夹紧", clampedRouteSurname.status === 200
  && clampedRouteSurname.json?.surname?.route?.[0]?.x === 0
  && clampedRouteSurname.json.surname.route[0].y === 100
  && clampedRouteSurname.json.surname.route[1].x === 100
  && clampedRouteSurname.json.surname.route[1].y === 0
  && clampedRouteSurname.json.surname.route[2].x === 40
  && clampedRouteSurname.json.surname.route[2].y === 60
  && clampedRouteSurname.json.surname.route[3].x === 84
  && clampedRouteSurname.json.surname.route[3].y === 34);

const compoundSurname = await callRoute({ url: "/api/surname?name=欧阳" });
await expectOk("复姓详情接口", compoundSurname.status === 200 && compoundSurname.json?.surname?.char === "欧阳");

const compoundSurnameWithPinyin = await callRoute({ url: "/api/surname?name=ouyang" });
await expectOk("复姓详情接口兼容拼音", compoundSurnameWithPinyin.status === 200 && compoundSurnameWithPinyin.json?.surname?.char === "欧阳");

const compoundSurnameListWithSuffix = await callRoute({ url: "/api/surnames?q=欧阳姓&limit=1" });
await expectOk("复姓列表搜索兼容姓后缀", compoundSurnameListWithSuffix.status === 200 && compoundSurnameListWithSuffix.json?.surnames?.[0]?.char === "欧阳");

const compoundSurnameListWithClanSuffix = await callRoute({ url: "/api/surnames?q=欧阳氏&limit=1" });
await expectOk("复姓列表搜索兼容氏后缀", compoundSurnameListWithClanSuffix.status === 200 && compoundSurnameListWithClanSuffix.json?.surnames?.[0]?.char === "欧阳");

const compoundSurnameListWithCompoundSuffix = await callRoute({ url: "/api/surnames?q=欧阳姓氏&limit=1" });
await expectOk("复姓列表搜索兼容姓氏后缀", compoundSurnameListWithCompoundSuffix.status === 200 && compoundSurnameListWithCompoundSuffix.json?.surnames?.[0]?.char === "欧阳");

const workspacePath = join(runtimeDir, "workspace.json");
mkdirSync(runtimeDir, { recursive: true });
writeFileSync(workspacePath, "{broken-json");
const publicFallback = await callRoute({ url: "/api/surnames?q=chen&limit=1" });
await expectOk("公开 API 坏工作区回退", publicFallback.status === 200 && publicFallback.json?.surnames?.[0]?.char === "陈");

const corruptWorkspaceRead = await callRoute({ url: "/api/workspace" });
await expectOk("后台读取坏工作区返回明确错误", corruptWorkspaceRead.status === 503 && /工作区文件损坏/.test(corruptWorkspaceRead.json?.error || ""));

rmSync(workspacePath, { force: true });
mkdirSync(workspacePath, { recursive: true });
const workspaceUnwritable = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(workspace)
});
await expectOk("工作区文件不可写时返回脱敏错误", workspaceUnwritable.status === 503
  && /工作区文件不可写/.test(workspaceUnwritable.json?.error || "")
  && !workspaceUnwritable.text.includes(runtimeDir));
rmSync(workspacePath, { recursive: true, force: true });

const auditPath = join(runtimeDir, "audit.log");
await expectOk("审计日志", existsSync(auditPath) && readFileSync(auditPath, "utf8").includes("workspace.save"));
const auditLines = readFileSync(auditPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
await expectOk("审计日志包含请求 ID", auditLines.some(item => item.event === "workspace.save" && /^req-[a-f0-9-]{36}$/.test(item.requestId || "")));
await expectOk("反馈审计日志", readFileSync(auditPath, "utf8").includes("feedback.create"));
await expectOk("反馈更新审计日志", readFileSync(auditPath, "utf8").includes("feedback.update"));

appendFileSync(auditPath, "{broken-jsonl\n");
const audit = await callRoute({ url: "/api/audit" });
await expectOk("审计列表接口", audit.status === 200 && audit.json?.audit?.some(item => item.event === "workspace.save"));
await expectOk("审计坏行容错", audit.status === 200 && audit.json?.audit?.some(item => item.event === "feedback.update"));

rmSync(auditPath, { force: true });
mkdirSync(auditPath, { recursive: true });
const auditUnavailable = await callRoute({ url: "/api/audit" });
await expectOk("审计文件不可读时降级为空列表", auditUnavailable.status === 200 && Array.isArray(auditUnavailable.json?.audit) && auditUnavailable.json.audit.length === 0);
rmSync(auditPath, { recursive: true, force: true });

mkdirSync(workspacePath, { recursive: true });
const clearUnwritableWorkspace = await callRoute({ method: "DELETE", url: "/api/workspace" });
await expectOk("工作区清空失败时返回脱敏错误", clearUnwritableWorkspace.status === 503
  && /工作区文件无法清空/.test(clearUnwritableWorkspace.json?.error || "")
  && !clearUnwritableWorkspace.text.includes(runtimeDir));
rmSync(workspacePath, { recursive: true, force: true });

const cleared = await callRoute({ method: "DELETE", url: "/api/workspace" });
await expectOk("清空工作区", cleared.status === 200 && cleared.json?.ok);

rmSync(runtimeDir, { recursive: true, force: true });

console.log("服务端逻辑检查通过：110/110");
