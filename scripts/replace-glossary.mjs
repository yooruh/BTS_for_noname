#!/usr/bin/env node

/**
 * 崩铁杀技能描述专有名词替换脚本：把角色技能描述（translate/simpleTranslate
 * 的 *_info 键与 intro）中的专有名词替换为 `${get.poptip('词条id')}`。
 *
 * 词条注册见 source/character/bts/glossary.js（翻译）与 source/tool/ui/poptips.js
 * （lib.poptip 注册）。替换规则：
 *  - 匹配词按长度降序替换（"必杀技"先于"必杀"、"赐福祝福"先于"赐福"），
 *    替换发生在字符串字面量内部文本上，不触及键名与代码结构；
 *  - 模板字符串（反引号）直接插值；普通字符串（'...'/"..."）在内容不含
 *    反引号/`${`/反斜杠时转换为模板字符串后插值，否则跳过该键；
 *  - 幂等：已替换文本不再含中文专有名词，可重复运行。
 *
 * 用法：node scripts/replace-glossary.mjs [--dry-run]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const ROLES_DIR = join(ROOT, 'source', 'character', 'bts', 'roles');
const dryRun = process.argv.includes('--dry-run');

// 词条 id → 匹配词（须与 glossary.js 的 GLOSSARY id 一致；长词优先自动排序）
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
    ['bts_glossary_bts_fanshi_active_faq', ['燔世状态']],
    ['bts_glossary_shengbian_faq', ['升变']],
    ['bts_glossary_yizhi_faq', ['忆质']],
    ['bts_glossary_jiyi_faq', ['记忆']],
    ['bts_glossary_bts_st_letu_active_faq', ['乐土状态']],
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
const FLAT = REPLACEMENTS.flatMap(([id, words]) =>
    words.map((word) => [word, id]),
).sort((a, b) => b[0].length - a[0].length);

/** 在字符串字面量内部文本上执行替换；返回替换后的文本与次数。 */
function replaceInLiteral(content) {
    let out = content;
    let count = 0;
    for (const [word, id] of FLAT) {
        const parts = out.split(word);
        if (parts.length > 1) {
            count += parts.length - 1;
            out = parts.join(`\${get.poptip('${id}')}`);
        }
    }
    return { out, count };
}

/** 普通字符串能否安全转换为模板字符串（无反引号/插值/反斜杠）。 */
function safeToTemplate(content) {
    return (
        !content.includes('`') &&
        !content.includes('${') &&
        !content.includes('\\')
    );
}

/**
 * 处理模板字符串内容（不含首尾反引号）：文本段直接替换；
 * 插值表达式 `${...}` 内若为简单字符串实参（'词' 或 B('词')），
 * 把实参替换为 get.poptip('词条id') 调用（避免嵌套模板插值破坏语法）。
 */
function processTemplateContent(content) {
    let out = '';
    let count = 0;
    let i = 0;
    while (i < content.length) {
        const d = content.indexOf('${', i);
        if (d === -1) {
            const { out: textOut, count: textCount } = replaceInLiteral(
                content.slice(i),
            );
            out += textOut;
            count += textCount;
            break;
        }
        const { out: textOut, count: textCount } = replaceInLiteral(
            content.slice(i, d),
        );
        out += textOut;
        count += textCount;
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
        out += `\${${processInterpolation(expr, (c) => {
            count += c;
        })}}`;
        i = j;
    }
    return { out, count };
}

/** 插值内简单字符串实参（'词' / B('词')）→ get.poptip('词条id') 调用。 */
function processInterpolation(expr, addCount) {
    const m = /^([A-Za-z_$][\w$]*\()?'([^']+)'\)?$/.exec(expr);
    if (m && m[2]) {
        const { out, count } = replaceInLiteral(m[2]);
        if (count > 0) {
            const pop = /get\.poptip\('([^']+)'\)/.exec(out);
            if (pop) {
                addCount(count);
                return m[1]
                    ? `${m[1]}get.poptip('${pop[1]}'))`
                    : `get.poptip('${pop[1]}')`;
            }
        }
    }
    return expr;
}

/**
 * 处理一个键值对字符串字面量（值部分含引号，如 '文本' 或 `文本`）。
 * 返回处理后的字面量文本；无法安全处理时返回原样。
 */
function processLiteral(literal) {
    const quote = literal[0];
    if (quote !== "'" && quote !== '"' && quote !== '`')
        return { out: literal, count: 0 };
    if (quote === '`') {
        const { out, count } = processTemplateContent(literal.slice(1, -1));
        if (count === 0) return { out: literal, count: 0 };
        return { out: `\`${out}\``, count };
    }
    const content = literal.slice(1, -1);
    const { out, count } = replaceInLiteral(content);
    if (count === 0) return { out: literal, count: 0 };
    if (!safeToTemplate(content)) {
        console.warn(
            `  ⚠ 跳过（含反引号/\${/反斜杠，无法转模板字符串）: ${content.slice(0, 40)}…`,
        );
        return { out: literal, count: 0 };
    }
    return { out: `\`${out}\``, count };
}

