#!/usr/bin/env node

/**
 * 崩铁杀 描述专有名词 → poptip 替换脚本（词条 / 技能 / 角色 三类引用统一超链接化）。
 *
 * 覆盖范围：角色文件的 `intro`（角色简介）、`_info`（技能说明，含跨行 `+` 拼接值的延续行）、
 * `simpleTranslate` 的 `_info`（简略说明）、`dynamicTranslate` 返回值、`glossary` 的 `info`；
 * 以及全局规则文件（globalrules / globalBuffs / globalMarks）的 `_info` 与 `info`。
 *
 * 替换源（三者合并，长词优先）：
 *  - 静态词条表（下方 REPLACEMENTS，术语/祝福/异常等 `bts_glossary_*_faq`）；
 *  - 技能名（`bts_sk_*` 且有 `<id>_info`，点击可见技能说明）；
 *  - 角色名（`bts_ch_*` 非皮肤、长度 ≥2，点击打开角色资料卡）。
 * 本文件主角色名保持纯文本（无需自链接）；单字名（刃）不入表（子串误伤，人工处理）。
 *
 * 机制：
 *  - 逐字符串字面量处理：模板字符串直接插值 `${get.poptip('id')}`；普通字符串内容不含
 *    反引号/`${`/反斜杠时转换为模板字符串，否则跳过；
 *  - 长词优先 + 跳过 `get.poptip(...)` 已有区间；一名多 id 优先本文件所属，仍多者取
 *    最短 id 并提示（远征 base/friend 等）；
 *  - 幂等：替换结果为 `get.poptip` 调用/`⟨id⟩` 标记，重跑不再命中。
 *
 * 用法：node scripts/replace-glossary.mjs [--dry-run]
 *   --dry-run：只打印将替换的明细（文件|区域|词→id|上下文）与统计，不写盘。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllRoleMods } from './lib/roles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const ROLES_DIR = join(ROOT, 'source', 'character', 'bts', 'roles');
const GLOBAL_FILES = [
    { label: 'rules/globalrules.js', path: join(ROOT, 'source', 'rules', 'globalrules.js') },
    { label: 'rules/globalBuffs.js', path: join(ROOT, 'source', 'rules', 'globalBuffs.js') },
    { label: 'rules/globalMarks.js', path: join(ROOT, 'source', 'rules', 'globalMarks.js') },
];
const dryRun = process.argv.includes('--dry-run');

// ── 静态词条表（词条 id → 匹配词；长词优先自动排序）────────────────────────
const REPLACEMENTS = [
    ['bts_glossary_bisha_faq', ['必杀技', '必杀']],
    ['bts_glossary_bless_dark_faq', ['暗之祝福']],
    ['bts_glossary_bless_cifu_faq', ['赐福祝福', '赐福']],
    ['bts_glossary_bless_huqi_faq', ['狐祈祝福', '狐祈']],
    ['bts_glossary_bless_xianwaiyin_faq', ['弦外音祝福', '弦外音']],
    ['bts_glossary_bless_zhisheng_faq', ['制胜祝福', '制胜']],
    ['bts_glossary_bless_yingyue_faq', ['映月']],
    ['bts_glossary_bless_fatal_faq', ['致命祝福', '致命']],
    ['bts_glossary_bless_through_faq', ['贯通祝福']],
    ['bts_glossary_bless_critical_faq', ['暴击祝福', '暴击']],
    ['bts_glossary_bless_busi_faq', ['不死祝福', '不死']],
    ['bts_glossary_bless_maxhp_faq', ['体力上限祝福', '体力上限']],
    ['bts_glossary_bless_god_faq', ['星启祝福']],
    ['bts_glossary_bless_yingzi_faq', ['契约祝福', '契约']],
    ['bts_glossary_bless_shengxi_faq', ['生息祝福', '生息']],
    ['bts_glossary_bless_fullburn_faq', ['完全燃烧祝福', '完全燃烧']],
    ['bts_glossary_bless_xuneng_faq', ['蓄能祝福', '蓄能']],
    ['bts_glossary_bless_canmei_faq', ['残梅祝福', '残梅']],
    ['bts_glossary_bless_zhiyu_faq', ['治愈祝福', '治愈']],
    ['bts_glossary_bless_zengfu_faq', ['增幅祝福', '增幅']],
    ['bts_glossary_bless_shengge_faq', ['升格祝福', '升格']],
    ['bts_glossary_bless_jieyin_faq', ['结印祝福', '结印']],
    ['bts_glossary_bless_gongwu_faq', ['共舞祝福', '共舞']],
    ['bts_glossary_bless_shenjun_faq', ['神君祝福', '神君']],
    ['bts_glossary_bless_rangming_faq', ['禳命祝福', '禳命']],
    ['bts_glossary_bless_kanpo_faq', ['看破祝福', '看破']],
    ['bts_glossary_bless_yuguotianqing_faq', ['雨过天晴祝福', '雨过天晴']],
    ['bts_glossary_bless_haiqu_faq', ['绝海祝福', '绝海']],
    ['bts_glossary_bless_zhianzhimi_faq', ['至暗之谜祝福', '至暗之谜']],
    ['bts_glossary_bless_qiyu_faq', ['旗语祝福', '旗语']],
    ['bts_glossary_bless_reyi_faq', ['热意祝福', '热意']],
    ['bts_glossary_bless_faq', ['祝福']],
    ['bts_glossary_nuqi_faq', ['怒气']],
    ['bts_glossary_xingqi_faq', ['星启']],
    ['bts_glossary_hudun_faq', ['护盾']],
    ['bts_glossary_canmeng_faq', ['残梦']],
    ['bts_glossary_feihuang_faq', ['飞黄']],
    ['bts_glossary_zhongdu_faq', ['中毒']],
    ['bts_glossary_mabi_faq', ['麻痹']],
    ['bts_glossary_guantong_faq', ['贯通']],
    ['bts_glossary_nature_dark_faq', ['量子属性']],
    ['bts_glossary_nature_guang_faq', ['虚数属性']],
    ['bts_glossary_nature_yan_faq', ['火属性']],
    ['bts_glossary_nature_feng_faq', ['风属性']],
    ['bts_glossary_nature_water_faq', ['水属性']],
    ['bts_glossary_nature_earth_faq', ['物理属性']],
    ['bts_glossary_abnormal_burn_faq', ['烧伤']],
    ['bts_glossary_abnormal_freeze_faq', ['冻结']],
    ['bts_glossary_abnormal_fossilize_faq', ['石化']],
    ['bts_glossary_abnormal_sleep_faq', ['睡眠']],
    ['bts_glossary_abnormal_confuse_faq', ['混乱']],
    ['bts_glossary_abnormal_scary_faq', ['恐惧']],
    ['bts_glossary_abnormal_shenghua_faq', ['升华']],
    ['bts_glossary_abnormal_lieyang_faq', ['烈阳']],
    ['bts_glossary_abnormal_shahuo_faq', ['煞火']],
    ['bts_glossary_abnormal_diyu_faq', ['地狱']],
    ['bts_glossary_abnormal_duanjian_faq', ['短见']],
    ['bts_glossary_abnormal_zhanfang_faq', ['绽放']],
    ['bts_glossary_abnormal_luandie_faq', ['乱蝶']],
    ['bts_glossary_abnormal_mingding_faq', ['酩酊']],
    ['bts_glossary_abnormal_fuzhai_faq', ['负债']],
    ['bts_glossary_abnormal_jielu_faq', ['揭露']],
    ['bts_glossary_abnormal_baixie_faq', ['败谢']],
    ['bts_glossary_abnormal_dingzhen_faq', ['定谮']],
    ['bts_glossary_abnormal_chunzui_faq', ['沉醉']],
    ['bts_glossary_duzhu_faq', ['赌注']],
    ['bts_glossary_shuowang_faq', ['朔望']],
    ['bts_glossary_extra_st_faq', ['怒气豁免']],
    ['bts_glossary_zhugu_faq', ['主顾']],
    ['bts_glossary_qizha_faq', ['欺诈']],
    ['bts_glossary_huozhong_faq', ['火种']],
    ['bts_glossary_fanshi_active_faq', ['燔世状态']],
    ['bts_glossary_shengbian_faq', ['升变']],
    ['bts_glossary_yizhi_faq', ['忆质']],
    ['bts_glossary_jiyi_faq', ['记忆']],
    ['bts_glossary_st_letu_active_faq', ['乐土状态']],
    ['bts_glossary_lanhan_faq', ['婪酣']],
    ['bts_glossary_magic_diamond_faq', ['宝石']],
    ['bts_glossary_xingzhi_faq', ['兴致']],
    ['bts_glossary_qifen_faq', ['气氛']],
    ['bts_glossary_xuechou_faq', ['血仇']],
    ['bts_glossary_moze_dark_assault_faq', ['暗袭']],
    ['bts_glossary_fuyuan_faq', ['浮元']],
    ['bts_glossary_st_zhankan_faq', ['斩勘']],
    ['bts_glossary_st_piji_faq', ['避劫']],
    ['bts_glossary_ebao_faq', ['恶报']],
    ['bts_glossary_koudai_faq', ['口袋']],
    ['bts_glossary_st_mengchong_faq', ['传冲']],
    ['bts_glossary_xinrui_faq', ['新蕊']],
    ['bts_glossary_midi_faq', ['谜底']],
    ['bts_glossary_linggan_faq', ['灵感']],
    ['bts_glossary_baihua_faq', ['白花']],
    ['bts_glossary_bailu_zhulu_faq', ['珠露']],
];

const STATIC_MAP = new Map();
for (const [id, words] of REPLACEMENTS) {
    for (const word of words) {
        const prev = STATIC_MAP.get(word);
        if (prev && prev !== id) {
            console.warn(`⚠ 静态词条重名：${word}（${prev} / ${id}）`);
        }
        STATIC_MAP.set(word, id);
    }
}

// ── 动态字典：技能名 / 角色名（从角色模块导入，保持与源码同步）──────────────
const mods = await loadAllRoleMods();
const skillDict = new Map(); // word -> [{ id, owner }]
const charDict = new Map(); // word -> [{ id, owner }]
const selfNameByFile = new Map(); // 角色相对路径 -> 主角色显示名（该文件内保持纯文本）
const addEntry = (map, word, entry) => {
    if (!map.has(word)) map.set(word, []);
    const list = map.get(word);
    if (!list.some((e) => e.id === entry.id)) list.push(entry);
};
for (const [full, mod] of mods) {
    const rel = full.replace(/\\/g, '/').split('/roles/')[1];
    const charKeys = Object.keys(mod.character || {});
    if (charKeys.length === 1) {
        const name = mod.translate?.[charKeys[0]];
        if (typeof name === 'string') selfNameByFile.set(rel, name);
    }
    for (const [k, v] of Object.entries(mod.translate || {})) {
        if (typeof v !== 'string') continue;
        if (/^bts_sk_[A-Za-z0-9_]+$/.test(k) && typeof mod.translate[`${k}_info`] === 'string') {
            addEntry(skillDict, v, { id: k, owner: rel });
        } else if (
            /^bts_ch_[A-Za-z0-9_]+$/.test(k) &&
            !/_skin\d+$/.test(k) &&
            v.length >= 2
        ) {
            addEntry(charDict, v, { id: k, owner: rel });
        }
    }
}

// ── 人工裁决覆盖（干跑审计产物）────────────────────────────────────────
// 词级强制目标：同名歧义的人工裁决结果。
const WORD_OVERRIDES = new Map([
    // 「乐手」在知更鸟·晴歌文本中指忆灵「晴空乐手」（角色卡），而非同名技能 bts_sk_yueshou
    ['乐手', 'bts_ch_qingkongyueshou'],
]);
// 文件×词 级跳过：泛用词误报（黑塔 intro 的「压制输出」是玩法类别描述，不指佩拉技能「压制」）。
const FILE_WORD_SKIPS = new Set(['heitakongjianzhan/heita.js::压制']);

// ── 合并词表与总正则（长词优先）──────────────────────────────────────────
const ALL_WORDS = [
    ...new Set([...STATIC_MAP.keys(), ...skillDict.keys(), ...charDict.keys()]),
].sort((a, b) => b.length - a.length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD_RE = new RegExp(ALL_WORDS.map(escapeRe).join('|'), 'g');

// ── 统计与报告 ───────────────────────────────────────────────────────────
const stats = { replaced: 0, files: 0 };
const detail = []; // dry-run 明细
const notes = new Set(); // 一名多 id 等提示
const keptSelf = new Map(); // rel -> count（自身名保留次数，仅统计）

/** 找出 text 中所有 get.poptip(...) 调用区间（避免在已有引用内二次替换）。 */
function findPoptipSpans(text) {
    const spans = [];
    const re = /get\.poptip\(/g;
    let m;
    while ((m = re.exec(text))) {
        let depth = 0;
        let i = m.index + 'get.poptip('.length - 1;
        let quote = null;
        for (; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === '\\') i++;
                else if (ch === quote) quote = null;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === '`') {
                quote = ch;
                continue;
            }
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) break;
            }
        }
        const end = i + 1;
        spans.push([m.index, end]);
        re.lastIndex = end;
    }
    return spans;
}

