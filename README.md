# 百家姓溯源录网站 MVP

本目录是“百家姓溯源录”网站 MVP。当前范围聚焦网站、AI 溯源、资料沉淀与审核流程。

## 交付文件

- `server.js`：Node.js 服务，提供静态页面、工作区 JSON 持久化和 AI 代理 API。
- `package.json`：项目脚本入口。
- `index.html`：前台页面内部文件；对外访问路径为 `/`。
- `robots.txt` / `sitemap.xml` / `manifest.webmanifest`：公开站 SEO、爬虫和安装入口基础资产。
- `assets/icon.svg`：浏览器 favicon 与 Web App Manifest 品牌图标。
- `assets/styles.css`：深色科技国风资料库视觉样式，融合中国红、鎏金、米白与青绿色高亮。
- `assets/app.js`：查询、AI Harness、资料沉淀、审核队列等前端逻辑。
- `data/seed-workspace.json`：服务端初始姓氏资料库，前端通过 `/api/bootstrap` 读取。
- `verify-site.mjs`：本地验收脚本。
- `verify-server.mjs`：服务端 API 集成验收脚本。
- `verify-server-auth.mjs`：无端口管理令牌鉴权验收脚本。
- `Dockerfile` / `.dockerignore`：生产部署用容器配置。
- `上线Review报告.md`：当前上线审查结论、验证结果和剩余受限项。
- `.env.example`：生产环境变量示例。
- `data/workspace.json`、`data/audit.log`、`data/feedback.jsonl`、`data/backups/`：运行后自动生成的资料工作区、审计、反馈和备份文件；当前交付目录不携带这些运行态数据。

## 本期已实现

- 姓氏一键查询：初始资料由 Node 服务提供，支持陈、王、李样板姓氏；首页改为深色搜索台和姓氏宫格，可按简体、繁体或拼音命中已沉淀姓氏，新增资料、AI 初稿、反馈也会复用同一套当前姓氏解析；未知汉字姓氏自动创建待收录档案，未命中的拉丁/数字/标点混合输入不会写入姓氏库。
- 公开查询 API：提供姓氏列表与单姓详情接口，后续小程序可直接复用。
- 姓氏档案：简体/繁体、拼音、起源朝代、始祖线索、郡望、堂号、源流分支；详情页改为大号姓氏身份卡、可信信息胶囊、分段 Tab 和深色档案卡片，状态会区分“已审核发布 / 来源待核 / 待收录 / 待补来源”。
- 迁徙路线：路线节点可视化 + 四阶段时间轴。
- 图腾字形：保留图腾与字形演变字段，先用占位视觉。
- 名人典故家风：按姓氏展示历史名人、典故线索、家风家训。
- 用户动作：收藏、分享、导出 PDF、纠错反馈。
- AI Harness：支持 Markdown 资料检索，优先调用服务端 AI 代理接入 OpenAI-compatible API；服务端未配置或调用失败时离线初稿降级。
- 资料沉淀：支持批量补充待收录姓氏、新增 Markdown 资料、审核队列、批准/驳回、沉淀指标；审核项使用稳定 ID 流转，避免重复标题时误操作。
- 档案编辑：运营台可人工校订当前姓氏基础字段和摘要，保存后同步前台展示并进入审核队列。
- 产品分区：普通用户前台与运营工作台分离，避免后台能力混入用户浏览路径。
- 反馈管理：纠错反馈提交到服务端 `feedback.jsonl`，运营台可查看并标记处理中/已处理/已关闭。
- 审计事件：运营台可查看服务端审计事件，追踪资料保存、反馈处理和 AI 初稿请求。
- 管理令牌验证：运营台可即时验证 `ADMIN_TOKEN` 是否可用，并自动刷新反馈工单与审计事件。
- 管理令牌清除：运营台可清除当前浏览器会话中的令牌，便于演示或共享设备收尾。
- 工程化形态：HTML / CSS / JS / seed data / Node API 已拆分，后续可直接换数据库或接后台。
- 上线基础：安全响应头、收紧 CSP 去除内联样式依赖、静态资源目录边界校验、写接口限流、操作审计日志、Docker 部署配置。
- 公开站上线资产：SEO / Open Graph / Twitter Card 元信息、favicon、`robots.txt`、`sitemap.xml`、Web App Manifest。
- 演示入口：`/?demo=pending` 自动跑通“张姓待收录 -> 资料入库 -> AI 初稿 -> 审核发布”。

