import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 9876;
const baseUrl = `http://127.0.0.1:${port}`;
const runtimeDir = join(tmpdir(), `baijiaxing-server-${Date.now()}`);
const server = spawn(process.execPath, ["server.js"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: String(port), DATA_DIR: runtimeDir },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", chunk => { output += chunk.toString(); });
server.stderr.on("data", chunk => { output += chunk.toString(); });

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await wait(150);
    }
  }
  throw new Error(`服务未启动：${output}`);
}

async function expectOk(name, condition) {
  if (!condition) throw new Error(`未满足检查项：${name}`);
}

try {
  await waitForServer();

  const health = await fetch(`${baseUrl}/api/health`).then(res => res.json());
  await expectOk("health", health.ok && health.service === "baijiaxing-suyuanlu" && health.seedReady);

  const home = await fetch(`${baseUrl}/`);
  const html = await home.text();
  await expectOk("首页 HTML", html.includes("<!doctype html>") && html.includes("assets/app.js") && html.includes("百家姓溯源录"));
  await expectOk("安全响应头", home.headers.get("content-security-policy")?.includes("script-src 'self'"));

  const css = await fetch(`${baseUrl}/assets/styles.css`);
  await expectOk("样式资源", css.ok && css.headers.get("content-type")?.includes("text/css"));

  const app = await fetch(`${baseUrl}/assets/app.js`);
  await expectOk("前端脚本资源", app.ok && app.headers.get("content-type")?.includes("text/javascript"));

  const bootstrap = await fetch(`${baseUrl}/api/bootstrap`).then(res => res.json());
  await expectOk("种子资料接口", bootstrap.ok && bootstrap.workspace?.surnames?.["陈"]?.char === "陈");

  const forbidden = await fetch(`${baseUrl}/data/workspace.json`);
  await expectOk("data 目录禁止访问", forbidden.status === 403);

  const sourceLeak = await fetch(`${baseUrl}/server.js`);
  await expectOk("服务端源码禁止访问", sourceLeak.status === 403);

  const workspace = {
    version: 1,
    surnames: { "测": { char: "测" } },
    markdownCorpus: [{ surname: "测", title: "测试资料.md", content: "测试内容" }],
    reviewState: [{ surname: "测", title: "测试审核", status: "AI 初稿" }]
  };
  const save = await fetch(`${baseUrl}/api/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workspace)
  }).then(res => res.json());
  await expectOk("保存工作区", save.ok);

  const loaded = await fetch(`${baseUrl}/api/workspace`).then(res => res.json());
  await expectOk("读取工作区", loaded.ok && loaded.workspace?.surnames?.["测"]?.char === "测");

  const invalid = await fetch(`${baseUrl}/api/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdownCorpus: [{ surname: "坏" }] })
  });
  await expectOk("非法工作区拒绝", invalid.status === 400);

  const cleared = await fetch(`${baseUrl}/api/workspace`, { method: "DELETE" }).then(res => res.json());
  await expectOk("清空工作区", cleared.ok);

  console.log("服务端集成检查通过：13/13");
} finally {
  server.kill();
  rmSync(runtimeDir, { recursive: true, force: true });
}