/** 解析词 → poptip id：人工裁决 > 静态优先；动态优先本文件所属，仍未定者取最短 id 并提示。 */
function resolveId(word, rel) {
    if (FILE_WORD_SKIPS.has(`${rel}::${word}`)) return null;
    if (WORD_OVERRIDES.has(word)) return WORD_OVERRIDES.get(word);
    if (STATIC_MAP.has(word)) return STATIC_MAP.get(word);
    const dyn = [...(skillDict.get(word) || []), ...(charDict.get(word) || [])];
    if (!dyn.length) return null;
    const owned = dyn.filter((e) => e.owner === rel);
    const pool = owned.length ? owned : dyn;
    if (pool.length === 1) return pool[0].id;
    const chosen = [...pool].sort((a, b) => a.id.length - b.id.length)[0];
    notes.add(
        `一名多 id：${rel} 的「${word}」候选 ${pool.map((e) => e.id).join(' / ')} → 取 ${chosen.id}`,
    );
    return chosen.id;
}

/** 对一段纯文本执行替换；返回 { out, count }。 */
function tokenize(text, rel, area) {
    const spans = findPoptipSpans(text);
    let out = '';
    let last = 0;
    let count = 0;
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(text))) {
        const word = m[0];
        const idx = m.index;
        if (spans.some(([s, e]) => idx >= s && idx + word.length <= e)) continue;
        if (selfNameByFile.get(rel) === word) {
            keptSelf.set(rel, (keptSelf.get(rel) || 0) + 1);
            continue;
        }
        const id = resolveId(word, rel);
        if (!id) continue;
        out += text.slice(last, idx) + `\${get.poptip('${id}')}`;
        last = idx + word.length;
        count++;
        if (dryRun) {
            const ctx = text
                .slice(Math.max(0, idx - 30), idx + word.length + 30)
                .replace(/\n/g, ' ');
            detail.push(`${rel}\t${area}\t${word}\t${id}\t${ctx}`);
        }
    }
    out += text.slice(last);
    return { out, count };
}