## 运行方式

新增姓氏、以“徐”姓为例沉淀资料、以及 ccswitch / OpenAI-compatible Harness 配置，可看：[运营帮助-新增姓氏与Harness配置.md](docs/运营帮助-新增姓氏与Harness配置.md)。

### 本机快速启动

本项目正式持久化使用 MySQL。先准备本地库和账号：

```sql
CREATE DATABASE baijiaxingfy DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'baijiaxing'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON baijiaxingfy.* TO 'baijiaxing'@'localhost';
FLUSH PRIVILEGES;
```

然后安装依赖并启动：

```bash
cd /Users/nathan/Projects/apiGateway/baijiaxingFY
npm install
DATABASE_URL=mysql://baijiaxing:change-me@127.0.0.1:3306/baijiaxingfy \
AUTH_BOOTSTRAP_USER=admin \
AUTH_BOOTSTRAP_PASSWORD=admin-pass-123 \
HOST=127.0.0.1 \
PORT=8765 \
npm start
```

访问地址：

```text
http://127.0.0.1:8765/
http://127.0.0.1:8765/login
http://127.0.0.1:8765/admin
http://127.0.0.1:8765/api/health
```

首次启动时会用 `AUTH_BOOTSTRAP_USER` / `AUTH_BOOTSTRAP_PASSWORD` 创建管理员账号。登录后台后可整理资料、处理反馈、查看审计，并在后台保存 Harness 的 endpoint、model、system prompt、temperature、检索关键词和 API Key。

推荐以 Node.js 项目方式运行：

```bash
npm start
```

然后访问：

```text
http://localhost:8765/
http://localhost:8765/?demo=pending
```

默认监听 `127.0.0.1:8765`。可通过环境变量调整：

```bash
HOST=127.0.0.1 PORT=8765 npm start
```

`HOST` 会去除首尾空白，空值回退到 `127.0.0.1`；`PORT` 只接受 1-65535 的正整数，空值、非数字或越界值会回退到 `8765`，避免公开地址生成空白主机、`NaN` 或无效端口。

上线前建议设置：

```bash
SITE_ORIGIN=https://your-domain.example
ADMIN_TOKEN=change-me
DATABASE_URL=mysql://baijiaxing:change-me@127.0.0.1:3306/baijiaxingfy
AUTH_BOOTSTRAP_USER=admin
AUTH_BOOTSTRAP_PASSWORD=change-me-before-production
AI_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4.1-mini
AI_API_KEY=your_server_side_key
WRITE_LIMIT_PER_MINUTE=60
AI_LIMIT_PER_MINUTE=12
TRUST_PROXY=false
BACKUP_RETENTION=20
AI_TIMEOUT_MS=120000
REQUEST_TIMEOUT_MS=130000
```

不建议直接双击静态页面文件作为交付预览；当前版本按 Node 项目组织，初始资料库、MySQL 持久化、用户会话和 AI 代理都通过本地服务提供。

## 数据库与本地存储

正式运行使用 MySQL 做持久化，覆盖：

- 用户账号、角色和登录会话。
- Harness 后台配置，包括 endpoint、model、system prompt、temperature、检索关键词和 API Key。
- 运营工作区、纠错反馈、审计事件和资料整理数据。

当前 MySQL schema 采用轻量 `app_kv` JSON 表保存 MVP 运行态对象，服务启动或首次读写时自动建表：

