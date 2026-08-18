#!/usr/bin/env node

/**
 * 崩铁杀 开发↔安装目录同步脚本
 *
 * 移植自叁岛世界 scripts/sync.mjs（同款机制）。
 * 以源目录的 Directory.json 为唯一同步依据：只逐文件同步清单中列出的文件，
 * 逐字节比对（Buffer.equals）决定是否复制；清单外的文件一律不同步。
 *
 * 用法:
 *   node scripts/sync.mjs install         dev → 已安装目录（本机配置 installed）
 *   node scripts/sync.mjs export          已安装[0] → dev + 已安装[1]
 *   node scripts/sync.mjs <cmd> --dry-run 仅预览将更新的文件
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, closeInteractive } from './lib/interactive.mjs';
import { devRoot, installed } from './lib/dev-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);

/** 读取源目录的 Directory.json，返回文件相对路径（正斜杠）列表；缺失/解析失败返回 null */
function readManifest(srcRoot) {
    const manifestPath = join(srcRoot, 'Directory.json');
    if (!existsSync(manifestPath)) return null;
    try {
        return Object.keys(
            JSON.parse(readFileSync(manifestPath, 'utf-8')),
        ).sort();
    } catch {
        return null;
    }
}

/** 同步单个清单文件：有差异才写；返回 'changed' | 'same' | 'missing' */
function syncManifestFile(src, dest, dryRun) {
    if (!existsSync(src)) return 'missing';
    const srcBuf = readFileSync(src);
    const same = existsSync(dest) && readFileSync(dest).equals(srcBuf);
    if (same) return 'same';
    if (!dryRun) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, srcBuf);
    }
    return 'changed';
}

/**
 * 按 Directory.json 清单同步 srcRoot → destRoot：只同步清单中存在的文件。
 * 结果按顶层段聚合，返回 {file, changed, fileCount, missingCount}[]。
 */
function syncByManifest(srcRoot, destRoot, manifest, dryRun) {
    const buckets = new Map(); // 顶层段 -> {changed, total, missing}
    for (const relPath of manifest) {
        const top = relPath.includes('/')
            ? relPath.slice(0, relPath.indexOf('/'))
            : relPath;
        const bucket = buckets.get(top) || { changed: 0, total: 0, missing: 0 };
        const result = syncManifestFile(
            join(srcRoot, relPath),
            join(destRoot, relPath),
            dryRun,
        );
        bucket.total++;
        if (result === 'changed') bucket.changed++;
        else if (result === 'missing') bucket.missing++;
        buckets.set(top, bucket);
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([top, { changed, total, missing }]) => ({
            file: top,
            changed: changed > 0,
            fileCount: total,
            missingCount: missing,
        }));
}

/** 打印单个目标的同步结果 */
function reportResults(dest, results, dryRun) {
    for (const r of results) {
        const verb = dryRun ? '将更新' : '已更新';
        const missing =
            r.missingCount > 0
                ? `（另有 ${r.missingCount} 个清单文件源缺失）`
                : '';
        if (r.changed)
            log.ok(`  ${r.file} — ${verb} ${r.fileCount} 个文件${missing}`);
        else if (r.missingCount > 0)
            log.warn(`  ${r.file} — 清单中 ${r.missingCount} 个文件源缺失`);
        else log.info(`  ${r.file} — 已同步（${r.fileCount} 个文件未变化）`);
    }
}

/** 用同一源清单同步一组目标目录 */
function syncToTargets(srcRoot, dests, dryRun) {
    const manifest = readManifest(srcRoot);
    if (!manifest) {
        log.warn(
            `未找到 ${join(srcRoot, 'Directory.json')}，请先运行 node scripts/rebuild.mjs`,
        );
        return [];
    }
    const all = [];
    for (const dest of dests) {
        if (!existsSync(dest)) {
            log.warn(`目标目录不存在，跳过: ${dest}`);
            continue;
        }
        log.info(`同步到: ${dest}`);
        const results = syncByManifest(srcRoot, dest, manifest, dryRun);
        reportResults(dest, results, dryRun);
        all.push({ dest, results });
    }
    return all;
}

/**
 * install：dev → 已安装目录
 * @returns {Array<{dest:string, results:object[]}>}
 */
export function syncInstall({ dryRun = false } = {}) {
    if (installed.length === 0) {
        log.warn(
            '未配置本机安装路径：请创建 scripts/lib/dev-config.local.json（参照 dev-config.local.example.json）',
        );
        return [];
    }
    return syncToTargets(devRoot, installed, dryRun);
}

/**
 * export：已安装[0] → dev + 已安装[1]
 * @returns {Array<{dest:string, results:object[]}>}
 */
export function syncExport({ dryRun = false } = {}) {
    if (installed.length === 0) {
        log.warn(
            '未配置本机安装路径：请创建 scripts/lib/dev-config.local.json（参照 dev-config.local.example.json）',
        );
        return [];
    }
    const source = installed[0];
    if (!existsSync(source)) {
        throw new Error(`未找到导出源: ${source}`);
    }
    return syncToTargets(source, [devRoot, installed[1]], dryRun);
}

function printUsage() {
    console.log(`用法:
  node scripts/sync.mjs install         dev → 已安装目录
  node scripts/sync.mjs export          已安装[0] → dev + 已安装[1]
  node scripts/sync.mjs <cmd> --dry-run 仅预览将更新的文件`);
}

async function runInteractive() {
    try {
        const choice = await menu('请选择同步方向:', [
            { label: 'install — dev → 已安装目录', value: 'install' },
            { label: 'export — 已安装[0] → dev + 已安装[1]', value: 'export' },
        ]);
        if (!choice) {
            log.warn('已取消');
            return;
        }
        if (choice.value === 'install') syncInstall({ dryRun: false });
        else syncExport({ dryRun: false });
    } finally {
        closeInteractive();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    try {
        if (!cmd) {
            await runInteractive();
            return;
        }
        if (cmd === 'install') {
            syncInstall({ dryRun });
        } else if (cmd === 'export') {
            syncExport({ dryRun });
        } else {
            printUsage();
            process.exit(1);
        }
        if (dryRun)
            console.log('\n\x1b[33m（预览模式，未写入任何文件）\x1b[0m');
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
