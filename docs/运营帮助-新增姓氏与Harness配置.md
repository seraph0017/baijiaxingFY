# 运营帮助：新增姓氏与 Harness 配置

本文以“徐”姓为例，说明如何把一个新姓氏加入“百家姓溯源录”，并用 AI Harness 生成可审核初稿。

## 前提

- 先启动服务并登录后台：

```bash
AUTH_BOOTSTRAP_USER=admin AUTH_BOOTSTRAP_PASSWORD=admin-pass-123 HOST=127.0.0.1 PORT=8765 npm start
```

- 访问：
  - 前台：`http://127.0.0.1:8765/`
  - 登录：`http://127.0.0.1:8765/login`
  - 后台：`http://127.0.0.1:8765/admin`

- 后台登录账号：

```text
admin
admin-pass-123
```

如果使用临时 `DATA_DIR=$(mktemp -d)` 启动，服务关闭后资料会丢失。正式沉淀资料建议配置 MySQL，或至少使用固定 `DATA_DIR`。

## 方法一：后台输入“徐”并一键生成

这是最简单的日常方式。

1. 登录后台 `/admin`。
2. 找到“当前姓氏”。
3. 在输入框里填：

```text
徐
```

4. 直接点击“生成 / 更新 AI 初稿”。

系统会自动：

- 如果徐姓不存在，创建“徐姓待收录档案”。
- 把当前后台工作对象切换为徐姓。
- 自动进入 AI 初稿生成流程。
- 如果已有徐姓 Markdown 资料，会带资料生成；如果没有资料，也会先生成基础初稿。
- 生成后加入审核队列。

不需要再单独点击“切换 / 创建”，生成时会自动切换或创建。

## 方法二：前台直接搜索新姓氏

适合从公开页面快速创建单个待收录档案。

1. 打开前台 `/`。
2. 在“档案检索”里输入 `徐`。
3. 点击“查档案”。
4. 如果系统里还没有徐姓，会自动创建“徐姓待收录档案”。
5. 登录后台 `/admin`，在审核队列里可以看到徐姓待收录项。

这个方法只会创建占位档案，不会自动补全源流、迁徙、名人、家风等内容。后续还要在后台补资料并跑 Harness。

## 方法三：后台批量补充

适合一次加入多个姓氏。

1. 登录 `/admin`。
2. 找到“批量补充姓氏”。
3. 输入：

```text
徐
```

也可以一次输入多个：

```text
徐 何 高 林
欧阳、司马、诸葛
```

4. 点击“批量加入待收录”。

系统会自动：

- 创建徐姓待收录档案。
- 加入审核队列。
- 跳过已存在姓氏。
- 过滤拉丁字母、数字、标点混合的脏输入。

## 方法四：后台新增 Markdown 资料，然后生成 AI 初稿

这是推荐的日常运营流程。

1. 登录 `/admin`。
2. 在“当前姓氏”输入 `徐`。
3. 展开“补充来源材料”，填写资料标题，例如：

```text
徐姓源流补充.md
```

4. 资料类型建议按来源填写：

```text
classic
```

常用类型：

- `classic`：正史、氏族类典籍、权威资料摘录。
- `local`：地方志、公开姓氏资料、地方文化资料。
- `folk`：宗族轶事、民间传说，必须标注“待核”或“传说”。

5. 粘贴资料摘录。示例：

```text
徐姓资料补充：
常见源流之一认为徐姓与嬴姓、徐国相关，徐国故地常与今江苏泗洪、安徽泗县一带的古徐地域线索相关。
资料整理时应区分典籍记载、地方志线索与民间传说，不应把单一说法作为唯一结论。
后续需补充：始祖线索、徐国迁徙、郡望堂号、代表人物、出处卷目。
```

6. 点击“保存来源材料”。
7. 在“本次检索关键词”里可以填：

```text
徐 源流 徐国 嬴姓 郡望 迁徙 名人 家风 来源
```

8. 点击“生成 / 更新 AI 初稿”。
9. 查看“AI 初稿输出”，再由编辑人工校订。
10. 在审核队列中选择“发布到前台”或“退回补资料”。

注意：AI 初稿只是草稿，正式前台内容仍需要人工补出处、可信等级和争议说明。

## 方法五：手动校订徐姓基础档案

适合已有资料、需要人工直接录入。

在后台“姓氏档案编辑”里填写：

```text
繁体：徐
拼音：Xu
起源朝代：周
得姓始祖：待考
郡望：东海、高平等待核
堂号：待补充
```