```sql
CREATE TABLE IF NOT EXISTS app_kv (
  name VARCHAR(128) PRIMARY KEY,
  payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

当前代码仍保留 `DATA_DIR` 文件兜底，便于无 MySQL 的开发验收环境运行。文件兜底会写入：

- `data/seed-workspace.json`：随代码提交的初始姓氏资料库，只作为种子数据。
- `data/workspace.json`：运行后生成的运营工作区，保存新增姓氏、Markdown 资料和审核队列。
- `data/feedback.jsonl`：运行后生成的纠错反馈队列。
- `data/audit.log`：运行后生成的运营审计日志。
- `data/backups/`：保存或清空工作区前自动生成的备份。

如果配置了 `DATABASE_URL` 或 `MYSQL_HOST`，应以 MySQL 为准；生产环境不要依赖文件兜底保存核心数据。

## 生产部署

直接部署 Node：

```bash
NODE_ENV=production HOST=0.0.0.0 PORT=8765 ADMIN_TOKEN=replace-with-strong-token AI_ENDPOINT=https://api.openai.com/v1/chat/completions AI_API_KEY=your_server_side_key npm start
```

Docker 部署：

```bash
docker build -t baijiaxing-suyuanlu .
docker run -d \
  --name baijiaxing-suyuanlu \
  -p 8765:8765 \
  -e SITE_ORIGIN=https://your-domain.example \
  -e ADMIN_TOKEN=replace-with-strong-token \
  -e AI_ENDPOINT=https://api.openai.com/v1/chat/completions \
  -e AI_MODEL=gpt-4.1-mini \
  -e AI_API_KEY=your_server_side_key \
  -v baijiaxing-data:/app/runtime \
  baijiaxing-suyuanlu
```

健康检查：

```bash
curl http://localhost:8765/api/health
```

Docker 镜像内置 `HEALTHCHECK`，容器平台会定期请求 `/api/health` 判断实例状态。
生产环境缺少 `ADMIN_TOKEN`、`AI_ENDPOINT`、`AI_API_KEY`，或 AI endpoint 不是 HTTP(S) URL 时，`/api/health` 会返回 503，容器平台应将实例标记为未就绪。
镜像内也包含 `verify-*.mjs` 验收脚本，便于部署前在容器内执行 `npm run verify:release` 做自检。

容器内 release 自检需要带齐生产必需环境变量：

```bash
docker run --rm \
  -e ADMIN_TOKEN=verify-token \
  -e AI_ENDPOINT=https://api.openai.com/v1/chat/completions \
  -e AI_API_KEY=verify-key \
  -v baijiaxing-verify:/app/runtime \
  baijiaxing-suyuanlu npm run verify:release
```

生产建议：

- 必须设置强 `ADMIN_TOKEN`；生产环境缺少 `ADMIN_TOKEN` 或仅填写空白字符时，后台读写和 AI 代理接口会拒绝服务，健康检查返回 503。
- 健康检查会同时验证生产配置、AI endpoint 格式、运行目录可写性和备份目录可用性；`DATA_DIR` 不可写或 `data/backups/` 被误建成文件时返回 503，避免容器平台把无法保存资料的实例标记为 healthy。健康检查使用随机探针文件验证写入能力，避免并发探针文件名冲突导致误报。健康检查响应不会返回服务器运行目录绝对路径、底层存储错误或具体缺失配置名，只返回配置摘要和脱敏错误。
- 必须把 `SITE_ORIGIN` 设置为正式 HTTP(S) 访问域名，服务端会用它生成 `robots.txt` 和 `sitemap.xml` 内的完整地址；如果误填空白字符或非 HTTP(S) 地址，服务端会回退到默认 `http://HOST:PORT`，避免生成空白、脚本协议或非法 canonical / sitemap 地址。
- 把运行目录挂载为持久卷，保留 `workspace.json`、`audit.log` 和备份文件；镜像内置的 `data/seed-workspace.json` 不应被运行卷覆盖。
- 当前源码交付目录只保留 `data/seed-workspace.json`；运行态 `workspace.json`、`audit.log`、`feedback.jsonl` 和 `backups/` 会在服务运行后生成，不应作为初始交付数据随包带出。
- 反向代理公开暴露 `GET /`、`GET /assets/*`、`GET /robots.txt`、`GET /sitemap.xml`、`GET /manifest.webmanifest`、`GET/HEAD /api/health`、`GET /api/bootstrap`、`GET /api/surnames`、`GET /api/surname`。`GET /api/workspace` 需管理令牌，只给运营台读取完整工作区。
- `AI_API_KEY` 只放服务端环境变量，不写入前端页面或资料 JSON。

## 验收方式

```bash
node verify-site.mjs
npm run verify:ui
npm run verify:logic
npm run verify:auth
npm run verify:production
npm run verify:release
npm run verify:server
```

