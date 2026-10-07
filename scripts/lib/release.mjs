import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import {
    PATHS,
    htmlEscape,
    isValidVersion,
    readText,
    stripV,
    writeText,
} from './shared.mjs';

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function getReleaseManifestPath() {
    return PATHS.releaseManifest;
}

export function readReleaseManifest() {
    const manifest = JSON.parse(readText(PATHS.releaseManifest));
    validateManifest(manifest);
    return manifest;
}

export function writeReleaseManifest(manifest) {
    validateManifest(manifest);
    writeText(PATHS.releaseManifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function getLatestRelease(manifest = readReleaseManifest()) {
    return manifest.releases[0];
}

export function getCurrentReleaseVersion(manifest = readReleaseManifest()) {
    return stripV(getLatestRelease(manifest).version);
}

export function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object')
        throw new Error('release/releases.json 必须是对象');
    if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
        throw new Error('release/releases.json 中的 releases 不能为空');
    }

    const seen = new Set();
    manifest.releases.forEach((release, index) => {
        const label = `releases[${index}]`;
        if (!release || typeof release !== 'object')
            throw new Error(`${label} 必须是对象`);
        if (!release.version || !isValidVersion(release.version))
            throw new Error(`${label}.version 不是合法版本号`);
        const version = stripV(release.version);
        if (seen.has(version)) throw new Error(`版本号重复：${version}`);
        seen.add(version);
        if (
            !Array.isArray(release.highlights) ||
            release.highlights.length === 0
        ) {
            throw new Error(`${label}.highlights 必须是非空数组`);
        }
        if (release.players && !Array.isArray(release.players))
            throw new Error(`${label}.players 必须是数组`);
        if (release.footerNotes && !Array.isArray(release.footerNotes))
            throw new Error(`${label}.footerNotes 必须是数组`);
    });
}

export function createReleaseSkeleton(
    version,
    manifest = readReleaseManifest(),
) {
    const normalized = stripV(version);
    if (!isValidVersion(normalized)) throw new Error(`无效版本号：${version}`);
    if (
        manifest.releases.some(
            (release) => stripV(release.version) === normalized,
        )
    ) {
        throw new Error(`版本 ${normalized} 已存在`);
    }
    if (compareVersions(normalized, getCurrentReleaseVersion(manifest)) <= 0) {
        throw new Error(`新版本 ${normalized} 必须大于当前版本`);
    }
    const latest = getLatestRelease(manifest);
    return {
        version: normalized,
        gameVersion: latest.gameVersion || '>=1.10.0',
        branch: manifest.defaultBranch || 'main',
        description: latest.description || '崩铁杀开发版本',
        players: [],
        highlights: ['待补充更新内容'],
        footerNotes: [],
    };
}

export function scaffoldRelease(version, { dryRun = false } = {}) {
    const manifest = readReleaseManifest();
    const release = createReleaseSkeleton(version, manifest);
    const next = { ...manifest, releases: [release, ...manifest.releases] };
    if (!dryRun) writeReleaseManifest(next);
    return {
        file: 'release/releases.json',
        changed: true,
        release,
        manifest: next,
    };
}

export function manifestToVersionJson(manifest) {
    return {
        defaultBranch: manifest.defaultBranch || 'main',
        versions: manifest.releases.slice(0, 1).map((release) => ({
            extensionVersion: stripV(release.version),
            gameVersion: release.gameVersion || '>=1.10.0',
            branch: release.branch || manifest.defaultBranch || 'main',
            description: release.description || '崩铁杀开发版本',
            highlights: release.highlights,
        })),
    };
}

export function syncVersionFiles(version, dryRun = false) {
    return [
        syncPackageJson(version, dryRun),
        syncExtensionJs(version, dryRun),
        syncInfoJson(version, dryRun),
    ];
}

export function writeVersionJson(manifest, dryRun = false) {
    const previousZip = readZipMetaMap();
    const next = manifestToVersionJson(manifest);
    for (const entry of next.versions) {
        if (previousZip.has(entry.extensionVersion))
            entry.zip = previousZip.get(entry.extensionVersion);
    }
    return writeWholeFile(
        PATHS.versionJson,
        `${JSON.stringify(next, null, 2)}\n`,
        dryRun,
    );
}

export function patchVersionJsonZip(version, zipInfo) {
    const content = JSON.parse(readText(PATHS.versionJson));
    const entry = content.versions?.find(
        (item) => stripV(item.extensionVersion) === stripV(version),
    );
    if (!entry) throw new Error(`version.json 中未找到版本 ${version}`);
    entry.zip = {
        filename: zipInfo.filename,
        size: zipInfo.size,
        md5: zipInfo.md5,
        branch: zipInfo.branch,
        tag: zipInfo.tag,
    };
    writeText(PATHS.versionJson, `${JSON.stringify(content, null, 2)}\n`);
    return entry.zip;
}

