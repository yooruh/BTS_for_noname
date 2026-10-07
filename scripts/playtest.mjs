#!/usr/bin/env node

/**
 * 崩铁杀 连续游玩控制台（调试服务器 + 页面注入 + 无人值守）
 *
 * AI / 自动化用法（全程「子命令 + 参数」直用，绝不进交互菜单）：
 *   node scripts/playtest.mjs auto [ms] [--no-auto] [--no-open] [--char <id>] [--test] [--set k=v]... [--query k=v]...
 *       后台启动（detached）。ms=崩溃/卡死自动跳过毫秒（0=关闭，缺省 15000）；--no-auto=后台但不自动游玩
 *       （手动观测）；--no-open=不自动打开浏览器；--char=打开页后直启/每局直刷指定角色（bts_ch_xxx）；
 *       --test=打开测试台页；--set k=v=注入游戏配置（可多次）；--query k=v=附加任意 URL 参数（可多次）。
 *       已在运行且参数不一致 → 自动停止并按新参数重启；参数一致 → 沿用实例并打开页面（除非 --no-open）。
 *       打开时遵循「一页纪律」：先关闭同源旧调试页（`--keep` 保留）——多页同开会让多个游戏实例竞争写
 *       同一 IndexedDB，造成备份互覆 / 设置漂移。
 *   node scripts/playtest.mjs open [url] [--test] [--char <id>] [--no-auto] [--keep] [--restore fill|force] [--set k=v]... [--query k=v]...
 *       在 VS Code 内置浏览器打开调试页（未运行时自动以默认模式拉起）；url 可省略（默认首页）或相对路径。
 *   node scripts/playtest.mjs set k=v [...]      写入游戏配置（经服务器待注入队列下发；未运行则手动模式拉起；
 *        页面自取写库并重载——免 URL 长参数，集成浏览器同样可靠）
 *        ls. 前缀=写 localStorage（无名杀启动键，server 每次页面内联、免依赖 IDB）：
 *        set ls.directstart=true 等价「每次启动直入对局」（关闭启动页）；配 show_splash=off 双保险；
 *        空值撤销（如 ls.directstart=）
 *   node scripts/playtest.mjs apply-nncfg [file] [--dry] [--test] [--char <id>] [--set k=v]... [--query k=v]...
 *       批量注入配置：解码 nncfg（缺省 zip/style/nncfg/win11.0.nncfg）→ 每项生成 __bts_set → 打开注入页
 *       （页面写库并自动重载，脚本读 persist-log 核验）。--dry=只解码打印（不打开页面）；--test/--char 可
 *       让注入页顺手直启一局（测试台）。适用「整包设置」（全崩铁武将池 characters / 开发者模式 dev /
 *       界面样式等）；单键微调用 set（两者可叠加：--set 后写覆盖）。
 *   node scripts/playtest.mjs events [--tail N] [--type t1,t2] [--json] [--full]
 *       读取事件流尾部——AI 观测入口（默认最近 20 条；--type 过滤类型，逗号分隔；--json 机器可读；
 *       --full 不截断长字段）。只读、可在服务器未运行时使用。
 *   node scripts/playtest.mjs status [--json]   运行状态与统计（--json：机器可读，含服务器 env 摘要）
 *   node scripts/playtest.mjs stop              停止服务器
 *   node scripts/playtest.mjs restore [--force] 恢复配置数据（缺失自动补缺；--force 强制覆盖）
 *   node scripts/playtest.mjs seed              制作配置种子快照（灾难回退基准）
 *   node scripts/playtest.mjs clean [--dry] [--all]
 *       一键删除测试数据（对局事件流 / persist 日志 / 待注入记录 / 标签报告 / 旧残留）→ 统计与审计从零开始。
 *       永不触碰配置备份（persist.json / persist.prev.json / persist.shrunk-*.json / seeds/——防丢数据铁律）；
 *       pending.json 仅清空 sets（保留 ls 启动项）。--dry=只预览；--all=连同 archive/ 历史归档与
 *       data/_tmp_* 临时输出一并清除。服务器运行中亦可执行（文件即时重建；内存计数需重启归零）。
 *   node scripts/playtest.mjs engine [key|seed] [--force] [--from <key>]
 *       查看/切换「服务器版本（引擎）」：noname（缺省；端口 8931 / 数据目录 data/）或 noname - 新版
 *       （key=new，别名 新版；端口 8932 / 数据目录 data-new/）。端口即浏览器同源隔离：两版本的
 *       IndexedDB/localStorage 与服务器测试数据（persist 备份/事件流/日志/队列/seeds/归档）全部
 *       相互分离、可同时运行；各命令只面向「当前配置版本」（切换只影响之后启动的服务器）。
 *       可选列表由 dev-config.local.json 的 installed 派生；所选版本存其 playtest.engine（本机配置）。
 *       engine seed（--force 覆盖已有；--from 指定来源）手动把其它版本的配置备份播种到当前版本；
 *       首次启用某版本（数据目录无 persist.json）时 auto/open/restore 会自动播种（无播种时无备份
 *       可导、dev=false 卡 boot）。
 *   node scripts/playtest.mjs fg                前台启动（Ctrl+C 停止；关闭自动游玩、日志直出）
 *   node scripts/playtest.mjs                   交互菜单（仅人类；AI 勿无参调用，会等待输入）
 *
 * 页面 URL 参数（客户端消费；脚本经 --test/--char/--no-auto/--restore/--set/--query 自动拼装）：
 *   ?__bts_test=1        测试台：零自动干预（不自动开局/选将/托管/续局、不参与接管）；控制台
 *                        __BTS_PLAYTEST.test.state()/start(武将)/pick/setAuto/check 供 AI 直测。
 *   ?__bts_char=<id>     目标角色：test 模式=自动直启一局（等价 test.start）；auto 模式=每局自动点选
 *                        该角色（连续刷同一角色，配合无人值守可跨局循环）。
 *   ?__bts_noauto=1      页面级禁自动（即使服务器为无人值守）：本页面不启用 playtest 自动逻辑。
 *   ?__bts_restore=fill|force  配置恢复（补缺 / 覆盖）。
 *   ?__bts_set=k:v       写入游戏配置（可多个；值按 JSON 解析：true / 数字 / ["bts"] / "文本" 均合法，
 *                        非法 JSON 按原文字符串）→ 页面写库并自动重载。
 *
 * 「内置浏览器打开」原理：本仓库自带极小辅助扩展 _others/debug/helper-ext（注册 URI 处理器），
 * 脚本调起 vscode://bts-debug.playtest-helper/open?url=… → 扩展内执行 simpleBrowser.show。
 * （vscode://command 形式不存在，勿用；细节见 helper-ext/README.md 与《调试与自动化测试手册》§2.3。）
 *
 * 实现本体在 _others/debug/：server.mjs（静态服务 + 注入 + /__playtest/* 端点；服务器根与数据目录
 * 由本脚本按「服务器版本」传入）、playtest_client.js（页面侧状态机）、persist_client.js（页面侧备份/恢复/设置注入）。
 * 页面生命周期：open/auto 打开新页时，辅助扩展会先关闭「标题匹配调试页」的旧浏览器标签
 * （同名多开 = 多个游戏实例竞争写同一 IndexedDB；见《调试与自动化测试手册》§2.3）。AI 接管页面的推荐
 * 姿势：在浏览器工具中导航/打开目标 URL（复用一个已共享页面），而不是依赖脚本打开的未共享新页。
 * 本脚本只负责「拉起 / 停止 / 观察」；交互约定复用 scripts/lib/interactive.mjs（仅无参时的菜单）。
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, confirm, closeInteractive } from './lib/interactive.mjs';
import { installed } from './lib/dev-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);
const debugDir = resolve(__dirname, '..', '..', '_others', 'debug');
const serverFile = join(debugDir, 'server.mjs');
const helperSrcDir = join(debugDir, 'helper-ext');
const serverOverlayDir = join(debugDir, '..', '_tmp_overlay');
const nncfgDir = resolve(__dirname, '..', 'style', 'nncfg');
const nncfgDefaultFile = join(nncfgDir, 'win11.0.nncfg');
const HELPER_ID = 'bts-debug.playtest-helper';

// ---------- 服务器版本（引擎）配置 ----------
// 可选版本由本机配置 scripts/lib/dev-config.local.json 的 installed 派生：
// 安装路径形如 <引擎>/resources/app/extension/崩铁杀 → 服务器根 = <引擎>/resources/app。
// 所选版本存 playtest.engine（缺省 noname）；两版本测试数据目录相互分离（data / data-<key>）。
const engineConfigFile = join(__dirname, 'lib', 'dev-config.local.json');
const defaultEngineRoot = resolve(debugDir, '..', '..', '..', '..', 'noname', 'resources', 'app');
// 端口按版本分配（noname=8931；其余版本按列表序 8932 起）——端口即浏览器同源隔离：
// 两个版本的 IndexedDB/localStorage 与服务端数据目录均相互独立（实测教训：
// 同端口时新版引擎会向共享 DB 写入自身资源并重置配置，必须分端口）。
const PORT_BASE = 8931;

/** 引擎名 → 版本 key（noname | new | 其余按名字 slug） */
function engineKeyFromName(name) {
    if (name === 'noname') return 'noname';
    if (/新版/.test(name)) return 'new';
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'engine';
}