当前验收覆盖：产品定位、深色资料库视觉、视觉配色、查询、档案字段、详情页签、源流分支、迁徙路线、名人典故家风、收藏分享导出、纠错反馈、AI Harness、资料沉淀、审核动作、演示入口、工作区污染拦截、工作区快照恢复过滤、公开站 SEO 资产、CSP 收紧和禁用词检查。

`npm run verify:logic` 不监听端口，适合受限环境，覆盖健康检查、首页 HTML、静态资源、种子资料接口、工作区保存/读取/清空、审计日志、非法数据拒绝、拉丁混合姓氏污染拒绝、静态目录请求不泄漏服务器路径、`data/` 目录禁止直接访问。

`npm run verify:auth` 不监听端口，专门覆盖设置 `ADMIN_TOKEN` 后的后台读写接口拒绝无令牌请求、接受正确令牌请求，以及公开纠错反馈仍可提交。

`npm run verify:production` 不监听端口，专门覆盖生产环境缺少 `ADMIN_TOKEN`、`ADMIN_TOKEN` 为空白、缺少 `AI_ENDPOINT` 或 `AI_API_KEY`、AI endpoint 格式错误、非法 `SITE_ORIGIN` 回退、空白 `HOST` 回退、无效 `PORT` 回退、运行目录不可写时健康检查失败；后台读写和 AI 代理接口拒绝服务，公开查询接口仍可访问。

`npm run verify:release` 会串行执行语法检查、静态验收、UI 结构验收、服务端无端口逻辑验收和鉴权验收，适合作为提交前的主验收命令。

`npm run verify:server` 会真实启动本地服务，适合上线前最终验收；该脚本使用临时 `DATA_DIR`，不会把测试工作区、审计日志或反馈数据写入交付目录。若运行环境禁止监听端口，请在本机终端或部署机执行。

## AI Harness 技术口径

当前页面内置一组 Markdown 样例语料，通过 `retrieveMarkdownContext` 做关键词召回，生成结构化上下文。运营台可在“当前姓氏”输入框里直接输入“徐”这类未收录姓氏，点击“生成 AI 初稿”时会自动创建待收录档案、切换当前姓氏并进入 Harness 生成流程。Harness 会优先调用服务端 AI 代理，由 Node 服务读取 `AI_ENDPOINT`、`AI_MODEL`、`AI_API_KEY` 等环境变量并转发到 OpenAI-compatible `chat/completions` 接口；生产环境以服务端环境变量为准，必须设置 `AI_ENDPOINT` 和 `AI_API_KEY`。后台保存的 Endpoint / 模型 / API Key 会写入运行态配置；配置 MySQL 时会持久化到 `app_kv` 的 `harness-config` 记录，API Key 也会随配置一起保存。后台再次保存配置时，如果 API Key 输入框留空，不会覆盖已保存 Key。服务端未配置、管理令牌错误或模型接口失败时回退到 `buildOfflineDraft` 离线初稿，保证演示可用。AI endpoint 必须是 HTTP(S) URL，`apiKey` 必须是非空且请求头安全的 ASCII 可见字符，`model` 必须是非空字符串；配置格式错误直接返回 400。AI 上游非 200、网络异常或返回格式异常时，服务端只返回脱敏后的状态摘要，不把上游响应正文或底层错误正文透传到前端。

Node 服务提供：

