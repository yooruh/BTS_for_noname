#!/usr/bin/env node

/**
 * 崩铁杀重建脚本：扫描八阵营角色并同步角色入口/包清单，生成运行时 Directory.json。
 * 用法：node scripts/rebuild.mjs [--check]
 */
import { createHash } from 'node:crypto';
import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS, log, readText, writeText } from './lib/shared.mjs';
import { menu, closeInteractive } from './lib/interactive.mjs';
import { loadRoleMods } from './lib/roles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const rolesRoot = resolve(ROOT, 'source', 'character', 'bts', 'roles');
const packIndexPath = resolve(ROOT, 'source', 'character', 'bts', 'index.js');
const manifestPath = resolve(ROOT, 'source', 'tool', 'pack', 'manifest.js');
const bgmListPath = resolve(ROOT, 'source', 'bgm-list.js');
const FACTIONS = new Set([
    'xingqionglieche',
    'xinghelieshou',
    'heitakongjianzhan',
    'yaliluo',
    'pinuokangni',
    'xianzhou',
    'huangjinyi',
    'erxiangleyuan',
]);
const EXCLUDES = new Set([
    '.git',
    '.gitignore',
    '.gitattributes',
    '.claude',
    '.vscode',
    'node_modules',
    'scripts',
    'release',
    'package.json',
    'package-lock.json',
    'jsconfig.json',
    '.update_state.json',
    'version.json',
]);

let crlfTextFiles = new Map();

function getDirectories(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
        .map((entry) => entry.name)
        .sort();
}

/** 扫描八阵营角色文件并校验，返回模块相对路径（roles/<阵营>/<文件>）与错误。 */
export async function scanRoles() {
    const modules = [];
    const errors = [];
    const characterIds = new Set();
    const skillIds = new Set();
    const translateIds = new Set();
    // 直接 import 角色文件读 character/skill/translate/sort（lib/roles.mjs 缓存）——
    // 注释掉的块 import 不可见，不会误当作定义（不再用正则解析源码）。
    const roleMods = await loadRoleMods(rolesRoot);
    for (const faction of getDirectories(rolesRoot)) {
        if (!FACTIONS.has(faction)) {
            errors.push(`未知阵营目录：roles/${faction}`);
            continue;
        }
        const directory = join(rolesRoot, faction);
        const files = readdirSync(directory, { withFileTypes: true })
            .filter(
                (entry) =>
                    entry.isFile() &&
                    entry.name.endsWith('.js') &&
                    !entry.name.startsWith('_'),
            )
            .map((entry) => basename(entry.name, '.js'))
            .sort();
        for (const file of files) {
            const relativePath = `roles/${faction}/${file}`;
            const mod = roleMods.get(join(directory, `${file}.js`));
            const chars = Object.keys(mod?.character ?? {});
            const skills = Object.keys(mod?.skill ?? {});
            const translates = Object.keys(mod?.translate ?? {});
            const sort = mod?.sort;
            if (chars.length !== 1 || !chars[0].startsWith('bts_'))
                errors.push(
                    `${relativePath} 必须且只能定义一个 bts_ 前缀主角色`,
                );
            if (sort !== faction)
                errors.push(`${relativePath} 的 sort 必须为 ${faction}`);
            if (chars[0] && !translates.includes(chars[0]))
                errors.push(`${relativePath} 缺少角色翻译 ${chars[0]}`);
            if (chars[0] && !chars[0].slice(7).startsWith(file))
                errors.push(`${relativePath} 文件名必须是角色 ID 的资源主名`);
            for (const id of chars) {
                if (characterIds.has(id)) errors.push(`重复角色 ID：${id}`);
                characterIds.add(id);
            }
            for (const id of skills) {
                if (skillIds.has(id)) errors.push(`重复技能 ID：${id}`);
                skillIds.add(id);
            }
            for (const id of translates) {
                if (translateIds.has(id)) errors.push(`重复翻译键：${id}`);
                translateIds.add(id);
            }
            modules.push(relativePath);
        }
    }
    return { modules, errors };
}

function replaceIfChanged(filePath, next, checkOnly) {
    const previous = readText(filePath);
    if (previous === next) return false;
    if (!checkOnly) writeText(filePath, next);
    return true;
}