/** 处理模板字符串内容（不含首尾反引号）：文本段直接替换；简单字符串实参转换。 */
function processTemplateContent(content, rel, area) {
    let out = '';
    let count = 0;
    let i = 0;
    while (i < content.length) {
        const d = content.indexOf('${', i);
        if (d === -1) {
            const r = tokenize(content.slice(i), rel, area);
            out += r.out;
            count += r.count;
            break;
        }
        const r = tokenize(content.slice(i, d), rel, area);
        out += r.out;
        count += r.count;
        // 扫描插值结束（引号感知的配对 }）
        let j = d + 2;
        let depth = 1;
        let quote = null;
        while (j < content.length && depth > 0) {
            const ch = content[j];
            if (quote) {
                if (ch === '\\') {
                    j += 2;
                    continue;
                }
                if (ch === quote) quote = null;
                j++;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === '`') {
                quote = ch;
                j++;
                continue;
            }
            if (ch === '{') depth++;
            if (ch === '}') depth--;
            j++;
        }
        const expr = content.slice(d + 2, j - 1).trim();
        const converted = processInterpolation(expr, rel, area);
        out += `\${${converted.expr}}`;
        count += converted.count;
        i = j;
    }
    return { out, count };
}

/** 插值内简单字符串实参（'词' / B('词')）→ get.poptip('id') 调用（整参=单词才转换）。 */
function processInterpolation(expr, rel, area) {
    const m = /^([A-Za-z_$][\w$]*\()?'([^']+)'\)?$/.exec(expr);
    if (!m) return { expr, count: 0 };
    const { out, count } = tokenize(m[2], rel, area);
    if (count !== 1) return { expr, count: 0 };
    const only = /^\$\{get\.poptip\('([^']+)'\)\}$/.exec(out);
    if (!only) return { expr, count: 0 };
    return {
        expr: m[1] ? `${m[1]}get.poptip('${only[1]}'))` : `get.poptip('${only[1]}')`,
        count: 1,
    };
}