源流摘要示例：

```text
徐姓常见源流之一与嬴姓、徐国相关。徐国地域和迁徙线索在不同资料中存在多种表述，正式展示时应并列呈现源流说法，并补充典籍、地方志或公开资料出处。
```

点击“保存档案校订”后，系统会：

- 更新当前徐姓档案。
- 写入工作区。
- 加入审核队列。

## 方法六：导入 JSON 工作区

适合一次性导入整理好的资料库。

后台“本地资料工作区”支持导入 JSON。最小示例：

```json
{
  "version": 1,
  "surnames": {
    "徐": {
      "char": "徐",
      "traditional": "徐",
      "pinyin": "Xu",
      "dynasty": "周",
      "ancestor": "待考",
      "summary": "徐姓常见源流之一与嬴姓、徐国相关，正式展示需补充典籍与地方志出处。",
      "tags": ["徐国", "嬴姓线索", "待补来源", "人工审核"],
      "info": {
        "繁体": "徐",
        "拼音": "Xu",
        "起源朝代": "周",
        "得姓始祖": "待考",
        "郡望": "东海、高平等待核",
        "堂号": "待补充"
      },
      "origins": [
        {
          "title": "徐国源流线索",
          "text": "常见说法认为徐姓一支与徐国相关，需补充权威出处。",
          "level": "待补来源"
        }
      ],
      "migrations": [
        ["先秦", "徐国相关地域线索待补充。"],
        ["秦汉", "迁徙与郡望线索待补充。"],
        ["魏晋隋唐", "望族分支资料待补充。"],
        ["宋元明清", "地方志和族谱线索待补充。"]
      ],
      "route": [
        { "phase": "先秦", "place": "古徐地域", "reason": "徐国源流线索", "x": 22, "y": 50 },
        { "phase": "秦汉", "place": "东海等地", "reason": "郡望线索待核", "x": 38, "y": 44 },
        { "phase": "唐宋", "place": "南北迁徙", "reason": "待补迁徙资料", "x": 56, "y": 58 },
        { "phase": "明清", "place": "各地分布", "reason": "待补地方志", "x": 72, "y": 48 }
      ],
      "branches": ["徐姓分支脉络待补充。"],
      "visuals": {
        "totem": "徐姓图腾资料待补充。",
        "glyph": "徐字字形演变资料待补充。",
        "stages": ["徐", "徐", "徐", "徐"]
      },
      "figures": [
        { "name": "徐姓名人待补", "desc": "新增资料后由 AI 抽取人物线索，编辑审核后发布。", "type": "待审核" }
      ],
      "sources": ["待新增典籍或地方志出处"]
    }
  },
  "markdownCorpus": [
    {
      "id": "xu-source-001",
      "type": "local",
      "surname": "徐",
      "title": "徐姓源流补充.md",
      "content": "徐姓常见源流之一与徐国相关，正式展示需补充出处。"
    }
  ],
  "reviewState": [
    {
      "id": "rv-xu-001",
      "surname": "徐",
      "title": "徐姓资料初始导入",
      "status": "待补来源",
      "owner": "文史编辑",
      "createdAt": "2026-06-12T00:00:00.000Z"
    }
  ]
}
```

导入规则：

- `surnames` 必须是对象，至少包含一个姓氏。
- 每个姓氏条目的 `char` 必须和键名一致，例如 `"徐": { "char": "徐" }`。
- `markdownCorpus` 必须是数组，条目至少包含 `surname`、`title`、`content`。
- `reviewState` 必须是数组，条目至少包含 `surname`、`title`、`status`。
- 不接受纯拉丁、数字、点、下划线、横线组合的“姓氏”。

## 方法七：直接调用 API

适合脚本化导入。

先导出当前工作区，再合并徐姓资料后 POST 回去：

```bash
curl -s http://127.0.0.1:8765/api/workspace \
  -H "X-Admin-Token: your-admin-token" > workspace.json
```

保存：

```bash
curl -X POST http://127.0.0.1:8765/api/workspace \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  --data @workspace.json
```

如果当前是开发模式且没有设置 `ADMIN_TOKEN`，部分接口可能不要求管理令牌。生产环境必须设置强 `ADMIN_TOKEN`。

## 方法八：修改种子数据

适合把徐姓做成代码内置样板。

编辑：

```text
data/seed-workspace.json
```

把徐姓加入 `surnames`，并按需补 `markdownCorpus`、`reviewState`。