/**
 * 生成 source/content.js 的 updateContent（扩展更新弹窗数据）。
 * 数组格式：可选 players 角色卡 + text 正文；正文支持 `{{poptip:arg|label}}`，
 * 运行时经 get.poptip() 渲染为可点击词条。
 */
export function renderUpdateContent(manifest) {
    const latest = getLatestRelease(manifest);
    const players = latest.players || [];
    const footerNotes = latest.footerNotes || [];
    const bodyLines = latest.highlights.map(
        (item, index) =>
            `${formatOrder(index + 1)} ${renderRuntimeMarkup(item)}<br>`,
    );
    const footerLines = footerNotes.map(
        (note) => `<li>${renderRuntimeMarkup(note)}</li>`,
    );
    const htmlParts = [
        '<div style="text-align: left;font-size: 16px;">',
        ...bodyLines,
    ];
    if (footerLines.length > 0) htmlParts.push('<hr>', ...footerLines);
    htmlParts.push('</div>');
    const entries = [];
    if (players.length > 0) {
        entries.push(
            `    { type: "players", data: ${renderPlayersArray(players)} },`,
        );
    }
    entries.push(
        `    {\n        type: "text", addText: true, data: \`${jsTemplateEscape(htmlParts.join('\n'))}\`\n    }`,
    );
    return `export const updateContent = [\n${entries.join('\n')}\n];`;
}

export function writeUpdateContent(manifest, dryRun = false) {
    const source = readText(PATHS.contentJs);
    const rendered = renderUpdateContent(manifest);
    // 兼容旧版「模板字符串」与现行「数组」两种历史格式。
    const marker = /export const updateContent = (?:`[^`]*`|\[[\s\S]*?\]);\n?/;
    const next = marker.test(source)
        ? source.replace(marker, `${rendered}\n`)
        : `${source.trimEnd()}\n\n${rendered}\n`;
    return writeWholeFile(PATHS.contentJs, next, dryRun);
}

/** 生成 style/html/update.html（完整历史更新日志页，设置/帮助内经 showDocModal 打开）。 */
export function renderUpdateHtml(manifest) {
    const blocks = manifest.releases
        .map((release, index) => renderUpdateBlock(release, index))
        .join('\n\n');
    return `<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>崩铁杀 - 更新日志</title>
    <style>
        /* ── 主题变量（浅色默认；深色由 dialogManager 注入的 data-lit-theme 切换）── */
        :root {
            --primary: #2e4a6b;
            --accent: #b08d4f;
            --text: #333a42;
            --text-sub: #6b7681;
            --bg: #f2f4f7;
            --surface: #ffffff;
            --border: #dde2e8;
            --shadow: 0 4px 18px rgba(20, 30, 45, 0.08);
        }

        html[data-lit-theme="dark"] {
            --primary: #8fb3d9;
            --accent: #d4b577;
            --text: #d7dbe0;
            --text-sub: #9aa4af;
            --bg: #1d2126;
            --surface: #262b31;
            --border: #3a4149;
            --shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
        }

        *, *::before, *::after {
            box-sizing: border-box;
        }

        html,
        body {
            margin: 0;
            padding: 0;
            min-width: 0;
            overflow-x: hidden;
            background: var(--bg);
            color: var(--text);
            font-family: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
            line-height: 1.7;
            font-size: 15px;
        }

        .container {
            max-width: 1080px;
            margin: 0 auto;
            padding: 28px 30px 60px;
        }

        h1 {
            font-size: 26px;
            color: var(--primary);
            text-align: center;
            margin: 0 0 6px;
            letter-spacing: 1px;
        }

        .notice-text p {
            color: var(--text-sub);
            font-size: 13px;
            text-align: center;
            margin: 0 0 30px;
            line-height: 1.5;
        }

        .update-block {
            min-width: 0;
            margin-bottom: 26px;
            padding: 16px 20px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-left: 4px solid var(--accent);
            border-radius: 6px;
            box-shadow: var(--shadow);
        }

        .update-block h3 {
            color: var(--primary);
            margin: 0 0 10px;
            font-size: 17px;
        }

        .update-list {
            list-style: none;
            padding-left: 0;
            margin: 0;
            overflow-wrap: anywhere;
        }

        .update-list li {
            margin-bottom: 9px;
            padding-left: 2em;
            text-indent: -2em;
            color: var(--text);
        }

        .update-list li:last-child {
            margin-bottom: 0;
        }

        .update-list li::before {
            content: "・";
            color: var(--accent);
            margin-right: 6px;
        }
    </style>
</head>

<body>
    <div class="container">
        <h1>崩铁杀更新日志</h1>
        <div class="notice-text">
            <p>游玩过程中如有 Bug 或结算异常，欢迎反馈；未完成的角色、资源与机制将持续补充。</p>
        </div>

${blocks}
    </div>
</body>

</html>
`;
}

export function writeUpdateHtml(manifest, dryRun = false) {
    return writeWholeFile(PATHS.updateHtml, renderUpdateHtml(manifest), dryRun);
}

function renderUpdateBlock(release, index) {
    const title =
        index === 0
            ? '{{version}}更新（当前版本）'
            : `${htmlEscape(release.displayVersion || stripV(release.version))}更新`;
    const items = release.highlights
        .map(
            (item, itemIndex) =>
                `                <li>${formatOrder(itemIndex + 1)} ${renderStaticMarkup(item)}</li>`,
        )
        .join('\n');
    return `        <div class="update-block">
            <h3>${title}</h3>
            <ul class="update-list">
${items}
            </ul>
        </div>`;
}

/** content.js 运行时文本：`{{poptip:arg|label}}` → 运行时 get.poptip() 表达式。 */
function renderRuntimeMarkup(text) {
    return String(text).replace(/\{\{poptip:([^}]+)\}\}/g, (_, token) => {
        const { arg } = parsePoptipToken(token);
        return `\${get.poptip(${JSON.stringify(arg)})}`;
    });
}

/** update.html 静态文本：`{{poptip:arg|label}}` → 纯文本标签；行内 <br> 保留。 */
function renderStaticMarkup(text) {
    return htmlEscape(text)
        .replace(/&lt;br&gt;/g, '<br>')
        .replace(/&amp;(lt|gt|quot|#39);/g, '&$1;')
        .replace(/\{\{poptip:([^}]+)\}\}/g, (_, token) =>
            htmlEscape(parsePoptipToken(token).label),
        );
}

/** 解析 `{{poptip:参数|显示名}}`；未提供显示名时从参数剥去前缀（与 publish.mjs 同规则）。 */
function parsePoptipToken(token) {
    const [arg, label] = token.split('|');
    return {
        arg,
        label: label || String(arg).replace(/^[a-z0-9_]+/i, '') || arg,
    };
}

function renderPlayersArray(players) {
    return `[${players.map((player) => JSON.stringify(player)).join(', ')}]`;
}

function formatOrder(index) {
    return CIRCLED_NUMBERS[index - 1] || `${index}.`;
}

/** 转义模板字符串中的反斜杠与反引号；`${...}` 为有意保留的运行时表达式。 */
function jsTemplateEscape(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`');
}

