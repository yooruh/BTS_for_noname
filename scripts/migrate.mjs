#!/usr/bin/env node

/**
 * 崩铁杀 素材迁移脚本（合并 migrate-assets / migrate-skins / migrate-bgm）。
 *
 * 从「太阳神备份根目录」把立绘 / 皮肤 / 音频 / BGM 迁到无名杀扩展目录。
 * 按子命令/参数区分三个功能：
 *   --assets <太阳神目录>   基础素材：立绘 + 技能音/角色音（ogg→mp3，依赖 ffmpeg）
 *   --skins  <太阳神目录>   皮肤 v3：默认皮肤 + 可选皮肤 + 音频命名修正（生成 skins.js）
 *   --bgm    <太阳神目录>   BGM：主公专属曲 + duel 随机曲 → audio/bgm
 * 均可加 --dry-run 只预览；无参数时进入交互菜单（先选迁移类型，再询问源目录）。
 *
 * 用法:
 *   node scripts/migrate.mjs --assets "<太阳神备份根目录>" [--dry-run]
 *   node scripts/migrate.mjs --skins  "<太阳神备份根目录>" [--dry-run]
 *   node scripts/migrate.mjs --bgm    "<太阳神备份根目录>" [--dry-run]
 *   node scripts/migrate.mjs                   交互选择
 */

