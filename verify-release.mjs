import { spawn } from "node:child_process";

const steps = [
  ["server syntax", process.execPath, ["--check", "server.js"]],
  ["app syntax", process.execPath, ["--check", "assets/app.js"]],
  ["verify-site syntax", process.execPath, ["--check", "verify-site.mjs"]],
  ["verify-ui syntax", process.execPath, ["--check", "verify-ui.mjs"]],
  ["verify-logic syntax", process.execPath, ["--check", "verify-server-logic.mjs"]],
  ["verify-auth syntax", process.execPath, ["--check", "verify-server-auth.mjs"]],
  ["verify-production syntax", process.execPath, ["--check", "verify-server-production.mjs"]],
  ["static release checks", process.execPath, ["verify-site.mjs"]],
  ["ui structure checks", "npm", ["run", "verify:ui"]],
  ["server logic checks", "npm", ["run", "verify:logic"]],
  ["server auth checks", "npm", ["run", "verify:auth"]],
  ["server production checks", "npm", ["run", "verify:production"]]
];

function runStep([name, command, args]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL(".", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`${name} 失败：\n${output}`));
        return;
      }
      resolve({ name, output: output.trim() });
    });
  });
}

for (const step of steps) {
  const result = await runStep(step);
  if (result.output) console.log(`[${result.name}] ${result.output.split("\n").at(-1)}`);
}

console.log(`Release 检查通过：${steps.length}/${steps.length}`);