/** 列出可选服务器版本；installed 为空/不可解析时回退为单引擎（noname 默认根） */
function listEngines() {
    const out = [];
    const seenRoot = new Set();
    const usedKeys = new Set();
    for (const p of installed) {
        const norm = String(p).replace(/\\/g, '/');
        const m = norm.match(/^(.*)\/extension\/[^/]+$/);
        if (!m) continue;
        const root = resolve(m[1]);
        if (seenRoot.has(root.toLowerCase())) continue;
        seenRoot.add(root.toLowerCase());
        const parts = m[1].split('/');
        const name =
            /\/resources\/app$/.test(m[1]) && parts.length >= 3
                ? parts[parts.length - 3]
                : parts[parts.length - 1] || m[1];
        let key = engineKeyFromName(name);
        if (usedKeys.has(key)) {
            let i = 2;
            while (usedKeys.has(`${key}-${i}`)) i++;
            key = `${key}-${i}`;
        }
        usedKeys.add(key);
        out.push({ key, label: name, root });
    }
    if (!out.length) out.push({ key: 'noname', label: 'noname', root: defaultEngineRoot });
    out.sort((a, b) => {
        if (a.key === 'noname' && b.key !== 'noname') return -1;
        if (b.key === 'noname' && a.key !== 'noname') return 1;
        return a.label.localeCompare(b.label, 'zh');
    });
    out.forEach((e, i) => (e.port = PORT_BASE + i));
    return out;
}

const engines = listEngines();

/** 读取本机配置中所选版本 key（缺失/不可读返回 null） */
function readEngineSelection() {
    try {
        const j = JSON.parse(readFileSync(engineConfigFile, 'utf-8'));
        const k = j && j.playtest && j.playtest.engine;
        return typeof k === 'string' && k ? k : null;
    } catch {
        return null;
    }
}

/** 写入所选版本（保留 installed 等其余字段） */
function saveEngineSelection(key) {
    let obj = {};
    try {
        const j = JSON.parse(readFileSync(engineConfigFile, 'utf-8'));
        if (j && typeof j === 'object') obj = j;
    } catch {
        /* 新建 */
    }
    if (!obj.playtest || typeof obj.playtest !== 'object') obj.playtest = {};
    obj.playtest.engine = key;
    mkdirSync(dirname(engineConfigFile), { recursive: true });
    writeFileSync(engineConfigFile, JSON.stringify(obj, null, 2) + '\n');
}

/** 版本 key → 数据目录（测试数据按版本分离；noname 沿用既有 data/） */
const dataDirFor = (e) => join(debugDir, e.key === 'noname' ? 'data' : `data-${e.key}`);

/** 路径等同（Windows 大小写不敏感） */
const samePath = (a, b) => resolve(String(a)).toLowerCase() === resolve(String(b)).toLowerCase();

/** 按根目录找版本（找不到返回 null） */
const findEngineByRoot = (root) => engines.find((e) => samePath(e.root, root)) || null;

/** 解析用户输入 → 版本（支持 key / 全名 / 别名 新版=new；歧义或不命中返回 null） */
function matchEngine(query) {
    const q = String(query).trim().toLowerCase();
    if (!q) return null;
    const byKey = engines.find((e) => e.key.toLowerCase() === q);
    if (byKey) return byKey;
    const byLabel = engines.find((e) => e.label.toLowerCase() === q);
    if (byLabel) return byLabel;
    if (['new', '新版', 'noname-new', 'noname - 新版'].includes(q)) {
        const hit = engines.find((e) => e.key === 'new');
        if (hit) return hit;
    }
    const subs = engines.filter((e) => e.label.toLowerCase().includes(q) || e.key.includes(q));
    return subs.length === 1 ? subs[0] : null;
}

const currentEngine =
    engines.find((e) => e.key === readEngineSelection()) ||
    engines.find((e) => e.key === 'noname') ||
    engines[0];
const engineRoot = currentEngine.root;
const dataDir = dataDirFor(currentEngine);
const playtestLog = join(dataDir, 'playtest.jsonl');
const persistFile = join(dataDir, 'persist.json');
const persistLogFile = join(dataDir, 'persist-log.jsonl');
const seedDir = join(dataDir, 'seeds');
const seedFile = join(seedDir, 'persist.seed.json');

const PORT = currentEngine.port;
const URL_BASE = `http://127.0.0.1:${PORT}/`;
const DEFAULT_AUTOSKIP_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP GET（只取状态码；连接失败/超时返回 null） */
const get = (url, timeout = 1500) =>
    new Promise((done) => {
        const req = http.get(url, (res) => {
            res.resume();
            done(res.statusCode);
        });
        req.setTimeout(timeout, () => {
            req.destroy();
            done(null);
        });
        req.on('error', () => done(null));
    });

/** HTTP GET 并解析 JSON（失败返回 null） */
const getJson = (url, timeout = 2000) =>
    new Promise((done) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try {
                    done(JSON.parse(body));
                } catch {
                    done(null);
                }
            });
        });
        req.setTimeout(timeout, () => {
            req.destroy();
            done(null);
        });
        req.on('error', () => done(null));
    });

const isRunning = async () => (await get(URL_BASE)) !== null;

/** 统计 playtest.jsonl 尾部（256KB 窗口）中 boot 事件数（验证「浏览器是否真的打开了页面」）。
 *  只读尾部——此前全量读取，日志数 MB 时 openBrowser 轮询会反复全量扫描。 */
function countBoots() {
    try {
        const st = statSync(playtestLog);
        const start = Math.max(0, st.size - 256 * 1024);
        const fd = openSync(playtestLog, 'r');
        let txt;
        try {
            const buf = Buffer.alloc(st.size - start);
            readSync(fd, buf, 0, buf.length, start);
            txt = buf.toString('utf8');
        } finally {
            closeSync(fd);
        }
        let n = 0;
        let i = -1;
        while ((i = txt.indexOf('"type":"boot"', i + 1)) !== -1) n++;
        return n;
    } catch {
        return 0;
    }
}

/** 解析 VS Code 实际使用的扩展目录（多来源候选 + pylance 存在性探测器） */
function getExtensionsDir() {
    const candidates = [];
    // 1) 运行中实例的命令行 --extensions-dir
    try {
        const r = spawnSync(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                "(Get-CimInstance Win32_Process -Filter \"Name='Code.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)",
            ],
            { encoding: 'utf8', windowsHide: true },
        );
        const cl = (r.stdout || '').trim();
        const m = cl.match(/--extensions-dir(?:=|\s+)"?([^"]+?)"?(?:\s|$)/i);
        if (m && m[1]) candidates.push(m[1].trim());
    } catch {
        /* ignore */
    }
    // 2) VS Code 终端环境变量（实测最可靠：其值以 <extDir>\ 开头，如 d:\.vscode\extensions\ms-python.debugpy-...）
    try {
        const dp = process.env.VSCODE_DEBUGPY_ADAPTER_ENDPOINTS || '';
        const m = dp.match(/^(.*[\\/]extensions[\\/])/i);
        if (m && m[1]) candidates.push(m[1].replace(/[\\/]+$/, ''));
    } catch {
        /* ignore */
    }
    // 3) 显式环境变量
    if (process.env.VSCODE_EXTENSIONS) candidates.push(process.env.VSCODE_EXTENSIONS);
    // 4) HOME / USERPROFILE 下的 .vscode/extensions
    if (process.env.HOME) candidates.push(join(process.env.HOME, '.vscode', 'extensions'));
    candidates.push(join(homedir(), '.vscode', 'extensions'));
    // 选择：优先包含已知真实扩展（pylance）的目录；否则第一个存在的；否则 USERPROFILE 默认
    const hasPylance = (d) => {
        try {
            return readdirSync(d).some((n) => /^ms-python\.vscode-pylance-/.test(n));
        } catch {
            return false;
        }
    };
    const existing = candidates.filter((c) => c && existsSync(c));
    return existing.find(hasPylance) || existing[0] || join(homedir(), '.vscode', 'extensions');
}

/** 安装/核验/升级辅助扩展（把 helper-ext 复制为 <扩展目录>/bts-debug.playtest-helper-1.0.0）。
 *  内容比对——源文件与已装版本不一致时覆盖更新并提示重载窗口
 *  （此前只查 package.json 是否存在，辅助扩展升级后永不更新）。 */
function ensureHelper() {
    if (!existsSync(helperSrcDir)) {
        log.error(`缺少辅助扩展源码目录：${helperSrcDir}`);
        return { ok: false, reason: 'no-source' };
    }
    const extDir = getExtensionsDir();
    const dest = join(extDir, `${HELPER_ID}-1.0.0`);
    const files = ['package.json', 'extension.js', 'README.md'];
    const same = files.every((f) => {
        try {
            return readFileSync(join(helperSrcDir, f)).equals(readFileSync(join(dest, f)));
        } catch {
            return false;
        }
    });
    if (same) return { ok: true, dest, fresh: false };
    const upgrade = existsSync(join(dest, 'package.json'));
    try {
        mkdirSync(dest, { recursive: true });
        for (const f of files) {
            copyFileSync(join(helperSrcDir, f), join(dest, f));
        }
    } catch (e) {
        return { ok: false, reason: String((e && e.message) || e), dest };
    }
    return { ok: true, dest, fresh: true, upgrade };
}

/** 调起 vscode:// URI（Windows 下经协议处理器路由到运行中的 VS Code 实例） */
function fireVsCodeUri(uri) {
    if (process.platform !== 'win32') {
        log.warn('非 Windows 平台暂未适配 URI 调起，请手动在 VS Code 中打开。');
        return false;
    }
    const r = spawnSync(
        'powershell',
        ['-NoProfile', '-Command', `Start-Process '${uri.replace(/'/g, "''")}'`],
        { encoding: 'utf8', windowsHide: true },
    );
    if (r.status === 0) return true;
    log.warn('URI 调起失败：' + (((r.stderr || '').trim() || 'exit ' + r.status)));
    return false;
}

/** k=v → k:v（__bts_set 参数约定以首个冒号分隔；已含冒号的 k:v 原样保留） */
function normalizeSetArg(s) {
    const i = s.indexOf('=');
    return i === -1 ? s : `${s.slice(0, i)}:${s.slice(i + 1)}`;
}

/**
 * 组装调试页 URL（在 base 上合并 query；各选项可叠加）。
 * @param {{urlArg?: string, test?: boolean, char?: string, noAuto?: boolean,
 *          restore?: string, sets?: string[], queries?: string[]}} opts
 */