- `GET/HEAD /api/health`：服务健康检查；生产配置缺失、AI endpoint 格式错误或运行目录不可写时返回 503，响应不暴露服务器路径或具体缺失配置名；`HEAD` 仅返回状态和响应头，便于网关或监控轻量探测。
- `GET /api/bootstrap`：读取 `data/seed-workspace.json` 初始资料库。
- `GET /api/surnames`：读取公开姓氏摘要列表，适合首页、搜索页、小程序列表页复用；支持 `q` 和 `limit`，例如 `/api/surnames?q=chen&limit=20`，单次最多返回 500 条，覆盖百家姓、复姓和运营增补姓氏。`q=陈姓`、`q=陈氏`、`q=陈姓氏`、`q=欧阳姓`、`q=欧阳氏`、`q=欧阳姓氏` 会自动按 `陈`、`欧阳` 参与匹配。
- `GET /api/surname?name=陈`：读取单个姓氏完整档案，未收录时返回 404；支持 `name=chen`、`name=陳` 这类拼音或繁体等值查询，便于小程序搜索页直接复用详情接口；公开返回会补齐前端可渲染的默认字段，避免资料沉淀阶段的半成品档案导致页面白屏。
- `GET /api/workspace`：读取 `data/workspace.json` 完整工作区；生产设置 `ADMIN_TOKEN` 后需要 `X-Admin-Token`，前台页面默认通过公开姓氏 API 初始化；运行态工作区损坏时返回明确恢复提示，公开查询接口仍回退种子库保障前台可用。
- `POST /api/workspace`：保存当前姓氏库、Markdown 资料和审核队列；服务端会拒绝拉丁/数字/标点混合姓氏档案、资料姓氏和审核姓氏，避免绕过前端污染长期资料库。
- `DELETE /api/workspace`：清空服务端工作区；清空前会自动备份当前 `workspace.json`。
- `POST /api/feedback`：提交用户纠错反馈，写入 `feedback.jsonl`；`surname` 为必填字段，并会去除末尾“姓/氏”后保存，便于运营台聚合；拉丁/数字/标点混合姓氏会返回 400，避免绕过前端污染反馈队列；联系方式会清洗为单行并限制长度，避免运营台列表被换行或异常空白扰乱；反馈文件不可写时返回脱敏 503，不暴露服务器路径。
- `GET /api/feedback`：运营台读取纠错反馈列表；历史 JSONL 中的非法状态会归一为“待处理”，缺少 `id` 的历史反馈会按姓氏、内容和创建时间生成稳定导入 ID，历史反馈内容会清理控制字符并限制展示长度，避免刷新后工单定位变化或旧数据拖慢运营台。
- `PATCH /api/feedback`：运营台更新纠错反馈处理状态；反馈文件读写异常会返回脱敏 503，避免运行目录路径出现在前端错误里。
- `GET /api/audit`：运营台读取最近审计事件。
- `POST /api/ai-draft`：服务端 AI 代理，优先使用服务端环境变量调用 OpenAI-compatible `chat/completions`；请求体必须是 JSON 对象，`endpoint` 必须是 HTTP(S) URL，`apiKey` 和 `model` 必须是非空字符串，`messages` 必须是非空数组且每条包含 `role` 与 `content`，失败时前端回退离线初稿。

服务端会对工作区 JSON 做基础 schema 校验，保存前自动备份旧版数据到 `data/backups/`，清空工作区前也会自动备份当前版本；默认保留最近 20 份，可通过 `BACKUP_RETENTION` 调整。保存工作区必须包含 `surnames`，且至少包含一个姓氏档案；如果运行态工作区不可写，接口会返回脱敏 503 并提示检查运行数据目录。清空资料库请使用 `DELETE /api/workspace`；如果运行态文件无法清空，接口同样返回脱敏 503，不暴露服务器路径。所有 JSON 写接口按 UTF-8 字节限制请求体大小，超过 5MB 返回 413，避免多字节内容绕过限制。`markdownCorpus` 的 `surname/title/content` 和 `reviewState` 的 `surname/title/status` 必须是非空字符串，避免对象、数字等脏字段进入长期资料库；`surnames` 键名、`char`、资料姓氏和审核姓氏都不接受拉丁/数字/点/下划线/横线组合。前端无法直接访问 `data/` 目录，只能通过 API 读写。运营台导入 JSON 时 `surnames` 必须是对象且至少包含一个姓氏档案，不接受数组；每个姓氏条目也必须是对象，若带 `char` 字段则需与姓氏键名一致；若传入 `markdownCorpus` 或 `reviewState`，也必须是数组，且每条资料/审核记录都必须包含非空字符串字段，避免脏队列先进入浏览器本地工作区；若导入文件里混入拉丁/数字/标点混合姓氏，会在本地入口直接拒绝。从服务端快照、本地缓存或导入 JSON 恢复时，会再次过滤拉丁/数字/标点混合姓氏、无效 Markdown 资料和无效审核条目，并补齐姓氏档案的默认可渲染字段；半成品档案会显示为“待补来源”，不会拖垮前台展示。导入新资料库后页面默认展示导入库中的首个姓氏，避免输入框旧姓氏被重新创建为待收录档案；如果导入 JSON 不包含 `markdownCorpus` 或 `reviewState`，前端会清空旧语料和旧审核队列，避免干净资料库被旧运营数据污染。

