#!/usr/bin/env node

/**
 * 崩铁杀 连续游玩控制台（调试服务器 + 页面注入 + 无人值守）
 *
 * AI / 自动化用法（全程「子命令 + 参数」直用，绝不进交互菜单）：
 *   node scripts/playtest.mjs auto [ms] [--no-auto] [--no-open] [--char <id>] [--test] [--set k=v]... [--query k=v]...
 *       后台启动（detached）。ms=崩溃/卡死自动跳过毫秒（0=关闭，缺省 15000）；--no-auto=后台但不自动游玩
 *       （手动观测）；--no-open=不自动打开浏览器；--char=打开页后直启/每局直刷指定角色（bts_ch_xxx）；
 *       --test=打开测试台页；--set k=v=注入游戏配置（可多次）；--query k=v=附加任意 URL 参数（可多次）。
 *       已在运行且参数不一致 → 自动停止并按新参数重启；参数一致 → 沿用实例并打开页面（2026-09-29 修复：
 *       此前沿用时静默不打开，`auto --char` 等同于没执行；现沿用也执行打开，除非 --no-open）。
 *       打开时遵循「一页纪律」：先关闭同源旧调试页（`--keep` 保留）——多页同开会让多个游戏实例竞争写
 *       同一 IndexedDB，造成备份互覆 / 设置漂移（2026-09-29 实机复盘）。
 *   node scripts/playtest.mjs open [url] [--test] [--char <id>] [--no-auto] [--keep] [--restore fill|force] [--set k=v]... [--query k=v]...
 *       在 VS Code 内置浏览器打开调试页（未运行时自动以默认模式拉起）；url 可省略（默认首页）或相对路径。
 *   node scripts/playtest.mjs set k=v [...]      写入游戏配置（经服务器待注入队列下发；未运行则手动模式拉起；
 *        页面自取写库并重载——免 URL 长参数，集成浏览器同样可靠；旧版服务器自动回退 URL __bts_set）
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
 * 实现本体在 _others/debug/：server.mjs（静态服务 + 注入 + /__playtest/* 端点）、
 * playtest_client.js（页面侧状态机）、persist_client.js（页面侧备份/恢复/设置注入）。
 * 页面生命周期（2026-09-29）：open/auto 打开新页时，辅助扩展会先关闭「标题匹配调试页」的旧浏览器标签
 * （同名多开 = 多个游戏实例竞争写同一 IndexedDB；见《调试与自动化测试手册》§2.3）。AI 接管页面的推荐
 * 姿势：在浏览器工具中导航/打开目标 URL（复用一个已共享页面），而不是依赖脚本打开的未共享新页。
 * 本脚本只负责「拉起 / 停止 / 观察」；交互约定复用 scripts/lib/interactive.mjs（仅无参时的菜单）。
 */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, confirm, closeInteractive } from './lib/interactive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);
const debugDir = resolve(__dirname, '..', '..', '_others', 'debug');
const serverFile = join(debugDir, 'server.mjs');
const playtestLog = join(debugDir, 'data', 'playtest.jsonl');
const helperSrcDir = join(debugDir, 'helper-ext');
const persistFile = join(debugDir, 'data', 'persist.json');
const persistLogFile = join(debugDir, 'data', 'persist-log.jsonl');
const seedDir = join(debugDir, 'data', 'seeds');
const seedFile = join(seedDir, 'persist.seed.json');
const nncfgDir = resolve(__dirname, '..', 'style', 'nncfg');
const nncfgDefaultFile = join(nncfgDir, 'win11.0.nncfg');
const HELPER_ID = 'bts-debug.playtest-helper';

const PORT = 8931;
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
 *  2026-09-29：改为只读尾部——此前全量读取，日志数 MB 时 openBrowser 轮询会反复全量扫描。 */
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
 *  2026-09-29：加入「内容比对」——源文件与已装版本不一致时覆盖更新并提示重载窗口
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

