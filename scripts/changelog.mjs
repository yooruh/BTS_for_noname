#!/usr/bin/env node

/** 管理 release/releases.json 中的崩铁杀发布记录。 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    scaffoldRelease,
    getLatestRelease,
    getReleaseManifestPath,
    readReleaseManifest,
} from './lib/release.mjs';
import { log } from './lib/shared.mjs';

const SELF_PATH = fileURLToPath(import.meta.url);

function usage() {
    console.log(`用法:
  node scripts/changelog.mjs show
  node scripts/changelog.mjs path
  node scripts/changelog.mjs scaffold [--dry-run] <版本号>`);
}

function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'show';
    if (command === 'help' || command === '--help' || command === '-h')
        return usage();
    if (command === 'show') {
        const release = getLatestRelease(readReleaseManifest());
        console.log(`当前版本 ${release.version}:`);
        release.highlights.forEach((item, index) =>
            console.log(`  ${index + 1}. ${item}`),
        );
        return;
    }
    if (command === 'path') return log.info(getReleaseManifestPath());
    if (command === 'scaffold') {
        const version = args.filter((arg) => !arg.startsWith('-'))[1];
        if (!version) throw new Error('请提供新版本号');
        const result = scaffoldRelease(version, {
            dryRun: args.includes('--dry-run'),
        });
        log.ok(
            `${args.includes('--dry-run') ? '预览创建' : '已创建'}发布记录：${result.release.version}`,
        );
        console.log(JSON.stringify(result.release, null, 2));
        return;
    }
    throw new Error(`未知命令：${command}`);
}

try {
    if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) main();
} catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    usage();
    process.exitCode = 1;
}
