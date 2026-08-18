#!/usr/bin/env node

/**
 * 崩铁杀发布包工具：纯 Node.js 生成完整安装包或无媒体代码包。
 */
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from './lib/crc32.mjs';
import {
    getCurrentReleaseVersion,
    patchVersionJsonZip,
    readReleaseManifest,
} from './lib/release.mjs';
import { isValidVersion, log, releaseTag, stripV } from './lib/shared.mjs';
import { menu, prompt, closeInteractive } from './lib/interactive.mjs';
import { normalizeCrlfTextFiles, walkDir } from './rebuild.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const DEFAULT_OUTPUT = resolve(ROOT, '..', '_others');
const FULL_SUFFIX = '崩铁杀.zip';
const CODE_SUFFIX = '-code.zip';
const ZIP_BRANCH = 'zips';

function dosDateTime(date) {
    return {
        date:
            ((date.getFullYear() - 1980) << 9) |
            ((date.getMonth() + 1) << 5) |
            date.getDate(),
        time:
            (date.getHours() << 11) |
            (date.getMinutes() << 5) |
            Math.floor(date.getSeconds() / 2),
    };
}

function localHeader(name, entry) {
    const filename = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(entry.time, 10);
    header.writeUInt16LE(entry.date, 12);
    header.writeUInt32LE(entry.crc, 14);
    header.writeUInt32LE(entry.compressedSize, 18);
    header.writeUInt32LE(entry.size, 22);
    header.writeUInt16LE(filename.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, filename]);
}

