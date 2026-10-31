#!/usr/bin/env node
/**
 * 崩铁杀快速迭代 watcher（只写 overlay / 冒烟镜像，不触碰安装树）。
 *
 * 用法（zip/ 目录运行）：
 *   node scripts/dev.mjs [--once] [--no-smoke] [--no-rebuild] [--verbose]
 *
 * 行为：
 *   - watch zip/source、zip/style、zip/extension.js、zip/info.json
 *   - JS 变更先 `node --check`，通过后复制到
 *       _others/_tmp_overlay/extension/崩铁杀/<相对路径>
 *       _others/smoke/app/extension/崩铁杀/<相对路径>（source/style/根文件）
 *   - 新增 source 文件默认自动 `rebuild.mjs --write` 更新 Directory/清单（--no-rebuild 关闭）
 *   - 不自动开调试页；需要实测时另跑 `npm run playtest -- open --test`
 *
 * 说明：overlay 优先于安装树，刷新页面即可吃到修改；安装树同步仍用 `verify --full` 或 `sync install`。
 */
import {
    appendFileSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    watch,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const WORKSPACE = resolve(ROOT, '..');
const OVERLAY = join(WORKSPACE, '_others', '_tmp_overlay', 'extension', '崩铁杀');
const SMOKE = join(WORKSPACE, '_others', 'smoke', 'app', 'extension', '崩铁杀');
const LOG_FILE = join(WORKSPACE, '_others', 'debug', 'data', 'dev-watch.jsonl');

const argv = process.argv.slice(2);
const options = {
    once: argv.includes('--once'),
    all: argv.includes('--all'),
    noSmoke: argv.includes('--no-smoke'),
    noRebuild: argv.includes('--no-rebuild'),
    verbose: argv.includes('--verbose'),
};

const stamp = () => new Date().toISOString();
const relOf = (file) => relative(ROOT, file).replace(/\\/g, '/');

function logLine(record) {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${JSON.stringify({ t: stamp(), ...record })}\n`, 'utf8');
}

function walk(dir, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

function destinations(rel) {
    const list = [];
    if (rel.startsWith('source/')) {
        list.push(join(OVERLAY, rel));
        if (!options.noSmoke) list.push(join(SMOKE, rel));
    } else if (rel.startsWith('style/')) {
        list.push(join(OVERLAY, rel));
        if (!options.noSmoke && existsSync(join(SMOKE, 'style'))) list.push(join(SMOKE, rel));
    } else if (rel === 'extension.js' || rel === 'info.json') {
        list.push(join(OVERLAY, rel));
        if (!options.noSmoke && existsSync(SMOKE)) list.push(join(SMOKE, rel));
    }
    return list;
}

function sameContent(left, right) {
    try {
        return readFileSync(left).equals(readFileSync(right));
    } catch {
        return false;
    }
}

function checkSyntax(file) {
    if (!/\.(?:js|mjs)$/.test(file)) return null;
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30_000,
    });
    if (result.status === 0) return null;
    return `${result.stdout || ''}${result.stderr || ''}`.trim().slice(-800);
}

function rebuildIfNeeded() {
    if (options.noRebuild) return;
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'rebuild.mjs'), '--write'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 60_000,
    });
    if (result.status === 0) {
        console.log('[dev] rebuild --write 完成（Directory/索引已更新）');
        logLine({ action: 'rebuild', ok: true });
    } else {
        console.error(`[dev] rebuild --write 失败：\n${(result.stdout || '').concat(result.stderr || '').trim().slice(-800)}`);
        logLine({ action: 'rebuild', ok: false });
    }
}

function syncOne(file) {
    const rel = relOf(file);
    const dests = destinations(rel);
    if (!dests.length) return;
    const error = checkSyntax(file);
    if (error) {
        console.error(`[dev] 语法错误，跳过复制：${rel}\n${error}`);
        logLine({ action: 'syntax-error', file: rel });
        return;
    }
    let changed = dests.filter((dest) => !sameContent(file, dest));
    if (rel.startsWith('source/')) {
        // 以冒烟镜像为“上次已同步”基准：源与镜像相同 = 本次没有实质改动，不往 overlay 灌全量。
        const smokeDest = dests.find((dest) => dest.includes('smoke'));
        if (smokeDest && existsSync(smokeDest) && sameContent(file, smokeDest)) changed = [];
    }
    if (!changed.length) {
        if (options.verbose) console.log(`[dev] 无变化 ${rel}`);
        return;
    }
    const newFile = changed.some((dest) => !existsSync(dest));
    for (const dest of changed) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(file, dest);
        if (options.verbose) console.log(`[dev] ${rel} → ${relOf(dest)}`);
    }
    console.log(`[dev] 已同步 ${rel}${newFile ? '（新文件）' : ''}`);
    logLine({ action: 'copy', file: rel, newFile, dests: changed.map(relOf) });
    if (newFile && rel.startsWith('source/')) rebuildIfNeeded();
}

function syncAll() {
    const files = [...walk(join(ROOT, 'source'))];
    if (options.all) files.push(...walk(join(ROOT, 'style')));
    files.push(
        ...['extension.js', 'info.json']
            .map((name) => join(ROOT, name))
            .filter((file) => existsSync(file)),
    );
    for (const file of files) syncOne(file);
    console.log(
        `[dev] 一次性同步完成：扫描 ${files.length} 个文件${options.all ? '（含 style）' : '（style 需 --all）'}`,
    );
}

if (options.once) {
    syncAll();
    process.exit(0);
}

console.log('== 崩铁杀 dev watcher ==');
console.log(`源：${ROOT}`);
console.log(`overlay：${OVERLAY}`);
console.log(`冒烟镜像：${options.noSmoke ? '(跳过)' : SMOKE}`);
console.log('监听中… Ctrl+C 停止；实测请另跑 npm run playtest -- open --test');

const timers = new Map();
function schedule(file) {
    const key = file;
    if (timers.has(key)) clearTimeout(timers.get(key));
    timers.set(
        key,
        setTimeout(() => {
            timers.delete(key);
            try {
                if (existsSync(file) && statSync(file).isFile()) syncOne(file);
            } catch (error) {
                console.error(`[dev] 处理失败：${file}\n${error.message || error}`);
            }
        }, 160),
    );
}

const watchers = [];
const watchTree = (dir) => {
    if (!existsSync(dir)) return;
    const watcher = watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        schedule(join(dir, filename.toString()));
    });
    watcher.on('error', (error) => console.error(`[dev] watch 错误：${error.message || error}`));
    watchers.push(watcher);
};

watchTree(join(ROOT, 'source'));
watchTree(join(ROOT, 'style'));
for (const name of ['extension.js', 'info.json']) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    const watcher = watch(file, () => schedule(file));
    watcher.on('error', (error) => console.error(`[dev] watch 错误：${error.message || error}`));
    watchers.push(watcher);
}

const stop = () => {
    for (const watcher of watchers) watcher.close();
    for (const timer of timers.values()) clearTimeout(timer);
    console.log('\n[dev] 已停止。');
    process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