function updateRoleIndex(modules, checkOnly) {
    const source = readText(packIndexPath);
    // JSON.stringify(modules, null, 4)：多行 4 空格数组；键/值替换为单引号、
    // 补尾随逗号，与 prettier 输出逐字节一致（保证 rebuild 幂等）。
    const next = source.replace(
        /const ROLE_FILES\s*=\s*\[[\s\S]*?\];/,
        `const ROLE_FILES = ${JSON.stringify(modules, null, 4)
            .replace(/"([^"]+)"/g, "'$1'")
            .replace(/\n\]$/, ',\n]')};`,
    );
    if (next === source && !/const ROLE_FILES\s*=/.test(source))
        throw new Error('未找到 bts/index.js 的 ROLE_FILES');
    return replaceIfChanged(packIndexPath, next, checkOnly);
}

function updateManifest(checkOnly) {
    const source = readText(manifestPath);
    const next = source
        .replace(/(CHARACTER_PACK_FILES\s*=\s*)\[[^\]]*\]/, "$1['bts/index']")
        .replace(/(CARD_PACK_FILES\s*=\s*)\[[^\]]*\]/, "$1['bts_cd/index']");
    return replaceIfChanged(manifestPath, next, checkOnly);
}

/**
 * 生成 audio/bgm/ 可用 BGM 清单（source/bgm-list.js）：content.js 的 BGM 跟随主公
 * 据此判断「有专属 → 播放；无 → 随机对战音乐（duel1-12）」。
 */
function updateBgmList(checkOnly) {
    const files = readdirSync(resolve(ROOT, 'audio', 'bgm'))
        .filter((entry) => entry.endsWith('.mp3'))
        .map((entry) => entry.slice(0, -4))
        .filter((entry) => !entry.startsWith('duel'))
        .sort();
    const next = `// 由 scripts/rebuild.mjs 自动生成——audio/bgm/ 下可用 BGM 清单（不含 duel 随机曲）。\n// 修改本文件无效：运行 npm run rebuild 重新生成。\nexport const BGM_LIST = new Set(${JSON.stringify(files, null, 4).replace(/"([^"]+)"/g, "'$1'")});\n`;
    if (!existsSync(bgmListPath)) {
        if (!checkOnly) writeText(bgmListPath, next);
        return true;
    }
    return replaceIfChanged(bgmListPath, next, checkOnly);
}

/** 递归计算运行时文件清单；构建/发布工具与版本发布元数据不随客户端更新。 */
export function walkDir(directory = ROOT, baseDir = ROOT) {
    if (directory === baseDir) crlfTextFiles = new Map();
    const result = {};
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || EXCLUDES.has(entry.name)) continue;
        const fullPath = join(directory, entry.name);
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            Object.assign(result, walkDir(fullPath, baseDir));
            continue;
        }
        if (!entry.isFile()) continue;
        let buffer = readFileSync(fullPath);
        if (!buffer.includes(0)) {
            let crCount = 0;
            for (const byte of buffer) if (byte === 13) crCount++;
            if (crCount > 0) {
                // 自动统一为 LF：去除 CR 字节后写回，并以 LF 内容计算 size/MD5，
                // 使 Directory.json 与工作区/发布内容一致（对齐 .gitattributes「eol=lf」）。
                buffer = Buffer.from(buffer.filter((b) => b !== 13));
                writeFileSync(fullPath, buffer);
                crlfTextFiles.set(relPath, crCount);
            }
        }
        result[relPath] = {
            size: buffer.length,
            md5: createHash('md5').update(buffer).digest('hex'),
        };
    }
    return result;
}

/** 打印本轮 walkDir 自动统一为 LF 的文本文件报告（walkDir 已就地转换，此处不再抛错）。 */
export function normalizeCrlfTextFiles() {
    if (crlfTextFiles.size === 0) return;
    const list = [...crlfTextFiles.keys()];
    const shown = list.slice(0, 5).join('、');
    log.warn(
        `已自动将 ${list.length} 个文本文件统一为 LF（原含 CRLF）：${shown}${list.length > 5 ? `…等 ${list.length} 个` : ''}`,
    );
    crlfTextFiles.clear();
}

export function updateDirectoryJson(checkOnly = false) {
    const manifest = walkDir();
    normalizeCrlfTextFiles();
    // Directory.json 的内容不能对自身计算稳定 MD5；始终以 null 表示跳过该项校验。
    manifest['Directory.json'] ??= { size: 0, md5: null };
    manifest['Directory.json'].md5 = null;
    let next = `${JSON.stringify(manifest, null, 2)}\n`;
    if (manifest['Directory.json']) {
        for (let i = 0; i < 8; i++) {
            const size = Buffer.byteLength(next, 'utf8');
            if (manifest['Directory.json'].size === size) break;
            manifest['Directory.json'].size = size;
            next = `${JSON.stringify(manifest, null, 2)}\n`;
        }
    }
    const previous = existsSync(PATHS.directoryJson)
        ? readText(PATHS.directoryJson)
        : '';
    const changed = previous !== next;
    if (!checkOnly && changed) writeText(PATHS.directoryJson, next);
    return {
        file: 'Directory.json',
        changed,
        fileCount: Object.keys(manifest).length,
        totalSize: Object.values(manifest).reduce(
            (sum, item) => sum + item.size,
            0,
        ),
    };
}