function buildPageUrl({
    urlArg = '',
    test = false,
    char = '',
    noAuto = false,
    restore = '',
    sets = [],
    queries = [],
} = {}) {
    let u;
    try {
        u = new URL(urlArg || URL_BASE, URL_BASE);
    } catch {
        u = new URL(URL_BASE);
    }
    if (test) u.searchParams.set('__bts_test', '1');
    if (char) u.searchParams.set('__bts_char', char);
    if (noAuto) u.searchParams.set('__bts_noauto', '1');
    if (restore) u.searchParams.set('__bts_restore', restore);
    for (const s of sets) u.searchParams.append('__bts_set', normalizeSetArg(s));
    for (const q of queries) {
        const i = q.indexOf('=');
        if (i > 0) u.searchParams.set(q.slice(0, i), q.slice(i + 1));
    }
    return u.toString();
}

/** 读取服务器信息（stats.data 的 env/root；旧版服务器缺字段时相应为 null） */
async function readServerInfo() {
    const stats = await getJson(URL_BASE + '__playtest/stats');
    const d = stats && stats.data;
    if (!d) return null;
    return { env: d.env ?? null, root: typeof d.root === 'string' && d.root ? d.root : null };
}

/** 探测除当前版本外仍在运行的版本实例（端口独立；供 status/engine 展示） */
async function probeOtherEngines() {
    const out = [];
    for (const e of engines) {
        if (e.port === PORT) continue;
        if ((await get(`http://127.0.0.1:${e.port}/`, 800)) !== null) out.push(e);
    }
    return out;
}

/**
 * 子命令参数解析（AI/自动化直用面）：
 * 支持 `--flag`、`--key value`、`--key=value`、`--set k=v`（多次）、`--query k=v`（多次）、
 * 数字位置参数（毫秒）、其余位置参数（如 url）。
 * @param {string[]} argv 子命令之后的参数
 */
/**
 * 子命令参数解析（AI/自动化直用面）：
 * 支持 `--flag`、`--key value`、`--key=value`、`--set k=v`（多次）、`--query k=v`（多次）、
 * 数字位置参数（毫秒）、其余位置参数（如 url）。
 * 需要值的选项缺参时立即返回 { error }（此前 `--set` 缺参会把 undefined 带下去，
 * 在 buildPageUrl 处以「Cannot read properties of undefined」崩溃，无法定位问题）。
 * @param {string[]} argv 子命令之后的参数
 */
function parseArgs(argv) {
    const flags = new Set();
    const values = {};
    const sets = [];
    const queries = [];
    const positional = [];
    let i = 0; // take() 与主循环共享的游标
    const take = (name, inline) => {
        const v = inline === null ? argv[++i] : inline;
        if (v === undefined || (typeof v === 'string' && v.startsWith('--'))) {
            return { error: `--${name} 缺少参数值` };
        }
        return { value: v };
    };
    for (i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (typeof a !== 'string') continue;
        if (a.startsWith('--')) {
            const body = a.slice(2);
            const eq = body.indexOf('=');
            const name = eq === -1 ? body : body.slice(0, eq);
            const inline = eq === -1 ? null : body.slice(eq + 1);
            if (name === 'set' || name === 'query') {
                const t = take(name, inline);
                if (t.error) return { error: t.error };
                (name === 'set' ? sets : queries).push(t.value);
                continue;
            }
            if (name === 'char' || name === 'restore' || name === 'file' || name === 'tail' || name === 'type' || name === 'from') {
                const t = take(name, inline);
                if (t.error) return { error: t.error };
                values[name] = t.value;
                continue;
            }
            flags.add(name);
            continue;
        }
        if (/^\d+$/.test(a) && values.ms === undefined) {
            values.ms = Number(a);
            continue;
        }
        positional.push(a);
    }
    return { flags, values, sets, queries, positional };
}

/** 读取辅助扩展的标签操作报告（旧版辅助扩展不产生该文件——静默跳过）。
 *  仅当报告时间戳 >= since（本次调起时间）才算数，避免读到上次操作留下的陈报告。 */
function reportHelperTabs(dumpFile, since) {
    try {
        if (!existsSync(dumpFile)) return;
        const rep = JSON.parse(readFileSync(dumpFile, 'utf-8'));
        if (!rep || typeof rep.ts !== 'number' || rep.ts < since) return;
        const closed = Array.isArray(rep.closed) ? rep.closed : [];
        if (closed.length) log.info(`已关闭旧调试页 ${closed.length} 个（${closed.join('、')}）——保持「一页纪律」。`);
    } catch {
        /* 报告不可读不影响打开结果 */
    }
}

/**
 * 在 VS Code 内置浏览器打开页面（含辅助扩展安装/升级与结果核验）。
 * 核验：轮询 boot 计数（页面已加载并起 playtest 客户端）与 stats.pageLoads（新服务器）。
 * 标签治理：默认先关闭「标题匹配调试页」的旧浏览器标签（一页纪律；keep=true 保留）。
 */
async function openBrowser(url, { waitMs = 15000, keep = false } = {}) {
    if (!(await isRunning())) {
        log.warn('服务器未运行——先执行「无人值守启动」。');
        return false;
    }
    const helper = ensureHelper();
    if (!helper.ok) {
        log.error('辅助扩展不可用：' + (helper.reason || '未知原因'));
        console.log(`  可手动打开：${url}`);
        return false;
    }
    if (helper.fresh) {
        log.warn(`辅助扩展已${helper.upgrade ? '升级' : '安装'} → ${helper.dest}`);
        log.warn('请执行一次「开发人员: 重新加载窗口」（Ctrl+R）后重试（一次性操作）；本轮不再等待。');
        console.log(`  也可先手动打开：${url}`);
        return false;
    }
    const bootsBefore = countBoots();
    const stats0 = await getJson(URL_BASE + '__playtest/stats');
    const loads0 =
        stats0 && stats0.data && typeof stats0.data.pageLoads === 'number' ? stats0.data.pageLoads : null;
    const dumpFile = join(dataDir, 'helper-tabs.json');
    const uri =
        `vscode://${HELPER_ID}/open?url=${encodeURIComponent(url)}` +
        `&dump=${encodeURIComponent(dumpFile)}` +
        (keep ? '' : `&closeLabelRe=${encodeURIComponent('无名杀|崩铁杀')}`);
    log.info('调起 VS Code：' + uri);
    const t0 = Date.now();
    fireVsCodeUri(uri);
    while (Date.now() - t0 < waitMs) {
        await sleep(1000);
        if (countBoots() > bootsBefore) {
            log.ok(`已在 VS Code 内置浏览器打开：${url}`);
            reportHelperTabs(dumpFile, t0);
            return true;
        }
        if (loads0 !== null) {
            const stats = await getJson(URL_BASE + '__playtest/stats');
            const loads = stats && stats.data && stats.data.pageLoads;
            if (typeof loads === 'number' && loads > loads0) {
                log.ok(`已在 VS Code 内置浏览器打开：${url}`);
                reportHelperTabs(dumpFile, t0);
                return true;
            }
        }
    }
    log.warn('未检测到新页面加载。可能原因：');
    console.log('  1) 辅助扩展刚安装/升级 → 需重载一次 VS Code 窗口（Ctrl+R）后重试；');
    console.log('  2) VS Code 未运行或 URI 被安全软件拦截；');
    console.log('  3) 该页面此前已打开 → VS Code 可能聚焦旧标签而未重新加载（用 events / 浏览器工具查看即可）；');
    console.log(`  4) 手动兜底：在内置浏览器（或任意浏览器）打开 ${url}`);
    return false;
}

/** 恢复配置数据：确保服务器有备份（缺失则用种子回填）→ 打开页面触发补缺/强制恢复，并核验结果 */
async function restoreConfig({ force = false } = {}) {
    if (!(await isRunning())) {
        log.warn('服务器未运行——先执行「无人值守启动」。');
        return false;
    }
    ensureEngineSeed(); // 首次启用/备份丢失：先从其它版本播种（播种后即有「备份可导」）
    if (!existsSync(persistFile)) {
        if (existsSync(seedFile)) {
            mkdirSync(dataDir, { recursive: true });
            copyFileSync(seedFile, persistFile);
            log.ok('服务端无备份 → 已用种子快照回填 persist.json');
        } else {
            log.error('服务端无备份且无种子快照，无法恢复（可先在健康状态执行 seed）。');
            return false;
        }
    }
    const st = statSync(persistFile);
    log.info(`服务端备份：${(st.size / 1024).toFixed(1)} KB（${persistFile}）`);
    const logBefore = existsSync(persistLogFile) ? readFileSync(persistLogFile, 'utf-8').length : 0;
    const url = URL_BASE + (force ? '?__bts_restore=force' : '?__bts_restore=fill');
    const opened = await openBrowser(url);
    if (!opened) return false;
    const t0 = Date.now();
    let seen = false;
    while (Date.now() - t0 < 30000) {
        await sleep(1500);
        try {
            if (!existsSync(persistLogFile)) continue;
            const txt = readFileSync(persistLogFile, 'utf-8');
            if (txt.length <= logBefore) continue;
            const fresh = txt.slice(logBefore).trim().split(/\r?\n/).slice(-8);
            if (fresh.some((l) => /补缺|恢复|暂无|异常|库尚未/.test(l))) {
                console.log('  页面侧恢复日志：');
                for (const l of fresh) {
                    try {
                        console.log('   · ' + JSON.parse(l).msg);
                    } catch {
                        console.log('   · ' + l);
                    }
                }
                seen = true;
                break;
            }
        } catch {
            /* ignore */
        }
    }
    if (seen) {
        log.ok('恢复流程已执行（结论见上方页面侧日志）。');
    } else {
        log.warn('未在 30 秒内读到页面侧恢复日志（页面未加载或扩展未激活；可重试 restore 或先 open）。');
    }
    return seen;
}

