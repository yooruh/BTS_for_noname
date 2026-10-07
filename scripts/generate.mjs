#!/usr/bin/env node

/**
 * 崩铁杀派生数据生成脚本。
 *
 * 遍历「全局 buff/标记 + 全部角色 buffSkills/marks」定义上的自定义标签
 * （markKind / permanent / glossaryId），自动生成 source/generated/buffRegistry.js：
 *   MARKS_REGISTRY / BLESSES / ABNORMALS / PERMANENT_BLESSES / BUFF_GLOSSARY
 * 运行时静态 import 本表（加载期不遍历技能，符合「build 复杂度可增、加载复杂度不增」）。
 *
 * 标签缺失兜底：markKind 按键前缀推断（bts_bless_→bless …）；permanent 仅认显式 true。
 *
 * 用法：node scripts/generate.mjs [--check]   （--check 只比对不写盘，漂移/校验失败退出码 1）
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log, readText, writeText } from './lib/shared.mjs';
import { menu, closeInteractive } from './lib/interactive.mjs';
import { installBtsLoader } from './lib/bts-loader.mjs';
import { loadRoleMods, relRolePath } from './lib/roles.mjs';
import { scanRoles } from './rebuild.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const SOURCE = resolve(ROOT, 'source');
const GENERATED_DIR = resolve(SOURCE, 'generated');
const GENERATED_PATH = resolve(GENERATED_DIR, 'buffRegistry.js');

const KNOWN_KINDS = ['bless', 'abnormal', 'shield', 'curse', 'pet', 'mark', 'record'];
// 孤儿裸键：不得再以裸键形式出现在 lib.translate 绑定的对象键上（应使用完整 bts_ 键）。
const BARE_ORPHAN_KEYS = ['liubu', 'zhigaozhizi', 'dengshen', 'bts_liewu'];

const GENERATED_HEADER =
    '// 由 scripts/generate.mjs 自动生成（勿手改）：标记定义标签（markKind/permanent/glossaryId）→ 静态表；' +
    '运行时直接 import（加载期不遍历技能），键均为 bts_ 完整键。\n';

async function importIfExists(rel) {
    const url = pathToFileURL(resolve(SOURCE, rel)).href;
    try {
        return await import(url);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
        throw error;
    }
}

/** 键前缀推断（markKind 缺失时的兜底）。 */
function inferKind(key, def) {
    if (key.startsWith('bts_bless_')) return 'bless';
    if (key.startsWith('bts_abnormal_')) return 'abnormal';
    if (key === 'bts_shield') return 'shield';
    if (key === 'bts_curse') return 'curse';
    if (key.startsWith('bts_pet_')) return 'pet';
    if (def && def.mark === false) return 'record';
    return 'mark';
}

/** 常驻判定：显式 permanent:true（常驻祝福不自然衰减）。 */
function resolvePermanent(key, def) {
    return def && def.permanent === true;
}