如设置 `ADMIN_TOKEN`，写入、清空和 AI 代理接口都需要请求头 `X-Admin-Token`。前端页面的“管理令牌”输入框会自动带上该请求头，并可用“清除令牌”移除当前浏览器会话中的令牌。非生产环境不设置 `ADMIN_TOKEN` 时，写接口保持开放，方便本地演示；生产环境缺少 `ADMIN_TOKEN` 时后台读写和 AI 代理接口会拒绝服务。

服务端会写入 `data/audit.log` 记录保存、清空和 AI 初稿请求，日志只记录事件摘要，不写入 API Key 或完整请求正文。审计日志写入失败时只在服务端输出 warning，不阻断资料保存、反馈提交或 AI 初稿请求；审计日志不可读时运营台会降级为空列表，避免辅助日志拖垮后台。反馈文件不可读时不会伪装为空列表，而是返回明确 503 错误，提醒运营检查运行数据目录。写接口和 AI 代理有分钟级内存限流，可通过 `WRITE_LIMIT_PER_MINUTE`、`AI_LIMIT_PER_MINUTE` 调整；限流桶会按窗口自动清理，避免长时间运行后积累过期来源，触发 429 时会返回 `Retry-After` 告诉调用方建议等待秒数。默认不信任 `X-Forwarded-For`，只有确认反向代理会清洗客户端同名请求头时，才设置 `TRUST_PROXY=true` 使用代理转发 IP 参与限流。AI 和 HTTP 请求超时可通过 `AI_TIMEOUT_MS`、`REQUEST_TIMEOUT_MS` 调整；默认 AI 超时为 120 秒，适配 ccswitch / gpt-5.5 这类生成长中文初稿耗时较长的请求。限流值和超时值都必须是正整数，`0`、负数或非数字会回退默认值，避免误配置导致全量拦截、失去限流或立即超时。`PORT` 会额外限制在 1-65535，错误值回退到 8765。后台受保护接口会先校验管理令牌再计入限流，避免无令牌请求消耗运营后台额度。

后续工程化可以继续升级为：

- Markdown 文档库：作为姓氏资料沉淀层。
- 向量库/RAG：替代当前关键词召回。
- 审核后台：承接 AI 初稿、来源补充、版本发布。
- 网站/小程序共用数据模型：复用 `surname -> profile/origins/migrations/route/figures/sources` 结构，并优先调用 `/api/surnames?limit=500`、`/api/surnames?q=chen&limit=20`、`/api/surname?name=陈`、`/api/surname?name=chen`、`/api/surname?name=陳` 这类公开查询接口。
- 迁徙路线 `route[].x/y` 使用 0-100 的地图百分比坐标，服务端公开 API 和前端导入都会夹紧越界值；`null`、空字符串和非数字会回退默认节点坐标，避免异常资料把地图节点渲染到容器外或错误贴边。

## 未入库姓氏补充方式

- 单个姓氏：运营台“当前姓氏”输入框直接输入未收录汉字姓氏，例如 `徐`，点击“生成 AI 初稿”会自动创建待收录档案、切换当前姓氏并进入 AI Harness；前台搜索框输入未收录汉字姓氏也会创建待收录档案。输入“陈姓”“陈氏”“陈姓氏”“欧阳姓”“欧阳氏”“欧阳姓氏”会自动按“陈”“欧阳”处理；输入已收录姓氏拼音如 `chen`、`wang`、`li` 会优先命中对应档案，并在新增 Markdown 资料、AI Harness、纠错反馈和档案编辑中保持一致；未命中的拉丁/数字/标点混合输入会回退到默认样板，不创建拉丁字母姓氏档案。
- 批量补充：运营工作台“批量补充姓氏”支持粘贴空格、逗号、顿号或换行分隔的汉字姓氏列表，一次性创建待收录档案，自动跳过已有姓氏，并过滤拉丁/数字/标点混合脏输入。
- 后续沉淀：为新姓氏补 Markdown 资料，运行 AI Harness 生成初稿，再由编辑补充来源、可信等级和争议说明后发布。
