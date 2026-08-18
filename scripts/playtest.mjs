#!/usr/bin/env node

/**
 * 崩铁杀 连续游玩控制台（调试服务器 + 页面注入 + 无人值守）
 *
 * 一条 npm 入口管理整套连续游玩环境：
 *   npm run playtest                  打开交互菜单，按序号选择操作
 *   npm run playtest -- auto [ms]     后台无人值守启动（默认 15000ms；0=崩溃即停），随后自动在内置浏览器打开页面
 *   npm run playtest -- fg            前台启动（调试用：关闭自动游玩、日志直出；会先停掉在跑的实例）
 *   npm run playtest -- open          在 VS Code 内置浏览器打开调试页面（自动安装/核验辅助扩展）
 *   npm run playtest -- restore [--force]  恢复配置数据（备份缺失时用种子回填；--force 强制覆盖）
 *   npm run playtest -- seed          把当前服务端备份固定为「种子快照」（灾难回退基准）
 *   npm run playtest -- stop          停止服务器（释放 8931 端口）
 *   npm run playtest -- status        查看运行状态与统计
 *
 * 「内置浏览器打开」原理：本仓库自带极小辅助扩展 _others/debug/helper-ext（注册 URI 处理器），
 * 脚本调起 vscode://bts-debug.playtest-helper/open?url=… → 扩展内执行 simpleBrowser.show。
 * （vscode://command 形式不存在，勿用；细节见 helper-ext/README.md 与《调试与自动化测试手册》§2.3。）
 *
 * 实现本体在 _others/debug/：server.mjs（静态服务 + 注入 + /__playtest/* 端点）、
 * playtest_client.js（页面侧状态机）。本脚本只负责「拉起 / 停止 / 观察」，
 * 交互约定复用 scripts/lib/interactive.mjs（与 sync.mjs / purge.mjs 等同款编号菜单）。
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

/** 统计 playtest.jsonl 中 boot 事件数（用于验证「浏览器是否真的打开了页面」） */
function countBoots() {
    try {
        const txt = readFileSync(playtestLog, 'utf-8');
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

/** 安装/核验辅助扩展（把 helper-ext 复制为 <扩展目录>/bts-debug.playtest-helper-1.0.0） */
function ensureHelper() {
    if (!existsSync(helperSrcDir)) {
        log.error(`缺少辅助扩展源码目录：${helperSrcDir}`);
        return { ok: false, reason: 'no-source' };
    }
    const extDir = getExtensionsDir();
    const dest = join(extDir, `${HELPER_ID}-1.0.0`);
    if (existsSync(join(dest, 'package.json'))) {
        return { ok: true, dest, fresh: false };
    }
    try {
        mkdirSync(dest, { recursive: true });
        for (const f of ['package.json', 'extension.js', 'README.md']) {
            copyFileSync(join(helperSrcDir, f), join(dest, f));
        }
    } catch (e) {
        return { ok: false, reason: String((e && e.message) || e), dest };
    }
    return { ok: true, dest, fresh: true };
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

/**
 * 在 VS Code 内置浏览器打开页面（含辅助扩展安装与结果核验）。
 * 核验：轮询 boot 计数（页面已加载并起 playtest 客户端）与 stats.pageLoads（新服务器）。
 */
async function openBrowser(url, { waitMs = 15000 } = {}) {
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
        log.warn(`首次安装辅助扩展 → ${helper.dest}`);
        log.warn('请执行一次「开发人员: 重新加载窗口」（Ctrl+R）后重试（一次性操作）。');
    }
    const bootsBefore = countBoots();
    const stats0 = await getJson(URL_BASE + '__playtest/stats');
    const loads0 =
        stats0 && stats0.data && typeof stats0.data.pageLoads === 'number' ? stats0.data.pageLoads : null;
    const uri = `vscode://${HELPER_ID}/open?url=${encodeURIComponent(url)}`;
    log.info('调起 VS Code：' + uri);
    fireVsCodeUri(uri);
    const t0 = Date.now();
    while (Date.now() - t0 < waitMs) {
        await sleep(1000);
        if (countBoots() > bootsBefore) {
            log.ok(`已在 VS Code 内置浏览器打开：${url}`);
            return true;
        }
        if (loads0 !== null) {
            const stats = await getJson(URL_BASE + '__playtest/stats');
            const loads = stats && stats.data && stats.data.pageLoads;
            if (typeof loads === 'number' && loads > loads0) {
                log.ok(`已在 VS Code 内置浏览器打开：${url}`);
                return true;
            }
        }
    }
    log.warn('未检测到新页面加载。可能原因：');
    console.log('  1) 辅助扩展刚安装 → 需重载一次 VS Code 窗口（Ctrl+R）后重试；');
    console.log('  2) VS Code 未运行或 URI 被安全软件拦截；');
    console.log(`  3) 手动兜底：在内置浏览器（或任意浏览器）打开 ${url}`);
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
 * 后台无人值守启动（脱离当前终端）。
 * @param {{autoskipMs?: number, open?: boolean, allowRestart?: boolean}} opts
 *   allowRestart=true 时，若服务器已在运行会询问「停止后按新参数重启」（交互菜单用；CLI 保持沿用）
 */
async function startDetached({ autoskipMs = DEFAULT_AUTOSKIP_MS, allowRestart = false } = {}) {
    if (!ensureServerFile()) process.exit(1);
    if (await isRunning()) {
        log.warn(`服务器已在运行（${URL_BASE}）。`);
        if (allowRestart && (await confirm('是否停止后按新参数重启？', { defaultYes: false }))) {
            stopServer();
            for (let i = 0; i < 10 && (await isRunning()); i++) await sleep(300);
            if (await isRunning()) {
                log.error(`停止失败：端口 ${PORT} 仍被占用。`);
                process.exit(1);
            }
        } else {
            log.info('沿用现有实例（其配置由首次启动时决定）。');
            return;
        }
    }
    const child = spawn(process.execPath, ['server.mjs'], {
        cwd: debugDir,
        detached: true,
        stdio: 'ignore',
        env: (() => {
            const env = {
                ...process.env,
                BTS_PLAYTEST: '1',
                ...(autoskipMs ? { BTS_AUTOSKIP_MS: String(autoskipMs) } : {}),
            };
            delete env.BTS_PLAYTEST_OFF; // 无人值守优先：勿让残留的关闭开关赢过开启
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
    log.ok('已在后台启动（无人值守）：');
    console.log(`  地址：${URL_BASE}`);
    console.log(
        `  配置：playtest=自动启用；崩溃/卡死自动跳过=${autoskipMs ? autoskipMs + 'ms' : '关闭（崩溃即停）'}`,
    );
    console.log('  停止：npm run playtest -- stop（或菜单选「停止服务器」）');
    await openBrowser(URL_BASE); // 自动打开 VS Code 内置浏览器并核验（辅助扩展异常时打印兑底指引）
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

/** 查看运行状态与统计 */
async function showStatus() {
    if (!(await isRunning())) {
        log.info(`服务器未运行（${URL_BASE}）——用「无人值守启动」拉起。`);
        return;
    }
    log.ok(`服务器运行中：${URL_BASE}`);
    const stats = await getJson(URL_BASE + '__playtest/stats');
    const d = stats && stats.data;
    if (d) {
        const loads = typeof d.pageLoads === 'number' ? d.pageLoads : '—';
        console.log(
            `  计数（本服务器实例累计）：页面加载 ${loads}；对局开始 ${d.gameStart} / 结束 ${d.gameEnd} / clean ${d.cleanEnd}；错误 ${d.errors} / 挂起 ${d.pauses}（entries ${d.entries}）`,
        );
    } else {
        log.warn('未取到 /__playtest/stats（页面尚未打开或服务器版本过旧）。');
    }
    try {
        if (existsSync(playtestLog)) {
            const st = statSync(playtestLog);
            console.log(`  落盘日志：${playtestLog}`);
            console.log(
                `  （${(st.size / 1024).toFixed(1)} KB，更新于 ${st.mtime.toISOString()}；完整汇总：node _others/debug/log-audit.mjs）`,
            );
        }
    } catch {
        /* 忽略读取失败 */
    }
    try {
        if (existsSync(persistLogFile)) {
            const ps = statSync(persistLogFile);
            console.log(
                `  持久化日志：data/persist-log.jsonl（${(ps.size / 1024).toFixed(1)} KB；页面侧备份/恢复 trace）`,
            );
        }
    } catch {
        /* 忽略读取失败 */
    }
}

function printUsage() {
    console.log(`用法:
  node scripts/playtest.mjs                    打开交互菜单（= npm run playtest）
  node scripts/playtest.mjs auto [ms]          后台无人值守启动（默认 ${DEFAULT_AUTOSKIP_MS}ms；0=关闭自动跳过），随后自动在内置浏览器打开
  node scripts/playtest.mjs fg                 前台启动（调试用：关闭自动游玩；会先停掉在跑的实例）
  node scripts/playtest.mjs open               在 VS Code 内置浏览器打开调试页面
  node scripts/playtest.mjs restore [--force]  恢复配置数据（缺失自动补缺；--force 强制覆盖）
  node scripts/playtest.mjs seed               制作配置种子快照（灾难回退基准）
  node scripts/playtest.mjs stop               停止服务器
  node scripts/playtest.mjs status             查看运行状态 / 统计
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

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    try {
        if (!cmd) {
            await runInteractive();
            return;
        }
        if (cmd === 'auto') {
            const msArg = args.slice(1).find((a) => /^\d+$/.test(a));
            await startDetached({
                autoskipMs: msArg === undefined ? DEFAULT_AUTOSKIP_MS : Number(msArg),
            });
        } else if (cmd === 'fg' || cmd === 'start') {
            await startForeground();
        } else if (cmd === 'open') {
            await openBrowser(URL_BASE);
        } else if (cmd === 'restore') {
            await restoreConfig({ force: args.includes('--force') });
        } else if (cmd === 'seed') {
            snapshotSeed();
        } else if (cmd === 'stop') {
            stopServer();
        } else if (cmd === 'status') {
            await showStatus();
        } else {
            printUsage();
            process.exit(1);
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