function centralHeader(name, entry, offset) {
    const filename = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(entry.time, 12);
    header.writeUInt16LE(entry.date, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressedSize, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    return Buffer.concat([header, filename]);
}

function endOfCentralDirectory(count, centralSize, centralOffset) {
    const header = Buffer.alloc(22);
    header.writeUInt32LE(0x06054b50, 0);
    header.writeUInt16LE(0, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(count, 8);
    header.writeUInt16LE(count, 10);
    header.writeUInt32LE(centralSize, 12);
    header.writeUInt32LE(centralOffset, 16);
    header.writeUInt16LE(0, 20);
    return header;
}

export function buildZip(files) {
    const body = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
        const source = readFileSync(file.absolutePath);
        const compressed = deflateRawSync(source, { level: 6 });
        const entry = {
            ...dosDateTime(file.mtime),
            crc: crc32(source),
            size: source.length,
            compressedSize: compressed.length,
        };
        const local = localHeader(file.name, entry);
        body.push(local, compressed);
        central.push(centralHeader(file.name, entry, offset));
        offset += local.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    return Buffer.concat([
        ...body,
        directory,
        endOfCentralDirectory(files.length, directory.length, offset),
    ]);
}

export function readCentralDirectory(zip) {
    for (
        let index = zip.length - 22;
        index >= Math.max(0, zip.length - 65557);
        index--
    ) {
        if (zip.readUInt32LE(index) !== 0x06054b50) continue;
        const count = zip.readUInt16LE(index + 10);
        let cursor = zip.readUInt32LE(index + 16);
        const entries = [];
        for (let item = 0; item < count; item++) {
            if (zip.readUInt32LE(cursor) !== 0x02014b50)
                throw new Error('ZIP 中央目录损坏');
            const nameLength = zip.readUInt16LE(cursor + 28);
            const extraLength = zip.readUInt16LE(cursor + 30);
            const commentLength = zip.readUInt16LE(cursor + 32);
            entries.push({
                name: zip
                    .subarray(cursor + 46, cursor + 46 + nameLength)
                    .toString('utf8'),
                size: zip.readUInt32LE(cursor + 24),
            });
            cursor += 46 + nameLength + extraLength + commentLength;
        }
        return entries;
    }
    throw new Error('未找到 ZIP 结束目录记录');
}

export function getPackageFiles({ codeOnly = false } = {}) {
    const manifest = walkDir(ROOT, ROOT);
    normalizeCrlfTextFiles();
    return Object.keys(manifest)
        .filter(
            (name) =>
                !codeOnly ||
                (!name.startsWith('image/') && !name.startsWith('audio/')),
        )
        .sort()
        .map((name) => {
            const absolutePath = resolve(ROOT, name);
            const stat = statSync(absolutePath);
            return { name, absolutePath, size: stat.size, mtime: stat.mtime };
        });
}

function existingVersions(outputDirectory, codeOnly) {
    if (!existsSync(outputDirectory)) return new Set();
    const result = new Set();
    const suffix = codeOnly ? CODE_SUFFIX : FULL_SUFFIX;
    for (const name of readdirSync(outputDirectory)) {
        if (!name.endsWith(suffix)) continue;
        const version = name.slice(0, -suffix.length);
        if (isValidVersion(version)) result.add(stripV(version));
    }
    return result;
}

function bump(version) {
    const parts = stripV(version).split('.').map(Number);
    parts[parts.length - 1]++;
    return parts.join('.');
}

function resolveVersion({
    explicitVersion = null,
    forceReleaseVersion = false,
    codeOnly,
    outputDirectory,
}) {
    const releaseVersion = getCurrentReleaseVersion(readReleaseManifest());
    if (explicitVersion)
        return { version: stripV(explicitVersion), source: '命令行指定' };
    if (codeOnly || forceReleaseVersion)
        return { version: releaseVersion, source: '发布清单' };
    const taken = existingVersions(outputDirectory, codeOnly);
    let version = releaseVersion;
    while (taken.has(version)) version = bump(version);
    return {
        version,
        source: version === releaseVersion ? '发布清单' : '自动递增',
    };
}

export function zipProject({
    codeOnly = false,
    checkOnly = false,
    dryRun = false,
    outputDirectory = DEFAULT_OUTPUT,
    explicitVersion = null,
    forceReleaseVersion = false,
    silent = false,
} = {}) {
    const { version, source } = resolveVersion({
        explicitVersion,
        forceReleaseVersion: forceReleaseVersion || checkOnly,
        codeOnly,
        outputDirectory,
    });
    const filename = `${version}${codeOnly ? CODE_SUFFIX : FULL_SUFFIX}`;
    const outputPath = resolve(outputDirectory, filename);
    const files = getPackageFiles({ codeOnly });
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    if (dryRun)
        return {
            file: filename,
            outputPath,
            version,
            source,
            files,
            totalSize,
            changed: false,
        };
    if (checkOnly) {
        if (!existsSync(outputPath))
            return {
                file: filename,
                outputPath,
                version,
                source,
                files,
                totalSize,
                changed: true,
                reason: '发布包不存在',
            };
        const expected = new Map(files.map((file) => [file.name, file.size]));
        const actual = readCentralDirectory(readFileSync(outputPath));
        const changed =
            actual.length !== expected.size ||
            actual.some((file) => expected.get(file.name) !== file.size);
        return {
            file: filename,
            outputPath,
            version,
            source,
            files,
            totalSize,
            changed,
        };
    }

    const buffer = buildZip(files);
    const md5 = createHash('md5').update(buffer).digest('hex');
    const changed =
        !existsSync(outputPath) || !readFileSync(outputPath).equals(buffer);
    if (changed) {
        mkdirSync(outputDirectory, { recursive: true });
        writeFileSync(outputPath, buffer);
    }
    if (codeOnly) {
        patchVersionJsonZip(version, {
            filename,
            size: buffer.length,
            md5,
            branch: ZIP_BRANCH,
            tag: releaseTag(version),
        });
    }
    const result = {
        file: filename,
        outputPath,
        version,
        source,
        files,
        totalSize,
        zipSize: buffer.length,
        md5,
        changed,
    };
    if (!silent)
        log.ok(
            `${filename}：${files.length} 个文件，${(buffer.length / 1024 / 1024).toFixed(2)} MB${changed ? '' : '（内容未变）'}`,
        );
    return result;
}

function usage() {
    console.log(`用法:
  node scripts/zip.mjs [--code] [--dry-run] [--check] [-o <目录>]
  node scripts/zip.mjs --version [版本号]

无参数时进入交互菜单选择打包方式；带参数则按参数执行。
默认生成完整安装包；--code 生成不含 image/ 和 audio/ 的代码包。`);
}

/** 解析 -o/--out 后的输出目录（无则用默认值） */
function resolveOutputDir(args) {
    const outputIndex = Math.max(args.indexOf('-o'), args.indexOf('--out'));
    return outputIndex >= 0 && args[outputIndex + 1]
        ? resolve(process.cwd(), args[outputIndex + 1])
        : DEFAULT_OUTPUT;
}

/** 运行一次 zipProject 并打印 dry-run / check 的结果 */
function runAndReport(opts, args) {
    const result = zipProject(opts);
    if (args.includes('--dry-run')) {
        log.info(
            `${result.file}：${result.files.length} 个文件，${(result.totalSize / 1024 / 1024).toFixed(2)} MB；预览模式未写入`,
        );
    } else if (args.includes('--check')) {
        if (result.changed) {
            log.error(
                `${result.file} 与当前预期文件集不一致：${result.reason || '文件清单或尺寸不符'}`,
            );
            process.exitCode = 1;
        } else log.ok(`${result.file} 校验通过`);
    }
    return result;
}

async function runInteractive() {
    let outputDirectory = DEFAULT_OUTPUT;
    try {
        // 循环：允许先设置输出目录(-o)、指定版本，再选打包方式，交互态可完成命令行全部能力
        for (;;) {
            const choice = await menu('请选择打包方式:', [
                { label: '生成完整安装包（含媒体）', value: 'full' },
                { label: '生成代码包（不含 image/、audio/）', value: 'code' },
                { label: '校验发布包与当前文件集是否一致', value: 'check' },
                { label: '预览打包内容（dry-run，不写入）', value: 'dry' },
                { label: '生成指定版本（--version <版本号>）', value: 'version' },
                { label: `指定输出目录（当前 ${outputDirectory}）`, value: 'out' },
            ]);
            if (!choice) {
                log.warn('已取消');
                return;
            }
            if (choice.value === 'out') {
                const d = await prompt('输出目录（绝对路径，回车取消）: ');
                if (d) outputDirectory = resolve(process.cwd(), d);
                continue; // 回到菜单，用新输出目录继续
            }
            if (choice.value === 'version') {
                const v = await prompt('请输入版本号（如 26.8.7.0）: ', { required: true });
                if (!isValidVersion(v)) throw new Error(`无效版本号：${v}`);
                const repo = zipProject({
                    codeOnly: false,
                    checkOnly: false,
                    dryRun: false,
                    outputDirectory,
                    explicitVersion: v,
                    forceReleaseVersion: false,
                });
                log.ok(`已生成 ${repo.file}`);
                return;
            }
            const opts = {
                codeOnly: choice.value === 'code',
                checkOnly: choice.value === 'check',
                dryRun: choice.value === 'dry',
                outputDirectory,
                explicitVersion: null,
                forceReleaseVersion: choice.value === 'check',
            };
            const reportArgs =
                choice.value === 'dry'
                    ? ['--dry-run']
                    : choice.value === 'check'
                      ? ['--check']
                      : [];
            runAndReport(opts, reportArgs);
            return;
        }
    } finally {
        closeInteractive();
    }
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return usage();
    // 无参数：交互选择（不默认执行某一功能）
    const hasAnyFlag = args.some((a) => ['-o', '--out', '--version', '--code', '--check', '--dry-run', '-d'].includes(a));
    if (!hasAnyFlag) {
        runInteractive().catch((error) => {
            log.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        });
        return;
    }
    const versionIndex = args.indexOf('--version');
    const versionValue =
        versionIndex >= 0 &&
        args[versionIndex + 1] &&
        !args[versionIndex + 1].startsWith('-')
            ? args[versionIndex + 1]
            : null;
    if (versionValue && !isValidVersion(versionValue))
        throw new Error(`无效版本号：${versionValue}`);
    try {
        runAndReport(
            {
                codeOnly: args.includes('--code'),
                checkOnly: args.includes('--check'),
                dryRun: args.includes('--dry-run') || args.includes('-d'),
                outputDirectory: resolveOutputDir(args),
                explicitVersion: versionValue,
                forceReleaseVersion: versionIndex >= 0 && !versionValue,
            },
            args,
        );
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) main();