/** 把当前服务端备份固定为「种子快照」（灾难回退的最终基准） */
function snapshotSeed() {
    if (!existsSync(persistFile)) {
        log.error('服务端没有备份文件（persist.json）——先让页面运行一阵完成首次备份。');
        return;
    }
    mkdirSync(seedDir, { recursive: true });
    copyFileSync(persistFile, seedFile);
    const st = statSync(seedFile);
    writeFileSync(
        join(seedDir, 'persist.seed.meta.json'),
        JSON.stringify({ ts: new Date().toISOString(), bytes: st.size, source: persistFile }, null, 2) + '\n',
    );
    log.ok(`种子快照已更新：${seedFile}（${(st.size / 1024).toFixed(1)} KB）`);
    console.log('  用途：服务端备份丢失时，restore 会自动用它回填（含 dev/武将池/扩展/速度等关键配置）。');
}

/**
 * 配置播种（修复「新版首次打开无法自动导入配置」）：
 * noname 有长年备份可导，而新版本数据目录（data-<key>）为空 → 页面「服务器端没有备份文件」
 * → 空容器永远导入不了配置（dev=false 卡 boot）。首次启用时自动从「其它版本」播种一份
 * 配置级备份（非录像；仅 persist.json，与「测试数据按版本分离」原则一致），此后各版本独立演进。
 */
function seedEngineConfig(target, { candidates = null } = {}) {
    const dstFile = join(dataDirFor(target), 'persist.json');
    const list = candidates || defaultSeedCandidates(target);
    for (const src of list) {
        if (!existsSync(src)) continue;
        try {
            let raw = readFileSync(src, 'utf-8');
            let stripped = false;
            // 配置级原则：源若带 video 录像（如旧种子快照），播种前剔除
            if (raw.length <= 8 * 1024 * 1024 && raw.includes('"video":')) {
                try {
                    const obj = JSON.parse(raw);
                    const db = obj && obj.dbs && obj.dbs['noname_0.9_data'];
                    if (db && db.stores && db.stores.video) {
                        delete db.stores.video;
                        raw = JSON.stringify(obj);
                        stripped = true;
                    }
                } catch {
                    /* 解析失败则原样复制 */
                }
            }
            mkdirSync(dirname(dstFile), { recursive: true });
            writeFileSync(dstFile, raw);
            const rel = (p) => p.replace(debugDir, '').replace(/^[\\/]+/, '');
            log.ok(
                `已播种配置备份：${rel(src)} → ${rel(dstFile)}（${(raw.length / 1024).toFixed(1)} KB${stripped ? '，已剔除录像' : ''}）`,
            );
            return { ok: true, from: src, bytes: raw.length, stripped };
        } catch (e) {
            log.warn(`播种失败（${src}）：${(e && e.message) || e}`);
        }
    }
    return { ok: false };
}

/** 播种来源优先级：本版本 seeds（仅 noname）→ 其它版本 persist.json（noname 优先）→ 本版本 seeds → 其它版本 seeds */
function defaultSeedCandidates(target) {
    const others = engines.filter((e) => e.key !== target.key);
    const ordered = [others.find((e) => e.key === 'noname'), ...others].filter(Boolean);
    const list = [];
    if (target.key === 'noname') list.push(join(dataDirFor(target), 'seeds', 'persist.seed.json'));
    for (const e of ordered) list.push(join(dataDirFor(e), 'persist.json'));
    if (target.key !== 'noname') list.push(join(dataDirFor(target), 'seeds', 'persist.seed.json'));
    for (const e of ordered) list.push(join(dataDirFor(e), 'seeds', 'persist.seed.json'));
    return list;
}

/** 首次启用（开页前调用）：数据目录无配置备份时自动播种；返回结果 / null（已有或无可播种来源） */
function ensureEngineSeed(target = currentEngine) {
    const dstFile = join(dataDirFor(target), 'persist.json');
    if (existsSync(dstFile)) return null;
    log.info(`「${target.label}」首次启用且尚无配置备份 → 自动播种（首次导入配置）…`);
    const r = seedEngineConfig(target);
    if (!r.ok) {
        log.warn('未找到可播种来源——首次打开将以默认配置运行（可 apply-nncfg / set 注入，或 engine seed 手动播种）。');
        return null;
    }
    return r;
}

/** engine seed：手动把其它版本（或 --from 指定版本）的配置备份播种到当前版本 */
async function seedForCurrentEngine(opts = {}) {
    const force = !!(opts.flags && opts.flags.has && opts.flags.has('force'));
    const fromQuery = opts.values && opts.values.from;
    if (existsSync(persistFile) && !force) {
        log.info(`「${currentEngine.label}」已有配置备份（${persistFile}）——用其它版本覆盖请加 --force。`);
        return;
    }
    let candidates = null;
    if (fromQuery) {
        const src = matchEngine(fromQuery);
        if (!src) {
            log.error(`未知来源版本：「${fromQuery}」（可选：${engines.map((e) => e.key).join(' / ')}）`);
            process.exitCode = 1;
            return;
        }
        if (src.key === currentEngine.key) {
            log.error('来源版本与当前版本相同——engine seed 是把「其它版本」的配置播种到当前版本。');
            process.exitCode = 1;
            return;
        }
        candidates = [join(dataDirFor(src), 'persist.json'), join(dataDirFor(src), 'seeds', 'persist.seed.json')];
    }
    const r = seedEngineConfig(currentEngine, { candidates });
    if (!r.ok) {
        log.error('未找到可用的播种来源（来源版本尚无 persist.json / seeds 快照）。');
        process.exitCode = 1;
        return;
    }
    console.log('  页面已打开时：刷新一次即按新备份补缺导入（仅补缺失键）。');
}

function ensureServerFile() {
    if (existsSync(serverFile)) return true;
    log.error(`未找到调试服务器：${serverFile}`);
    return false;
}

/** 按端口停止调试服务器（等价 stop-debug-server.cmd，跨 shell 安全） */
function stopServer(port = PORT) {
    if (process.platform !== 'win32') {
        log.warn('停止逻辑目前仅实现 Windows（按端口杀进程）；请手动结束 server.mjs。');
        return;
    }
    const ps =
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
        'Select-Object -ExpandProperty OwningProcess -Unique | ' +
        'ForEach-Object { Stop-Process -Id $_ -Force; "killed PID $_" }';
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
        encoding: 'utf8',
        windowsHide: true,
    });
    const out = (r.stdout || '').trim();
    if (out) log.ok(`已停止（端口 ${port}）：` + out.split(/\r?\n/).join('；'));
    else log.info(`端口 ${port} 未在运行。`);
}

/** 停止全部版本的调试服务器（各版本端口独立） */
function stopAllServers() {
    for (const e of engines) stopServer(e.port);
}

/**
 * 后台启动（detached；CLI/AI 与交互菜单共用）。
 * @param {{autoskipMs?: number, off?: boolean, allowRestart?: boolean, openUrl?: string|false, keep?: boolean}} opts
 *   - off=true：后台「手动模式」（注入 BTS_PLAYTEST_OFF，页面不自动游玩）；默认无人值守。
 *   - allowRestart=true：已在运行且需要变化时，询问后再重启（交互菜单用）。
 *     否则（CLI 直用）参数不一致 → 自动停止并按新参数重启；一致 → 沿用实例（并打开页面）。
 *   - openUrl：启动后打开的页面 URL；undefined=默认首页；''/false=不打开。
 *   - keep=true：打开页面时不关闭旧调试页（默认关闭，遵循「一页纪律」）。
 */
async function startDetached({
    autoskipMs = DEFAULT_AUTOSKIP_MS,
    off = false,
    allowRestart = false,
    openUrl,
    keep = false,
} = {}) {
    if (!ensureServerFile()) process.exit(1);
    if (!existsSync(join(engineRoot, 'index.html'))) {
        log.error(`所选服务器版本根目录无效（缺 index.html）：${engineRoot}`);
        console.log(`  当前配置：${currentEngine.key}；用 engine 命令切换，或检查 dev-config.local.json 的 installed。`);
        process.exit(1);
    }
    ensureEngineSeed(); // 首次启用新版本：先播种配置备份再拉起/打开（否则空目录无备份可导）
    let reuse = false; // 沿用现有实例（不重启）；沿用也继续走「打开页面」而非直接 return
    if (await isRunning()) {
        log.warn(`服务器已在运行（${URL_BASE}）。`);
        const info = await readServerInfo();
        const env = info ? info.env : null;
        let needRestart = false;
        if (allowRestart) {
            needRestart = await confirm('是否停止后按新参数重启？', { defaultYes: false });
            if (!needRestart) {
                log.info('沿用现有实例（其配置由首次启动时决定）。');
                reuse = true;
            }
        } else {
            const curOff = env ? !!env.off : null;
            const curSkip = env ? env.autoskip || '' : null;
            const wantSkip = off || !autoskipMs ? '' : String(autoskipMs);
            needRestart = !(env !== null && curOff === !!off && String(curSkip) === wantSkip);
            if (!needRestart) {
                log.info('沿用现有实例（参数一致）。');
                reuse = true;
            } else {
                log.warn(
                    `现有实例与请求不一致（现：${env === null ? '旧版无法探测' : curOff ? '手动模式' : `自动模式/${curSkip || '无跳过'}`}）→ 自动停止并重启。`,
                );
            }
        }
        if (!reuse) {
            stopServer();
            for (let i = 0; i < 10 && (await isRunning()); i++) await sleep(300);
            if (await isRunning()) {
                log.error(`停止失败：端口 ${PORT} 仍被占用。`);
                process.exit(1);
            }
        }
    }
    if (!reuse) {
        const child = spawn(process.execPath, ['server.mjs', engineRoot, String(PORT), serverOverlayDir, dataDir], {
            cwd: debugDir,
            detached: true,
            stdio: 'ignore',
            env: (() => {
                const env = { ...process.env };
                if (off) {
                    env.BTS_PLAYTEST_OFF = '1';
                    delete env.BTS_PLAYTEST;
                    delete env.BTS_AUTOSKIP_MS;
                } else {
                    env.BTS_PLAYTEST = '1'; // 无人值守优先：勿让残留的关闭开关赢过开启
                    delete env.BTS_PLAYTEST_OFF;
                    if (autoskipMs) env.BTS_AUTOSKIP_MS = String(autoskipMs);
                    else delete env.BTS_AUTOSKIP_MS;
                }
                return env;
            })(),
        });
        child.unref();
        let ready = false;
        for (let i = 0; i < 20; i++) {
            await sleep(400);
            if (await isRunning()) {
                ready = true;
                break;
            }
        }
        if (!ready) {
            log.error('启动后 8s 内未就绪；请用「前台启动」排查：npm run playtest -- fg');
            process.exit(1);
        }
        log.ok(`已在后台启动（${off ? '手动模式：不自动游玩' : '无人值守'}）：`);
        console.log(`  地址：${URL_BASE}`);
        console.log(`  版本：${currentEngine.label}（端口 ${PORT}；数据目录：${dataDir}）`);
        console.log(
            off
                ? '  配置：playtest=关闭自动游玩（页面刷新后仅手动/直测）'
                : `  配置：playtest=自动启用；崩溃/卡死自动跳过=${autoskipMs ? autoskipMs + 'ms' : '关闭（崩溃即停）'}`,
        );
        console.log('  停止：npm run playtest -- stop（或菜单选「停止服务器」）');
    }
    // 打开页面（沿用实例时同样执行——此前沿用时静默返回、不打开页面，auto --char 形同虚设）
    const finalOpenUrl = openUrl === undefined ? URL_BASE : openUrl;
    if (finalOpenUrl) await openBrowser(finalOpenUrl, { keep });
}