function walkJs(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walkJs(full, out);
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

/** 文本级校验：手写 BLESSES/ABNORMALS 残留 + 孤儿裸键。 */
function scanSourceText(errors) {
    const files = walkJs(SOURCE);
    for (const file of files) {
        const rel = relative(SOURCE, file).replace(/\\/g, '/');
        if (rel.startsWith('generated/')) continue; // 生成文件自身含 BLESSES/ABNORMALS 导出
        const text = readText(file);
        for (const m of text.matchAll(/export\s+const\s+(BLESSES|ABNORMALS)\s*=/g)) {
            errors.push(`手写 ${m[1]} 数组残留：${rel}（应改由标签自动生成）`);
        }
        // 负向后行断言防子串误伤（bts_st_dengshen: 不得命中 dengshen:）
        for (const m of text.matchAll(
            /(?<![\w$])(['"]?)(?:liubu|zhigaozhizi|dengshen|bts_liewu)\1\s*:/g,
        )) {
            errors.push(`孤儿裸键 ${m[0].trim().split(':')[0]}：${rel}（应使用完整 bts_ 键）`);
        }
    }
}

/**
 * 汇总全部标记定义并校验。
 * @returns {{byKind: Object<string,string[]>, permanent: string[],
 *            glossary: Object<string,string>, warnings: string[], errors: string[]}}
 */
async function collect() {
    const { errors: roleErrors } = await scanRoles();
    if (roleErrors.length) throw new Error(`角色校验失败：\n- ${roleErrors.join('\n- ')}`);

    // 全局 buff（rules/globalBuffs.js buffSkills）
    const globalBuffsMod = await importIfExists('rules/globalBuffs.js');
    const globalBuffEntries = Object.entries(globalBuffsMod?.buffSkills ?? {});
    const globalBuffTranslate = globalBuffsMod?.translate ?? {};

    // 全局标记（rules/globalMarks.js marks）
    const globalMarksMod = await importIfExists('rules/globalMarks.js');
    // 属性附加名（bts_n_*）在 natures.js translate（globalMarks.js 不重复维护）
    const naturesMod = await importIfExists('rules/natures.js');
    const naturesTranslate = naturesMod?.translate ?? {};
    const globalMarkEntries = Object.entries(globalMarksMod?.marks ?? {});
    const globalMarkTranslate = {
        ...naturesTranslate,
        ...(globalMarksMod?.translate ?? {}),
    };

    // 全局规则词条（rules/globalrules.js glossary：通用机制词条）
    const globalrulesMod = await importIfExists('rules/globalrules.js');

    // 角色模块（lib/roles.mjs 已缓存 scanRoles 加载过的同一批模块，直接复用，不重复 import）
    const roleMods = [...(await loadRoleMods())].map(([full, mod]) => ({
        file: relRolePath(full),
        mod,
    }));

    // 词条 id 全集（校验 glossaryId 可解析）：通用词条在 rules/globalrules.js、角色专属在
    // 各角色文件 glossary，均在此聚合）
    const glossaryIds = new Set(
        [
            ...(globalrulesMod?.glossary ?? []),
            ...roleMods.flatMap(({ mod }) => mod?.glossary ?? []),
        ].map((g) => g.id),
    );

    const warnings = [];
    const errors = [];
    const byKind = Object.fromEntries(KNOWN_KINDS.map((k) => [k, []]));
    const permanent = [];
    const glossary = {};
    const seen = new Set();
    // skill 与标记定义的撞名集合（真实技能键）
    const skillKeys = new Set();

    const push = (key, def, translateMap, src) => {
        const explicit = def && typeof def.markKind === 'string';
        const kind = explicit ? def.markKind : inferKind(key, def);
        if (!KNOWN_KINDS.includes(kind)) {
            errors.push(`未知 markKind：${src} ${key} = ${String(kind)}`);
            return;
        }
        if (seen.has(key)) errors.push(`重复标记键：${src} ${key}`);
        else seen.add(key);

        byKind[kind].push(key);
        if (kind === 'bless' && resolvePermanent(key, def)) permanent.push(key);
        if (def?.glossaryId) {
            glossary[key] = def.glossaryId;
            if (!glossaryIds.has(def.glossaryId)) {
                errors.push(`glossaryId 不可解析：${src} ${key} → ${def.glossaryId}`);
            }
        }
        // 迁移进度提示（不阻断 --check）
        if (!explicit) warnings.push(`[待打标签] ${src} ${key}（现由前缀推断为 ${kind}）`);
        if (def && (def.name != null || def.markContent != null)) {
            warnings.push(`[待迁移] ${src} ${key}：name/markContent 仍在对象内，应迁入 translate`);
        }
        if (!explicit || !def || (def.name == null && def.markContent == null)) {
            // 未显式标签或未带内联 name：仍需确保有显示名来源（translate[id] 或内联 name）
            const hasName = translateMap[key] != null || (def && def.name != null);
            if (!hasName) warnings.push(`[缺译名] ${src} ${key}：translate[${key}] 与内联 name 均缺失`);
        }
    };

    for (const [key, def] of globalBuffEntries) {
        push(key, def, globalBuffTranslate, '全局buff(globalBuffs)');
    }
    for (const [key, def] of globalMarkEntries) {
        push(key, def, globalMarkTranslate, '全局标记');
    }
    for (const { file, mod } of roleMods) {
        const translateMap = mod.translate ?? {};
        for (const [key, def] of Object.entries(mod.buffSkills ?? {})) {
            push(key, def, translateMap, file);
        }
        for (const [key, def] of Object.entries(mod.marks ?? {})) {
            push(key, def, translateMap, file);
        }
        for (const key of Object.keys(mod.skill ?? {})) skillKeys.add(key);
    }

    // 标记定义与真实技能键撞名（现存的 4 处死 markIntro 撞名，阶段3 修复后应清零）
    for (const key of seen) {
        if (skillKeys.has(key)) {
            errors.push(`标记键与技能键撞名：${key}（定义既在 skill 又在 buffSkills/marks/RULE_MARKS）`);
        }
    }

    // 铁律：buff/标记 _info 不得进 simpleTranslate（否则 index.js 的 dynamicTranslate 循环
    // 会把说明当标记名动态渲染）。撞名技能修复前（其 _info 是合法技能描述）不误报。
    for (const { file, mod } of roleMods) {
        const simple = mod.simpleTranslate ?? {};
        for (const entryKey of seen) {
            if (!skillKeys.has(entryKey) && simple[`${entryKey}_info`] != null) {
                errors.push(`${file}：simpleTranslate 含标记 ${entryKey}_info（应只在 translate）`);
            }
        }
    }

    scanSourceText(errors);

    // 输出稳定排序
    const sorted = (arr) => [...arr].sort((a, b) => a.localeCompare(b));
    const sortedGlossary = Object.fromEntries(
        Object.entries(glossary).sort(([a], [b]) => a.localeCompare(b)),
    );
    return {
        byKind: Object.fromEntries(KNOWN_KINDS.map((k) => [k, sorted(byKind[k])])),
        permanent: sorted(permanent),
        glossary: sortedGlossary,
        warnings,
        errors,
    };
}

function render(data) {
    const json = (value) =>
        JSON.stringify(value, null, 4)
            .replace(/"([^"]+)"/g, "'$1'")
            .replace(/\n\]$/, ',\n]');
    const lines = [
        GENERATED_HEADER,
        `export const MARKS_REGISTRY = ${json(data.byKind)};`,
        '',
        `export const BLESSES = ${json(data.byKind.bless)};`,
        `export const ABNORMALS = ${json(data.byKind.abnormal)};`,
        `export const PERMANENT_BLESSES = ${json(data.permanent)};`,
        `export const BUFF_GLOSSARY = ${json(data.glossary)};`,
    ];
    return lines.join('\n');
}

/**
 * 生成/校验派生数据表。
 * @param {{checkOnly?: boolean, silent?: boolean}} [opts]
 * @returns {Promise<{file: string, changed: boolean, errorCount: number, warningCount: number}>}
 */
export async function generateProject({ checkOnly = false, silent = false } = {}) {
    installBtsLoader();
    const data = await collect();
    const next = render(data);
    const previous = readTextSafe(GENERATED_PATH);
    const changed = previous !== next;
    if (changed && !checkOnly) {
        mkdirSync(GENERATED_DIR, { recursive: true });
        writeText(GENERATED_PATH, next);
    }
    for (const w of data.warnings) log.warn(w);
    for (const e of data.errors) log.error(e);
    if (!silent) {
        const counts = `校验 ${Object.values(data.byKind).reduce((s, a) => s + a.length, 0)} 个标记定义`;
        if (data.errors.length) {
            log.error(`${counts}；${data.errors.length} 处错误（${checkOnly ? '--check' : '已写入'}）`);
        } else if (changed) {
            log.ok(`${counts}；${checkOnly ? '存在待同步的派生表' : '已同步派生表'}`);
        } else {
            log.ok(`${counts}；派生表已是最新`);
        }
        if (data.warnings.length) {
            log.warn(`${data.warnings.length} 条迁移提示（见上方 [待…] 行，完成打标/迁移后应清零）`);
        }
    }
    return {
        file: 'source/generated/buffRegistry.js',
        changed,
        errorCount: data.errors.length,
        warningCount: data.warnings.length,
    };
}

function readTextSafe(filePath) {
    try {
        return readText(filePath);
    } catch {
        return '';
    }
}

async function runInteractive() {
    try {
        const choice = await menu('请选择派生数据操作:', [
            { label: '生成 buffRegistry.js（默认）', value: 'generate' },
            { label: '校验模式（--check，不写盘）', value: 'check' },
        ]);
        if (!choice) {
            log.warn('已取消');
            return;
        }
        await run(choice.value === 'check');
    } finally {
        closeInteractive();
    }
}

async function run(checkOnly) {
    try {
        const { changed, errorCount } = await generateProject({ checkOnly });
        if (checkOnly && (changed || errorCount)) process.exitCode = 1;
        if (!checkOnly && errorCount) process.exitCode = 1;
    } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

function main() {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const write = args.includes('--write');
    if (!check && !write) {
        runInteractive().catch(() => process.exitCode ||= 1);
        return;
    }
    run(check);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) main();
