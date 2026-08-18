/**
 * 崩铁杀构建脚本共享工具。
 * 仅使用 Node.js 内置模块，不引入运行时依赖。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

export const PATHS = {
    root,
    packageJson: resolve(root, 'package.json'),
    extensionJs: resolve(root, 'extension.js'),
    infoJson: resolve(root, 'info.json'),
    versionJson: resolve(root, 'version.json'),
    directoryJson: resolve(root, 'Directory.json'),
    releaseManifest: resolve(root, 'release', 'releases.json'),
    contentJs: resolve(root, 'source', 'content.js'),
};

export function readText(filePath) {
    return readFileSync(filePath, 'utf8');
}

export function writeText(filePath, content) {
    writeFileSync(filePath, content, 'utf8');
}

/** 读取 UTF-8 文本文件（与叁岛 shared.mjs 对齐的别名，供发布脚本等使用） */
export function readFile(filePath) {
    return readFileSync(filePath, 'utf-8');
}

/** 写入 UTF-8 文本文件（与叁岛 shared.mjs 对齐的别名） */
export function writeFile(filePath, data) {
    writeFileSync(filePath, data, 'utf-8');
}

/** 对文件内容执行正则替换并保存（与叁岛 shared.mjs 对齐） */
export function replaceInFile(filePath, pattern, replacement) {
    const oldContent = readFile(filePath);
    const newContent = oldContent.replace(pattern, replacement);
    if (newContent !== oldContent) {
        writeFile(filePath, newContent);
    }
    return { oldContent, newContent, replaced: newContent !== oldContent };
}

export function isValidVersion(version) {
    return /^v?\d+\.\d+\.\d+(?:\.\d+)?$/.test(String(version));
}

export function stripV(version) {
    return String(version).replace(/^v/, '');
}

export function withV(version) {
    return `v${stripV(version)}`;
}

export function releaseTag(version) {
    return `${withV(version)}-code-zip`;
}

export const log = {
    info(message) {
        console.log(`\x1b[36m[INFO]\x1b[0m ${message}`);
    },
    ok(message) {
        console.log(`\x1b[32m[OK]\x1b[0m ${message}`);
    },
    warn(message) {
        console.log(`\x1b[33m[WARN]\x1b[0m ${message}`);
    },
    error(message) {
        console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
    },
};
