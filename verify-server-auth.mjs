import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Writable } from "node:stream";

const runtimeDir = join(tmpdir(), `baijiaxing-auth-${Date.now()}`);
process.env.DATA_DIR = runtimeDir;
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.AUTH_BOOTSTRAP_USER = "admin";
process.env.AUTH_BOOTSTRAP_PASSWORD = "admin-pass-123";
process.env.WRITE_LIMIT_PER_MINUTE = "1";
process.env.AI_LIMIT_PER_MINUTE = "1";

const { handleRequest } = await import("./server.js");

function createMockRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    }
  });
  req.method = method;
  req.url = url;
  req.headers = { host: "auth.local", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
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

function expectOk(name, condition) {
  if (!condition) throw new Error(`未满足检查项：${name}`);
}

const workspacePayload = {
  version: 1,
  surnames: { "权": { char: "权" } },
  markdownCorpus: [{ surname: "权", title: "权限测试.md", content: "权限测试内容" }],
  reviewState: [{ surname: "权", title: "权限测试审核", status: "AI 初稿" }]
};

const protectedGet = await callRoute({ url: "/api/audit" });
expectOk("审计接口拒绝无令牌", protectedGet.status === 401);

const protectedWorkspaceRead = await callRoute({ url: "/api/workspace" });
expectOk("工作区读取拒绝无令牌", protectedWorkspaceRead.status === 401);

const protectedWrite = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(workspacePayload)
});
expectOk("工作区写入拒绝无令牌", protectedWrite.status === 401);

const protectedAi = await callRoute({
  method: "POST",
  url: "/api/ai-draft",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [] })
});
expectOk("AI 代理拒绝无令牌", protectedAi.status === 401);

const anonymousMe = await callRoute({ url: "/api/auth/me" });
expectOk("未登录 me 返回 401", anonymousMe.status === 401);

const badLogin = await callRoute({
  method: "POST",
  url: "/api/auth/login",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "wrong-password" })
});
expectOk("错误密码拒绝登录", badLogin.status === 401);

const login = await callRoute({
  method: "POST",
  url: "/api/auth/login",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin-pass-123" })
});
const sessionCookie = String(login.headers["set-cookie"] || "").split(";")[0];
expectOk("管理员账号可登录", login.status === 200 && login.json?.user?.role === "admin" && /^bjx_session=/.test(sessionCookie));

const loggedInMe = await callRoute({
  url: "/api/auth/me",
  headers: { cookie: sessionCookie }
});
expectOk("登录后 me 返回当前用户", loggedInMe.status === 200 && loggedInMe.json?.user?.username === "admin");

const harnessConfig = await callRoute({
  method: "PUT",
  url: "/api/harness-config",
  headers: { "content-type": "application/json", cookie: sessionCookie },
  body: JSON.stringify({
    endpoint: "https://api.example.com/v1/chat/completions",
    model: "gpt-4.1-mini",
    apiKey: "secret-key",
    systemPrompt: "只整理可信姓氏资料。",
    temperature: 0.2,
    retrievalQuery: "源流 迁徙 名人",
    sourceTypes: ["classic", "local"]
  })
});
expectOk("管理员可保存 Harness 配置", harnessConfig.status === 200 && harnessConfig.json?.config?.endpoint.includes("api.example.com"));

const readHarnessConfig = await callRoute({
  url: "/api/harness-config",
  headers: { cookie: sessionCookie }
});
expectOk("Harness 配置可读取且不回显 Key", readHarnessConfig.status === 200 && readHarnessConfig.json?.config?.model === "gpt-4.1-mini" && readHarnessConfig.json?.config?.hasApiKey === true && !JSON.stringify(readHarnessConfig.json).includes("secret-key"));

const logout = await callRoute({
  method: "POST",
  url: "/api/auth/logout",
  headers: { cookie: sessionCookie }
});
expectOk("用户可退出登录", logout.status === 200 && /Max-Age=0/.test(String(logout.headers["set-cookie"] || "")));

const publicFeedback = await callRoute({
  method: "POST",
  url: "/api/feedback",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ surname: "陈", content: "公开反馈仍可提交，后台处理需要管理令牌。" })
});
expectOk("公开反馈无需令牌", publicFeedback.status === 200 && publicFeedback.json?.feedback?.id);

const authorizedWrite = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json", "x-admin-token": "test-admin-token" },
  body: JSON.stringify(workspacePayload)
});
expectOk("工作区写入接受正确令牌", authorizedWrite.status === 200 && authorizedWrite.json?.ok);
expectOk("无令牌请求不消耗后台写入限流", authorizedWrite.status !== 429);

const authorizedWorkspaceRead = await callRoute({
  url: "/api/workspace",
  headers: { "x-admin-token": "test-admin-token" }
});
expectOk("工作区读取接受正确令牌", authorizedWorkspaceRead.status === 200 && authorizedWorkspaceRead.json?.workspace?.surnames?.["权"]?.char === "权");

const forwardedBypassWrite = await callRoute({
  method: "POST",
  url: "/api/workspace",
  headers: { "content-type": "application/json", "x-admin-token": "test-admin-token", "x-forwarded-for": "203.0.113.88" },
  body: JSON.stringify(workspacePayload)
});
expectOk("默认不信任转发头绕过限流", forwardedBypassWrite.status === 429);
expectOk("限流响应返回 Retry-After", forwardedBypassWrite.headers["retry-after"] === "60");

const authorizedAudit = await callRoute({
  url: "/api/audit",
  headers: { "x-admin-token": "test-admin-token" }
});
expectOk("审计接口接受正确令牌", authorizedAudit.status === 200 && authorizedAudit.json?.audit?.some(item => item.event === "workspace.save"));

const authorizedFeedbackList = await callRoute({
  url: "/api/feedback",
  headers: { "x-admin-token": "test-admin-token" }
});
expectOk("反馈列表接受正确令牌", authorizedFeedbackList.status === 200 && authorizedFeedbackList.json?.feedback?.length === 1);

const auditPath = join(runtimeDir, "audit.log");
expectOk("鉴权通过操作写入审计", existsSync(auditPath) && readFileSync(auditPath, "utf8").includes("workspace.save"));

rmSync(runtimeDir, { recursive: true, force: true });

console.log("服务端鉴权检查通过：13/13");
