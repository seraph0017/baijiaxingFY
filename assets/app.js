let surnames = {};
let markdownCorpus = [];
let reviewState = [];
let feedbackState = [];
let auditState = [];
let workspaceSaveChain = Promise.resolve();
let workspaceSaveVersion = 0;
let currentSurname = "陈";

  const STORAGE_KEY = "baijiaxing-suyuanlu-workspace-v1";

  const byId = (id) => document.getElementById(id);
  const on = (id, event, handler) => {
    const element = byId(id);
    if (element) element.addEventListener(event, handler);
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  function stableReviewId(item, index = 0) {
    const fingerprint = [
    item?.surname,
    item?.title,
    item?.status,
    item?.owner,
    item?.createdAt,
    index
    ].map(value => String(value ?? "").trim()).join("|");
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i += 1) {
    hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
    hash |= 0;
    }
    return `rv-imported-${Math.abs(hash).toString(36)}`;
  }

  function normalizeReviewItem(item, index = 0) {
    const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return {
    ...source,
    id: normalizeClientText(source.id, stableReviewId(source, index)),
    surname: normalizeSurnameInput(source.surname, "未"),
    title: normalizeClientText(source.title, "未命名审核项"),
    status: normalizeReviewStatus(source.status),
    owner: normalizeClientText(source.owner, "文史编辑"),
    createdAt: normalizeClientText(source.createdAt, new Date().toISOString())
    };
  }

  function normalizeReviewStatus(status) {
    const value = normalizeClientText(status, "待审核");
    if (["AI 初稿", "待补来源", "待收录"].includes(value)) return "待审核";
    if (value === "已驳回") return "待补资料";
    return value;
  }

  function createReviewItem(surname, title, status, owner) {
    return normalizeReviewItem({
    id: `rv-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    surname,
    title,
    status,
    owner,
    createdAt: new Date().toISOString()
    });
  }

  function getWorkspaceSnapshot() {
    return {
    version: 1,
    savedAt: new Date().toISOString(),
    surnames,
    markdownCorpus,
    reviewState
    };
  }

  function normalizeClientText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function isLatinLikeQuery(value) {
    return /^[a-z0-9\s._-]+$/i.test(String(value || "").trim());
  }

  function isUsableSurnameName(value) {
    const name = normalizeSurnameInput(value, "");
    return Boolean(name) && !isLatinLikeQuery(name);
  }

  function normalizeCorpusItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (!isUsableSurnameName(item.surname)) return null;
    const title = normalizeClientText(item.title, "");
    const content = normalizeClientText(item.content, "");
    if (!title || !content) return null;
    return {
      ...item,
      id: normalizeClientText(item.id, `corpus-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`),
      type: normalizeClientText(item.type, "local"),
      surname: normalizeSurnameInput(item.surname, ""),
      title,
      content
    };
  }

  function normalizeReviewSnapshotItem(item, index = 0) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    if (!isUsableSurnameName(item.surname)) return null;
    const title = normalizeClientText(item.title, "");
    const status = normalizeClientText(item.status, "");
    if (!title || !status) return null;
    return normalizeReviewItem(item, index);
  }

  function clampMapCoordinate(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, numeric));
  }

  function normalizeClientMigrationRows(rows, char) {
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
      normalizeClientText(row[0], defaults[index][0]),
      normalizeClientText(row[1], defaults[index][1])
    ];
    });
  }

  function normalizeClientRouteRows(rows, char) {
    const defaults = [
    { phase: "待补", place: `${char}姓发源地待考`, reason: "需补充来源资料", x: 12, y: 50 },
    { phase: "待补", place: `${char}姓郡望待考`, reason: "需文史编辑审核", x: 36, y: 38 },
    { phase: "待补", place: `${char}姓迁徙节点待补`, reason: "需地方志或族谱线索", x: 62, y: 56 },
    { phase: "待补", place: `${char}姓现状分布待补`, reason: "需人口与公开资料", x: 84, y: 34 }
    ];
    if (!Array.isArray(rows) || rows.length < 4) return defaults;
    return rows.slice(0, 4).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return defaults[index];
    return {
      phase: normalizeClientText(item.phase, defaults[index].phase),
      place: normalizeClientText(item.place, defaults[index].place),
      reason: normalizeClientText(item.reason, defaults[index].reason),
      x: clampMapCoordinate(item.x, defaults[index].x),
      y: clampMapCoordinate(item.y, defaults[index].y)
    };
    });
  }

  function normalizeClientSurnameProfile(item, fallbackName = "") {
    const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const char = normalizeSurnameInput(source.char || fallbackName, "未");
    const info = source.info && typeof source.info === "object" && !Array.isArray(source.info) ? source.info : {};
    const traditional = normalizeClientText(source.traditional || info["繁体"], char);
    const pinyin = normalizeClientText(source.pinyin || info["拼音"], "待补充");
    const dynasty = normalizeClientText(source.dynasty || info["起源朝代"], "待考");
    const ancestor = normalizeClientText(source.ancestor || info["得姓始祖"], "待考");
    const visuals = source.visuals && typeof source.visuals === "object" && !Array.isArray(source.visuals) ? source.visuals : {};
    return {
    ...source,
    char,
    traditional,
    pinyin,
    dynasty,
    ancestor,
    summary: normalizeClientText(source.summary, `${char}姓档案正在沉淀中，需补充权威来源、迁徙线索、人物典故和家风资料。`),
    tags: Array.isArray(source.tags) && source.tags.length ? source.tags.map(tag => normalizeClientText(tag, "待补来源")) : ["待补来源", "人工审核"],
    info: {
      ...info,
      "繁体": traditional,
      "拼音": pinyin,
      "起源朝代": dynasty,
      "得姓始祖": ancestor,
      "郡望": normalizeClientText(info["郡望"], "待补充"),
      "堂号": normalizeClientText(info["堂号"], "待补充")
    },
    origins: Array.isArray(source.origins) && source.origins.length ? source.origins.map(origin => ({
      title: normalizeClientText(origin?.title, `${char}姓源流待补`),
      text: normalizeClientText(origin?.text, "需补充来源资料。"),
      level: normalizeClientText(origin?.level, "待补来源")
    })) : [{ title: `${char}姓源流待补`, text: "当前档案处于资料沉淀阶段，需补充典籍、地方志或公开资料摘录。", level: "待补来源" }],
    migrations: normalizeClientMigrationRows(source.migrations, char),
    route: normalizeClientRouteRows(source.route, char),
    branches: Array.isArray(source.branches) && source.branches.length ? source.branches.map(branch => normalizeClientText(branch, "待补充分支线索。")) : [`${char}姓分支脉络待补充。`],
    visuals: {
      totem: normalizeClientText(visuals.totem, `${char}姓图腾说明待设计确认。`),
      glyph: normalizeClientText(visuals.glyph, `${char}姓字形演变资料待补充。`),
      stages: Array.isArray(visuals.stages) && visuals.stages.length ? visuals.stages.map(stage => normalizeClientText(stage, char)) : ["待", "补", "字", char]
    },
    figures: Array.isArray(source.figures) && source.figures.length ? source.figures.map(figure => ({
      name: normalizeClientText(figure?.name, `${char}姓人物待补`),
      desc: normalizeClientText(figure?.desc, "需补充生平、功绩、来源和可信等级。"),
      type: normalizeClientText(figure?.type, "待审核")
    })) : [{ name: `${char}姓名人典故待补`, desc: "新增资料后由 AI 抽取人物、典故和家风线索，编辑审核后发布。", type: "待审核" }],
    sources: Array.isArray(source.sources) && source.sources.length ? source.sources.map(sourceName => normalizeClientText(sourceName, "待补来源")) : ["待补来源"]
    };
  }

  function getAdminHeaders(headers = {}) {
    const inputToken = byId("adminToken")?.value.trim();
    const token = inputToken || sessionStorage.getItem("baijiaxing-admin-token") || "";
    if (inputToken) sessionStorage.setItem("baijiaxing-admin-token", inputToken);
    if (token && byId("adminToken") && !byId("adminToken").value) byId("adminToken").value = token;
    return token ? { ...headers, "X-Admin-Token": token } : headers;
  }

  function queueWorkspaceServerSave(snapshot, message, version) {
    const requestBody = JSON.stringify(snapshot);
    workspaceSaveChain = workspaceSaveChain
    .catch(() => {})
    .then(() => fetch("/api/workspace", {
      method: "POST",
      headers: getAdminHeaders({ "Content-Type": "application/json" }),
      body: requestBody
    }))
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`服务端保存失败 ${response.status}`)))
    .then(() => {
      if (version !== workspaceSaveVersion) return;
      const serverStatus = byId("workspaceStatus");
      if (serverStatus) serverStatus.textContent = `${message} 后端 JSON 已同步。`;
    })
    .catch(() => {
      if (version !== workspaceSaveVersion) return;
      const serverStatus = byId("workspaceStatus");
      if (serverStatus) serverStatus.textContent = `${message} 后端未同步，请检查服务状态或管理令牌。`;
    });
    return workspaceSaveChain;
  }

  function persistWorkspace(message = "已自动保存到当前浏览器。") {
    try {
    const snapshot = getWorkspaceSnapshot();
    const version = workspaceSaveVersion + 1;
    workspaceSaveVersion = version;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    const status = byId("workspaceStatus");
    if (status) status.textContent = message;
    queueWorkspaceServerSave(snapshot, message, version);
    } catch (error) {
    const status = byId("workspaceStatus");
    if (status) status.textContent = `保存失败：${error.message}`;
    }
  }

  function applyWorkspaceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("JSON 格式不正确");
    if (snapshot.surnames && typeof snapshot.surnames === "object" && !Array.isArray(snapshot.surnames)) {
    surnames = Object.fromEntries(Object.entries(snapshot.surnames)
      .filter(([key, item]) => isUsableSurnameName(key) && isUsableSurnameName(item?.char || key))
      .map(([key, item]) => {
      const profile = normalizeClientSurnameProfile(item, key);
      return [profile.char, profile];
      }));
    }
    markdownCorpus.splice(0, markdownCorpus.length, ...(Array.isArray(snapshot.markdownCorpus) ? snapshot.markdownCorpus.map(normalizeCorpusItem).filter(Boolean) : []));
    reviewState.splice(0, reviewState.length, ...(Array.isArray(snapshot.reviewState) ? snapshot.reviewState.map(normalizeReviewSnapshotItem).filter(Boolean) : []));
  }

async function hydrateSeedWorkspace() {
  let response;
  try {
    response = await fetch("/api/bootstrap");
  } catch {
    response = await fetch("data/seed-workspace.json");
  }
  if (!response.ok && location.protocol === "file:") {
    response = await fetch("data/seed-workspace.json");
  }
  if (!response.ok) throw new Error(`种子资料读取失败 ${response.status}`);
  const payload = await response.json();
  const workspace = payload.workspace || payload;
  if (!workspace) throw new Error("种子资料为空");
  applyWorkspaceSnapshot(workspace);
}

async function hydratePublicApiWorkspace() {
    const listResponse = await fetch("/api/surnames?limit=500");
    if (!listResponse.ok) throw new Error(`公开列表读取失败 ${listResponse.status}`);
    const listPayload = await listResponse.json();
    const summaries = listPayload.surnames || [];
    const detailEntries = await Promise.all(summaries.map(async item => {
    const response = await fetch(`/api/surname?name=${encodeURIComponent(item.char)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.surname ? [payload.surname.char, payload.surname] : null;
    }));
    const publicSurnames = Object.fromEntries(detailEntries.filter(Boolean));
    if (!Object.keys(publicSurnames).length) throw new Error("公开姓氏资料为空");
    applyWorkspaceSnapshot({ surnames: publicSurnames });
  }