/** 普通字符串能否安全转换为模板字符串（无反引号/插值/反斜杠）。 */
function safeToTemplate(content) {
    return !content.includes('`') && !content.includes('${') && !content.includes('\\');
}

/** 处理一个字符串字面量（含引号）。无法安全处理时原样返回。 */
function processLiteral(literal, rel, area) {
    const quote = literal[0];
    if (quote !== "'" && quote !== '"' && quote !== '`')
        return { out: literal, count: 0 };
    if (quote === '`') {
        const { out, count } = processTemplateContent(literal.slice(1, -1), rel, area);
        if (count === 0) return { out: literal, count: 0 };
        return { out: `\`${out}\``, count };
    }
    const content = literal.slice(1, -1);
    const { out, count } = tokenize(content, rel, area);
    if (count === 0) return { out: literal, count: 0 };
    if (!safeToTemplate(content)) {
        console.warn(`  ⚠ 跳过（含反引号/\${/反斜杠，无法转模板字符串）: ${content.slice(0, 40)}…`);
        return { out: literal, count: 0 };
    }
    return { out: `\`${out}\``, count };
}

/** 行级处理：`键: '值'` 形式的 _info / info（glossary）键值行；或 `键:` 结尾（值在下一行）。 */
function processKeyLine(line, rel) {
    const keyOnly = /^(\s*)(?:'([^']+)'|"([^"]+)"|([\w$]+)):\s*$/.exec(line);
    if (keyOnly) {
        const key = keyOnly[2] || keyOnly[3] || keyOnly[4];
        if (key.endsWith('_info') || key === 'info') {
            return { line, count: 0, nextIsValue: true, key };
        }
        return { line, count: 0 };
    }
    const m = /^(\s*)(?:'([^']+)'|"([^"]+)"|([\w$]+))\s*:\s*/.exec(line);
    if (!m) return { line, count: 0 };
    const key = m[2] || m[3] || m[4];
    if (!key.endsWith('_info') && key !== 'info') return { line, count: 0 };
    const rest = line.slice(m[0].length).trimEnd();
    const trailing = rest.endsWith(',') ? ',' : '';
    const literal = trailing ? rest.slice(0, -1).trimEnd() : rest.trimEnd();
    const { out, count } = processLiteral(literal, rel, key);
    const cont = !/[;,]/.test(rest.slice(-1)); // 值行未以 , / ; 终止 → 后续 `+ \`...\`` 为延续行
    if (count === 0) return { line, count: 0, key, cont };
    return { line: `${m[1]}${key}: ${out}${trailing}`, count, key, cont };
}