/** 读取服务器 env 摘要（stats.env；旧版服务器无此字段时返回 null） */
async function readServerEnv() {
    const stats = await getJson(URL_BASE + '__playtest/stats');
    return stats && stats.data ? (stats.data.env ?? null) : null;
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
 * 2026-09-29：需要值的选项缺参时立即返回 { error }（此前 `--set` 缺参会把 undefined 带下去，
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
            if (name === 'char' || name === 'restore' || name === 'file' || name === 'tail' || name === 'type') {
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

/** 读取辅助扩展的标签操作报告（2026-09-29 新增；旧版辅助扩展不产生该文件——静默跳过）。
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
 * 标签治理（2026-09-29）：默认先关闭「标题匹配调试页」的旧浏览器标签（一页纪律；keep=true 保留）。
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
    const dumpFile = join(debugDir, 'data', 'helper-tabs.json');
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
    if (!existsSync(persistFile)) {
        if (existsSync(seedFile)) {
            mkdirSync(join(debugDir, 'data'), { recursive: true });
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

function ensureServerFile() {
    if (existsSync(serverFile)) return true;
    log.error(`未找到调试服务器：${serverFile}`);
    return false;
}

/** 按端口停止调试服务器（等价 stop-debug-server.cmd，跨 shell 安全） */
function stopServer() {
    if (process.platform !== 'win32') {
        log.warn('停止逻辑目前仅实现 Windows（按端口杀进程）；请手动结束 server.mjs。');
        return;
    }
    const ps =
        `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ` +
        'Select-Object -ExpandProperty OwningProcess -Unique | ' +
        'ForEach-Object { Stop-Process -Id $_ -Force; "killed PID $_" }';
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
        encoding: 'utf8',
        windowsHide: true,
    });
    const out = (r.stdout || '').trim();
    if (out) log.ok('已停止：' + out.split(/\r?\n/).join('；'));
    else log.info(`端口 ${PORT} 未在运行。`);
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
    let reuse = false; // 沿用现有实例（不重启）——2026-09-29：沿用也继续走「打开页面」而非直接 return
    if (await isRunning()) {
        log.warn(`服务器已在运行（${URL_BASE}）。`);
        let needRestart = false;
        if (allowRestart) {
            needRestart = await confirm('是否停止后按新参数重启？', { defaultYes: false });
            if (!needRestart) {
                log.info('沿用现有实例（其配置由首次启动时决定）。');
                reuse = true;
            }
        } else {
            const env = await readServerEnv();
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
        const child = spawn(process.execPath, ['server.mjs'], {
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
        console.log(
            off
                ? '  配置：playtest=关闭自动游玩（页面刷新后仅手动/直测）'
                : `  配置：playtest=自动启用；崩溃/卡死自动跳过=${autoskipMs ? autoskipMs + 'ms' : '关闭（崩溃即停）'}`,
        );
        console.log('  停止：npm run playtest -- stop（或菜单选「停止服务器」）');
    }
    // 打开页面（2026-09-29 修复：沿用实例时同样执行——此前沿用时静默返回、不打开页面，auto --char 形同虚设）
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
    const env = { ...process.env, BTS_PLAYTEST_OFF: '1' };
    delete env.BTS_PLAYTEST;
    delete env.BTS_AUTOSKIP_MS;
    const child = spawn(process.execPath, ['server.mjs'], {
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
        return;
    }
    log.ok(`服务器运行中：${URL_BASE}`);
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
        console.log(
            `  持久化日志：data/persist-log.jsonl（${(pLogInfo.bytes / 1024).toFixed(1)} KB；页面侧备份/恢复 trace）`,
        );
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
  status --json  机器可读（含服务器 env 与页面计数，供 AI 解析）
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
                { label: '恢复配置数据（缺失自动补缺；可选强制覆盖）', value: 'restore' },
                { label: '制作配置种子快照（把当前健康备份固定为回退基准）', value: 'seed' },
                { label: '停止服务器（释放 8931 端口）', value: 'stop' },
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
        } else if (value === 'restore') {
            const force = await confirm('是否强制覆盖恢复（--force）？默认普通补缺（仅补缺失键）', {
                defaultYes: false,
            });
            await restoreConfig({ force });
        } else if (value === 'seed') {
            snapshotSeed();
        } else if (value === 'stop') {
            stopServer();
        } else if (value === 'status') {
            await showStatus();
        }
    } finally {
        closeInteractive();
    }
}

/** open 子命令：确保服务器在跑 → 组装含各参数的页面 URL → 打开并核验 */
async function cmdOpen(opts) {
    if (!(await isRunning())) {
        log.info('服务器未运行 → 先以默认模式（无人值守）后台拉起…');
        await startDetached({ autoskipMs: DEFAULT_AUTOSKIP_MS, off: false, openUrl: '' });
    }
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
 * 2026-09-29 起优先走「服务器待注入队列」下发（POST /__bts/pending → 打开注入页 → 页面自取写库）：
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
        } else if (cmd === 'stop') {
            stopServer();
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
