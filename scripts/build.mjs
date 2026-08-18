#!/usr/bin/env node

/** 崩铁杀统一发布构建入口。 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebuildProject } from './rebuild.mjs';
import {
    getCurrentReleaseVersion,
    getReleaseManifestPath,
    readReleaseManifest,
    syncVersionFiles,
    writeUpdateContent,
    writeVersionJson,
} from './lib/release.mjs';
import { log } from './lib/shared.mjs';
import { menu, closeInteractive } from './lib/interactive.mjs';
import { zipProject } from './zip.mjs';

const SELF_PATH = fileURLToPath(import.meta.url);

function usage() {
    console.log(`用法:
  node scripts/build.mjs              同步发布版本、更新摘要与运行时清单
  node scripts/build.mjs --zip        构建后额外生成当前版本的代码包
  node scripts/build.mjs --dry-run    预览构建变更，不写入文件
  node scripts/build.mjs --current    显示发布清单中的当前版本`);
}

async function runInteractive() {
    try {
        const choice = await menu('请选择发布构建操作:', [
            { label: '同步发布版本、更新摘要与运行时清单', value: 'build' },
            { label: '构建后生成当前版本代码包（--zip）', value: 'zip' },
            { label: '显示发布清单中的当前版本（--current）', value: 'current' },
            { label: '预览构建变更，不写入文件（--dry-run）', value: 'dry' },
        ]);
        if (!choice) {
            log.warn('已取消');
            return;
        }
        if (choice.value === 'current') {
            const manifest = readReleaseManifest();
            log.info(`当前发布版本：${getCurrentReleaseVersion(manifest)}`);
            log.info(`发布源：${getReleaseManifestPath()}`);
            return;
        }
        buildAndZip(choice.value === 'zip', choice.value === 'dry');
    } finally {
        closeInteractive();
    }
}

function buildAndZip(zip = false, dryRun = false) {
    const manifest = readReleaseManifest();
    const results = [
        ...syncVersionFiles(getCurrentReleaseVersion(manifest), dryRun),
        writeVersionJson(manifest, dryRun),
        writeUpdateContent(manifest, dryRun),
        ...rebuildProject({ checkOnly: dryRun, silent: true }),
    ];
    const changed = results
        .filter((result) => result.changed)
        .map((result) => result.file);
    log.info(
        `发布版本：${getCurrentReleaseVersion(manifest)}（${dryRun ? '预览模式' : '写入模式'}）`,
    );
    if (changed.length)
        log.ok(`${dryRun ? '将同步' : '已同步'}：${changed.join('、')}`);
    else log.ok('所有发布产物均已同步');

    if (zip && !dryRun) {
        zipProject({ codeOnly: true });
    } else if (zip) {
        log.info('预览模式未生成代码包；可用 node scripts/zip.mjs --code --dry-run 查看打包内容');
    }
}

function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    if (args.includes('--help') || args.includes('-h')) return usage();
    const positional = args.filter((arg) => !arg.startsWith('-'));
    if (positional.length)
        throw new Error(
            `不再接受命令行版本号：${positional.join(', ')}；请编辑 release/releases.json`,
        );

    // 无任何参数：交互选择（不默认执行某一功能）
    const hasFlag = args.some((a) => a === '--zip' || a === '--dry-run' || a === '-d' || a === '--current' || a === '-c');
    if (!hasFlag) {
        runInteractive().catch((error) => {
            log.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        });
        return;
    }

    const manifest = readReleaseManifest();
    if (args.includes('--current') || args.includes('-c')) {
        log.info(`当前发布版本：${getCurrentReleaseVersion(manifest)}`);
        log.info(`发布源：${getReleaseManifestPath()}`);
        return;
    }

    buildAndZip(args.includes('--zip'), dryRun);
    return;
}

try {
    if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) main();
} catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
