/** 崩铁杀构建脚本共享工具：仅用 Node.js 内置模块，无运行时依赖。 */

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
    updateHtml: resolve(root, 'style', 'html', 'update.html'),
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

/** 最小 HTML 转义（用于把更新日志文本渲染进生成的 HTML 页面）。 */
export function htmlEscape(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

/**
 * 本体包三档（pack.mjs body 的 --variant）：
 * - full   拓展包：官方 8 扩展 + 全部媒体，无名杀与崩铁杀都能完整游玩。
 * - slim   基础包：只保证崩铁杀完整可玩——仅崩铁杀扩展、卡牌图、卡牌音效、结算音效与字体。
 * - update 更新包：默认只含崩铁杀扩展（连引擎都不带，无本体素材、无官方其他扩展），
 *                  供已装过基础包/拓展包的玩家覆盖更新；`--with-engine` 可额外带引擎程序文件。
 */
export const BODY_VARIANTS = {
    full: { label: '拓展包', desc: '完整无名杀内容：官方扩展 + 全部媒体' },
    slim: { label: '基础包', desc: '保证崩铁杀完整可玩：卡牌图、背景/启动画面、卡牌音效、结算音效、字体' },
    update: { label: '更新包', desc: '只含崩铁杀扩展（默认不带引擎），供装过整包的玩家覆盖更新' },
};

/** 变体 → 中文产物名；未知变体直接报错，避免产物命名漂移 */
export function bodyVariantLabel(variant) {
    const item = BODY_VARIANTS[variant];
    if (!item) throw new Error(`未知本体包变体：${variant}（可用：${Object.keys(BODY_VARIANTS).join('|')}）`);
    return item.label;
}

/** 从产物文件名反查变体（供 installer 自动识别更新包）；识别不到返回 null */
export function bodyVariantFromName(name) {
    const hit = Object.entries(BODY_VARIANTS).find(([, item]) => String(name).includes(`_${item.label}`));
    return hit ? hit[0] : null;
}

/**
 * 本体包文件名（含扩展名）。
 * 命名约定：`{崩铁杀版本}_{拓展包|基础包|更新包}[_不含崩铁杀].zip`——版本由调用方传入，
 * 取自 release/releases.json 的当前发布版本（如 `26.11.1.0`），便于按版本区分产物。
 * —— 「包含崩铁杀」不写后缀（视为默认形态）；仅「不含崩铁杀」时追加 `_不含崩铁杀`
 *    （更新包天然只含崩铁杀，不含崩铁杀时由调用方直接报错）。
 * @param {{ version: string, variant: 'full'|'slim'|'update', withBts: boolean }} o
 */
export function bodyZipName({ version, variant, withBts }) {
    const suffix = bodyVariantLabel(variant);
    return `${stripV(version)}_${suffix}${withBts ? '' : '_不含崩铁杀'}.zip`;
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