/** 行级处理：`键: '值'` 形式的 _info 键值行；或 `键:` 结尾（值在下一行）。
 * 键可带引号（手写文件）或无引号（prettier 对合法标识符省略引号）。 */
function processKeyLine(line) {
    // 键行冒号结尾（prettier 长值换行格式）：bts_xxx_info: / 'bts_xxx_info':
    const keyOnly = /^(\s*)(?:'([\w]+)'|"([\w]+)"|([\w]+)):\s*$/.exec(line);
    if (keyOnly) {
        const key = keyOnly[2] || keyOnly[3] || keyOnly[4];
        if (key.endsWith('_info')) {
            return { line, count: 0, nextIsValue: true };
        }
        return { line, count: 0 };
    }
    const m = /^(\s*)(?:'([\w]+)'|"([\w]+)"|([\w]+))\s*:\s*/.exec(line);
    if (!m) return { line, count: 0 };
    const key = m[2] || m[3] || m[4];
    if (!key.endsWith('_info')) return { line, count: 0 };
    const rest = line.slice(m[0].length).trimEnd();
    const trailing = rest.endsWith(',') ? ',' : '';
    const literal = trailing ? rest.slice(0, -1).trimEnd() : rest.trimEnd();
    const { out, count } = processLiteral(literal);
    if (count === 0) return { line, count: 0 };
    return { line: `${m[1]}${key}: ${out}${trailing}`, count };
}

/** 处理独立值行（上一个 _info 键行把值放到了下一行）。 */
function processValueLine(line) {
    const trimmed = line.trimEnd();
    const trailing = trimmed.endsWith(',') ? ',' : '';
    const literal = (trailing ? trimmed.slice(0, -1) : trimmed).trim();
    const { out, count } = processLiteral(literal);
    if (count === 0) return { line, count: 0 };
    const indent = line.slice(0, line.length - line.trimStart().length);
    return { line: `${indent}${out}${trailing}`, count };
}

/** 处理 intro 导出（可能为多行字符串拼接，逐段处理）。返回处理后的行与声明结束行索引。 */
function processIntroBlock(lines, startIndex) {
    let count = 0;
    let endIndex = startIndex;
    const out = [...lines];
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        // 收集本行所有字符串字面量（引号感知：支持 ' " ` 与 \ 转义）
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
                    literals.push({
                        start: j,
                        end: k + 1,
                        text: line.slice(j, k + 1),
                    });
                    j = k + 1;
                    continue;
                }
            }
            j++;
        }
        for (const lit of literals.reverse()) {
            const { out: newText, count: c } = processLiteral(lit.text);
            if (c > 0) {
                out[i] =
                    out[i].slice(0, lit.start) +
                    newText +
                    out[i].slice(lit.end);
                count += c;
            }
        }
        if (/;\s*$/.test(out[i].trimEnd())) {
            endIndex = i; // 声明结束
            break;
        }
    }
    return { lines: out, count, endIndex };
}

// ── 主流程 ───────────────────────────────────────────────────────────────
let totalFiles = 0;
let totalReplace = 0;
const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            walk(full);
            continue;
        }
        if (!entry.endsWith('.js')) continue;
        const lines = readFileSync(full, 'utf8').split('\n');
        const out = [...lines];
        let fileCount = 0;
        let pendingInfoValue = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('export const intro')) {
                const {
                    lines: newLines,
                    count,
                    endIndex,
                } = processIntroBlock(out, i);
                for (let k = i; k <= endIndex; k++) out[k] = newLines[k];
                fileCount += count;
                i = endIndex;
                continue;
            }
            if (pendingInfoValue) {
                // 上一键行把 _info 值放到了本行（prettier 长值换行格式）。
                const { line: newLine, count } = processValueLine(line);
                if (count > 0) {
                    out[i] = newLine;
                    fileCount += count;
                }
                pendingInfoValue = false;
                continue;
            }
            const { line: newLine, count, nextIsValue } = processKeyLine(line);
            if (count > 0) {
                out[i] = newLine;
                fileCount += count;
            }
            if (nextIsValue) pendingInfoValue = true;
        }
        if (fileCount > 0) {
            totalReplace += fileCount;
            totalFiles++;
            const rel = full.replace(ROOT + '/', '').replace(/\\/g, '/');
            if (dryRun) {
                console.log(`  [dry-run] ${rel}：${fileCount} 处`);
            } else {
                writeFileSync(full, out.join('\n'), 'utf8');
                console.log(`  已更新 ${rel}：${fileCount} 处`);
            }
        }
    }
};
walk(ROLES_DIR);

console.log(
    `${dryRun ? '[dry-run] ' : ''}共替换 ${totalReplace} 处（${totalFiles} 个文件）。`,
);