import {
    readFileSync,
    readdirSync,
    existsSync,
    mkdirSync,
    statSync,
    copyFileSync,
    renameSync,
    unlinkSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { menu, prompt, confirm, closeInteractive } from './lib/interactive.mjs';
import { log } from './lib/shared.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SELF_PATH = fileURLToPath(import.meta.url);

const FFMPEG = 'ffmpeg';

// ── 通用：ffmpeg 转码（dryRun 时不执行）────────────────────────────────────
function ffmpeg(input, output, { dryRun, scale = null } = {}) {
    if (dryRun) return true;
    const args = ['-y', '-loglevel', 'error', '-i', input];
    if (scale) args.push('-vf', `scale=${scale}:-1`);
    args.push(output);
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    if (r.status !== 0) {
        console.error(
            `  ✗ ffmpeg 失败 ${basename(input)}: ${(r.stderr || '').trim()}`,
        );
        return false;
    }
    return true;
}

// ── 通用：角色 id 收集（roles 目录中 character/transformCharacter 的键）────
function collectCharacterIds() {
    const ids = new Set();
    const walk = (dir) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            const stat = statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (entry.endsWith('.js')) {
                const code = readFileSync(full, 'utf8');
                const pat =
                    /(?:export\s+const\s+character|export\s+const\s+transformCharacter)\s*=\s*\{([\s\S]*?)\};/g;
                let m;
                while ((m = pat.exec(code))) {
                    for (const id of m[1].matchAll(/'?bts_[\w]+'?\s*:/g))
                        ids.add(id[0].replace(/['":\s]/g, ''));
                }
            }
        }
    };
    walk(join(ROOT, 'source', 'character', 'bts', 'roles'));
    return ids;
}

const baseOf = (id) => id.replace(/^bts_/, '');

// ── 1. 基础素材（migrate-assets）──────────────────────────────────────────
function migrateAssets(srcRoot, { dryRun }) {
    const SRC_AUDIO = join(srcRoot, 'audio', 'skill');
    const SRC_PORTRAIT = join(srcRoot, 'image', 'generals', 'card');
    const DST_AUDIO_SKILL = join(ROOT, 'audio', 'skill');
    const DST_AUDIO_DIE = join(ROOT, 'audio', 'die');
    const DST_PORTRAIT = join(ROOT, 'image', 'character');

    // 从生成的索引读取全部武将 id，用于过滤立绘（card 目录混有标准武将）
    function loadCharacterIds() {
        const indexPath = join(ROOT, '..', '_others', '.index', 'generals.json');
        if (!existsSync(indexPath)) return null;
        const list = JSON.parse(readFileSync(indexPath, 'utf8'));
        return new Set(list.map((g) => g.id));
    }
    const CHARACTER_IDS = loadCharacterIds();

    const ensureDir = (dir) => {
        if (!dryRun) mkdirSync(dir, { recursive: true });
    };

    // 1. 立绘迁移
    ensureDir(DST_PORTRAIT);
    let portraitOk = 0, portraitSkip = 0;
    if (existsSync(SRC_PORTRAIT)) {
        for (const file of readdirSync(SRC_PORTRAIT)) {
            if (!file.endsWith('.jpg')) continue;
            const id = file.slice(0, -4);
            if (/_\d+$/.test(id)) { portraitSkip++; continue; }
            if (CHARACTER_IDS && !CHARACTER_IDS.has(id)) { portraitSkip++; continue; }
            const dst = join(DST_PORTRAIT, `bts_${id}.png`);
            if (existsSync(dst) && !dryRun) { portraitSkip++; continue; }
            if (ffmpeg(join(SRC_PORTRAIT, file), dst, { dryRun })) portraitOk++;
        }
    }

    // 2. 音频迁移
    ensureDir(DST_AUDIO_SKILL);
    ensureDir(DST_AUDIO_DIE);
    let skillOk = 0, dieOk = 0, audioSkip = 0;
    if (existsSync(SRC_AUDIO)) {
        for (const file of readdirSync(SRC_AUDIO)) {
            if (!file.endsWith('.ogg')) continue;
            const name = file.slice(0, -4);
            if (/\d$/.test(name)) {
                const dst = join(DST_AUDIO_SKILL, `bts_${name}.mp3`);
                if (existsSync(dst) && !dryRun) { audioSkip++; continue; }
                if (ffmpeg(join(SRC_AUDIO, file), dst, { dryRun })) skillOk++;
            } else {
                const dst = join(DST_AUDIO_DIE, `bts_${name}.mp3`);
                if (existsSync(dst) && !dryRun) { audioSkip++; continue; }
                if (ffmpeg(join(SRC_AUDIO, file), dst, { dryRun })) dieOk++;
            }
        }
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}素材迁移完成：`);
    console.log(`  立绘   ${portraitOk} 张（跳过变体 ${portraitSkip}）`);
    console.log(`  技能音 ${skillOk} 个`);
    console.log(`  角色音 ${dieOk} 个（阵亡）`);
    console.log(`  跳过已存在 ${audioSkip} 个音频`);
}

// ── 2. 皮肤迁移 v3（migrate-skins）────────────────────────────────────────
function migrateSkins(srcRoot, { dryRun }) {
    const SRC_FULLSKIN = join(srcRoot, 'image', 'fullskin', 'generals', 'full');
    const SRC_CARD = join(srcRoot, 'image', 'generals', 'card');
    const SRC_SKINS = join(
        srcRoot,
        'image',
        'heroskin',
        'fullskin',
        'generals',
        'full',
    );
    const DST_CHARACTER = join(ROOT, 'image', 'character');
    const DST_SKIN = join(ROOT, 'image', 'skin');
    const DST_AUDIO_SKILL = join(ROOT, 'audio', 'skill');
    const DST_AUDIO_DIE = join(ROOT, 'audio', 'die');
    const SKINS_MODULE = join(ROOT, 'source', 'character', 'bts', 'skins.js');

    const CHAR_IDS = collectCharacterIds();
    const ensureDir = (dir) => {
        if (!dryRun) mkdirSync(dir, { recursive: true });
    };

    function findDefaultSource(id) {
        const base = baseOf(id);
        const candidates = [
            base,
            base.toLowerCase(),
            base.toUpperCase(),
            base[0].toUpperCase() + base.slice(1),
        ];
        for (const dir of [SRC_FULLSKIN, SRC_CARD]) {
            if (!existsSync(dir)) continue;
            const files = readdirSync(dir);
            for (const c of candidates) {
                const hit = files.find((f) => f.slice(0, f.lastIndexOf('.')) === c);
                if (hit) return { dir, file: hit };
            }
            const st = files.find(
                (f) => f.slice(0, f.lastIndexOf('.')) === `st_${base}`,
            );
            if (st) return { dir, file: st };
        }
        return null;
    }

    let okDefault = 0, missingDefault = [];
    console.log('== 1. 默认皮肤（头像）==');
    ensureDir(DST_CHARACTER);
    for (const id of [...CHAR_IDS].sort()) {
        const dst = join(DST_CHARACTER, `${id}.png`);
        const src = findDefaultSource(id);
        if (src) {
            if (src.dir === SRC_CARD) {
                if (ffmpeg(join(src.dir, src.file), dst, { dryRun })) okDefault++;
            } else {
                if (dryRun) { okDefault++; continue; }
                copyFileSync(join(src.dir, src.file), dst);
                okDefault++;
            }
        } else if (id === 'bts_xing') {
            if (!dryRun) copyFileSync(join(DST_CHARACTER, 'bts_kaituozhe.png'), dst);
            okDefault++;
        } else if (id === 'bts_tingyun_wangguiren') {
            if (!dryRun) copyFileSync(join(DST_CHARACTER, 'bts_tingyun.png'), dst);
            okDefault++;
        } else {
            missingDefault.push(id);
        }
    }
    for (const stale of [
        'bts_Archer.png', 'bts_Gilgamesh.png', 'bts_Saber.png',
        'bts_st_huangquan.png', 'bts_st_xueyi.png',
    ]) {
        const correct = stale
            .replace(/^bts_([A-Z])/, (_, c) => `bts_${c.toLowerCase()}`)
            .replace('bts_st_', 'bts_');
        const p = join(DST_CHARACTER, stale);
        if (!dryRun && existsSync(p) && !existsSync(join(DST_CHARACTER, correct)))
            unlinkSync(p);
    }
    console.log(`  迁移 ${okDefault} 张（含覆盖）`);
    if (missingDefault.length) console.log(`  ⚠ 无源图：${missingDefault.join(', ')}`);

    // 2. 可选皮肤
    console.log('== 2. 可选皮肤 ==');
    let skinOk = 0, skinSkip = 0, skinDirs = 0;
    const SKIN_TRANSLATE = {};
    if (existsSync(DST_SKIN)) {
        for (const entry of readdirSync(DST_SKIN)) {
            const full = join(DST_SKIN, entry);
            if (statSync(full).isDirectory() && /[0-9]$/.test(entry)) {
                if (dryRun) console.log(`  [dry-run] 删除旧皮肤目录 ${entry}/`);
                else rmSync(full, { recursive: true, force: true });
            }
        }
    }
    if (existsSync(SRC_SKINS)) {
        for (const file of readdirSync(SRC_SKINS)) {
            if (!file.endsWith('.png')) continue;
            const m = file.slice(0, -4).match(/^(.*?)_(\d+)$/);
            if (!m) { skinSkip++; continue; }
            const base = m[1], num = m[2];
            const norm = base.replace(/^st_/, '');
            const charId = [...CHAR_IDS].find((id) => {
                const b = baseOf(id);
                return (
                    b === base || b === `st_${base}` || b === norm ||
                    b.toLowerCase() === base.toLowerCase() ||
                    b.toLowerCase() === norm.toLowerCase()
                );
            });
            if (!charId) { skinSkip++; continue; }
            const skinId = `${charId}_skin${num}`;
            SKIN_TRANSLATE[skinId] = `皮肤${num}`;
            const dstDir = join(DST_SKIN, charId);
            const dstFile = join(dstDir, `${skinId}.png`);
            if (existsSync(dstFile)) { skinOk++; continue; }
            ensureDir(dstDir);
            if (dryRun) { skinOk++; continue; }
            copyFileSync(join(SRC_SKINS, file), dstFile);
            skinOk++;
        }
        if (existsSync(DST_SKIN))
            skinDirs = readdirSync(DST_SKIN).filter((e) =>
                statSync(join(DST_SKIN, e)).isDirectory(),
            ).length;
    }
    console.log(`  迁移 ${skinOk} 张；跳过 ${skinSkip}（非本包/原皮）`);
    console.log(`  覆盖 ${skinDirs} 名角色（image/skin/<角色 id>/）`);

    // 3. 音频命名修正
    console.log('== 3. 音频命名修正 ==');
    const audioFixes = [
        [join(DST_AUDIO_DIE, 'bts_Gilgamesh.mp3'), join(DST_AUDIO_DIE, 'bts_gilgamesh.mp3')],
        [join(DST_AUDIO_DIE, 'bts_st_huangquan.mp3'), join(DST_AUDIO_DIE, 'bts_huangquan.mp3')],
        [join(DST_AUDIO_DIE, 'bts_kaotuozhe.mp3'), join(DST_AUDIO_DIE, 'bts_kaituozhe.mp3')],
    ];
    for (const [from, to] of audioFixes) {
        if (!existsSync(from)) continue;
        if (dryRun) { console.log(`  [dry-run] 重命名 ${basename(from)} → ${basename(to)}`); continue; }
        renameSync(from, to);
        console.log(`  重命名 ${basename(from)} → ${basename(to)}`);
    }
    const stray = join(DST_AUDIO_DIE, 'bts_st_anxi1 .mp3');
    if (existsSync(stray)) {
        const target = join(DST_AUDIO_SKILL, 'bts_st_anxi1.mp3');
        if (dryRun) console.log('  [dry-run] 移动 bts_st_anxi1 .mp3 → audio/skill/');
        else { renameSync(stray, target); console.log('  移动 bts_st_anxi1 .mp3 → audio/skill/'); }
    }
    const winFile = join(DST_AUDIO_DIE, 'bts_win_agelaiya.mp3');
    if (existsSync(winFile)) {
        if (dryRun) console.log('  [dry-run] 删除 bts_win_agelaiya.mp3（无对应机制）');
        else { unlinkSync(winFile); console.log('  删除 bts_win_agelaiya.mp3（无对应机制）'); }
    }
    const dieMissing = [...CHAR_IDS].filter(
        (id) => !existsSync(join(DST_AUDIO_DIE, `${id}.mp3`)),
    );
    if (dieMissing.length) console.log(`  ⚠ 无阵亡音（源亦无）：${dieMissing.join(', ')}`);

    // 4. 生成 skins.js
    console.log('== 4. 生成 skins.js ==');
    if (Object.keys(SKIN_TRANSLATE).length) {
        const entries = Object.entries(SKIN_TRANSLATE)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, name]) => `    '${id}': '${name}',`)
            .join('\n');
        const body = [
            '// 本文件由 scripts/migrate.mjs 自动生成：可选皮肤的显示名翻译（皮肤N）。',
            '// 皮肤图片本身由引擎经 character.skinPath（registry.js fillCharacterResources）',
            '// + game.getFileList 目录扫描自动发现，无需注册 characterSubstitute。',
            'export const SKIN_TRANSLATE = {',
            entries,
            '};',
        ].join('\n');
        if (dryRun) {
            console.log(`  [dry-run] 将写入 ${basename(SKINS_MODULE)}（${Object.keys(SKIN_TRANSLATE).length} 条皮肤名）`);
        } else {
            writeFileSync(SKINS_MODULE, body, 'utf8');
            console.log(`  已写入 ${SKINS_MODULE}（${Object.keys(SKIN_TRANSLATE).length} 条皮肤名）`);
        }
    } else {
        console.log('  无可选皮肤，跳过');
    }

    console.log(`${dryRun ? '[dry-run] ' : ''}素材迁移完成。`);
}

// ── 3. BGM 迁移（migrate-bgm）─────────────────────────────────────────────
function migrateBgm(srcRoot, { dryRun }) {
    const SRC_SYSTEM = join(srcRoot, 'audio', 'system');
    const DST_BGM = join(ROOT, 'audio', 'bgm');
    const CHAR_IDS = collectCharacterIds();

    if (!existsSync(SRC_SYSTEM)) throw new Error(`源目录不存在：${SRC_SYSTEM}`);

    let ok = 0, skip = 0, duel = 0;
    if (!dryRun) mkdirSync(DST_BGM, { recursive: true });

    for (const file of readdirSync(SRC_SYSTEM)) {
        if (!file.endsWith('.mp3')) continue;
        const base = file.slice(0, -4);
        const dm = /^duel(\d+)$/.exec(base);
        if (dm) {
            if (dryRun) { duel++; continue; }
            copyFileSync(join(SRC_SYSTEM, file), join(DST_BGM, `duel${dm[1]}.mp3`));
            duel++;
            continue;
        }
        const norm = base.replace(/^st_/, '');
        const charId = [...CHAR_IDS].find((id) => {
            const b = baseOf(id);
            return (
                b === base || b === `st_${base}` || b === norm ||
                b.toLowerCase() === base.toLowerCase() ||
                b.toLowerCase() === norm.toLowerCase()
            );
        });
        if (!charId) { skip++; continue; }
        if (dryRun) { ok++; continue; }
        copyFileSync(join(SRC_SYSTEM, file), join(DST_BGM, `${charId}.mp3`));
        ok++;
    }

    console.log(`  迁移角色 BGM ${ok} 个；duel 曲 ${duel} 首；跳过 ${skip}（非本包/系统音效）`);
    console.log(`${dryRun ? '[dry-run] ' : ''}BGM 迁移完成。`);
}

function printUsage() {
    console.log(`用法:
  node scripts/migrate.mjs --assets "<太阳神备份根目录>" [--dry-run]  基础素材（立绘 + 技能/阵亡音频）
  node scripts/migrate.mjs --skins  "<太阳神备份根目录>" [--dry-run]  皮肤 v3（默认 + 可选 + 音频命名修正）
  node scripts/migrate.mjs --bgm    "<太阳神备份根目录>" [--dry-run]  BGM（主公专属 + duel 随机曲）
  node scripts/migrate.mjs                                          交互选择（类型 + 源目录）`);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printUsage();
    // 预览/写盘：命令行 --dry-run 置 true；交互模式下选完类型与源目录后再 y/N 二次确认
    let dryRun = args.includes('--dry-run') || args.includes('-d');
    const assetsFlag = args.includes('--assets');
    const skinsFlag = args.includes('--skins');
    const bgmFlag = args.includes('--bgm');

    const mode = [...args].find((a) => /^--(assets|skins|bgm)$/.test(a));
    const srcArg = (() => {
        const modeNames = ['assets', 'skins', 'bgm'];
        for (const n of modeNames) {
            const i = args.indexOf(`--${n}`);
            if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('-'))
                return args[i + 1];
        }
        return null;
    })();

    try {
        let kind = mode ? mode.replace(/^--/, '') : null;
        let srcRoot = srcArg;

        if (kind && !srcRoot) {
            log.error(`--${kind} 需要太阳神备份根目录参数`);
            printUsage();
            process.exit(1);
        }
        if (!kind) {
            const standalone = [assetsFlag, skinsFlag, bgmFlag].filter(Boolean).length;
            if (standalone > 1) throw new Error('--assets/--skins/--bgm 一次只能指定一个');
            const choice = await menu('请选择迁移类型:', [
                { label: '基础素材（立绘 + 技能/阵亡音频，ogg→mp3）', value: 'assets' },
                { label: '皮肤 v3（默认 + 可选 + 音频命名修正）', value: 'skins' },
                { label: 'BGM（主公专属 + duel 随机曲）', value: 'bgm' },
            ]);
            if (!choice) {
                log.warn('已取消');
                return;
            }
            kind = choice.value;
            srcRoot = await prompt('请输入太阳神备份根目录（绝对路径）: ', { required: true });
            if (!existsSync(srcRoot) || !statSync(srcRoot).isDirectory()) {
                throw new Error(`目录不存在或不是目录：${srcRoot}`);
            }
            // 交互模式可在此选择是否仅预览（--dry-run，不写入）
            if (!args.includes('--dry-run')) {
                dryRun = await confirm('是否仅预览（--dry-run，不写入）？');
            }
        } else if (!existsSync(srcRoot) || !statSync(srcRoot).isDirectory()) {
            throw new Error(`目录不存在或不是目录：${srcRoot}`);
        }

        if (kind === 'assets') migrateAssets(srcRoot, { dryRun });
        else if (kind === 'skins') migrateSkins(srcRoot, { dryRun });
        else if (kind === 'bgm') migrateBgm(srcRoot, { dryRun });
        else throw new Error(`未知迁移类型：${kind}`);
    } finally {
        closeInteractive();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
    main().catch((error) => {
        log.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}