function syncPackageJson(version, dryRun) {
    return replaceWhole(
        PATHS.packageJson,
        /("version"\s*:\s*")[^"]+(")/,
        `$1${stripV(version)}$2`,
        dryRun,
    );
}

function syncExtensionJs(version, dryRun) {
    return replaceWhole(
        PATHS.extensionJs,
        /(const btsVersion\s*=\s*)"[^"]+"/,
        `$1"${stripV(version)}"`,
        dryRun,
    );
}

function syncInfoJson(version, dryRun) {
    return replaceWhole(
        PATHS.infoJson,
        /(版本：)[^"<\\]+/,
        `$1${stripV(version)}`,
        dryRun,
    );
}

function replaceWhole(filePath, pattern, replacement, dryRun) {
    const previous = readText(filePath);
    const next = previous.replace(pattern, replacement);
    if (next === previous && !pattern.test(previous))
        throw new Error(`${basename(filePath)} 中未找到预期版本字段`);
    if (!dryRun && next !== previous) writeText(filePath, next);
    return { file: basename(filePath), changed: next !== previous };
}

function writeWholeFile(filePath, next, dryRun) {
    const previous = existsSync(filePath) ? readText(filePath) : '';
    if (!dryRun && previous !== next) writeText(filePath, next);
    return { file: basename(filePath), changed: previous !== next };
}

function readZipMetaMap() {
    if (!existsSync(PATHS.versionJson)) return new Map();
    try {
        const previous = JSON.parse(readText(PATHS.versionJson));
        return new Map(
            (previous.versions || [])
                .filter((entry) => entry.zip?.filename)
                .map((entry) => [stripV(entry.extensionVersion), entry.zip]),
        );
    } catch {
        return new Map();
    }
}

function compareVersions(left, right) {
    const a = stripV(left).split('.').map(Number);
    const b = stripV(right).split('.').map(Number);
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        if ((a[index] || 0) !== (b[index] || 0))
            return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
}