/**
 * 前台启动：日志直接输出到本终端（Ctrl+C 停止）。
 * 注入「关闭自动游玩」开关（BTS_PLAYTEST_OFF=1）：页面刷新后仅手动操作，不再自动开新局。
 * @param {{allowRestart?: boolean}} opts allowRestart=true 时，若服务器已在运行会询问「停止后以前台模式重启」
 */
async function startForeground({ allowRestart = false } = {}) {
    if (!ensureServerFile()) process.exit(1);
    if (!existsSync(join(engineRoot, 'index.html'))) {
        log.error(`所选服务器版本根目录无效（缺 index.html）：${engineRoot}`);
        console.log(`  当前配置：${currentEngine.key}；用 engine 命令切换，或检查 dev-config.local.json 的 installed。`);
        process.exit(1);
    }
    if (await isRunning()) {
        log.warn(`服务器已在运行（${URL_BASE}）。`);
        if (allowRestart) {
            if (!(await confirm('是否停止并以前台模式（关闭自动游玩）重启？', { defaultYes: true }))) {
                log.info('已取消（沿用现有实例）。');
                return;
            }
        } else {
            log.info('CLI 前台模式需独占端口：先停止现有实例…');
        }
        stopServer();
        for (let i = 0; i < 10 && (await isRunning()); i++) await sleep(300);
        if (await isRunning()) {
            log.error(`停止失败：端口 ${PORT} 仍被占用。`);
            process.exit(1);
        }
    }
    log.info(
        '前台启动（Ctrl+C 停止）：已注入「关闭自动游玩」（页面刷新后生效）；需要自动游玩请用「无人值守启动」。',
    );
    console.log(`  版本：${currentEngine.label}（端口 ${PORT}；数据目录：${dataDir}）`);
    const env = { ...process.env, BTS_PLAYTEST_OFF: '1' };
    delete env.BTS_PLAYTEST;
    delete env.BTS_AUTOSKIP_MS;
    const child = spawn(process.execPath, ['server.mjs', engineRoot, String(PORT), serverOverlayDir, dataDir], {
        cwd: debugDir,
        stdio: 'inherit',
        env,
    });
    child.on('exit', (code) => process.exit(code ?? 0));
}

/** 查看运行状态与统计；json=true 时输出机器可读 JSON（AI 解析用） */
async function showStatus({ json = false } = {}) {
    const running = await isRunning();
    const stats = running ? await getJson(URL_BASE + '__playtest/stats') : null;
    const d = stats && stats.data;
    const others = await probeOtherEngines();
    const fileInfo = (f) => {
        try {
            if (!existsSync(f)) return null;
            const st = statSync(f);
            return { path: f, bytes: st.size, mtime: st.mtime.toISOString() };
        } catch {
            return null;
        }
    };
    const logInfo = fileInfo(playtestLog);
    const pLogInfo = fileInfo(persistLogFile);
    if (json) {
        console.log(
            JSON.stringify(
                {
                    running,
                    url: URL_BASE,
                    engine: { key: currentEngine.key, label: currentEngine.label, root: engineRoot, dataDir, port: PORT },
                    runningEngine:
                        d && typeof d.root === 'string' && d.root
                            ? {
                                  root: d.root,
                                  label: (findEngineByRoot(d.root) || {}).label ?? null,
                                  match: samePath(d.root, engineRoot),
                              }
                            : null,
                    othersRunning: others.map((e) => ({ key: e.key, label: e.label, port: e.port })),
                    env: d ? (d.env ?? null) : null,
                    stats: d ?? null,
                    playtestLog: logInfo,
                    persistLog: pLogInfo,
                },
                null,
                2,
            ),
        );
        return;
    }
    if (!running) {
        log.info(
            `服务器未运行（${URL_BASE}）——用「无人值守启动」拉起（node scripts/playtest.mjs auto）。`,
        );
        console.log(`  配置服务器版本：${currentEngine.label}（端口 ${PORT}；数据目录：${dataDir}）`);
        if (others.length)
            console.log(`  其他版本实例：${others.map((e) => `${e.label}（${e.port}，运行中）`).join('、')}`);
        return;
    }
    log.ok(`服务器运行中：${URL_BASE}`);
    console.log(`  服务器版本：${currentEngine.label}（端口 ${PORT}；数据目录：${dataDir}）`);
    if (others.length)
        console.log(`  其他版本实例：${others.map((e) => `${e.label}（${e.port}，运行中）`).join('、')}`);
    if (d && typeof d.root === 'string' && d.root) {
        const same = samePath(d.root, engineRoot);
        const from = findEngineByRoot(d.root);
        console.log(
            `  运行实例：${from ? from.label : d.root}${same ? '（与配置一致）' : '（与配置不一致——auto/fg/open/set 会自动切换，或先 stop）'}`,
        );
    }
    if (d && d.env) {
        console.log(
            `  服务器模式：${d.env.off ? '手动（不自动游玩）' : '无人值守'}；自动跳过=${d.env.autoskip || '关闭'}`,
        );
    }
    if (d) {
        const loads = typeof d.pageLoads === 'number' ? d.pageLoads : '—';
        console.log(
            `  计数（本服务器实例累计）：页面加载 ${loads}；对局开始 ${d.gameStart} / 结束 ${d.gameEnd} / clean ${d.cleanEnd}；错误 ${d.errors} / 挂起 ${d.pauses}（entries ${d.entries}）`,
        );
    } else {
        log.warn('未取到 /__playtest/stats（页面尚未打开或服务器版本过旧）。');
    }
    if (logInfo) {
        console.log(`  落盘日志：${logInfo.path}`);
        console.log(
            `  （${(logInfo.bytes / 1024).toFixed(1)} KB，更新于 ${logInfo.mtime}；完整汇总：node _others/debug/log-audit.mjs）`,
        );
    }
    if (pLogInfo) {
        const rel = pLogInfo.path.slice(debugDir.length).replace(/^[\\/]+/, '');
        console.log(`  持久化日志：${rel}（${(pLogInfo.bytes / 1024).toFixed(1)} KB；页面侧备份/恢复 trace）`);
    }
}

/**
 * 事件瘦身（events --json 默认输出用）：截断超长字段（gameLogTail），--full 原样返回。
 */
function slimEvent(e, full) {
    if (full) return e;
    const out = { ...e };
    if (Array.isArray(out.gameLogTail) && out.gameLogTail.length > 5) {
        out.gameLogTail = out.gameLogTail
            .slice(-5)
            .concat([`…（共 ${e.gameLogTail.length} 行，--full 查看全文）`]);
    }
    return out;
}

/**
 * events 子命令：读取事件流尾部（AI 观测入口——「最近发生了什么」）。
 * node scripts/playtest.mjs events [--tail N] [--type t1,t2] [--json] [--full]
 *   默认最近 20 条；--type 过滤事件类型（逗号分隔）；--json 机器可读；--full 不截断长字段。
 * 只读；服务器未运行时也可用（直接读 data/playtest.jsonl）。
 */