/** 处理独立值行（上一个 _info/info 键行把值放到了下一行）。 */
function processValueLine(line, rel, key) {
    const trimmed = line.trimEnd();
    const trailing = trimmed.endsWith(',') ? ',' : '';
    const literal = (trailing ? trimmed.slice(0, -1) : trimmed).trim();
    const { out, count } = processLiteral(literal, rel, key);
    const cont = !/[;,]/.test(trimmed.slice(-1)); // 值行未以 , / ; 终止 → 后续 `+ \`...\`` 为延续行
    if (count === 0) return { line, count: 0, cont };
    const indent = line.slice(0, line.length - line.trimStart().length);
    return { line: `${indent}${out}${trailing}`, count, cont };
}

/** 对一行文本中的所有字符串字面量执行替换（intro / dynamicTranslate 等自由文本行用）。 */
function processLiteralsOnLine(line, rel, area) {
    const literals = [];
    let j = 0;
    while (j < line.length) {
        const q = line[j];
        if (q === "'" || q === '"' || q === '`') {
            let k = j + 1;
            while (k < line.length && line[k] !== q) {
                if (line[k] === '\\') k++;
                k++;
            }
            if (k < line.length) {
                literals.push({ start: j, end: k + 1, text: line.slice(j, k + 1) });
                j = k + 1;
                continue;
            }
        }
        j++;
    }
    let out = line;
    let count = 0;
    for (const lit of literals.reverse()) {
        const { out: newText, count: c } = processLiteral(lit.text, rel, area);
        if (c > 0) {
            out = out.slice(0, lit.start) + newText + out.slice(lit.end);
            count += c;
        }
    }
    return { line: out, count };
}