export async function rebuildProject({ checkOnly = false, silent = false } = {}) {
    const { modules, errors } = await scanRoles();
    if (errors.length)
        throw new Error(`角色校验失败：\n- ${errors.join('\n- ')}`);
    const results = [
        {
            file: 'source/character/bts/index.js',
            changed: updateRoleIndex(modules, checkOnly),
        },
        {
            file: 'source/tool/pack/manifest.js',
            changed: updateManifest(checkOnly),
        },
        {
            file: 'source/bgm-list.js',
            changed: updateBgmList(checkOnly),
        },
        updateDirectoryJson(checkOnly),
    ];
    if (!silent) {
        const changed = results
            .filter((result) => result.changed)
            .map((result) => result.file);
        log.ok(
            `已校验 ${modules.length} 个角色；${changed.length ? `${checkOnly ? '存在待同步文件' : '已同步'}：${changed.join('、')}` : '所有清单已是最新'}`,
        );
    }
    return results;
}

// ── 吸收 rebuild-audio-map.mjs：技能音频行数表 + 语音/阵亡字幕↔mp3 交叉校验 ──
/** 递归列出目录下所有以 ext 结尾的文件（目录不存在即空）。 */
function listDirFiles(dir, ext, out = []) {
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) listDirFiles(full, ext, out);
            else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
        }
    } catch {
        /* 目录不存在即空 */
    }
    return out;
}

/**
 * 读取 scripts/voice-exclude.txt 的阵亡豁免条目（`.die` / `.all` 后缀；支持 * 通配）。
 * 与 voice.mjs 共用清单：本处只取阵亡语义（无后缀=技能、`.bgm` 与语音键检查无关）。
 */
function loadDieExemptPatterns() {
    const file = resolve(ROOT, 'scripts', 'voice-exclude.txt');
    const patterns = [];
    let raw = '';
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return patterns; // 清单缺失：按无豁免处理
    }
    for (const line of raw.split(/\r?\n/)) {
        const p = line.replace(/#.*$/, '').trim();
        if (!p) continue;
        const sm = /\.(die|all)$/.exec(p);
        if (!sm) continue;
        const id = p.slice(0, -sm[0].length);
        if (!/^bts_/.test(id)) continue;
        patterns.push({
            p,
            re: new RegExp('^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$'),
        });
    }
    return patterns;
}

/**
 * 生成角色包静态技能音频行数表（audio/skill/bts_<skill><n>.mp3 → source/character/bts/audio.js；
 * 运行时由 registry.js fillSkillAudio 按 ext: 前缀转换），并交叉校验语音/阵亡字幕键与 mp3 一一对应。
 * @returns {{changed: boolean, errorCount: number}}
 */