function hydrateWorkspace() {
    try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applyWorkspaceSnapshot(JSON.parse(raw));
    } catch (error) {
    console.warn("工作区恢复失败", error);
    }
  }

  async function hydrateWorkspaceFromServer() {
    try {
    await hydratePublicApiWorkspace();
    const response = await fetch("/api/workspace", { headers: getAdminHeaders() });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status >= 500) {
      const status = byId("workspaceStatus");
      if (status) status.textContent = `完整工作区读取失败：${payload.error || `HTTP ${response.status}`}。公开资料已加载，请检查运行数据目录。`;
      }
      return true;
    }
    if (payload.workspace) {
      applyWorkspaceSnapshot(payload.workspace);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.workspace));
    }
    return true;
    } catch {
    return false;
    }
  }

  function exportWorkspace() {
    const json = JSON.stringify(getWorkspaceSnapshot(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `baijiaxing-workspace-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    byId("workspaceStatus").textContent = "已导出当前资料工作区 JSON。";
  }

  async function copyWorkspace() {
    const json = JSON.stringify(getWorkspaceSnapshot(), null, 2);
    try {
    await navigator.clipboard.writeText(json);
    byId("workspaceStatus").textContent = "已复制当前资料工作区 JSON。";
    } catch {
    byId("importDataText").value = json;
    byId("workspaceStatus").textContent = "浏览器不允许复制，已放入导入框，可手动复制。";
    }
  }

  function importWorkspace() {
    try {
    const raw = byId("importDataText").value.trim();
    if (!raw) {
      byId("workspaceStatus").textContent = "请先粘贴 JSON。";
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.surnames || typeof parsed.surnames !== "object" || Array.isArray(parsed.surnames)) {
      throw new Error("导入 JSON 的 surnames 必须是对象。");
    }
    if (!Object.keys(parsed.surnames).length) {
      throw new Error("导入 JSON 至少需要包含一个姓氏档案。");
    }
    if (Object.entries(parsed.surnames).some(([, item]) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("导入 JSON 的 surnames 条目必须是对象。");
    }
    if (Object.entries(parsed.surnames).some(([key, item]) => item.char !== undefined && normalizeSurnameInput(item.char, "") !== normalizeSurnameInput(key, ""))) {
      throw new Error("导入 JSON 的 char 必须与姓氏键名一致。");
    }
    const isImportString = (value) => typeof value === "string" && value.trim();
    if (parsed.markdownCorpus !== undefined && !Array.isArray(parsed.markdownCorpus)) {
      throw new Error("导入 JSON 的 markdownCorpus 必须是数组。");
    }
    if (parsed.reviewState !== undefined && !Array.isArray(parsed.reviewState)) {
      throw new Error("导入 JSON 的 reviewState 必须是数组。");
    }
    if (Array.isArray(parsed.markdownCorpus) && parsed.markdownCorpus.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("导入 JSON 的 markdownCorpus 条目必须包含 surname、title、content。");
    }
    if (Array.isArray(parsed.reviewState) && parsed.reviewState.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("导入 JSON 的 reviewState 条目必须包含 surname、title、status。");
    }
    if (Array.isArray(parsed.markdownCorpus) && parsed.markdownCorpus.some(item => !isImportString(item.surname) || !isImportString(item.title) || !isImportString(item.content))) {
      throw new Error("导入 JSON 的 markdownCorpus 条目必须包含 surname、title、content。");
    }
    if (Array.isArray(parsed.reviewState) && parsed.reviewState.some(item => !isImportString(item.surname) || !isImportString(item.title) || !isImportString(item.status))) {
      throw new Error("导入 JSON 的 reviewState 条目必须包含 surname、title、status。");
    }
    if (Object.entries(parsed.surnames).some(([key, item]) => isLatinLikeQuery(key) || isLatinLikeQuery(item.char))) {
      throw new Error("导入 JSON 的姓氏格式不正确。");
    }
    if (Array.isArray(parsed.markdownCorpus) && parsed.markdownCorpus.some(item => isLatinLikeQuery(item.surname))) {
      throw new Error("导入 JSON 的姓氏格式不正确。");
    }
    if (Array.isArray(parsed.reviewState) && parsed.reviewState.some(item => isLatinLikeQuery(item.surname))) {
      throw new Error("导入 JSON 的姓氏格式不正确。");
    }
    applyWorkspaceSnapshot(parsed);
    persistWorkspace("已导入并保存资料工作区。");
    renderHotList();
    renderRepositoryStats();
    renderReviewQueue();
    const importedDefaultSurname = Object.keys(surnames)[0];
    if (byId("publicView")) renderSurname(importedDefaultSurname);
    else {
    setCurrentSurname(importedDefaultSurname);
    syncProfileEditor();
    }
    } catch (error) {
    byId("workspaceStatus").textContent = `导入失败：${error.message}`;
    }
  }

  async function resetWorkspace() {
    localStorage.removeItem(STORAGE_KEY);
    try {
    const response = await fetch("/api/workspace", { method: "DELETE", headers: getAdminHeaders() });
    if (!response.ok) throw new Error(`后端清空失败 ${response.status}`);
    byId("workspaceStatus").textContent = "已清空本地数据和后端工作区，刷新页面后恢复初始样板。";
    } catch (error) {
    byId("workspaceStatus").textContent = `本地数据已清空，${error.message}，请检查服务状态或管理令牌。`;
    }
  }

  function renderHotList() {
    const hotList = byId("hotList");
    if (!hotList) return;
    hotList.innerHTML = Object.keys(surnames).map(name => (
    `<button class="chip" data-surname="${escapeHtml(name)}" data-surname-length="${name.length}">${escapeHtml(name)}</button>`
    )).join("");
  }

  function setSurnameLengthClass(element, name) {
    if (!element) return;
    const long = String(name || "").length > 1;
    element.classList.toggle("surname-long", long);
    element.classList.toggle("surname-single", !long);
  }

  function normalizeSurnameInput(value, fallback = "陈") {
    return String(value || "").trim().replace(/(姓氏|姓|氏)$/, "").slice(0, 4) || fallback;
  }

  function compactQueryText(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function resolveSurnameQuery(value) {
    const raw = String(value || "").trim();
    const normalized = normalizeSurnameInput(raw, "");
    if (normalized && surnames[normalized]) return normalized;
    const compact = compactQueryText(raw);
    if (compact) {
    const matched = Object.values(surnames).find(item => [
      item.char,
      item.traditional,
      item.info?.["繁体"],
      item.pinyin,
      item.info?.["拼音"]
    ].some(field => compactQueryText(field) === compact));
    if (matched?.char) return matched.char;
    }
    if (isLatinLikeQuery(raw)) return "陈";
    return normalized || "陈";
  }

  function getCurrentSurname() {
    return resolveSurnameQuery(byId("surnameInput")?.value || currentSurname);
  }

  function setCurrentSurname(name) {
    currentSurname = normalizeSurnameInput(name, currentSurname || "陈");
    if (byId("activeSurnameInput")) byId("activeSurnameInput").value = currentSurname;
    return currentSurname;
  }

  function getSelectedSourceTypes() {
    return Array.from(document.querySelectorAll("[data-source]:checked"))
    .map(input => input.dataset.source);
  }

  function createPendingSurname(name, options = {}) {
    const { persist = true } = options;
    const char = normalizeSurnameInput(name, "新");
    if (surnames[char]) return surnames[char];
    const hints = buildPendingFieldHints(char);
    const pending = {
    char,
    pinyin: hints.pinyin,
    traditional: char,
    dynasty: hints.dynasty,
    ancestor: hints.ancestor,
    summary: `${char}姓暂未进入正式样板库，已创建待收录档案。可先新增资料、生成 AI 初稿，再进入文史审核。`,
    tags: ["待收录", "AI 初稿", "资料待补", "人工审核"],
    info: {
      "繁体": char,
      "拼音": hints.pinyin,
      "起源朝代": hints.dynasty,
      "得姓始祖": hints.ancestor,
      "郡望": hints.junwang,
      "堂号": hints.tanghao
    },
    origins: [
      { title: "待收录源流", text: "当前姓氏尚缺少足够上下文。请先新增典籍、地方志或公开资料摘录。", level: "待补来源" },
      { title: "AI 整理入口", text: "资料入库后，Harness 会按来源、迁徙、名人、家风等字段生成初稿。", level: "AI 初稿" }
    ],
    migrations: [
      ["秦汉", hints.migrationEarly],
      ["魏晋南北朝", hints.migrationMiddle],
      ["唐宋元明清", hints.migrationLate],
      ["近现代", hints.migrationModern]
    ],
    route: [
      { phase: "待补", place: "发源地待考", reason: "需新增来源资料", x: 10, y: 50 },
      { phase: "待补", place: "郡望待考", reason: "需文史编辑审核", x: 38, y: 36 },
      { phase: "待补", place: "迁徙节点待补", reason: "需地方志或族谱线索", x: 63, y: 55 },
      { phase: "待补", place: "现状分布待补", reason: "需人口与宗亲资料", x: 84, y: 32 }
    ],
    branches: ["待收录分支：需通过资料沉淀和人工审核补全。"],
    visuals: {
      totem: "待设计确认。资料不足时不生成定论式图腾说明。",
      glyph: "待补充字形演变资料。",
      stages: ["待", "补", "字", char]
    },
    figures: [
      { name: `${char}姓名人线索`, desc: "需核：查正史人物传、地方志人物条目和公开姓氏人物资料后再写入。", type: "待核人物" },
      { name: `${char}姓典故线索`, desc: "需核：查地方文献、宗族故事和公开资料，区分传说与可证事实。", type: "典故线索" },
      { name: `${char}姓家风线索`, desc: "需核：查族谱序言、宗祠楹联、家训文本或地方志艺文资料。", type: "家风家训" }
    ],
    sources: [`需核：补充${char}姓源流资料`, `需核：补充${char}姓郡望、迁徙、人物和家风资料`]
    };
    surnames[char] = pending;
    reviewState.unshift(createReviewItem(char, `${char}姓待收录档案`, "待审核", "运营整理"));
    if (persist) {
    renderHotList();
    renderRepositoryStats();
    renderReviewQueue();
    persistWorkspace(`${char}姓待收录档案已保存。`);
    }
    return pending;
  }

  function buildPendingFieldHints(char) {
    return {
      pinyin: "需核：普通话读音和异读",
      dynasty: "需核：查姓氏典籍与地方志",
      ancestor: "需核：查得姓始祖和多源流记载",
      junwang: "需核：查郡望资料",
      tanghao: "需核：查堂号资料",
      migrationEarly: `需核：查${char}姓早期发源地、封国或郡县线索。`,
      migrationMiddle: `需核：查${char}姓中古时期郡望形成、南北迁徙和地方志线索。`,
      migrationLate: `需核：查${char}姓唐宋至明清族谱、移民和地域分支资料。`,
      migrationModern: `需核：查${char}姓近现代分布、宗亲资料和公开统计线索。`
    };
  }

  function parseBatchSurnames(raw) {
    return Array.from(new Set(
    String(raw || "")
      .split(/[\s,，、;；|/]+/)
      .map(name => name.trim())
      .filter(name => !isLatinLikeQuery(name))
      .map(name => normalizeSurnameInput(name, ""))
      .filter(Boolean)
    ));
  }

  function importSurnameBatch() {
    const raw = byId("batchSurnameInput").value;
    const names = parseBatchSurnames(raw);
    if (!names.length) {
    byId("batchSurnameStatus").textContent = "请先粘贴待补充姓氏。";
    return;
    }
    const created = [];
    const skipped = [];
    names.forEach(name => {
    if (surnames[name]) {
      skipped.push(name);
      return;
    }
    createPendingSurname(name, { persist: false });
    created.push(name);
    });
    if (created.length) {
    renderHotList();
    renderRepositoryStats();
    renderReviewQueue();
    if (byId("publicView")) renderSurname(created[0]);
    else {
      setCurrentSurname(created[0]);
      syncProfileEditor();
    }
    persistWorkspace(`已批量加入 ${created.length} 个待收录姓氏。`);
    }
    byId("batchSurnameInput").value = "";
    byId("batchSurnameStatus").textContent = created.length
    ? `已加入：${created.join("、")}。${skipped.length ? `已跳过已有：${skipped.join("、")}。` : ""}`
    : `未新增，全部已存在：${skipped.join("、")}。`;
  }

  function switchAdminSurname() {
    const raw = byId("activeSurnameInput")?.value || currentSurname;
    if (isLatinLikeQuery(raw)) {
      if (byId("activeSurnameStatus")) byId("activeSurnameStatus").textContent = "请输入汉字姓氏，例如：徐。";
      return "";
    }
    const name = setCurrentSurname(normalizeSurnameInput(raw, currentSurname || "陈"));
    if (!surnames[name]) createPendingSurname(name);
    syncProfileEditor();
    renderRepositoryStats();
    renderReviewQueue();
    if (byId("activeSurnameStatus")) byId("activeSurnameStatus").textContent = `已切换到${name}姓，可直接生成 AI 初稿。`;
    return name;
  }

  function retrieveMarkdownContext(surname, query, sourceTypes) {
    const terms = [surname, ...String(query || "").split(/\s+/).filter(Boolean)];
    return markdownCorpus
    .filter(item => item.surname === surname && sourceTypes.includes(item.type))
    .map(item => {
      const text = `${item.title} ${item.content}`;
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { ...item, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  }

  function buildOfflineDraft(surname, contextItems) {
    const data = surnames[surname] || surnames["陈"];
    const contextText = contextItems.map(item => `- ${item.title}：${item.content}`).join("\n");
    const originLines = data.origins.map((item, index) => `${index + 1}. ${item.title}（${item.level}）：${item.text || "需按公开资料继续核验。"} `).join("\n");
    const migrationLines = data.migrations.map(([phase, text]) => `- ${phase}：${text}`).join("\n");
    const branchLines = (data.branches || []).map(item => `- ${item}`).join("\n");
    const figureLines = data.figures.map(item => `- ${item.name}：${item.desc}（${item.type}）`).join("\n");
    return [
    `【${data.char}姓 AI 初稿】`,
    `基础档案：姓氏=${data.char}；繁体=${data.traditional || data.char}；拼音=${data.pinyin || data.info?.["拼音"] || "需核音"}；起源朝代=${data.dynasty || data.info?.["起源朝代"] || "需按资料核定"}；得姓始祖=${data.ancestor || data.info?.["得姓始祖"] || "需按资料核定"}；郡望=${data.info?.["郡望"] || "需查地方志和郡望资料"}；堂号=${data.info?.["堂号"] || "需查族谱和堂号资料"}。`,
    `源流摘要：${data.summary} 编辑审核时应把确定记载、常见说法和待核传说分开，不把单一线索写成定论。`,
    `源流分支：\n${originLines}`,
    `迁徙路线：\n${migrationLines}`,
    `望族分支：\n${branchLines || `- ${data.char}姓望族、郡望和分支需结合地方志、族谱目录和公开姓氏资料继续核验。`}`,
    `名人典故：\n${figureLines}`,
    `家风家训：\n- 可先围绕族谱序言、地方志人物传、宗祠楹联和公开家训材料建立线索。\n- 当前初稿不得虚构具体家训原文；缺少出处时标为“待核线索”。`,
    `参考来源：\n${contextText || `- 暂未召回本地资料。建议先补充${data.char}姓源流、郡望、迁徙、人物和家风资料，再重新生成。`}`,
    "审核风险：\n- 区分正史/地方志/族谱/民间传说，不做唯一源流定论。\n- 对始祖、发源地、郡望、堂号、人物故事逐条补出处。\n- 没有明确证据的内容保留为“待核线索”，不得写成确定事实。"
    ].join("\n\n");
  }

  function extractAiProfileField(draft, labels) {
    const escaped = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = new RegExp(`(?:${escaped})\\s*[=：:]\\s*([^；;，,\\n]+)`);
    const match = String(draft || "").match(pattern);
    return match ? match[1].trim().replace(/[。.]$/, "") : "";
  }

  function extractAiSection(draft, title) {
    const pattern = new RegExp(`${title}[：:]\\s*([\\s\\S]*?)(?=\\n\\s*(?:源流分支|迁徙路线|望族分支|名人典故|家风家训|参考来源|审核风险)[：:]|$)`);
    const match = String(draft || "").match(pattern);
    return match ? match[1].trim() : "";
  }

  function summarizeAiSection(text, fallback) {
    const cleaned = String(text || "")
      .replace(/^\s*[-\d.、]+\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? cleaned.slice(0, 260) : fallback;
  }

  function parseAiListSection(text) {
    return String(text || "")
      .split(/\n+/)
      .map(line => line.replace(/^\s*(?:[-*]|\d+[.、)]?)\s*/, "").trim())
      .filter(Boolean);
  }

  function parseAiOrigins(text) {
    return parseAiListSection(text).slice(0, 6).map(line => {
      const [titlePart, ...rest] = line.split(/[：:]/);
      const title = titlePart?.trim() || "源流线索";
      const body = rest.join("：").trim() || line;
      const level = /正史|典籍|可信|高/.test(line) ? "较高可信" : (/传说|民间|待核|需核/.test(line) ? "待核来源" : "多源并列");
      return { title, text: body, level };
    });
  }

  function parseAiMigrations(text) {
    const lines = parseAiListSection(text);
    const fallbackPhases = ["先秦/秦汉", "魏晋南北朝", "唐宋元明清", "近现代"];
    return (lines.length ? lines : fallbackPhases.map(phase => `${phase}：需继续核验迁徙路线。`))
      .slice(0, 4)
      .map((line, index) => {
        const [phasePart, ...rest] = line.split(/[：:]/);
        const phase = phasePart?.trim() || fallbackPhases[index] || `阶段 ${index + 1}`;
        const detail = rest.join("：").trim() || line;
        return [phase, detail];
      });
  }

  function parseAiFigures(text) {
    return parseAiListSection(text).slice(0, 6).map(line => {
      const [namePart, ...rest] = line.split(/[：:]/);
      const name = namePart?.trim() || "人物线索";
      const desc = rest.join("：").trim() || line;
      const type = /家风|家训|宗祠|楹联/.test(line) ? "家风家训" : (/典故|故事|传说/.test(line) ? "典故线索" : "待核人物");
      return { name, desc, type };
    });
  }

  function parseAiSources(text) {
    return parseAiListSection(text).slice(0, 10);
  }

  function parseAiRisks(text) {
    return parseAiListSection(text).slice(0, 8);
  }

  function buildRouteFromMigrations(migrations) {
    const points = [
      { x: 14, y: 48 },
      { x: 36, y: 38 },
      { x: 62, y: 52 },
      { x: 84, y: 32 }
    ];
    return migrations.slice(0, 4).map(([phase, text], index) => ({
      phase,
      place: text.split(/[，,。；;]/)[0].slice(0, 16) || `${phase}线索`,
      reason: text,
      x: points[index]?.x ?? 50,
      y: points[index]?.y ?? 45
    }));
  }

  function applyAiDraftToProfile(surname, draft) {
    const data = surnames[surname] || createPendingSurname(surname, { persist: false });
    const traditional = extractAiProfileField(draft, ["繁体", "繁體"]) || data.traditional || data.char;
    const pinyin = extractAiProfileField(draft, ["拼音", "读音", "讀音"]) || data.pinyin || data.info?.["拼音"];
    const dynasty = extractAiProfileField(draft, ["起源朝代", "朝代线索", "起源时期"]) || data.dynasty || data.info?.["起源朝代"];
    const ancestor = extractAiProfileField(draft, ["得姓始祖", "始祖线索", "始祖"]) || data.ancestor || data.info?.["得姓始祖"];
    const junwang = extractAiProfileField(draft, ["郡望"]) || data.info?.["郡望"];
    const tanghao = extractAiProfileField(draft, ["堂号", "堂號"]) || data.info?.["堂号"];
    const summary = summarizeAiSection(
      extractAiSection(draft, "源流摘要") || extractAiSection(draft, "源流分支"),
      data.summary
    );
    const parsedOrigins = parseAiOrigins(extractAiSection(draft, "源流分支"));
    const parsedMigrations = parseAiMigrations(extractAiSection(draft, "迁徙路线"));
    const parsedBranches = parseAiListSection(extractAiSection(draft, "望族分支")).slice(0, 8);
    const parsedFigures = [
      ...parseAiFigures(extractAiSection(draft, "名人典故")),
      ...parseAiFigures(extractAiSection(draft, "家风家训"))
    ].slice(0, 8);
    const parsedSources = parseAiSources(extractAiSection(draft, "参考来源"));
    const parsedRisks = parseAiRisks(extractAiSection(draft, "审核风险"));
    data.traditional = traditional;
    data.pinyin = pinyin;
    data.dynasty = dynasty;
    data.ancestor = ancestor;
    data.summary = summary;
    data.info = {
      ...data.info,
      "繁体": traditional,
      "拼音": pinyin,
      "起源朝代": dynasty,
      "得姓始祖": ancestor,
      "郡望": junwang,
      "堂号": tanghao
    };
    if (parsedOrigins.length) data.origins = parsedOrigins;
    if (parsedMigrations.length) {
      data.migrations = parsedMigrations;
      data.route = buildRouteFromMigrations(parsedMigrations);
    }
    if (parsedBranches.length) data.branches = parsedBranches;
    if (parsedFigures.length) data.figures = parsedFigures;
    if (parsedSources.length) data.sources = parsedSources;
    if (parsedRisks.length) data.reviewRisks = parsedRisks;
    renderSurname(surname);
    syncProfileEditor();
    persistWorkspace(`${surname}姓 AI 初稿已回填到校订字段，源流分支、迁徙路线、参考来源、审核风险已同步。`);
    if (byId("profileEditStatus")) byId("profileEditStatus").textContent = `${surname}姓 AI 初稿已回填到校订字段，源流分支、迁徙路线、参考来源、审核风险已同步，请人工确认后保存并送审。`;
  }

  function buildAiDraftPrompt(data, contextItems) {
    const contextText = contextItems.length
      ? contextItems.map((item, index) => `## 资料 ${index + 1}：${item.title}\n类型：${item.type || "local"}\n${item.content}`).join("\n\n")
      : "未召回本地资料。请基于通用姓氏整理框架生成可审核初稿，并明确标注需要查证的方向。";
    return [
      `请根据上下文生成${data.char}姓结构化初稿，内容要比普通摘要更完整。`,
      "输出必须使用以下 8 个字段标题，顺序不要变：",
      "1. 基础档案：写明简体、繁体、拼音、起源朝代线索、得姓始祖线索、郡望、堂号。每个字段必须给出可审核内容，资料不足时写“需核：建议查证某类资料”，不要把字段值写成“待补充”。",
      "2. 源流分支：至少 3 条，区分典籍记载、地方志线索、族谱/民间说法，并标注可信等级。",
      "3. 迁徙路线：至少 4 个阶段，按先秦/秦汉、魏晋南北朝、唐宋元明清、近现代组织，写出地域方向和待核证据。",
      "4. 望族分支：至少 3 条，围绕郡望、堂号、地域分支、宗族资料线索展开。",
      "5. 名人典故：至少 3 条，缺少确定人物时写可查证的人物资料方向，不编造具体事实。",
      "6. 家风家训：至少 2 条，缺少原文时写可查证的家风材料方向，不编造原文。",
      "7. 参考来源：列出已召回资料；如果没有资料，列出下一步最该补的资料类型。",
      "8. 审核风险：列出 3-5 条需要人工核对的争议点。",
      "整体要求：不要只输出“待补充”；每一项都要有可读内容；不确定内容必须写成“待核线索”或“建议查证方向”；不要做唯一源流定论。",
      "上下文：",
      contextText
    ].join("\n");
  }

  function addCorpusSource() {
    const surname = getCurrentSurname();
    const title = byId("sourceTitle").value.trim();
    const content = byId("sourceContent").value.trim();
    const type = byId("sourceType").value.trim() || "local";
    if (!title || !content) {
    byId("sourceStatus").textContent = "请先填写资料标题和摘录内容。";
    return;
    }
    markdownCorpus.unshift({
    id: `manual-${Date.now()}`,
    type,
    surname,
    title,
    content
    });
    reviewState.unshift(createReviewItem(surname, `${surname}姓新增资料：${title}`, "待审核", "文史编辑"));
    byId("sourceStatus").textContent = `已保存${surname}姓来源材料，可参与下一次 AI 初稿生成。`;
    byId("sourceTitle").value = "";
    byId("sourceContent").value = "";
    renderRepositoryStats();
    renderReviewQueue();
    persistWorkspace(`${surname}姓新增资料已保存。`);
  }

  async function callAiModel({ surname, contextItems }) {
    const data = surnames[surname] || surnames["陈"];
    const systemPrompt = byId("harnessSystemPrompt")?.value.trim() || "你是中华姓氏文化资料整理助手。只输出科普初稿，不做定论。必须区分多源流、民间传说、待核来源。";
    const messages = [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: buildAiDraftPrompt(data, contextItems)
    }
    ];
    const response = await fetch("/api/ai-draft", {
    method: "POST",
    headers: getAdminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      messages
    })
    });
    if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `AI 代理返回 ${response.status}`);
    }
    const payload = await response.json();
    return payload.payload?.choices?.[0]?.message?.content || "AI 已返回，但未解析到正文。";
  }

  async function loginUser(event) {
    event.preventDefault();
    const status = byId("loginStatus");
    if (status) status.textContent = "正在登录...";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: byId("loginUsername").value.trim(),
          password: byId("loginPassword").value
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `登录失败 ${response.status}`);
      if (status) status.textContent = "登录成功，正在进入后台。";
      location.href = "/admin";
    } catch (error) {
      if (status) status.textContent = `登录失败：${error.message}`;
    }
  }

  async function requireAdminSession() {
    const response = await fetch("/api/auth/me");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error(payload.error || "请先登录");
    }
    const currentUser = byId("currentUser");
    if (currentUser) currentUser.textContent = `${payload.user.displayName || payload.user.username} · ${payload.user.role}`;
    return payload.user;
  }

  async function logoutUser() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }

  async function loadHarnessConfig() {
    const status = byId("harnessConfigStatus");
    try {
      const response = await fetch("/api/harness-config", { headers: getAdminHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `读取失败 ${response.status}`);
      const config = payload.config || {};
      if (byId("harnessEndpoint")) byId("harnessEndpoint").value = config.endpoint || "";
      if (byId("harnessModel")) byId("harnessModel").value = config.model || "";
      if (byId("harnessSystemPrompt")) byId("harnessSystemPrompt").value = config.systemPrompt || "";
      if (byId("harnessTemperature")) byId("harnessTemperature").value = config.temperature ?? 0.3;
      if (byId("harnessRetrievalQuery")) byId("harnessRetrievalQuery").value = config.retrievalQuery || "";
      if (byId("retrievalQuery")) byId("retrievalQuery").value = config.retrievalQuery || byId("retrievalQuery").value;
      if (status) status.textContent = config.hasApiKey ? "Harness 配置已加载，API Key 已保存。留空不会覆盖。" : "Harness 配置已加载，尚未保存 API Key。";
    } catch (error) {
      if (status) status.textContent = `Harness 配置读取失败：${error.message}`;
    }
  }

  async function saveHarnessConfig() {
    const status = byId("harnessConfigStatus");
    if (status) status.textContent = "正在保存 Harness 配置...";
    try {
      const response = await fetch("/api/harness-config", {
        method: "PUT",
        headers: getAdminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          endpoint: byId("harnessEndpoint").value.trim(),
          model: byId("harnessModel").value.trim(),
          apiKey: byId("harnessApiKey").value.trim(),
          systemPrompt: byId("harnessSystemPrompt").value.trim(),
          temperature: Number(byId("harnessTemperature").value || 0.3),
          retrievalQuery: byId("harnessRetrievalQuery").value.trim(),
          sourceTypes: getSelectedSourceTypes()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `保存失败 ${response.status}`);
      byId("harnessApiKey").value = "";
      if (byId("retrievalQuery")) byId("retrievalQuery").value = payload.config?.retrievalQuery || byId("harnessRetrievalQuery").value.trim();
      if (status) status.textContent = "Harness 配置已保存。";
    } catch (error) {
      if (status) status.textContent = `Harness 配置保存失败：${error.message}`;
    }
  }

  function renderRepositoryStats() {
    if (!byId("repositoryStats")) return;
    const approved = reviewState.filter(item => item.status === "已发布").length;
    const pending = reviewState.length - approved;
    byId("repositoryStats").innerHTML = [
    [String(Object.keys(surnames).length), "样板姓氏"],
    [String(markdownCorpus.length), "Markdown 资料"],
    [String(pending), "待审核条目"],
    [String(approved), "已发布条目"]
    ].map(([value, label]) => (
    `<div class="status-tile"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`
    )).join("");
  }

  function renderReviewQueue() {
    if (!byId("reviewQueue")) return;
    byId("reviewQueue").innerHTML = reviewState.map(item => `
    <div class="review-item" data-review-row="${escapeHtml(item.title)}">
      <span class="tag">${escapeHtml(item.status)}</span>
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.surname)}姓 · ${escapeHtml(item.owner)}</small></div>
      <div class="review-actions">
      <button class="secondary" data-review="${escapeHtml(item.surname)}" type="button">查看</button>
      ${item.status === "已发布"
        ? `<button class="secondary" data-action="reject" data-review-id="${escapeHtml(item.id)}" type="button">退回补资料</button>`
        : `<button data-action="approve" data-review-id="${escapeHtml(item.id)}" type="button">发布到前台</button>
      <button class="secondary" data-action="reject" data-review-id="${escapeHtml(item.id)}" type="button">退回补资料</button>`}
      </div>
    </div>
    `).join("");
  }

  function renderFeedbackQueue() {
    const queue = byId("feedbackQueue");
    if (!queue) return;
    if (!feedbackState.length) {
    queue.innerHTML = `<div class="review-item"><span class="tag">暂无</span><div><strong>暂无纠错反馈</strong><small>用户提交后会出现在这里</small></div></div>`;
    return;
    }
    queue.innerHTML = feedbackState.map(item => `
    <div class="review-item" data-feedback-row="${escapeHtml(item.id)}">
      <span class="tag">${escapeHtml(item.status || "待处理")}</span>
      <div>
      <strong>${escapeHtml(item.surname || "未指定")}姓反馈</strong>
      <small>${escapeHtml(item.createdAt || "")}</small>
      ${item.contact ? `<small>联系方式：${escapeHtml(item.contact)}</small>` : ""}
      <p>${escapeHtml(item.content || "")}</p>
      </div>
      <div class="review-actions">
      <button class="secondary" data-feedback-action="处理中" data-feedback-id="${escapeHtml(item.id)}" type="button">处理中</button>
      <button data-feedback-action="已处理" data-feedback-id="${escapeHtml(item.id)}" type="button">已处理</button>
      <button class="secondary" data-feedback-action="已关闭" data-feedback-id="${escapeHtml(item.id)}" type="button">关闭</button>
      </div>
    </div>
    `).join("");
  }

  async function loadFeedbackQueue() {
    const queue = byId("feedbackQueue");
    if (queue) queue.innerHTML = `<div class="review-item"><span class="tag">加载中</span><div><strong>正在读取反馈</strong><small>连接服务端反馈队列</small></div></div>`;
    try {
    const response = await fetch("/api/feedback", { headers: getAdminHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `读取失败 ${response.status}`);
    feedbackState = payload.feedback || [];
    renderFeedbackQueue();
    } catch (error) {
    if (queue) queue.innerHTML = `<div class="review-item"><span class="tag">失败</span><div><strong>反馈读取失败</strong><small>${escapeHtml(error.message)}</small></div></div>`;
    }
  }

  async function updateFeedbackStatus(id, status) {
    try {
    const response = await fetch("/api/feedback", {
      method: "PATCH",
      headers: getAdminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, status })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `更新失败 ${response.status}`);
    const item = feedbackState.find(entry => entry.id === id);
    if (item) item.status = payload.feedback?.status || status;
    renderFeedbackQueue();
    } catch (error) {
    const queue = byId("feedbackQueue");
    if (queue) queue.insertAdjacentHTML("afterbegin", `<div class="review-item"><span class="tag">失败</span><div><strong>反馈状态更新失败</strong><small>${escapeHtml(error.message)}</small></div></div>`);
    }
  }

  function renderAuditTrail() {
    const trail = byId("auditTrail");
    if (!trail) return;
    if (!auditState.length) {
    trail.innerHTML = `<div class="review-item"><span class="tag">暂无</span><div><strong>暂无审计事件</strong><small>保存、反馈和 AI 操作后会出现在这里</small></div></div>`;
    return;
    }
    trail.innerHTML = auditState.map(item => `
    <div class="review-item">
      <span class="tag">${escapeHtml(item.event || "event")}</span>
      <div>
      <strong>${escapeHtml(item.path || "")}</strong>
      <small>${escapeHtml(item.at || "")}</small>
      ${item.requestId ? `<small class="audit-request-id">请求 ID：${escapeHtml(item.requestId)}</small>` : ""}
      <p>${escapeHtml(JSON.stringify(item.details || {}))}</p>
      </div>
    </div>
    `).join("");
  }

  async function loadAuditTrail() {
    const trail = byId("auditTrail");
    if (trail) trail.innerHTML = `<div class="review-item"><span class="tag">加载中</span><div><strong>正在读取审计事件</strong><small>连接服务端审计日志</small></div></div>`;
    try {
    const response = await fetch("/api/audit", { headers: getAdminHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `读取失败 ${response.status}`);
    auditState = payload.audit || [];
    renderAuditTrail();
    } catch (error) {
    if (trail) trail.innerHTML = `<div class="review-item"><span class="tag">失败</span><div><strong>审计读取失败</strong><small>${escapeHtml(error.message)}</small></div></div>`;
    }
  }

  async function verifyAdminAccess() {
    const status = byId("adminStatus");
    if (status) status.textContent = "正在验证管理令牌...";
    try {
    const response = await fetch("/api/audit", { headers: getAdminHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `验证失败 ${response.status}`);
    auditState = payload.audit || [];
    renderAuditTrail();
    await loadFeedbackQueue();
    if (status) status.textContent = "管理令牌可用，反馈工单与审计事件已刷新。";
    } catch (error) {
    if (status) status.textContent = `管理令牌验证失败：${error.message}`;
    }
  }

  function clearAdminAccess() {
    sessionStorage.removeItem("baijiaxing-admin-token");
    if (byId("adminToken")) byId("adminToken").value = "";
    feedbackState = [];
    auditState = [];
    renderFeedbackQueue();
    renderAuditTrail();
    const status = byId("adminStatus");
    if (status) status.textContent = "已清除当前浏览器会话中的管理令牌。";
  }

  function syncProfileEditor() {
    const name = getCurrentSurname();
    const data = surnames[name];
    if (!data || !byId("profileEditor")) return;
    byId("editTraditional").value = data.traditional || data.info?.["繁体"] || data.char || "";
    byId("editPinyin").value = data.pinyin || data.info?.["拼音"] || "";
    byId("editDynasty").value = data.dynasty || data.info?.["起源朝代"] || "";
    byId("editAncestor").value = data.ancestor || data.info?.["得姓始祖"] || "";
    byId("editJunwang").value = data.info?.["郡望"] || "";
    byId("editTanghao").value = data.info?.["堂号"] || "";
    byId("editSummary").value = data.summary || "";
    byId("profileEditStatus").textContent = `正在校订${name}姓档案。`;
  }

  function saveProfileEdits() {
    const name = getCurrentSurname();
    const data = surnames[name] || createPendingSurname(name);
    const traditional = byId("editTraditional").value.trim() || data.char;
    const pinyin = byId("editPinyin").value.trim() || "待补充";
    const dynasty = byId("editDynasty").value.trim() || "待考";
    const ancestor = byId("editAncestor").value.trim() || "待考";
    const junwang = byId("editJunwang").value.trim() || "待补充";
    const tanghao = byId("editTanghao").value.trim() || "待补充";
    const summary = byId("editSummary").value.trim();
    if (!summary) {
    byId("profileEditStatus").textContent = "请填写源流摘要。";
    return;
    }
    data.traditional = traditional;
    data.pinyin = pinyin;
    data.dynasty = dynasty;
    data.ancestor = ancestor;
    data.summary = summary;
    data.info = {
    ...data.info,
    "繁体": traditional,
    "拼音": pinyin,
    "起源朝代": dynasty,
    "得姓始祖": ancestor,
    "郡望": junwang,
    "堂号": tanghao
    };
    reviewState.unshift(createReviewItem(name, `${name}姓档案人工校订`, "待审核", "文史编辑"));
    renderSurname(name);
    renderRepositoryStats();
    renderReviewQueue();
    syncProfileEditor();
    persistWorkspace(`${name}姓档案校订已保存。`);
    byId("profileEditStatus").textContent = `${name}姓档案已保存，已送入审核发布队列。`;
  }

  function updateReviewStatus(id, status) {
    const item = reviewState.find(entry => entry.id === id);
    if (!item) return;
    item.status = normalizeReviewStatus(status);
    item.owner = item.status === "已发布" ? "已发布" : "待补充";
    renderRepositoryStats();
    renderReviewQueue();
    persistWorkspace(`审核状态已更新为${item.status}。`);
  }

  function renderMigrationMap(routeItems) {
    const nodes = routeItems || [];
    const points = nodes.map(item => `${item.x},${item.y}`).join(" ");
    return `
    <div class="migration-map" aria-label="迁徙路线可视化">
      <svg viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true">
      <path d="${points ? `M ${points.replaceAll(" ", " L ")}` : ""}"></path>
      </svg>
      ${nodes.map((item, index) => `
      <article class="route-node" data-route-node="${index + 1}" data-route-x="${escapeHtml(item.x)}" data-route-y="${escapeHtml(item.y)}">
        <strong>${escapeHtml(item.place)}</strong>
        <span>${escapeHtml(item.phase)}</span>
        <p>${escapeHtml(item.reason)}</p>
      </article>
      `).join("")}
    </div>`;
  }

  function routeAxisClass(axis, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `${axis}-0`;
    const rounded = Math.max(0, Math.min(100, Math.round(numeric / 5) * 5));
    return `${axis}-${rounded}`;
  }

  function positionRouteNodes() {
    document.querySelectorAll("[data-route-node]").forEach(node => {
      Array.from(node.classList).forEach(className => {
        if (/^route-[xy]-/.test(className)) node.classList.remove(className);
      });
      node.classList.add(
        routeAxisClass("route-x", node.dataset.routeX),
        routeAxisClass("route-y", node.dataset.routeY)
      );
    });
  }

  function resolveProfileReviewStatus(data, sourceCount) {
    if (reviewState.some(item => item.surname === data.char && item.status === "已发布")) return "已审核发布";
    if ((data.tags || []).some(tag => String(tag).includes("待收录"))) return "待收录";
    if (sourceCount > 0) return "来源待核";
    return "待补来源";
  }

  function renderSurname(name) {
    const data = surnames[name] || createPendingSurname(name);
    const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
    const reviewStatus = resolveProfileReviewStatus(data, sourceCount);
    setCurrentSurname(data.char);
    if (!byId("surnameInput") || !byId("profileTitle")) {
    syncProfileEditor();
    return;
    }
    byId("surnameInput").value = data.char;
    document.querySelector(".profile-head").dataset.surname = data.char;
    setSurnameLengthClass(document.querySelector(".profile-head"), data.char);
    setSurnameLengthClass(byId("surnameMark"), data.char);
    byId("surnameMark").textContent = data.char;
    byId("profileTitle").textContent = `${data.char}姓`;
    byId("profileMeta").innerHTML = [
      ["拼音", data.pinyin || data.info?.["拼音"] || "待补充", "profile-pinyin"],
      ["始祖", data.ancestor || data.info?.["得姓始祖"] || "待考", "profile-ancestor"],
      ["来源", `${sourceCount} 条`, "profile-source-count"],
      ["状态", reviewStatus, "profile-review-status"]
    ].map(([label, value, className]) => `<span class="meta-pill ${className}"><small>${escapeHtml(label)}</small>${escapeHtml(value)}</span>`).join("");
    byId("profileSummary").textContent = data.summary;
    byId("profileTags").innerHTML = data.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    byId("infoGrid").innerHTML = Object.entries(data.info).map(([key, value]) => (
    `<div class="info"><small>${escapeHtml(key)}</small><strong>${escapeHtml(value)}</strong></div>`
    )).join("");
    byId("tab-origin").innerHTML = `<div class="grid-2">${data.origins.map(item => `
    <article class="card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
      <span class="tag">${escapeHtml(item.level)}</span>
    </article>`).join("")}</div>`;
    byId("tab-migration").innerHTML = `${renderMigrationMap(data.route)}<div class="timeline">${data.migrations.map(([phase, text]) => `
    <div class="phase"><strong>${escapeHtml(phase)}</strong><span>${escapeHtml(text)}</span></div>`).join("")}</div>`;
    positionRouteNodes();
    byId("tab-branches").innerHTML = `<div class="grid-3">${data.branches.map(item => `
    <article class="card"><p>${escapeHtml(item)}</p></article>`).join("")}</div>`;
    byId("tab-visuals").innerHTML = `
    <div class="visual-grid">
      <div class="totem-box ${data.char.length > 1 ? "surname-long" : "surname-single"}" aria-label="${escapeHtml(data.char)}姓图腾占位">${escapeHtml(data.char)}</div>
      <article class="card">
      <h3>专属图腾与字形演变</h3>
      <p>${escapeHtml(data.visuals.totem)}</p>
      <p>${escapeHtml(data.visuals.glyph)}</p>
      <div class="glyph-row">
        ${data.visuals.stages.map((stage, index) => `
        <div class="glyph"><div><strong>${escapeHtml(stage)}</strong><span>阶段 ${index + 1}</span></div></div>
        `).join("")}
      </div>
      <p class="notice">MVP 先保留图腾/字形字段和占位视觉，后续接设计资产、字形资料或 AI 生成图。</p>
      </article>
    </div>`;
    byId("tab-sources").innerHTML = `<div class="source-list">${data.sources.map(item => `
    <div class="source"><strong>${escapeHtml(item)}</strong><p>展示前需由文史编辑补充摘录、卷目和可信等级。</p></div>`).join("")}</div>${Array.isArray(data.reviewRisks) && data.reviewRisks.length ? `
    <div class="source-list">${data.reviewRisks.map(item => `
    <div class="source"><strong>审核风险</strong><p>${escapeHtml(item)}</p></div>`).join("")}</div>` : ""}`;
    byId("cultureGrid").innerHTML = data.figures.map(item => `
    <article class="card">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.desc)}</p>
      <span class="tag">${escapeHtml(item.type)}</span>
    </article>`).join("");
    byId("actionStatus").textContent = "";
    if (byId("harnessResult")) byId("harnessResult").textContent = "";
    if (byId("aiDraft")) byId("aiDraft").textContent = "等待生成。默认先从本页资料库召回上下文。";
    syncProfileEditor();
  }

  function generateOfflineHarnessDraft(name) {
    const contextItems = retrieveMarkdownContext(name, byId("retrievalQuery").value, getSelectedSourceTypes());
    byId("aiDraft").textContent = buildOfflineDraft(name, contextItems);
    byId("harnessResult").textContent = `演示模式已召回 ${contextItems.length} 条 Markdown 上下文，生成${name}姓离线 AI 初稿。`;
    if (!reviewState.some(item => item.surname === name && item.title.includes("AI Harness"))) {
    reviewState.unshift(createReviewItem(name, `${name}姓 AI Harness 初稿`, "待审核", "文史编辑"));
    renderRepositoryStats();
    renderReviewQueue();
    persistWorkspace(`${name}姓 AI 初稿已保存到审核队列。`);
    }
  }

  function runDemoScenario() {
    const params = new URLSearchParams(location.search);
    if (params.get("demo") !== "pending") return;
    if (!byId("sourceTitle") || !byId("harness")) return;
    renderSurname("张");
    byId("sourceTitle").value = "张姓源流补充.md";
    byId("sourceType").value = "local";
    byId("sourceContent").value = "张姓资料补充：以地方志公开线索为上下文，需补充典籍来源、迁徙节点、郡望堂号和代表人物。";
    addCorpusSource();
    generateOfflineHarnessDraft("张");
    const draftItem = reviewState.find(item => item.surname === "张" && item.title.includes("AI Harness"));
    if (draftItem) updateReviewStatus(draftItem.id, "已发布");
    byId("sourceStatus").textContent = "演示模式：张姓待收录、资料入库、AI 初稿、审核发布已跑通。";
    document.querySelector("#harness").scrollIntoView({ behavior: "smooth" });
  }

  function setTab(name) {
    document.querySelectorAll(".module-tabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
    byId(`tab-${name}`).classList.add("active");
  }

  function setAppView(name) {
    if (!byId("opsView")) return;
    const next = name === "ops" ? "ops" : "public";
    byId("publicView").classList.toggle("hidden", next !== "public");
    byId("opsView").classList.toggle("hidden", next !== "ops");
    document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === next);
    });
    if (next === "ops") {
    syncProfileEditor();
    document.querySelector("#harness").scrollIntoView({ behavior: "smooth" });
    return;
    }
    document.querySelector("#profile").scrollIntoView({ behavior: "smooth" });
  }

  async function submitFeedback() {
    const text = byId("feedbackText").value.trim();
    const contact = byId("feedbackContact").value.trim();
    if (!text) {
    byId("feedbackResult").textContent = "请先填写需要反馈的内容。";
    return;
    }
    const surname = getCurrentSurname();
    try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surname, content: text, contact })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `提交失败 ${response.status}`);
    byId("feedbackResult").textContent = `已提交反馈工单 ${payload.feedback?.id || ""}，进入待处理队列。`;
    byId("feedbackText").value = "";
    byId("feedbackContact").value = "";
    loadFeedbackQueue();
    } catch (error) {
    byId("feedbackResult").textContent = `反馈提交失败：${error.message}`;
    }
  }

  async function generateHarnessDraft() {
    const name = byId("activeSurnameInput") ? switchAdminSurname() : getCurrentSurname();
    if (!name) {
      byId("harnessResult").textContent = "请先输入汉字姓氏，例如：徐。";
      return;
    }
    const contextItems = retrieveMarkdownContext(name, byId("retrievalQuery").value, getSelectedSourceTypes());
    byId("harnessResult").textContent = `已召回 ${contextItems.length} 条 Markdown 上下文，正在生成${name}姓初稿。`;
    if (byId("activeSurnameStatus")) byId("activeSurnameStatus").textContent = `${name}姓初稿生成中，可在下方查看输出。`;
    byId("aiDraft").textContent = "生成中...";
    try {
    const draft = await callAiModel({ surname: name, contextItems });
    byId("aiDraft").textContent = draft;
    applyAiDraftToProfile(name, draft);
    byId("harnessResult").textContent = `已通过服务端 AI 代理生成${name}姓 AI 初稿，进入待审核队列。`;
    if (byId("activeSurnameStatus")) byId("activeSurnameStatus").textContent = `${name}姓 AI 初稿已生成。`;
    if (!reviewState.some(item => item.surname === name && item.title.includes("AI Harness"))) {
      reviewState.unshift(createReviewItem(name, `${name}姓 AI Harness 初稿`, "待审核", "文史编辑"));
      renderRepositoryStats();
      renderReviewQueue();
      persistWorkspace(`${name}姓 AI 初稿已保存到审核队列。`);
    }
    } catch (error) {
    const offlineDraft = buildOfflineDraft(name, contextItems);
    byId("aiDraft").textContent = offlineDraft;
    applyAiDraftToProfile(name, offlineDraft);
    byId("harnessResult").textContent = `AI 接口调用失败，已回退到离线初稿：${error.message}`;
    if (byId("activeSurnameStatus")) byId("activeSurnameStatus").textContent = `${name}姓已生成离线初稿，请检查 Harness 配置。`;
    }
  }

  async function initializeWorkspace() {
    let serverReady = await hydrateWorkspaceFromServer();
    if (!serverReady) {
    try {
      await hydrateSeedWorkspace();
      serverReady = true;
    } catch {
      hydrateWorkspace();
    }
    }
    return serverReady;
  }

  async function initializeApp() {
    const serverReady = await initializeWorkspace();
    renderHotList();
    renderRepositoryStats();
    renderReviewQueue();
    renderSurname(surnames["陈"] ? "陈" : Object.keys(surnames)[0]);
    renderFeedbackQueue();
    renderAuditTrail();
    byId("dataReady").textContent = serverReady ? "JSON 持久化已连接" : "本地模式可用";
    runDemoScenario();
  }

  async function initializeAdminApp() {
    await requireAdminSession();
    const serverReady = await initializeWorkspace();
    renderRepositoryStats();
    renderReviewQueue();
    setCurrentSurname(surnames["陈"] ? "陈" : Object.keys(surnames)[0]);
    syncProfileEditor();
    renderFeedbackQueue();
    renderAuditTrail();
    if (byId("dataReady")) byId("dataReady").textContent = serverReady ? "JSON 持久化已连接" : "本地模式可用";
    await loadHarnessConfig();
  }

  function bindPublicEvents() {
  on("searchBtn", "click", () => {
    const value = resolveSurnameQuery(byId("surnameInput").value);
    renderSurname(value);
    document.querySelector("#profile").scrollIntoView({ behavior: "smooth" });
  });
  on("surnameInput", "keydown", event => {
    if (event.key === "Enter") byId("searchBtn").click();
  });
  on("hotList", "click", event => {
    const target = event.target.closest("[data-surname]");
    if (!target) return;
    renderSurname(target.dataset.surname);
    document.querySelector("#profile").scrollIntoView({ behavior: "smooth" });
  });
  on("moduleTabs", "click", event => {
    const target = event.target.closest("[data-tab]");
    if (!target) return;
    setTab(target.dataset.tab);
  });
  on("favoriteBtn", "click", () => {
    const name = getCurrentSurname();
    byId("actionStatus").textContent = `已收藏${name}姓档案样例。`;
  });
  on("shareBtn", "click", async () => {
    const name = getCurrentSurname();
    const url = `${location.href.split("#")[0]}#profile`;
    try {
    await navigator.clipboard.writeText(url);
    byId("actionStatus").textContent = `已复制${name}姓档案链接。`;
    } catch {
    byId("actionStatus").textContent = `${name}姓档案链接：${url}`;
    }
  });
  on("exportBtn", "click", () => {
    byId("actionStatus").textContent = "正在打开浏览器打印面板，可选择另存为 PDF。";
    window.print();
  });
  on("feedbackBtn", "click", submitFeedback);
  }

  function bindAdminEvents() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => setAppView(button.dataset.view));
  });
  on("logoutBtn", "click", logoutUser);
  on("saveHarnessConfigBtn", "click", saveHarnessConfig);
  on("switchSurnameBtn", "click", switchAdminSurname);
  on("activeSurnameInput", "keydown", event => {
    if (event.key === "Enter") switchAdminSurname();
  });
  on("quickHarnessBtn", "click", generateHarnessDraft);
  on("addSourceBtn", "click", addCorpusSource);
  on("batchSurnameBtn", "click", importSurnameBatch);
  on("saveProfileBtn", "click", saveProfileEdits);
  on("exportDataBtn", "click", exportWorkspace);
  on("copyDataBtn", "click", copyWorkspace);
  on("importDataBtn", "click", importWorkspace);
  on("resetDataBtn", "click", resetWorkspace);
  on("refreshFeedbackBtn", "click", loadFeedbackQueue);
  on("refreshAuditBtn", "click", loadAuditTrail);
  on("verifyAdminBtn", "click", verifyAdminAccess);
  on("clearAdminBtn", "click", clearAdminAccess);
  on("reviewQueue", "click", event => {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
    const nextStatus = actionTarget.dataset.action === "approve" ? "已发布" : "待补资料";
    updateReviewStatus(actionTarget.dataset.reviewId, nextStatus);
    return;
    }
    const target = event.target.closest("[data-review]");
    if (!target) return;
    if (byId("publicView")) renderSurname(target.dataset.review);
    else {
    setCurrentSurname(target.dataset.review);
    syncProfileEditor();
    }
    document.querySelector("#profileEditor").scrollIntoView({ behavior: "smooth" });
  });
  on("feedbackQueue", "click", event => {
    const target = event.target.closest("[data-feedback-action]");
    if (!target) return;
    updateFeedbackStatus(target.dataset.feedbackId, target.dataset.feedbackAction);
  });
  }

  if (byId("loginForm")) {
    on("loginForm", "submit", loginUser);
  } else if (byId("adminApp")) {
    bindAdminEvents();
    initializeAdminApp();
  } else {
    bindPublicEvents();
    initializeApp();
  }