async function showEvents(opts) {
    const tail = opts.values.tail === undefined ? 20 : Number(opts.values.tail);
    if (!Number.isInteger(tail) || tail < 1 || tail > 2000) {
        log.error('--tail 需为 1~2000 的整数（收到：' + opts.values.tail + '）');
        process.exitCode = 1;
        return;
    }
    const types = opts.values.type
        ? String(opts.values.type)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : null;
    if (!existsSync(playtestLog)) {
        log.warn(`暂无事件流（${playtestLog} 不存在）——先启动调试服务器并打开页面。`);
        return;
    }
    const full = opts.flags.has('full');
    // 尾部块读（避免大文件全量读）：1MB 块从后往前拼行，收集到足够行数即止
    const st = statSync(playtestLog);
    const CHUNK = 1024 * 1024;
    const wantLines = Math.max(tail * 4 + 100, 300);
    let lines = [];
    let pos = st.size;
    let carry = '';
    while (pos > 0 && lines.length < wantLines) {
        const start = Math.max(0, pos - CHUNK);
        const fd = openSync(playtestLog, 'r');
        let text;
        try {
            const buf = Buffer.alloc(pos - start);
            readSync(fd, buf, 0, buf.length, start);
            text = buf.toString('utf8');
        } finally {
            closeSync(fd);
        }
        pos = start;
        const parts = (text + carry).split(/\r?\n/);
        carry = pos > 0 ? parts.shift() : '';
        lines = parts.concat(lines);
    }
    if (carry) lines.unshift(carry);
    const picked = [];
    for (let i = lines.length - 1; i >= 0 && picked.length < tail; i--) {
        const l = lines[i].trim();
        if (!l) continue;
        let e = null;
        try {
            e = JSON.parse(l);
        } catch {
            continue;
        }
        if (types && !types.includes(e.type)) continue;
        picked.push(e);
    }
    picked.reverse();
    if (opts.flags.has('json')) {
        console.log(
            JSON.stringify({ tail, types, count: picked.length, events: picked.map((e) => slimEvent(e, full)) }, null, 2),
        );
        return;
    }
    if (!picked.length) {
        log.info(types ? `尾部未找到类型为 ${types.join('/')} 的事件。` : '事件流为空。');
        return;
    }
    for (const e of picked) {
        const t = e.t ? new Date(e.t + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(5, 19) : '-';
        const brief = Object.entries(e)
            .filter(([k, v]) => k !== 't' && k !== 'type' && v !== null && v !== undefined && ['string', 'number', 'boolean'].includes(typeof v))
            .slice(0, 8)
            .map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v}`)
            .join('  ');
        console.log(`[${t}] ${e.type}  ${brief}`);
    }
    console.log(`（共 ${picked.length} 条；完整事件流：${playtestLog}）`);
}

/**
 * clean 子命令：一键删除测试运行数据（对局事件流 / persist 日志 / 待注入记录 / 标签报告 / 旧残留），
 * 让后续统计与审计从零开始。**永不触碰配置备份**（persist.json / persist.prev.json /
 * persist.shrunk-*.json / seeds/ —— 防丢数据铁律）；pending.json 仅清空一次性 sets，
 * 保留 ls 启动项（localStorage 直入对局等持续配置）。--dry=只预览；--all=连同 archive/ 历史归档
 * 与 data/_tmp_* 临时调试输出一并清除。服务器运行中亦可执行：文件被删后由下一次写入即时重建
 * （内存统计 / stats 计数需重启服务器才归零）。
 */
async function cmdClean({ dry = false, all = false } = {}) {
    if (!existsSync(dataDir)) {
        log.info(`无数据目录（${dataDir}；服务器版本 ${currentEngine.label}），无需清理。`);
        return;
    }
    console.log(`服务器版本：${currentEngine.label}（数据目录：${dataDir}）`);
    const fmtBytes = (n) => {
        if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
        if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${n} B`;
    };
    const sizeOf = (p) => {
        try {
            const st = statSync(p);
            if (st.isFile()) return st.size;
            if (st.isDirectory()) return readdirSync(p).reduce((s, n) => s + sizeOf(join(p, n)), 0);
        } catch {
            /* ignore */
        }
        return 0;
    };
    // 核心测试数据（对局事件流 / 页面 trace / 队列记录 / 标签报告 / 旧残留）
    const CORE = [
        ['playtest.jsonl', '对局事件流'],
        ['playtest.prev.jsonl', '事件流轮转备份'],
        ['persist-log.jsonl', '页面备份/恢复 trace'],
        ['persist-log.jsonl.prev', 'trace 轮转备份'],
        ['pending-taken.json', '待注入取走记录'],
        ['helper-tabs.json', '内置浏览器标签报告'],
        ['last_gametail.txt', '早期战报残留'],
    ];
    const targets = [];
    for (const [name, label] of CORE) {
        const f = join(dataDir, name);
        if (existsSync(f)) targets.push({ path: f, name, label, bytes: sizeOf(f) });
    }
    // pending.json：仅清空一次性待注入 sets；ls（localStorage 启动项）属持续配置，保留
    let pendingSets = 0;
    let pendingLs = 0;
    let pendingExists = false;
    try {
        pendingExists = existsSync(join(dataDir, 'pending.json'));
        if (pendingExists) {
            const j = JSON.parse(readFileSync(join(dataDir, 'pending.json'), 'utf-8'));
            pendingSets = j && j.sets ? Object.keys(j.sets).length : 0;
            pendingLs = j && j.ls ? Object.keys(j.ls).length : 0;
        }
    } catch {
        /* 不可读：跳过重置 */
    }
    if (all) {
        try {
            const archDir = join(dataDir, 'archive');
            if (existsSync(archDir)) {
                for (const n of readdirSync(archDir)) {
                    const f = join(archDir, n);
                    targets.push({ path: f, name: `archive/${n}`, label: '历史归档', bytes: sizeOf(f) });
                }
            }
        } catch {
            /* ignore */
        }
        try {
            for (const n of readdirSync(dataDir)) {
                if (!n.startsWith('_tmp_')) continue;
                const f = join(dataDir, n);
                targets.push({ path: f, name: n, label: '临时调试输出', bytes: sizeOf(f) });
            }
        } catch {
            /* ignore */
        }
    }
    const totalBytes = targets.reduce((s, t) => s + t.bytes, 0);
    if (targets.length) {
        console.log(`将删除 ${targets.length} 项测试数据（共 ${fmtBytes(totalBytes)}）：`);
        for (const t of targets) console.log(`  · ${t.name}（${t.label}，${fmtBytes(t.bytes)}）`);
    } else {
        console.log('核心测试数据已为空（无文件可删）。');
    }
    if (pendingSets) console.log(`  · pending.json：清空 ${pendingSets} 项待注入 sets（保留 ${pendingLs} 项 ls 启动项）`);
    else if (pendingExists && pendingLs) console.log(`  · pending.json：无需清空（sets 已空；保留 ${pendingLs} 项 ls 启动项）`);
    if (!all) {
        let archCount = 0;
        let tmpCount = 0;
        try {
            archCount = readdirSync(join(dataDir, 'archive')).length;
        } catch {
            /* ignore */
        }
        try {
            tmpCount = readdirSync(dataDir).filter((n) => n.startsWith('_tmp_')).length;
        } catch {
            /* ignore */
        }
        if (archCount || tmpCount)
            console.log(`  另有 archive/ 归档 ${archCount} 项、_tmp_* 临时输出 ${tmpCount} 项未处理（--all 一并清除）。`);
    }
    const keeps = [
        'persist.json',
        'persist.prev.json',
        ...readdirSync(dataDir).filter((n) => /^persist\.shrunk-/.test(n)),
        'seeds/',
    ];
    console.log(`  保留（配置备份，防丢数据铁律）：${keeps.join('、')}`);
    if (dry) {
        log.info('--dry 预演：未删除任何文件。');
        return;
    }
    let deleted = 0;
    let failed = 0;
    let pendingCleared = false;
    for (const t of targets) {
        try {
            rmSync(t.path, { recursive: true, force: true });
            deleted++;
        } catch (e) {
            failed++;
            log.warn(`删除失败：${t.name}（${(e && e.message) || e}）`);
        }
    }
    if (pendingSets) {
        try {
            const pf = join(dataDir, 'pending.json');
            const j = JSON.parse(readFileSync(pf, 'utf-8'));
            j.sets = {};
            writeFileSync(pf, JSON.stringify(j));
            pendingCleared = true;
        } catch (e) {
            failed++;
            log.warn('pending.json 清空失败：' + ((e && e.message) || e));
        }
    }
    log.ok(
        `已删除 ${deleted} 项测试数据（${fmtBytes(totalBytes)}）` +
            (pendingCleared ? '，并清空 pending.json 待注入 sets' : '') +
            `${failed ? `；${failed} 项失败` : ''}。`,
    );
    if (await isRunning())
        console.log('  服务器运行中：新事件将写入重建后的文件（内存计数 / stats 需重启服务器归零）。');
    if (failed) process.exitCode = 1;
}

function printUsage() {
    console.log(`用法（AI/自动化一律带子命令与参数直用；无参=人类交互菜单）:
  node scripts/playtest.mjs auto [ms] [--no-auto] [--no-open] [--keep] [--char <id>] [--test] [--set k=v]... [--query k=v]...
  node scripts/playtest.mjs open [url] [--test] [--char <id>] [--no-auto] [--keep] [--restore fill|force] [--set k=v]... [--query k=v]...
  node scripts/playtest.mjs events [--tail N] [--type t1,t2] [--json] [--full]
  node scripts/playtest.mjs set <key>=<value> [...]
  node scripts/playtest.mjs apply-nncfg [file] [--dry] [--test] [--char <id>] [--keep] [--set k=v]... [--query k=v]...
  node scripts/playtest.mjs status [--json]
  node scripts/playtest.mjs stop
  node scripts/playtest.mjs restore [--force]
  node scripts/playtest.mjs seed
  node scripts/playtest.mjs clean [--dry] [--all]
  node scripts/playtest.mjs engine [key|seed] [--force] [--from <key>]
  node scripts/playtest.mjs fg

说明:
  auto  后台启动（ms=崩溃自动跳过毫秒，0=关闭，缺省 ${DEFAULT_AUTOSKIP_MS}；--no-auto=手动模式不自动游玩；
        --no-open 不打开页面；--char 直启/每局直刷指定角色；--test 打开测试台页；已在运行且参数不一致会自动重启，
        参数一致也会打开页面（除非 --no-open）。打开时默认先关闭同源旧调试页（--keep 保留），保持「一页纪律」）
  open  在 VS Code 内置浏览器打开调试页（未运行时自动以默认模式拉起；url 可省略或相对路径；同样默认关旧页，--keep 保留）
  events  读事件流尾部（默认最近 20 条；--type 过滤；--json 机器可读；--full 不截断长字段）
  set   写入游戏配置（如 set show_splash=off；ls. 前缀写 localStorage，如 set ls.directstart=true；
        未运行则手动模式拉起；页面写库后自动重载）
  apply-nncfg  批量注入 nncfg 配置（缺省 zip/style/nncfg/win11.0.nncfg：全崩铁武将池/开发者模式/界面
        样式等整包设置；--dry 只解码打印；单键调整仍用 set）
  clean  一键删除测试数据（对局事件流 / persist 日志 / 待注入记录 / 标签报告 / 旧残留），统计从零开始；
        永不触碰配置备份（persist*/seeds——防丢数据铁律）；--dry 只预览；--all 连同 archive/ 归档与
        _tmp_* 临时输出一并清除（作用于当前配置的服务器版本）
  engine  查看/切换服务器版本：noname（缺省；端口 8931/数据目录 data）或 noname - 新版（key=new，
        别名 新版；端口 8932/数据目录 data-new）。端口即同源隔离——浏览器存储与测试数据全部按版本
        分离、两版本可同时运行；stop 释放全部版本端口。配置存 scripts/lib/dev-config.local.json 的
        playtest.engine（本机配置）
  engine seed  把其它版本的配置备份播种到当前版本（--force 覆盖已有；--from <key> 指定来源）；
        首次启用某版本（数据目录无 persist.json）时 auto/open/restore 会自动播种——空容器页面即可
        自动导入配置（否则无备份可导、dev=false 卡 boot）
  status --json  机器可读（含服务器 env、引擎与页面计数，供 AI 解析）
（npm 传参写法：npm run playtest -- auto 30000）`);
}

