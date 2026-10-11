#!/usr/bin/env node

/**
 * 崩铁杀 连续游玩控制台（调试服务器 + 页面注入 + 无人值守）
 *
 * 用法（AI/自动化一律「子命令 + 参数」直用；无参 = 人类交互菜单；help = 打印本速览）：
 *   auto [ms] [--char <id|none>] [--test] [--no-open] [--no-auto] [--keep]  无人值守刷局（后台 + 开页）
 *   open [url] [--test] [--char <id|none>] [--no-auto] [--keep]            打开调试页（未跑则先拉起）
 *   status [--json] | stop | events [--tail N] [--type t] [--json]         状态 / 停止 / 看事件
 *   set <k=v | ls.k=v | @id=v> ...                                         写配置（@id = 调试键，见 keys）
 *   keys [id] [--json] | char [<id>|none]                                  调试键登记表 / 每局直刷角色
 *   restore [--force] | seed | clean [--dry] [--all]                       配置恢复 / 种子 / 清测试数据
 *   apply-nncfg [file] [--dry] | engine [key|seed] [--force] | fg           批量注入 / 版本切换 / 前台
 *   help [组]                                                               速览 / 某组详情（server|config|keys|engine|data）
 * 输出规范（2026-10-11）：每条命令 = 一行结论 + 必要细节；不逐条复述版本/端口/路径。
 * 完整路径/根目录：status、任意命令加 --verbose、或 status --json。
 * 机制细节：文档/调试与自动化测试手册.md（§2 启停 · §3.7 设置注入 · §3.8 调试键规范）；入口导航：文档/AgentSkill.md。
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, prompt, confirm, closeInteractive } from './lib/interactive.mjs';
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

// ---- 输出规范（2026-10-11 精简）----
// 每条命令 = ① 一行结论（重点）② 必要的短细节；不再逐条复述「版本 / 端口 / 数据目录」全文。
// 需要完整路径/根目录时：status、任意命令加 --verbose、或 status --json。
const VERBOSE = process.argv.includes('--verbose') || process.env.BTS_CLI_VERBOSE === '1';
/** 短上下文：`noname@8931` */
const where = () => `${currentEngine.label}@${PORT}`;
/** 相对数据目录的短路径（日志展示用） */
const dataRel = (p) => String(p).slice(dataDir.length).replace(/^[\\/]+/, '');

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
            if (
                ['char', 'restore', 'file', 'tail', 'type', 'from', 'owner', 'life'].includes(name)
            ) {
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
    if (VERBOSE) log.info('调起 VS Code：' + uri);
    const t0 = Date.now();
    fireVsCodeUri(uri);
    while (Date.now() - t0 < waitMs) {
        await sleep(1000);
        if (countBoots() > bootsBefore) {
            log.ok(`已打开调试页：${url}`);
            reportHelperTabs(dumpFile, t0);
            return true;
        }
        if (loads0 !== null) {
            const stats = await getJson(URL_BASE + '__playtest/stats');
            const loads = stats && stats.data && stats.data.pageLoads;
            if (typeof loads === 'number' && loads > loads0) {
                log.ok(`已打开调试页：${url}`);
                reportHelperTabs(dumpFile, t0);
                return true;
            }
        }
    }
    log.warn('未检测到新页面加载——辅助扩展刚装/升级（需重载一次 VS Code 窗口）· VS Code 未运行/URI 被拦 · 该页此前已开（可能只聚焦旧标签）。');
    console.log(`  手动兜底：在内置浏览器打开 ${url}`);
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
    log.info(`服务端备份：${(st.size / 1024).toFixed(1)} KB${VERBOSE ? `（${persistFile}）` : ''}`);
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
    if (out) log.ok(`已停止（${port}）${VERBOSE ? '：' + out.split(/\r?\n/).join('；') : ''}`);
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
 *   - quiet=true：不打印启动横幅（由调用方自己给结论，避免同一动作重复刷屏）。
 */
async function startDetached({
    autoskipMs = DEFAULT_AUTOSKIP_MS,
    off = false,
    allowRestart = false,
    openUrl,
    keep = false,
    quiet = false,
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
        log.warn(`服务器已在运行（${where()}）。`);
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
        if (!quiet) {
            log.ok(
                `已启动（${off ? '手动模式：不自动游玩' : `无人值守，崩溃自动跳过 ${autoskipMs ? autoskipMs + 'ms' : '关闭'}`}）· ${where()}`,
            );
            console.log(`  页面：${URL_BASE} · 停止：npm run playtest -- stop`);
        }
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
    console.log(`  版本：${where()} · 数据：${basename(dataDir)}/`);
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
                    debugKeys: (d && d.debugKeys) || null,
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
        log.info(`未运行 · 配置版本 ${where()}——拉起：npm run playtest -- auto`);
        if (others.length) console.log(`  其他实例：${others.map((e) => `${e.label}@${e.port}`).join('、')}（运行中）`);
        return;
    }
    const env = d ? d.env : null;
    const mode = !env ? '（旧版实例，无法探测模式）' : env.off ? '手动模式（不自动游玩）' : `无人值守（自动跳过 ${env.autoskip || '关闭'}）`;
    log.ok(`运行中 · ${where()} · ${mode}`);
    console.log(`  页面：${URL_BASE}`);
    if (d && d.debugKeys) {
        const k = d.debugKeys;
        console.log(`  调试键：每局直刷=${k.autoChar || '无'} · 测试台点名=${k.testChar || '无'} · 开关=${k.on === '1' ? '开' : k.off === '1' ? '关' : '?'}${k.autoskip ? ` · 自动跳过=${k.autoskip}` : ''}`);
    }
    if (d && typeof d.root === 'string' && d.root && !samePath(d.root, engineRoot))
        log.warn(`运行实例与配置版本不一致（实际跑的是 ${findEngineByRoot(d.root) || d.root}）——auto/fg/open 会自动切换，或先 stop。`);
    if (d)
        console.log(
            `  计数：页面加载 ${typeof d.pageLoads === 'number' ? d.pageLoads : '—'}；对局 ${d.gameStart} 开始 / ${d.gameEnd} 结束 / clean ${d.cleanEnd}；错误 ${d.errors} · 挂起 ${d.pauses}`,
        );
    else log.warn('未取到统计（页面尚未打开或服务器版本过旧）。');
    if (logInfo)
        console.log(
            `  事件流：${dataRel(logInfo.path)}（${(logInfo.bytes / 1024).toFixed(1)} KB，${new Date(logInfo.mtime).toLocaleString('zh-CN', { hour12: false })}）${pLogInfo ? ` · persist-log ${(pLogInfo.bytes / 1024).toFixed(1)} KB` : ''}`,
        );
    if (others.length) console.log(`  其他实例：${others.map((e) => `${e.label}@${e.port}`).join('、')}（运行中）`);
    if (VERBOSE) {
        console.log(`  根目录：${engineRoot}`);
        console.log(`  数据目录：${dataDir}`);
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
        log.warn('暂无事件流——先拉起调试服务器并打开页面（auto）。');
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
    console.log(`（共 ${picked.length} 条 · 完整流：${dataRel(playtestLog)}）`);
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

/** 命令分组（唯一来源：help 速览 / help <组> 详情 / 交互菜单二级项都取自这里）。
 *  每条 = [用法, 说明, 菜单标签]。新增命令只改这里，别处不再重复罗列。 */
const CLI_GROUPS = [
    {
        key: 'server',
        label: '服务器',
        desc: '启动 / 打开调试页 / 状态 / 停止',
        items: [
            ['auto [ms] [--char <id|none>] [--test] [--no-open] [--no-auto] [--keep]', '无人值守刷局（后台 + 自动开页；ms=崩溃自动跳过毫秒，缺省 15000）', '无人值守启动（后台 + 开页）'],
            ['open [url] [--test] [--char <id|none>] [--no-auto] [--keep]', '打开调试页（未运行则先以无人值守拉起）', '打开调试页'],
            ['status [--json]', '运行状态 / 统计（含调试键现值）；--json 机器可读', '查看状态 / 统计'],
            ['stop', '停止服务器（释放各版本端口）', '停止服务器'],
            ['fg', '前台启动（关闭自动游玩、日志直出；Ctrl+C 停止）', '前台启动（调试用）'],
        ],
    },
    {
        key: 'config',
        label: '配置与注入',
        desc: '写配置 / nncfg / 恢复 / 种子',
        items: [
            ['set <k=v | ls.k=v | @id=v> …', '写配置：k=游戏配置(IDB) · ls.k=启动键(localStorage) · @id=调试键(direct 通道，id 见 keys)', '写配置（set）'],
            ['config [关键字] [--json]', '列出游戏配置项与现值（来自配置备份 persist.json；改值用 set）', '查看游戏配置项（config）'],
            ['apply-nncfg [file] [--dry]', '批量注入 nncfg（全崩铁武将池 / 开发者模式 / 界面样式）', '应用 nncfg 配置'],
            ['restore [--force]', '恢复配置（缺省补缺；--force 覆盖）', '恢复配置'],
            ['seed', '制作配置种子快照（灾难回退基准）', '制作配置种子'],
        ],
    },
    {
        key: 'keys',
        label: '键与角色',
        desc: '每局直刷角色 / 调试键登记表',
        items: [
            ['char [<id>|none]', '查看 / 设置 / 清除「每局直刷」角色（粘性键 __bts_auto_char）', '每局直刷角色（char）'],
            ['keys [id] [--json] [--owner <x>] [--life <y>]', '调试键登记表：键名 / 生命周期 / 在哪设置 / 怎么清', '调试键登记表（keys）'],
            ['chars [关键字] [--json]', '列出可选角色（id + 中文名）——不用记 id，直接查/直接选', '查看角色清单（chars）'],
        ],
    },
    {
        key: 'engine',
        label: '版本',
        desc: '切换服务器版本 / 播种配置',
        items: [
            ['engine [key]', '查看 / 切换服务器版本（noname=8931 / 新版=8932，端口与数据隔离）', '切换服务器版本'],
            ['engine seed [--force] [--from <k>]', '把其它版本的配置备份播种到当前版本（首次启用某版本时 auto/open 会自动播种）', '播种配置（engine seed）'],
        ],
    },
    {
        key: 'data',
        label: '数据与观测',
        desc: '事件流 / 清理测试数据',
        items: [
            ['events [--tail N] [--type t] [--json|--full]', '读事件流尾部（AI 观测入口；缺省最近 20 条）', '查看事件流'],
            ['clean [--dry] [--all]', '清理测试数据（保留配置备份 persist*/seeds）', '清理测试数据'],
        ],
    },
];

/** 终端列宽对齐：CJK 记 2 宽 */
const padCJK = (s, w) => {
    const t = String(s);
    const width = [...t].reduce((n, ch) => n + (/[\u2E80-\uFFFF]/.test(ch) ? 2 : 1), 0);
    return t + ' '.repeat(Math.max(0, w - width));
};

/** 组名解析：key / 中文标签 / 标签前缀（如 help 键） */
function resolveGroup(arg) {
    const a = String(arg || "").trim();
    if (!a) return null;
    return CLI_GROUPS.find((g) => g.key === a || g.label === a || g.label.indexOf(a) === 0) || null;
}

/** 用法：无参=分组速览；带组名=该组逐条详情（二级）。 */
function printUsage(groupArg) {
    const group = resolveGroup(groupArg);
    if (group) {
        console.log(`${group.label}　${group.desc}`);
        for (const [usage, desc] of group.items) {
            console.log(`  ${usage}`);
            console.log(`      ${desc}`);
        }
        console.log("  速览：npm run playtest -- help");
        return;
    }
    if (groupArg) log.warn(`未知分组「${groupArg}」——用 help 看分组列表。`);
    console.log("崩铁杀调试台（npm run playtest -- <命令>；无参 = 交互菜单；--verbose 看完整路径）");
    for (const g of CLI_GROUPS) {
        const cmds = [...new Set(g.items.map((it) => it[0].split(/[ <[]/)[0]))].join(" | ");
        console.log(`  ${padCJK(g.label, 12)}${cmds}`);
        console.log(`  ${" ".repeat(12)}${g.desc} · 详情：playtest help ${g.label}`);
    }
    console.log("  提示：--char none 清除「每局直刷」（等价 char none）；@id 未登记会报错并指向 keys。");
    console.log("        集成浏览器会截断长 URL —— 依赖 URL 的玩法走服务器通道（set / apply-nncfg / char）。");
    console.log("        文档：文档/调试与自动化测试手册.md（§2 启停 · §3.7 设置注入 · §3.8 调试键规范）。");
}
/** 交互菜单：一级=分组（只 5 条），二级=具体动作；菜单项与 CLI_GROUPS 同源。 */
async function runInteractive() {
    try {
        for (;;) {
            const live = await isRunning();
            const group = await menu(
                `崩铁杀调试台（${where()}${live ? " · 运行中" : " · 未运行"}）`,
                CLI_GROUPS.map((g) => ({ label: `${padCJK(g.label, 12)}${g.desc}`, value: g.key })),
                { cancelLabel: "退出" },
            );
            if (!group) {
                log.info("已退出。");
                return;
            }
            await runMenuGroup(typeof group === "string" ? group : group.value);
        }
    } finally {
        closeInteractive();
    }
}

/** 二级菜单：某组的具体动作（只读查看类做完留在本组，其余回一级菜单）。 */
async function runMenuGroup(key) {
    const group = CLI_GROUPS.find((g) => g.key === key);
    if (!group) return;
    for (;;) {
        const picked = await menu(
            `${group.label}　${group.desc}`,
            group.items.map(([usage, desc, menuLabel]) => ({
                label: `${menuLabel}　〔${usage.split(" ")[0]}〕` ,
                usage,
                hint: desc,
            })),
            { cancelLabel: "← 返回" },
        );
        if (!picked) return;
        const usage = typeof picked === "string" ? picked : picked.usage;
        const stay = await runMenuAction(String(usage));
        if (!stay) return;
    }
}

/** 执行二级菜单动作；返回 true = 留在本组（只读汇报类），false = 回一级菜单。 */
async function runMenuAction(usage) {
    const cmd = usage.split(" ")[0];
    if (usage.startsWith("engine seed")) {
        const force = await confirm("覆盖已有备份（--force）？", { defaultYes: false });
        await seedForCurrentEngine({ flags: force ? new Set(["force"]) : new Set(), values: {}, positional: [] });
        return false;
    }
    if (cmd === "auto") {
        await startDetached({ allowRestart: true });
        return false;
    }
    if (cmd === "fg") {
        await startForeground({ allowRestart: true });
        return false;
    }
    if (cmd === "open") {
        await openBrowser(URL_BASE);
        return false;
    }
    if (cmd === "status") {
        await showStatus();
        return true;
    }
    if (cmd === "stop") {
        stopAllServers();
        return false;
    }
    if (cmd === "chars") {
        await cmdChars({ flags: new Set(), values: {}, positional: [] });
        return true;
    }
    if (cmd === "config") {
        await cmdConfig({ flags: new Set(), values: {}, positional: [] });
        return true;
    }
    if (cmd === "char") {
        const k = await readDebugKeys();
        const cur = k && k.autoChar ? `${charName(k.autoChar) || "?"}（${k.autoChar}）` : "无";
        const picked = await menu(
            `每局直刷角色　当前：${cur}`,
            [
                { label: "从角色列表选择（先按关键字过滤，支持中文名）", value: "pick" },
                { label: "清除（none）", value: "none" },
                { label: "手动输入 id / 中文名", value: "manual" },
            ],
            { cancelLabel: "← 返回" },
        );
        if (!picked) return true;
        let val = typeof picked === "string" ? picked : picked.value;
        if (val === "pick") {
            val = await pickFromList("选择角色（每局直刷）", listCharacters(), (c) => `${c.name}　${c.id}`, (c) => c.id);
            if (!val) return true;
        } else if (val === "manual") {
            val = (await prompt("角色 id 或中文名: ")).trim();
            if (isCancel(val)) {
                log.info("已取消。");
                return true;
            }
        }
        await cmdChar(val);
        return true;
    }
    if (cmd === "set") {
        const which = await menu(
            "写配置（先选通道，再选具体项）",
            [
                { label: `调试键（${Object.keys(loadBtsKeys().tokens || {}).length} 项，带说明与现值；含粘性键清除）`, value: "debug" },
                { label: `游戏配置（配置备份里 ${listConfigPairs().length} 项，列键 + 现值）`, value: "idb" },
                { label: "启动键（localStorage：directstart / show_splash_off …）", value: "ls" },
                { label: "手动输入（k=v / ls.k=v / @id=v）", value: "raw" },
            ],
            { cancelLabel: "← 返回" },
        );
        if (!which) return true;
        const ch = typeof which === "string" ? which : which.value;
        const snap = (await readDebugKeys()) || {};
        if (ch === "debug") {
            const tokens = Object.entries(loadBtsKeys().tokens || {}).map(([token, meta]) => ({ token, ...(meta || {}) }));
            const id = await pickFromList(
                "选择调试键",
                tokens,
                (r) => `${r.id}　${r.token}　〔${r.life}〕　${String(r.note || "").split(/[；（(]|——/)[0].trim().slice(0, 22)}`,
                (r) => r.id,
            );
            if (!id) return true;
            const cur = snap[id] === undefined ? "?" : snap[id] === null ? "无" : String(snap[id]);
            const val = (await prompt(`新值（现值 ${cur}；空/none=删除该键${id === "autoChar" ? "，也可填角色 id/中文名" : ""}）: `)).trim();
            if (isCancel(val) && val !== "" && val !== "none") {
                log.info("已取消。");
                return true;
            }
            if (id === "autoChar") {
                await cmdChar(val === "" || val === "none" ? "none" : val);
                return true;
            }
            await cmdSet([`@${id}=${val === "none" ? "" : val}`]);
            return true;
        }
        if (ch === "idb") {
            const pairs = listConfigPairs();
            if (!pairs.length) {
                log.warn("读不到配置备份（先让页面跑一会儿完成首次备份）。");
                return true;
            }
            const key = await pickFromList("选择游戏配置项", pairs, ([k, v]) => `${k}　= ${showValue(v)}`, ([k]) => k);
            if (!key) return true;
            const cur = (pairs.find(([k]) => k === key) || [])[1];
            if (typeof cur === "boolean") {
                const b = await menu(
                    `「${key}」现值 ${cur} → 选新值`,
                    [
                        { label: "true（开）", value: "true" },
                        { label: "false（关）", value: "false" },
                    ],
                    { cancelLabel: "← 取消" },
                );
                if (!b) return true;
                await cmdSet([`${key}=${typeof b === "string" ? b : b.value}`]);
                return true;
            }
            const val = (await prompt(`新值（现值 ${showValue(cur)}；数组/字符串请带引号或写 JSON）: `)).trim();
            if (!val) {
                log.info("已取消。");
                return true;
            }
            await cmdSet([`${key}=${val}`]);
            return true;
        }
        if (ch === "ls") {
            const known = ["directstart", "show_splash_off"];
            let key = await pickFromList("选择启动键（localStorage）", known, (k) => k, (k) => k);
            if (!key) {
                key = (await prompt("启动键名（如 directstart）: ")).trim();
                if (isCancel(key)) {
                    log.info("已取消。");
                    return true;
                }
            }
            const val = (await prompt("值（如 true / off；空=删除该键）: ")).trim();
            await cmdSet([`ls.${key}=${val}`]);
            return true;
        }
        const line = (await prompt("输入写入项（如 show_splash=off / ls.directstart=true / @autoChar=bts_ch_x；空格分隔多项）: ")).trim();
        if (isCancel(line)) {
            log.info("已取消。");
            return true;
        }
        await cmdSet(line.split(/\s+/).filter(Boolean));
        return true;
    }

    if (cmd === "keys") {
        await cmdKeys({ flags: new Set(), values: {}, positional: [] });
        const id = await prompt("输入 id 看详情（回车跳过）: ");
        if (id) await cmdKeys({ flags: new Set(), values: {}, positional: [id] });
        return true;
    }
    if (cmd === "engine") {
        const picked = await menu(
            "选择要启动的服务器版本（测试数据按版本分离）:",
            engines.map((e) => ({
                label: `${e.label}（${e.key}）${samePath(e.root, currentEngine.root) ? " ← 当前" : ""}` ,
                value: e.key,
            })),
            { cancelLabel: "不切换" },
        );
        if (!picked) {
            log.info("已取消。");
            return true;
        }
        await cmdEngine(typeof picked === "string" ? picked : picked.value);
        return false;
    }
    if (cmd === "events") {
        await showEvents({ flags: new Set(), values: {}, sets: [], queries: [], positional: [] });
        return true;
    }
    if (cmd === "clean") {
        if (!(await confirm("删除测试数据（保留配置备份 persist*/seeds）？", { defaultYes: false }))) {
            log.info("已取消。");
            return true;
        }
        const all = await confirm("是否连同 archive/ 历史归档与 _tmp_* 临时输出一并清除？", { defaultYes: false });
        await cmdClean({ all });
        return false;
    }
    log.warn(`菜单未实现的动作：${usage}`);
    return true;
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
            console.log(`  · ${e.key}｜${e.label}@${e.port}${marks.length ? `（${marks.join('；')}）` : ''} → ${basename(dataDirFor(e))}/`);
            if (VERBOSE) {
                console.log(`      根目录：${e.root}`);
                console.log(`      数据目录：${dataDirFor(e)}`);
            }
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
    log.ok(`服务器版本已切换：${currentEngine.label}@${currentEngine.port} → ${target.label}@${target.port}（端口与数据按版本独立）`);
    if (VERBOSE) {
        console.log(`  根目录：${target.root}`);
        console.log(`  数据目录：${dataDirFor(target)}`);
    }
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
        log.info('服务器未运行 → 先以「无人值守」后台拉起。');
        await startDetached({ autoskipMs: DEFAULT_AUTOSKIP_MS, off: false, openUrl: '', quiet: true });
    }
    ensureEngineSeed(); // 沿用运行中实例时也要保证「有备份可导」（服务器按请求读盘，补上即对下次加载生效）
    const url = buildPageUrl({
        urlArg: opts.positional[0] || '',
        test: opts.flags.has('test'),
        char: await resolveCharArg(opts.values.char || ''),
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

/** POST 到服务器待注入队列：sets=IDB config 项；ls=localStorage 项（server 加 noname_0.9_ 前缀）；
 *  direct=调试键原地写（键名原样、不加前缀；null=删除；一次性消费，页面下一次加载即生效）。
 *  成功返回 {ok:true,count}；服务器不可用返回 null。 */
function postPending(setsObj, note, lsObj, directObj) {
    return new Promise((done) => {
        const body = JSON.stringify({
            sets: setsObj || {},
            note: note || '',
            ls: lsObj || undefined,
            direct: directObj || undefined,
        });
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

// ---- 可选项数据源（菜单/命令共用；只读 + 进程内缓存）----
/** 角色清单（id + 中文名）：扫 zip/source/character 下的翻译映射（`bts_ch_xxx: '名'`）。 */
let _charsCache = null;
function listCharacters() {
    if (_charsCache) return _charsCache;
    const map = new Map();
    const RE = /^\s*(bts_(?:diy_)?ch_[a-z0-9_]+):\s*'([^']+)'/gm;
    const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.js'))
                for (const m of readFileSync(p, 'utf-8').matchAll(RE)) if (!map.has(m[1])) map.set(m[1], m[2]);
        }
    };
    try {
        walk(join(__dirname, '..', 'source', 'character'));
    } catch {
        /* 源码树缺失：给空表（命令会提示） */
    }
    _charsCache = [...map.entries()]
        .filter(([id]) => !id.endsWith('_prefix')) // `*_prefix` 是前缀/组合实体，不是可选角色
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return _charsCache;
}

/** 角色 id → 中文名（未知名返回 null）。 */
function charName(id) {
    const hit = listCharacters().find((c) => c.id === id);
    return hit ? hit.name : null;
}

/** 游戏配置项（[键, 现值]）：读最近的配置备份 data/persist.json（页面每 30s 备份一次）。 */
function listConfigPairs() {
    try {
        const pj = JSON.parse(readFileSync(persistFile, 'utf-8'));
        const cfg = pj && pj.dbs && pj.dbs['noname_0.9_data'] && pj.dbs['noname_0.9_data'].stores
            ? pj.dbs['noname_0.9_data'].stores.config
            : null;
        if (Array.isArray(cfg))
            return cfg
                .filter((r) => Array.isArray(r) && r.length === 2)
                .map(([k, v]) => [String(k), v])
                .sort((a, b) => a[0].localeCompare(b[0]));
    } catch {
        /* 无备份 / 结构不同：给空表 */
    }
    return [];
}

/** 关键字匹配（大小写不敏感；空关键字=全部）。 */
function matchKw(kw, ...fields) {
    const k = String(kw || '').trim().toLowerCase();
    if (!k) return true;
    return fields.some((f) => String(f === undefined || f === null ? '' : f).toLowerCase().includes(k));
}

/** 值显示（长值折叠）。 */
function showValue(v) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const t = s === undefined ? String(v) : s;
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
}

/** 交互：关键字过滤 + 编号选择（返回选中项的 value；取消返回 null）。 */
async function pickFromList(title, items, toLabel, toValue, { limit = 20 } = {}) {
    const kw = await prompt('关键字过滤（回车=全部）: ');
    const hits = items.filter((it) => matchKw(kw, toValue(it), toLabel(it)));
    if (!hits.length) {
        log.warn(`没有匹配「${kw}」的项（共 ${items.length} 项）。`);
        return null;
    }
    if (hits.length > limit) log.info(`匹配 ${hits.length} 项，列前 ${limit} 项（可再输更精确的关键字）。`);
    const picked = await menu(
        title,
        hits.slice(0, limit).map((it) => ({ label: toLabel(it), value: toValue(it) })),
        { cancelLabel: '← 取消' },
    );
    return picked ? (typeof picked === 'string' ? picked : picked.value) : null;
}

/** 输入里的「取消」写法（空 / 0 / q / 取消 / 返回）。 */
const isCancel = (s) => /^(0|q|quit|cancel|取消|返回|←)$/i.test(String(s || '').trim());

/** 读页面最近上报的调试键快照（服务器未跑或页面未上报 → null）。 */
async function readDebugKeys() {
    if (!(await isRunning())) return null;
    const stats = await getJson(URL_BASE + '__playtest/stats');
    return (stats && stats.data && stats.data.debugKeys) || null;
}

/** 调试键登记表（唯一事实源 _others/debug/bts-keys.json；server 与两个客户端同表）。 */
let _btsKeysTable = null;
function loadBtsKeys() {
    if (_btsKeysTable) return _btsKeysTable;
    const f = join(debugDir, 'bts-keys.json');
    try {
        _btsKeysTable = JSON.parse(readFileSync(f, 'utf-8'));
    } catch (e) {
        log.error(`调试键登记表读取失败：${f}（${(e && e.message) || e}）`);
        process.exit(1);
    }
    return _btsKeysTable;
}
/** id → 键名（未登记返回 null，由调用方决定是报错还是列候选）。 */
function btsKeyOrNull(id) {
    const tokens = loadBtsKeys().tokens || {};
    for (const [token, meta] of Object.entries(tokens)) if (meta && meta.id === id) return token;
    return null;
}
/** id → 键名（未登记即 fail-fast，供内部固定用法）。 */
function btsKey(id) {
    const token = btsKeyOrNull(id);
    if (!token) {
        log.error(`未登记的调试键 id：${id}（用 keys 查登记表）`);
        process.exit(1);
    }
    return token;
}

/** --char 的「清除」语义值（大小写不敏感）：清掉每局直刷角色（__bts_auto_char，粘性键）与测试台点名。 */
const CHAR_CLEAR_VALUES = new Set(['none', 'off', 'clear', '0', 'false']);

/**
 * --char 归一：清除值改走「服务器 direct 一次性通道」（免 URL——集成浏览器会截断长 query），
 * 成功时返回空串（不再下发 __bts_char）；服务器不可用（未运行/旧版）则原样返回，由页面按 URL
 * 语义清除（playtest_client 的 URL_CHAR_CLEAR）。非清除值原样返回。
 */
async function resolveCharArg(char) {
    const v = String(char || '');
    if (!CHAR_CLEAR_VALUES.has(v.toLowerCase())) return v;
    const pushed = await postPending({}, `playtest --char ${v}：清除每局直刷/点名角色`, null, {
        [btsKey('autoChar')]: null,
        [btsKey('testChar')]: null,
    });
    if (!pushed || !pushed.ok) return v; // 回退：URL 语义（页面侧同样清除）
    log.ok(`已请求清除「每局直刷」角色（${v}）——下次页面加载生效（服务器 direct 通道）`);
    return '';
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
/**
 * set 子命令：写配置 / 调试键（一次 POST 可混用三通道）。
 *   k=v        → IDB config（游戏配置，页面写库并回执）
 *   ls.k=v     → localStorage（无名杀启动键；server 加非ame.9_ 前缀；空值=删除）
 *   @id=v      → 调试键（登记表 id；走 direct 一次性通道、键名原样；空值=删除；id 见 keys）
 * 例：set show_splash=off／set @autoChar=bts_ch_zhenzhu／set @autoChar=（清除）／set ls.directstart=true
 */
async function cmdSet(pairs) {
    if (!pairs.length) {
        log.error('用法：set <k=v | ls.k=v | @id=v> […]');
        console.log('  例：set show_splash=off · set ls.directstart=true · set @autoChar=bts_ch_zhenzhu · set @autoChar=（清除）');
        process.exitCode = 1;
        return;
    }
    const sets = {};
    const ls = {};
    const direct = {};
    for (const p of pairs) {
        const i = p.indexOf('=');
        const k = i === -1 ? p : p.slice(0, i);
        const v = i === -1 ? '' : p.slice(i + 1);
        if (!k) continue;
        if (k.startsWith('@')) {
            // 调试键：id 必须在登记表内（拼错即失败并给出候选，见 keys）
            const token = btsKeyOrNull(k.slice(1));
            if (!token) {
                log.error(`未登记的调试键 id：「${k.slice(1)}」——用 keys 查登记表（或 keys --json）。`);
                process.exitCode = 1;
                return;
            }
            direct[token] = v === '' ? null : parseSetValueJsonFirst(v);
        } else if (k.startsWith('ls.')) {
            ls[k.slice(3)] = v === '' ? null : parseSetValueJsonFirst(v);
        } else {
            sets[k] = parseSetValueJsonFirst(v);
        }
    }
    const desc = [];
    if (Object.keys(sets).length) desc.push(`${Object.keys(sets).length} 项 IDB`);
    if (Object.keys(ls).length) desc.push(`${Object.keys(ls).length} 项 localStorage`);
    if (Object.keys(direct).length) desc.push(`${Object.keys(direct).length} 项调试键`);
    if (!desc.length) {
        log.error('没有可写入的键。');
        process.exitCode = 1;
        return;
    }
    if (!(await isRunning())) {
        log.info('服务器未运行 → 先以「手动模式」后台拉起（只注入，不自动游玩）。');
        await startDetached({ off: true, openUrl: '', quiet: true });
    }
    const r = await postPending(sets, 'playtest set', Object.keys(ls).length ? ls : null, Object.keys(direct).length ? direct : null);
    if (!r || !r.ok) {
        log.warn('服务器无待注入端点（旧版？）→ 回退 URL 注入（集成浏览器可能截断长参数；@id 不受支持）。');
        const url = buildPageUrl({ sets: pairs, noAuto: true });
        console.log(`  注入页：${url}`);
        const opened = await openBrowser(url);
        if (opened) log.ok('设置注入页已打开（URL 通道）：页面将写入游戏配置并自动重载。');
        return;
    }
    log.ok(`已下发 ${desc.join(' · ')} → 页面下一次加载生效`);
    const logBefore = existsSync(persistLogFile) ? readFileSync(persistLogFile, 'utf-8').length : 0;
    // IDB 项需要页面写库（用 noauto，免得开局打断写入）；纯启动键/调试键由 server 内联，
    // 直接开默认页（保持无人值守），避免把正在跑的自动页换成手动页。
    const opened = await openBrowser(Object.keys(sets).length ? buildPageUrl({ noAuto: true }) : URL_BASE);
    if (!opened) {
        process.exitCode = 1;
        return;
    }
    // IDB 项需页面写库回执；ls / 调试键由 server 内联（本页加载即已生效），无需等回执
    if (Object.keys(sets).length) reportSetVerdict(await waitPersistVerdict(logBefore));
    else
        log.info(
            '启动键由 server 内联（每次加载重放）、调试键由 playtest 页面拉取落地——本次打开的页面已生效（非 playtest 页不拉取）。',
        );
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
    const charArg = await resolveCharArg(opts.values.char || ''); // --char none：清除直刷角色
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
            char: charArg,
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
            char: charArg,
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

/**
 * keys 子命令：调试键登记表（回答「这个键在哪设置/什么生命周期/怎么清」）。
 *   keys                    一览：id / 键名 / 生命周期 / 备注（sticky 必写清除路径）
 *   keys <id>               单项详情（含 owner / writers / 备注）
 *   keys --owner playtest --life sticky --json
 */
async function cmdKeys(opts = { flags: new Set(), values: {}, positional: [] }) {
    const table = loadBtsKeys();
    const tokens = table.tokens || {};
    const owner = opts.values.owner;
    const life = opts.values.life;
    const wantId = opts.positional[0];
    const rows = Object.entries(tokens)
        .map(([token, meta]) => ({ token, ...(meta || {}) }))
        .filter((r) => (!owner || r.owner === owner) && (!life || r.life === life))
        .filter((r) => !wantId || r.id === wantId);
    if (opts.flags.has("json")) {
        console.log(JSON.stringify(wantId ? rows[0] || null : rows, null, 2));
        if (wantId && !rows.length) process.exitCode = 1;
        return;
    }
    if (wantId) {
        if (!rows.length) {
            log.error(`登记表里没有 id = ${wantId}（用 keys 看全部）。`);
            process.exitCode = 1;
            return;
        }
        const r = rows[0];
        console.log(`${r.id}  →  ${r.token}`);
        console.log(`  生命周期：${r.life} · 归属：${r.owner} · 类型：${r.kind}`);
        if (Array.isArray(r.writers) && r.writers.length) console.log(`  写入方：${r.writers.join(' / ')}`);
        console.log(`  备注：${r.note || '—'}`);
        return;
    }
    if (!rows.length) {
        log.warn('登记表为空（或过滤条件过严）。');
        return;
    }
    const wId = Math.max(3, ...rows.map((r) => String(r.id || "").length));
    const wTok = Math.max(8, ...rows.map((r) => r.token.length));
    const wLife = Math.max(4, ...rows.map((r) => String(r.life || "").length));
    console.log(`${"id".padEnd(wId)}  ${"键名".padEnd(wTok)}  ${"生命周期".padEnd(wLife)}  备注`);
    for (const r of rows) {
        // 备注只留第一分句（到 ；/——/（ 为止），表格不被长句撑爆
        const note = String(r.note || "").split(/[；（(]|——/)[0].trim().slice(0, 42);
        console.log(`${String(r.id).padEnd(wId)}  ${r.token.padEnd(wTok)}  ${String(r.life).padEnd(wLife)}  ${note}`);
    }
    console.log(`（共 ${rows.length} 条 · 详情 keys <id> · 全字段：--json · 文件：_others/debug/bts-keys.json）`);
}

/**
 * chars 子命令：列出可选角色（id + 中文名）——不用记 id，直接查 / 直接选。
 *   chars [关键字] [--json]      关键字可匹配 id 或中文名（如 chars 真）
 */
async function cmdChars(opts = { flags: new Set(), values: {}, positional: [] }) {
    const all = listCharacters();
    if (!all.length) {
        log.warn('扫不到角色清单（zip/source/character 缺失？）。');
        process.exitCode = 1;
        return;
    }
    const kw = opts.positional[0];
    const hits = all.filter((c) => matchKw(kw, c.id, c.name));
    if (opts.flags.has('json')) {
        console.log(JSON.stringify(hits, null, 2));
        return;
    }
    if (!hits.length) {
        log.warn(`没有匹配「${kw}」的角色（共 ${all.length} 个）。`);
        return;
    }
    for (const c of hits) console.log(`  ${c.id.padEnd(30)}${c.name}`);
    console.log(`（共 ${hits.length}/${all.length} 个 · 设直刷：char <id|中文名> · 来源 zip/source/character）`);
}

/**
 * config 子命令：列出游戏配置项与现值（来自最近一次配置备份 persist.json，页面每 30s 备份）。
 *   config [关键字] [--json]     改值：set <键>=<值>（或菜单「配置与注入 → 写配置」）
 */
async function cmdConfig(opts = { flags: new Set(), values: {}, positional: [] }) {
    const pairs = listConfigPairs();
    if (!pairs.length) {
        log.warn('读不到配置备份（data/persist.json 不存在或为空）——先让页面跑一会儿完成首次备份。');
        process.exitCode = 1;
        return;
    }
    const kw = opts.positional[0];
    const hits = pairs.filter(([k, v]) => matchKw(kw, k, showValue(v)));
    if (opts.flags.has('json')) {
        console.log(JSON.stringify(Object.fromEntries(hits), null, 2));
        return;
    }
    if (!hits.length) {
        log.warn(`没有匹配「${kw}」的配置项（共 ${pairs.length} 项）。`);
        return;
    }
    for (const [k, v] of hits) console.log(`  ${k.padEnd(42)}${showValue(v)}`);
    console.log(`（共 ${hits.length}/${pairs.length} 项 · 现值取自 ${dataRel(persistFile)}（≤30s 前） · 改：set <键>=<值>）`);
}

/**
 * char 子命令：查看 / 设置 / 清除「每局直刷」角色（粘性键 __bts_auto_char）。
 *   char                 看现值（页面心跳上报，含当前页模式）
 *   char <id|中文名>     设为该角色：校验 → 下发 direct → **立即刷新调试页** → 等页面确认生效
 *   char none            清除（同时清掉测试台点名键）
 *   --no-wait            跳过「等页面确认」（只下发 + 刷新）
 * 为什么要刷新页面：键值只存在浏览器里，direct 由 server 在 HTML 里内联——必须有一次页面加载才落地
 * （2026-10-11 用户实测「输入 none 后没生效」＝页面是测试台/未重载，故本命令改为立即刷新并确认）。
 */
async function cmdChar(arg = '', opts = { flags: new Set(), values: {} }) {
    const token = btsKeyOrNull('autoChar');
    let v = String(arg || '').trim();
    if (!v) {
        const k = await readDebugKeys();
        if (!k) {
            log.info('取不到现值（服务器未运行或页面未上报）——拉起：npm run playtest -- auto');
            return;
        }
        if (Date.now() - (k.at || 0) > 90000) log.warn('该值来自 >90 秒前的心跳，页面可能已关闭。');
        log.ok(`每局直刷角色：${k.autoChar ? `${charName(k.autoChar) || '?'}（${k.autoChar}）` : '无（未设置）'}`);
        if (k.testChar) console.log(`  测试台点名：${charName(k.testChar) || k.testChar}`);
        console.log(`  设：char <id|中文名> · 清：char none · 查角色：chars [关键字] · 当前页模式：${k.mode || '?'}`);
        return;
    }
    const clear = /^(none|off|clear|清|清除|0|false)$/i.test(v);
    if (!clear) {
        const hit = listCharacters().find((c) => c.id === v || c.name === v);
        if (!hit) {
            log.error(`未知角色「${v}」——用 chars [关键字] 查（共 ${listCharacters().length} 个，支持中文名）。`);
            process.exitCode = 1;
            return;
        }
        v = hit.id;
    }
    if (!(await isRunning())) {
        log.info('服务器未运行 → 先以「无人值守」后台拉起（键值需要页面落地）。');
        await startDetached({ autoskipMs: DEFAULT_AUTOSKIP_MS, off: false, openUrl: '', quiet: true });
    }
    const direct = clear ? { [token]: null, [btsKeyOrNull('testChar')]: null } : { [token]: v };
    const r = await postPending({}, `playtest char ${clear ? 'clear' : v}`, null, direct);
    if (!r || !r.ok) {
        log.warn('下发失败（服务器无待注入端点？）——确认服务器为当前版本：npm run playtest -- status');
        process.exitCode = 1;
        return;
    }
    log.ok(clear ? '已清除「每局直刷」角色（含测试台点名）。' : `每局直刷角色 → ${charName(v) || v}（${v}）`);
    const opened = await openBrowser(URL_BASE);
    if (!opened) {
        log.warn('未能自动打开/刷新调试页——请手动刷新页面后生效。');
        return;
    }
    if (opts.flags.has('no-wait')) return;
    const want = clear ? null : v;
    // 客户端落地后会立刻上报一次 debug-keys 快照 → 通常 1~3 秒即可确认
    for (let i = 0; i < 10; i++) {
        await sleep(2000);
        const k = await readDebugKeys();
        if (k && (k.autoChar || null) === want) {
            log.ok(`已生效（页面确认：每局直刷=${k.autoChar ? `${charName(k.autoChar) || '?'}（${k.autoChar}）` : '无'}，模式 ${k.mode || '?'}）`);
            return;
        }
    }
    log.warn('20 秒内未收到页面确认（页面未加载 playtest 客户端？）——请刷新调试页；只有 playtest 页面会拉取该队列。');
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
        if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
            printUsage(opts.positional[0]);
            return;
        }
        if (!cmd) {
            await runInteractive();
            return;
        }
        if (cmd === 'auto') {
            const ms = opts.values.ms === undefined ? DEFAULT_AUTOSKIP_MS : Number(opts.values.ms);
            // --char none 等清除值：服务器在跑 → 走 direct 一次性通道（可靠）；未跑 → 保留 URL 语义。
            const char = (await isRunning())
                ? await resolveCharArg(opts.values.char || '')
                : opts.values.char || '';
            const openUrl = opts.flags.has('no-open')
                ? ''
                : buildPageUrl({
                      test: opts.flags.has('test'),
                      char,
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
        } else if (cmd === 'keys') {
            await cmdKeys(opts);
        } else if (cmd === 'chars') {
            await cmdChars(opts);
        } else if (cmd === 'config') {
            await cmdConfig(opts);
        } else if (cmd === 'char') {
            await cmdChar(opts.positional[0] || '');
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