/** 处理 intro / dynamicTranslate 导出块（可能为多行字符串拼接，逐行处理到 stop 行）。 */
function processLiteralBlock(lines, startIndex, rel, area, stop) {
    let count = 0;
    let endIndex = startIndex;
    const out = [...lines];
    for (let i = startIndex; i < lines.length; i++) {
        const { line: newLine, count: c } = processLiteralsOnLine(lines[i], rel, area);
        if (c > 0) {
            out[i] = newLine;
            count += c;
        }
        if (stop(lines[i])) {
            endIndex = i;
            break;
        }
    }
    return { lines: out, count, endIndex };
}

/** 处理单个文件（角色文件含 intro；全局文件仅键行）。 */
function processFile(path, rel, { withIntro }) {
    const lines = readFileSync(path, 'utf8').split('\n');
    const out = [...lines];
    let fileCount = 0;
    let pendingInfoKey = null; // `键:` 独占一行时的待处理值行
    let pendingContKey = null; // 多行拼接值（+ \`...\`）延续行所属的 _info/info 键
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (withIntro && trimmed.startsWith('export const intro')) {
            const { lines: newLines, count, endIndex } = processLiteralBlock(out, i, rel, 'intro', (l) =>
                /;\s*$/.test(l.trimEnd()),
            );
            for (let k = i; k <= endIndex; k++) out[k] = newLines[k];
            fileCount += count;
            i = endIndex;
            continue;
        }
        if (withIntro && trimmed.startsWith('export const dynamicTranslate')) {
            const { lines: newLines, count, endIndex } = processLiteralBlock(
                out,
                i + 1,
                rel,
                'dynamicTranslate',
                (l) => l.trim() === '};',
            );
            for (let k = i + 1; k <= endIndex; k++) out[k] = newLines[k];
            fileCount += count;
            i = endIndex;
            continue;
        }
        if (pendingContKey) {
            if (/^\s*\+/.test(line)) {
                const { line: newLine, count } = processLiteralsOnLine(line, rel, pendingContKey);
                if (count > 0) {
                    out[i] = newLine;
                    fileCount += count;
                }
                if (/[;,]\s*$/.test(line.trimEnd())) pendingContKey = null;
                continue;
            }
            pendingContKey = null;
        }
        if (pendingInfoKey) {
            const { line: newLine, count, cont } = processValueLine(line, rel, pendingInfoKey);
            if (count > 0) {
                out[i] = newLine;
                fileCount += count;
            }
            if (cont) pendingContKey = pendingInfoKey;
            pendingInfoKey = null;
            continue;
        }
        const { line: newLine, count, nextIsValue, key, cont } = processKeyLine(line, rel);
        if (count > 0) {
            out[i] = newLine;
            fileCount += count;
        }
        if (nextIsValue) pendingInfoKey = key;
        else if (key && cont) pendingContKey = key;
    }
    if (fileCount > 0) {
        stats.replaced += fileCount;
        stats.files++;
        if (dryRun) {
            console.log(`  [dry-run] ${rel}：${fileCount} 处`);
        } else {
            writeFileSync(path, out.join('\n'), 'utf8');
            console.log(`  已更新 ${rel}：${fileCount} 处`);
        }
    }
}

// ── 主流程 ───────────────────────────────────────────────────────────────
const walkRoles = (dir, base = '') => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            walkRoles(full, base);
            continue;
        }
        if (!entry.endsWith('.js')) continue;
        const rel = full.replace(/\\/g, '/').split('/roles/')[1];
        processFile(full, rel, { withIntro: true });
    }
};
walkRoles(ROLES_DIR);
for (const { label, path } of GLOBAL_FILES) {
    processFile(path, label, { withIntro: false });
}

// ── 报告 ─────────────────────────────────────────────────────────────────
if (dryRun) {
    console.log('\n===== 将进行的替换明细（文件 | 区域 | 词 → id | 上下文）=====');
    for (const line of detail) console.log(line);
}
if (notes.size) {
    console.log('\n===== 提示 =====');
    for (const n of notes) console.log(`  · ${n}`);
}
if (keptSelf.size) {
    console.log('\n===== 自身名保留（主角色名不自我链接）=====');
    for (const [rel, n] of keptSelf) console.log(`  · ${rel}：${n} 处`);
}
console.log(
    `\n${dryRun ? '[dry-run] ' : ''}共替换 ${stats.replaced} 处（${stats.files} 个文件）；` +
        `词表：静态 ${STATIC_MAP.size} + 技能 ${skillDict.size} + 角色 ${charDict.size}。`,
);