async function runInteractive() {
    try {
        const choice = await menu(
            '崩铁杀连续游玩 —— 请选择操作：',
            [
                { label: '无人值守启动（后台，崩溃自动跳过 15 秒，随后自动打开内置浏览器）', value: 'auto' },
                { label: '前台启动（调试用：关闭自动游玩、日志输出到终端）', value: 'fg' },
                { label: '打开 VS Code 内置浏览器（调试页面）', value: 'open' },
                {
                    label: '应用 nncfg 配置（win11.0：全崩铁武将池 / 开发者模式 / 界面样式）',
                    value: 'nncfg',
                },
                { label: `切换服务器版本（当前：${currentEngine.label}@${currentEngine.port}；端口/数据按版本独立）`, value: 'engine' },
                { label: '恢复配置数据（缺失自动补缺；可选强制覆盖）', value: 'restore' },
                { label: '制作配置种子快照（把当前健康备份固定为回退基准）', value: 'seed' },
                { label: '清理测试数据（删除事件流/日志/队列记录；保留配置备份）', value: 'clean' },
                { label: `停止服务器（释放 ${engines.map((e) => e.port).join('/')} 端口）`, value: 'stop' },
                { label: '查看运行状态 / 统计', value: 'status' },
            ],
            { cancelLabel: '退出' },
        );
        if (!choice) {
            log.info('已退出。');
            return;
        }
        const value = typeof choice === 'string' ? choice : choice.value;
        if (value === 'auto') {
            await startDetached({ allowRestart: true });
        } else if (value === 'fg') {
            await startForeground({ allowRestart: true });
        } else if (value === 'open') {
            await openBrowser(URL_BASE);
        } else if (value === 'nncfg') {
            await applyNncfg({ flags: new Set(), values: {}, sets: [], queries: [], positional: [] });
        } else if (value === 'engine') {
            const picked = await menu(
                '选择要启动的服务器版本（测试数据按版本分离）：',
                engines.map((e) => ({
                    label: `${e.label}（${e.key}）${samePath(e.root, currentEngine.root) ? ' ← 当前' : ''}`,
                    value: e.key,
                })),
                { cancelLabel: '不切换' },
            );
            if (!picked) {
                log.info('已取消。');
                return;
            }
            await cmdEngine(typeof picked === 'string' ? picked : picked.value);
        } else if (value === 'restore') {
            const force = await confirm('是否强制覆盖恢复（--force）？默认普通补缺（仅补缺失键）', {
                defaultYes: false,
            });
            await restoreConfig({ force });
        } else if (value === 'seed') {
            snapshotSeed();
        } else if (value === 'clean') {
            if (!(await confirm('删除测试数据（保留配置备份 persist*/seeds）？', { defaultYes: false }))) {
                log.info('已取消。');
                return;
            }
            const all = await confirm('是否连同 archive/ 历史归档与 _tmp_* 临时输出一并清除？', { defaultYes: false });
            await cmdClean({ all });
        } else if (value === 'stop') {
            stopAllServers();
        } else if (value === 'status') {
            await showStatus();
        }
    } finally {
        closeInteractive();
    }
}

/**
 * engine 子命令：查看 / 切换「服务器版本（引擎）」——noname（缺省）或 noname - 新版（key=new）。
 * 配置持久化在 scripts/lib/dev-config.local.json 的 playtest.engine（本机配置，不入库）；
 * 可选列表由同文件 installed 派生。两版本测试数据目录相互分离（data / data-<key>）。
 * 用法：node scripts/playtest.mjs engine [noname|new|新版]
 */
async function cmdEngine(arg, opts = { flags: new Set(), values: {} }) {
    if (arg === 'seed' || arg === '播种') {
        await seedForCurrentEngine(opts);
        return;
    }
    const saved = readEngineSelection();
    if (saved && !engines.some((e) => e.key === saved))
        log.warn(`本机配置的版本「${saved}」不在可选列表（installed 已变化）→ 已回退「${currentEngine.label}」。`);
    if (!arg) {
        log.ok(`当前服务器版本：${currentEngine.label}（key=${currentEngine.key}，端口 ${PORT}）；数据目录：${dataDir}`);
        console.log('  可选（由 dev-config.local.json 的 installed 派生）：');
        for (const e of engines) {
            const marks = [];
            if (samePath(e.root, currentEngine.root)) marks.push('当前');
            if (!existsSync(join(e.root, 'index.html'))) marks.push('⚠ 缺 index.html，不可用');
            console.log(`  · ${e.key}｜${e.label}${marks.length ? `（${marks.join('；')}）` : ''}`);
            console.log(`      端口：${e.port}；根目录：${e.root}`);
            console.log(`      数据目录：${dataDirFor(e)}`);
        }
        console.log('  切换：npm run playtest -- engine <noname|new|新版>');
        return;
    }
    const target = matchEngine(arg);
    if (!target) {
        log.error(`未知服务器版本：「${arg}」（可选：${engines.map((e) => e.key).join(' / ')}；别名：新版 = noname - 新版）`);
        process.exitCode = 1;
        return;
    }
    if (!existsSync(join(target.root, 'index.html'))) {
        log.error(`「${target.label}」网页根目录不完整（缺 index.html）：${target.root}`);
        process.exitCode = 1;
        return;
    }
    if (samePath(target.root, currentEngine.root)) {
        log.info(`服务器版本已是「${currentEngine.label}」（数据目录：${dataDir}），无需切换。`);
        return;
    }
    saveEngineSelection(target.key);
    log.ok(`服务器版本已切换：${currentEngine.label}（${currentEngine.port}） → ${target.label}（${target.port}）`);
    console.log(`  根目录：${target.root}`);
    console.log(`  数据目录：${dataDirFor(target)}（端口与数据均按版本独立）`);
    if (!existsSync(join(dataDirFor(target), 'persist.json')))
        log.info(
            '该版本尚无配置备份（首次使用）——打开页面时自动从其它版本播种（首次导入配置）；也可手动：engine seed',
        );
    // 各版本服务器端口独立、可同时运行；切换只影响之后启动的实例
    const running = [];
    for (const e of engines) {
        if ((await get(`http://127.0.0.1:${e.port}/`, 800)) !== null) running.push(e);
    }
    if (running.length) {
        const same = running.find((e) => samePath(e.root, target.root));
        const others = running.filter((e) => !samePath(e.root, target.root));
        if (same) log.info(`「${target.label}」已在运行（http://127.0.0.1:${target.port}/）——start/open 将直接沿用。`);
        if (others.length)
            log.info(
                `其他版本实例仍在运行（${others.map((e) => `${e.label}@${e.port}`).join('、')}）——端口/数据互不影响；如需全部停止：npm run playtest -- stop。`,
            );
    }
}

/** open 子命令：确保服务器在跑 → 组装含各参数的页面 URL → 打开并核验 */
async function cmdOpen(opts) {
    if (!(await isRunning())) {
        log.info('服务器未运行 → 先以默认模式（无人值守）后台拉起…');
        await startDetached({ autoskipMs: DEFAULT_AUTOSKIP_MS, off: false, openUrl: '' });
    }
    ensureEngineSeed(); // 沿用运行中实例时也要保证「有备份可导」（服务器按请求读盘，补上即对下次加载生效）
    const url = buildPageUrl({
        urlArg: opts.positional[0] || '',
        test: opts.flags.has('test'),
        char: opts.values.char || '',
        noAuto: opts.flags.has('no-auto'),
        restore: opts.values.restore || '',
        sets: opts.sets,
        queries: opts.queries,
    });
    return await openBrowser(url, { keep: opts.flags.has('keep') });
}

/** k=v 的 v 按 JSON 优先解析（与页面 parseSetValue 语义一致；数组/带引号字符串/数字均可无损） */
function parseSetValueJsonFirst(s) {
    if (s === '') return '';
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
}

/** POST 设置到服务器待注入队列（sets=IDB config 项；ls=localStorage 项，可空/含 null 表示移除）。成功返回 {ok:true,count}；不可用返回 null */
function postPending(setsObj, note, lsObj) {
    return new Promise((done) => {
        const body = JSON.stringify({ sets: setsObj, note: note || '', ls: lsObj || undefined });
        const req = http.request(
            URL_BASE + '__bts/pending',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            },
            (res) => {
                let b = '';
                res.setEncoding('utf8');
                res.on('data', (c) => (b += c));
                res.on('end', () => {
                    try {
                        const j = JSON.parse(b);
                        done(j && j.success ? { ok: true, count: (j.data && j.data.count) || 0 } : null);
                    } catch {
                        done(null);
                    }
                });
            },
        );
        req.setTimeout(3000, () => {
            req.destroy();
            done(null);
        });
        req.on('error', () => done(null));
        req.write(body);
        req.end();
    });
}

/** 轮询 persist-log 增量，等「设置注入」类 trace（返回 'ok：…' / 'fail：…' / 'none'） */
async function waitPersistVerdict(logBefore, waitMs = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < waitMs) {
        await sleep(1200);
        try {
            if (!existsSync(persistLogFile)) continue;
            const txt = readFileSync(persistLogFile, 'utf-8');
            if (txt.length <= logBefore) continue;
            const fresh = txt.slice(logBefore).trim().split(/\r?\n/).slice(-12);
            for (const l of fresh) {
                let msg;
                try {
                    msg = JSON.parse(l).msg;
                } catch {
                    msg = l;
                }
                if (/设置注入：/.test(msg)) return 'ok：' + msg;
                if (/设置注入失败/.test(msg)) return 'fail：' + msg;
            }
        } catch {
            /* ignore */
        }
    }
    return 'none';
}

