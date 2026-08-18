import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import {
    PATHS,
    isValidVersion,
    readText,
    stripV,
    writeText,
} from './shared.mjs';

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

export function renderUpdateContent(manifest) {
    const latest = getLatestRelease(manifest);
    const lines = latest.highlights.map(
        (item, index) => `${index + 1}. ${item}<br>`,
    );
    for (const note of latest.footerNotes || []) lines.push(`<li>${note}</li>`);
    return `export const updateContent = \
\`<div style="text-align:left;font-size:16px;">\n${lines.join('\n')}\n</div>\`;`;
}

export function writeUpdateContent(manifest, dryRun = false) {
    const source = readText(PATHS.contentJs);
    const rendered = renderUpdateContent(manifest);
    const marker = /export const updateContent = `[^`]*`;\n?/;
    const next = marker.test(source)
        ? source.replace(marker, `${rendered}\n`)
        : `${source.trimEnd()}\n\n${rendered}\n`;
    return writeWholeFile(PATHS.contentJs, next, dryRun);
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