这个方法适合“产品默认自带徐姓样板”。如果只是运营新增，不建议改种子数据，应使用后台或 MySQL 持久化。

## Harness 配置

Harness 调用的是 OpenAI-compatible `chat/completions` 接口。

后台配置路径：

```text
/admin -> AI 资料整理 Harness -> Harness 后台配置
```

需要填写：

- `API Endpoint`
- `模型 ID`
- `API Key`
- `Temperature`
- `System Prompt`
- `默认检索关键词`

### ccswitch 地址能不能直接用？

可以，但前提是 ccswitch 提供的是 OpenAI-compatible 的 `chat/completions` 接口。

通常应填写完整接口地址，例如：

```text
https://你的-ccswitch-域名/v1/chat/completions
```

如果你手里的地址只是 base URL，例如：

```text
https://你的-ccswitch-域名/v1
```

一般需要补成：

```text
https://你的-ccswitch-域名/v1/chat/completions
```

然后填写：

```text
模型 ID：ccswitch 上可用的模型名
API Key：ccswitch 分配的 key
Temperature：0.2 - 0.5
```

保存后点击“生成 / 更新 AI 初稿”测试。如果配置正确，会显示“已通过服务端 AI 代理生成...”。如果失败，会显示错误摘要，并回退到离线初稿。

后台保存的 Endpoint、模型、System Prompt、Temperature、检索关键词和 API Key 会写入运行态配置。配置 MySQL 时，这些配置会保存到 MySQL 的 `app_kv` 表中，键名为 `harness-config`。再次保存配置时，如果 API Key 输入框留空，不会覆盖已经保存的 Key。

### 环境变量和后台配置的优先级

服务端环境变量优先级更高：

```text
AI_ENDPOINT > 后台保存的 endpoint
AI_API_KEY  > 后台保存的 apiKey
AI_MODEL    > 后台保存的 model
```

也就是说：

- 如果启动服务时设置了 `AI_ENDPOINT`，后台里填的 Endpoint 不会覆盖它。
- 如果启动服务时设置了 `AI_API_KEY`，后台里保存的 API Key 不会覆盖它。
- 如果想完全用后台配置测试 ccswitch，本机启动时不要设置 `AI_ENDPOINT`、`AI_API_KEY`、`AI_MODEL`。

### 推荐本机测试方式

本机只用后台配置测试：

```bash
AUTH_BOOTSTRAP_USER=admin \
AUTH_BOOTSTRAP_PASSWORD=admin-pass-123 \
HOST=127.0.0.1 \
PORT=8765 \
npm start
```

然后在后台填写 ccswitch endpoint、model、key。

生产环境更推荐用环境变量固定配置：

```bash
AI_ENDPOINT=https://你的-ccswitch-域名/v1/chat/completions \
AI_MODEL=你的模型名 \
AI_API_KEY=你的key \
AUTH_BOOTSTRAP_USER=admin \
AUTH_BOOTSTRAP_PASSWORD=change-me \
ADMIN_TOKEN=change-me \
NODE_ENV=production \
npm start
```

## 徐姓建议沉淀顺序

1. 先创建徐姓待收录档案。
2. 补 3-5 条 Markdown 资料：
   - 徐国 / 嬴姓相关源流线索。
   - 郡望堂号线索。
   - 迁徙路线线索。
   - 历史人物线索。
   - 家风家训或宗族文化线索。
3. 生成 / 更新 AI 初稿。
4. 人工校订基础字段和摘要。
5. 审核队列发布到前台。
6. 前台搜索 `徐` 验证展示。

## 常见问题

### 为什么我点 Harness 后还是离线初稿？

常见原因：

- Endpoint 不是完整的 `/v1/chat/completions`。
- API Key 错误或没有权限。
- 模型 ID 在 ccswitch 上不存在。
- 服务启动时设置了别的 `AI_ENDPOINT` / `AI_API_KEY`，覆盖了后台配置。
- 生产环境缺少必要配置。

### 为什么保存后重启没了？

看启动方式：

- 使用 MySQL：数据应持久保存。
- 使用固定 `DATA_DIR`：数据保存在该目录。
- 使用 `DATA_DIR=$(mktemp -d)`：只是临时演示，服务关闭后可能丢失。

### 徐姓资料能不能只靠 AI 自动补全？

不建议。Harness 只能生成初稿，正式展示需要人工补充来源、卷目、可信等级和争议说明。