/** 打印注入核验结论（ok/fail/none 三分支） */
function reportSetVerdict(verdict) {
    if (verdict.startsWith('ok')) {
        log.ok('设置注入成功（页面已写库并自动重载）：' + verdict.slice(3));
    } else if (verdict.startsWith('fail')) {
        log.error('设置注入失败：' + verdict.slice(5));
        process.exitCode = 1;
    } else {
        log.warn('30 秒内未读到页面侧注入日志（页面未加载？）——可重试；或 open 后在控制台查看 __BTS_PERSIST 状态。');
        process.exitCode = 1;
    }
}

/**
 * set 子命令：把 k=v 写入游戏配置。
 * 优先走「服务器待注入队列」下发（POST /__bts/pending → 打开注入页 → 页面自取写库）：
 * URL 只带 __bts_noauto，彻底规避集成浏览器对 URL 长参数的截断；旧版服务器自动回退 URL __bts_set。
 */
async function cmdSet(pairs) {
    if (!pairs.length) {
        log.error('用法：node scripts/playtest.mjs set <key>=<value> [...]（如 set show_splash=off）');
        process.exitCode = 1;
        return;
    }
    if (!(await isRunning())) {
        log.info('服务器未运行 → 以后台「手动模式」拉起（不干扰配置写入）…');
        await startDetached({ off: true, openUrl: '' });
    }
    const sets = {};
    const ls = {};
    for (const p of pairs) {
        const i = p.indexOf('=');
        const k = i === -1 ? p : p.slice(0, i);
        const v = i === -1 ? '' : p.slice(i + 1);
        if (!k) continue;
        // `ls.` 前缀 = 写 localStorage（无名杀启动键，如 directstart；先于游戏启动同步生效）；空值=移除
        if (k.indexOf('ls.') === 0) ls[k.slice(3)] = v === '' ? null : parseSetValueJsonFirst(v);
        else sets[k] = parseSetValueJsonFirst(v);
    }
    if (!Object.keys(sets).length && !Object.keys(ls).length) {
        log.error('没有可写入的键。');
        process.exitCode = 1;
        return;
    }
    const r = await postPending(sets, 'playtest set', Object.keys(ls).length ? ls : null);
    if (!r || !r.ok) {
        log.warn('服务器无待注入端点（旧版？）→ 回退 URL 注入（注意：集成浏览器可能截断长参数）。');
        const url = buildPageUrl({ sets: pairs, noAuto: true });
        console.log(`  注入页：${url}`);
        const opened = await openBrowser(url);
        if (opened) log.ok('设置注入页已打开（URL 通道）：页面将写入游戏配置并自动重载。');
        return;
    }
    const desc = [];
    if (Object.keys(sets).length) desc.push(`${Object.keys(sets).length} 项 IDB：` + Object.keys(sets).join('、'));
    if (Object.keys(ls).length)
        desc.push(`${Object.keys(ls).length} 项 localStorage：` + Object.keys(ls).join('、'));
    log.ok('已加入服务器待注入队列（' + desc.join('；') + '）');
    const logBefore = existsSync(persistLogFile) ? readFileSync(persistLogFile, 'utf-8').length : 0;
    const opened = await openBrowser(buildPageUrl({ noAuto: true }));
    if (!opened) {
        process.exitCode = 1;
        return;
    }
    reportSetVerdict(await waitPersistVerdict(logBefore));
}

/**
 * 解码 nncfg（引擎 lib.init.encode 的 Base64 形态）→ {config,data}。
 * win11.0 / android_wide11.0 均为标准 UTF-8 Base64；解码后必须能 JSON.parse 且含 config 对象。
 */
function decodeNncfg(text) {
    const b64 = String(text).trim();
    const json = Buffer.from(b64, 'base64').toString('utf8');
    let obj;
    try {
        obj = JSON.parse(json);
    } catch (e) {
        throw new Error(
            '解码结果不是 JSON（引擎曾对非 BMP 字符特殊编码？）：' + ((e && e.message) || e),
        );
    }
    if (!obj || typeof obj !== 'object' || !obj.config || typeof obj.config !== 'object')
        throw new Error('nncfg 结构异常（缺少 config 对象）');
    return obj;
}

/**
 * apply-nncfg 子命令：解码 nncfg → 每项 k=JSON.stringify(v) → __bts_set 注入页（页面写库+重载）。
 * 缺省文件 zip/style/nncfg/win11.0.nncfg；--dry 只解码打印；--file <path> 或位置参数可指定其他文件。
 * 核验：读 data/persist-log.jsonl 里页面侧「设置注入：…」/「设置注入失败：…」trace（30 秒窗口）。
 */
async function applyNncfg(opts) {
    const file = opts.values.file || opts.positional[0] || nncfgDefaultFile;
    if (!existsSync(file)) {
        log.error(`未找到 nncfg 文件：${file}（缺省应为 ${nncfgDefaultFile}）`);
        process.exitCode = 1;
        return;
    }
    let conf;
    try {
        conf = decodeNncfg(readFileSync(file, 'utf-8'));
    } catch (e) {
        log.error('nncfg 解码失败：' + ((e && e.message) || e));
        process.exitCode = 1;
        return;
    }
    const cfg = conf.config || {};
    const keys = Object.keys(cfg);
    if (!keys.length) {
        log.warn('config 段为空，无需注入。');
        return;
    }
    const pairs = keys.map((k) => `${k}=${JSON.stringify(cfg[k])}`);
    log.ok(`nncfg：${file}（${keys.length} 项配置）`);
    if (opts.flags.has('dry')) {
        console.log('  --dry：仅解码预览（不写配置、不打开页面）');
        for (const k of keys) console.log(`    ${k} = ${JSON.stringify(cfg[k])}`);
        const preview = buildPageUrl({ sets: pairs, noAuto: true });
        console.log(`  预计注入页 URL 长度：${preview.length} 字符`);
        return;
    }
    if (!(await isRunning())) {
        log.info('服务器未运行 → 以后台「手动模式」拉起（不干扰配置写入）…');
        await startDetached({ off: true, openUrl: '' });
    }
    const test = opts.flags.has('test');
    // 优先走「服务器待注入队列」（免 URL 长参数；集成浏览器同样可靠）；旧版服务器回退 URL __bts_set。
    const setsToPush = { ...cfg };
    for (const p of opts.sets) {
        const i = p.indexOf('=');
        const k = i === -1 ? p : p.slice(0, i);
        const v = i === -1 ? '' : p.slice(i + 1);
        if (k) setsToPush[k] = parseSetValueJsonFirst(v);
    }
    const pushed = await postPending(setsToPush, `apply-nncfg: ${file}`);
    let url;
    if (pushed && pushed.ok) {
        url = buildPageUrl({
            test,
            char: opts.values.char || '',
            noAuto: !test,
            queries: opts.queries,
        });
        log.ok(
            `已加入服务器待注入队列（${keys.length} 项 nncfg${opts.sets.length ? ` + ${opts.sets.length} 项 --set` : ''}）`,
        );
    } else {
        log.warn('服务器无待注入端点（旧版？）→ 回退 URL 注入（注意：集成浏览器可能截断长参数）。');
        url = buildPageUrl({
            test,
            char: opts.values.char || '',
            noAuto: !test,
            sets: [...pairs, ...opts.sets],
            queries: opts.queries,
        });
    }
    console.log(`  注入页 URL（${url.length} 字符）：${url.length > 150 ? url.slice(0, 150) + '…' : url}`);
    const logBefore = existsSync(persistLogFile) ? readFileSync(persistLogFile, 'utf-8').length : 0;
    const opened = await openBrowser(url, { keep: opts.flags.has('keep') });
    if (!opened) {
        process.exitCode = 1;
        return;
    }
    reportSetVerdict(await waitPersistVerdict(logBefore));
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    const opts = parseArgs(args.slice(1));
    try {
        if (opts.error) {
            log.error(opts.error + '（用法速览见下）');
            printUsage();
            process.exitCode = 1;
            return;
        }
        if (!cmd) {
            await runInteractive();
            return;
        }
        if (cmd === 'auto') {
            const ms = opts.values.ms === undefined ? DEFAULT_AUTOSKIP_MS : Number(opts.values.ms);
            const openUrl = opts.flags.has('no-open')
                ? ''
                : buildPageUrl({
                      test: opts.flags.has('test'),
                      char: opts.values.char || '',
                      sets: opts.sets,
                      queries: opts.queries,
                  });
            await startDetached({ autoskipMs: ms, off: opts.flags.has('no-auto'), openUrl, keep: opts.flags.has('keep') });
        } else if (cmd === 'fg' || cmd === 'start') {
            await startForeground({ allowRestart: false });
        } else if (cmd === 'open') {
            const opened = await cmdOpen(opts);
            if (!opened) process.exitCode = 1;
        } else if (cmd === 'set') {
            await cmdSet(opts.sets.length ? opts.sets : opts.positional);
        } else if (cmd === 'apply-nncfg' || cmd === 'nncfg') {
            await applyNncfg(opts);
        } else if (cmd === 'restore') {
            await restoreConfig({ force: opts.flags.has('force') });
        } else if (cmd === 'seed') {
            snapshotSeed();
        } else if (cmd === 'clean') {
            await cmdClean({ dry: opts.flags.has('dry'), all: opts.flags.has('all') });
        } else if (cmd === 'engine') {
            await cmdEngine(opts.positional[0], opts);
        } else if (cmd === 'stop') {
            stopAllServers();
        } else if (cmd === 'events') {
            await showEvents(opts);
        } else if (cmd === 'status') {
            await showStatus({ json: opts.flags.has('json') });
        } else {
            printUsage();
            process.exitCode = 1;
        }
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main().catch((error) => {
        log.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