export async function rebuildAudioMap({ checkOnly = false } = {}) {
    const audioDir = resolve(ROOT, 'audio', 'skill');
    const dieDir = resolve(ROOT, 'audio', 'die');
    const outputPath = resolve(ROOT, 'source', 'character', 'bts', 'audio.js');

    // 1) 技能音频行数表
    const counts = {};
    for (const full of listDirFiles(audioDir, '.mp3')) {
        const match = /^(bts_[\w]+?)(\d+)$/.exec(basename(full, '.mp3'));
        if (!match) continue;
        const [, skill, index] = match;
        counts[skill] = Math.max(counts[skill] || 0, Number(index));
    }
    const ordered = Object.fromEntries(
        Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
    );
    const audioLines = Object.entries(ordered)
        .map(([skill, count]) => `    '${skill}': ${count},`)
        .join('\n');
    const next = [
        '// 本文件由 scripts/rebuild.mjs 根据 audio/skill 自动生成，请勿手动编辑。',
        '// 键为 bts_ 技能 ID，值为可随机播放的语音行数。',
        'export const AUDIO_COUNTS = {',
        audioLines,
        '};',
    ].join('\n');
    let previous = '';
    try {
        previous = readText(outputPath);
    } catch {
        /* 首次生成 */
    }
    const changed = previous !== next;
    if (!checkOnly && changed) writeText(outputPath, next);

    // 2) 语音/阵亡字幕键 ↔ mp3 交叉校验：直接 import 读 translate 的 $ / ~ 键（lib/roles.mjs
    // 缓存）；注释掉的语音键 import 不可见 → 视为未声明（rebuild --audio --check 的「注释豁免」）。
    const declaredSkill = {};
    const declaredDies = new Set();
    // 阵亡检查豁免（scripts/voice-exclude.txt 的 .die/.all 条目；与 voice.mjs 共用清单）
    const dieExempt = loadDieExemptPatterns();
    const roleMods = await loadRoleMods(rolesRoot);
    for (const [, mod] of roleMods) {
        for (const [k] of Object.entries(mod.translate ?? {})) {
            let m = /^\$(bts_[\w]+?)(\d+)$/.exec(k);
            if (m) { (declaredSkill[m[1]] ??= new Set()).add(Number(m[2])); continue; }
            m = /^~(bts_[A-Za-z0-9_]+)$/.exec(k);
            if (m) declaredDies.add(m[1]);
        }
    }

    const errors = [];
    const warnings = [];
    for (const [skill, lines] of Object.entries(declaredSkill)) {
        const max = counts[skill];
        if (max == null) {
            errors.push(`技能 ${skill} 声明了语音键但 audio/skill/ 无 ${skill}<N>.mp3（静默失声）`);
            continue;
        }
        for (const line of lines) {
            if (line > max) errors.push(`技能 ${skill} 语音键 #${skill}${line} 超出 mp3 行数（${max}）`);
        }
    }
    for (const charId of declaredDies) {
        if (dieExempt.some((e) => e.re.test(charId))) continue; // 豁免：该角色阵亡语音不进检查
        if (!existsSync(join(dieDir, `${charId}.mp3`))) {
            errors.push(`角色 ${charId} 声明了阵亡语音但 audio/die/${charId}.mp3 不存在`);
        }
    }
    for (const skill of Object.keys(counts)) {
        if (!declaredSkill[skill]) {
            warnings.push(`audio/skill 有 ${skill} 的 mp3 但任何角色文件未声明 ${skill} 的语音键`);
        }
    }
    for (const full of listDirFiles(dieDir, '.mp3')) {
        const base = basename(full, '.mp3');
        if (dieExempt.some((e) => e.re.test(base))) continue; // 豁免：同上
        if (!declaredDies.has(base)) {
            warnings.push(`audio/die/${base}.mp3 无对应阵亡语音键 ~${base}`);
        }
    }

    for (const e of errors.sort()) console.error(`✗  ${e}`);
    for (const w of warnings.sort()) console.log(`⚠  ${w}`);
    const dieExemptHits = [
        ...new Set([...declaredDies, ...listDirFiles(dieDir, '.mp3').map((f) => basename(f, '.mp3'))]),
    ]
        .filter((id) => dieExempt.some((e) => e.re.test(id)))
        .sort();
    if (dieExemptHits.length) console.log(`·  阵亡豁免生效：${dieExemptHits.join('、')}`);

    const errorCount = errors.length;
    console.log(
        `✓ 识别 ${Object.keys(ordered).length} 个技能音频；${changed ? (checkOnly ? '存在待同步音频表' : '已同步音频表') : '音频表已是最新'}`,
    );
    if (errorCount) console.error(`共 ${errorCount} 处语音/阵亡键不一致（见上方 ✗ 行）。`);
    return { changed, errorCount: errorCount || 0 };
}

async function runInteractive() {
    try {
        const choice = await menu('请选择重建操作:', [
            { label: '重建角色清单 + Directory.json（默认）', value: 'rebuild' },
            { label: '生成音频映射表并校验语音键（--audio）', value: 'audio' },
            { label: '校验模式（--check，不写盘）', value: 'check' },
        ]);
        if (!choice) {
            log.warn('已取消');
            return;
        }
        if (choice.value === 'rebuild') runRebuild(false);
        else if (choice.value === 'audio') runAudio(false);
        else if (choice.value === 'check') runRebuild(true);
    } finally {
        closeInteractive();
    }
}

async function main() {
    const checkOnly = process.argv.includes('--check');
    const audio = process.argv.includes('--audio');
    const hasOp =
        process.argv.slice(2).some((a) => a === '--check' || a === '--audio');
    try {
        if (!hasOp) {
            await runInteractive();
            return;
        }
        if (audio) await runAudio(checkOnly);
        else await runRebuild(checkOnly);
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

async function runRebuild(checkOnly) {
    const results = await rebuildProject({ checkOnly });
    if (checkOnly && results.some((result) => result.changed))
        process.exitCode = 1;
}

async function runAudio(checkOnly) {
    const { changed, errorCount } = await rebuildAudioMap({ checkOnly });
    if (checkOnly && (changed || errorCount)) process.exitCode = 1;
    if (!checkOnly && errorCount) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main().catch((error) => {
        log.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
