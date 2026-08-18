#!/usr/bin/env node

/**
 * 崩铁杀 代码/素材一致性检查（只读，不写文件）。
 *
 * 合并自 check-invisible / audit-module-refs / audit-logskill / audit-choosetarget / verify-skins。
 * 均为只读检查；`--invisible --fix` 例外——invisible 检查可带 --fix 清理 BOM 与不可见字符。
 * 任一处检查发现违规，脚本以退出码 1 结束（供提交前 / CI 使用）。
 * 无参数时进入交互菜单选择要运行的检查项。
 *
 * 用法:
 *   node scripts/check.mjs --invisible [--fix]    BOM/零宽/控制字符检查（--fix 才清理写盘，否则只读）
 *   node scripts/check.mjs --globals              角色包级标识符是否被技能引用
 *   node scripts/check.mjs --logskill             logSkill 重复 + cost 结算约定检查
 *   node scripts/check.mjs --choosetarget         active 技能 content 选目标时机检查
 *   node scripts/check.mjs --skins                核对 image/character 与角色 id（孤儿/缺失头像）
 *   node scripts/check.mjs                        交互选择
 */

import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, confirm, closeInteractive } from './lib/interactive.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const ROLES_DIR = resolve(ROOT, 'source', 'character', 'bts', 'roles');

// ── invisible：BOM / 零宽 / 控制字符 ────────────────────────────────────────
const INVIS_SKIP_DIRS = new Set([
    '.git', '.claude', '.vscode', 'node_modules', 'image', 'audio', 'release', '_others',
]);
const INVIS_TEXT_EXT = new Set(['.js', '.mjs', '.json', '.css', '.html', '.md', '.svg', '.txt']);
const ALLOWED_CONTROLS = new Set([
    String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13),
]);
function isInvisibleCharacter(character) {
    return !ALLOWED_CONTROLS.has(character) && /\p{Cf}|\p{Cc}/u.test(character);
}
function walkTextFiles(directory, files = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!INVIS_SKIP_DIRS.has(entry.name)) walkTextFiles(full, files);
        } else if (entry.isFile() && INVIS_TEXT_EXT.has(extname(entry.name).toLowerCase())) {
            files.push(full);
        }
    }
    return files;
}
function invisibleFiles() {
    const dirs = ['source', 'scripts', 'style'];
    const files = [];
    for (const d of dirs) {
        const full = resolve(ROOT, d);
        if (existsSync(full)) walkTextFiles(full, files);
    }
    for (const f of [
        'extension.js', 'info.json', 'package.json', 'version.json',
        'Directory.json', 'jsconfig.json', '.gitignore', '.gitattributes',
    ]) {
        const full = resolve(ROOT, f);
        if (existsSync(full)) files.push(full);
    }
    return [...new Set(files)].sort();
}
function invisibleCheck({ fix }) {
    const files = invisibleFiles();
    const issues = [];
    const cleaned = [];
    for (const filePath of files) {
        let content = readFileSync(filePath, 'utf8');
        const original = content;
        if (content.charCodeAt(0) === 0xfeff) {
            issues.push(`${relative(ROOT, filePath)}：UTF-8 BOM`);
            content = content.slice(1);
        }
        const count = Array.from(content).filter(isInvisibleCharacter).length;
        if (count) {
            issues.push(`${relative(ROOT, filePath)}：${count} 个不可见/控制字符`);
            content = Array.from(content)
                .filter((character) => !isInvisibleCharacter(character))
                .join('');
        }
        if (fix && content !== original) {
            writeFileSync(filePath, content, 'utf8');
            cleaned.push(relative(ROOT, filePath));
        }
    }
    log.info(`扫描 ${files.length} 个文本文件`);
    if (issues.length === 0) log.ok('未发现 BOM、零宽或异常控制字符');
    else if (fix) log.ok(`已清理 ${cleaned.length} 个文件：\n- ${cleaned.join('\n- ')}`);
    else log.error(`检查失败：\n- ${issues.join('\n- ')}`);
    return issues.length > 0 && !fix;
}

// ── globals：包级标识符被技能引用 ───────────────────────────────────────────
function globalsCheck() {
    const GLOBALS = new Set(['lib', 'game', 'ui', 'get', 'ai', '_status', 'status']);
    const walk = (dir, out) => {
        for (const e of readdirSync(dir)) {
            const full = join(dir, e);
            if (statSync(full).isDirectory()) walk(full, out);
            else if (e.endsWith('.js')) out.push(full);
        }
    };
    const files = [];
    walk(ROLES_DIR, files);
    const rootBase = ROLES_DIR;
    let issues = 0;
    for (const f of files) {
        const code = readFileSync(f, 'utf8');
        const moduleDefs = new Set();
        const defRe = /^(?:const|let|async\s+function|function)\s+([A-Za-z_$][\w$]*)/gm;
        let m;
        while ((m = defRe.exec(code))) {
            const lineStart = code.lastIndexOf('\n', m.index) + 1;
            const line = code.slice(lineStart, code.indexOf('\n', m.index));
            if (!line.trim().startsWith('export')) moduleDefs.add(m[1]);
        }
        if (!moduleDefs.size) continue;
        const skillStart = code.indexOf('export const skill');
        if (skillStart < 0) continue;
        const skillCode = code.slice(skillStart);
        for (const name of moduleDefs) {
            const re = new RegExp(`\\b${name}\\b(?!\\s*[:=])`, 'g');
            let hit = false;
            let mm;
            while ((mm = re.exec(skillCode))) {
                const lineStart = skillCode.lastIndexOf('\n', mm.index) + 1;
                const line = skillCode.slice(lineStart, skillCode.indexOf('\n', mm.index));
                if (line.includes(`const ${name}`) || line.includes(`function ${name}`)) continue;
                hit = true;
                break;
            }
            if (hit) {
                issues++;
                console.log(`[引用] ${relative(rootBase, f)}: ${name}`);
            }
        }
    }
    console.log(issues ? `共 ${issues} 处包级标识符被技能代码引用` : '无包级标识符被技能代码引用');
    return issues > 0;
}

// ── 共用解析辅助（logskill / choosetarget）─────────────────────────────────
function matchingBrace(text, openIdx) {
    let depth = 0;
    let inStr = null;
    for (let i = openIdx; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
        if (c === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
            i++;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}
function findMethodRegion(text, objStart, objEnd, name) {
    const headerRe = new RegExp(`(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
    let m;
    headerRe.lastIndex = objStart;
    while ((m = headerRe.exec(text)) && m.index < objEnd) {
        if (m.index >= objEnd) break;
        const braceIdx = m.index + m[0].lastIndexOf('{');
        const close = matchingBrace(text, braceIdx);
        if (close === -1 || close > objEnd) {
            headerRe.lastIndex = m.index + m[0].length;
            continue;
        }
        return { start: m.index, end: close + 1 };
    }
    return null;
}
function stripCommentsAndStrings(region, start = 0) {
    let inStr = null;
    let out = '';
    for (let i = 0; i < region.length; i++) {
        const c = region[i];
        if (inStr) {
            if (c === '\\') { out += c + (region[i + 1] || ''); i++; continue; }
            out += c;
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; out += ' '; continue; }
        if (c === '/' && region[i + 1] === '/') { while (i < region.length && region[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && region[i + 1] === '*') {
            i += 2;
            while (i < region.length && !(region[i] === '*' && region[i + 1] === '/')) i++;
            i++;
            out += ' ';
            continue;
        }
        out += c;
    }
    return out;
}
function lineOf(text, idx) {
    let line = 1;
    for (let i = 0; i < idx && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}
function walkRoleFiles(dir, acc) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkRoleFiles(full, acc);
        else if (entry.endsWith('.js')) acc.push(full);
    }
    return acc;
}

// ── logskill：logSkill 重复 + cost 结算 ─────────────────────────────────────
const SETTLE_OPS = [
    'discard', 'damage', 'loseHp', 'lose', 'gain', 'gainMaxHp', 'loseMaxHp',
    'give', 'draw', 'recover', 'addMark', 'removeMark', 'equip', 'addSkill',
    'removeSkill', 'turnOver', 'throwCard', 'swapHandcards', 'changeSkills',
    'changeHero', 'reinit', 'addAngry', 'addShield', 'addAbnormal', 'addBless',
    'addCurse', 'addNature', 'removeAbnormal', 'removeBless', 'removeShield',
    'removeNature', 'loseAngry', 'loseOther', 'loseBless', 'loseShield',
    'loseMark', 'addOther',
];
const PLAYER_SETTLE_RE = new RegExp(
    `\\b(player|p|target|to|loser|winner)\\.(${SETTLE_OPS.join('|')})\\s*\\(`, 'g',
);
const API_SETTLE_RE =
    /\b(?:lib\.)?bts\.(?:api\.)?(?:add|gain|lose|remove|damage|recover|draw|discard|give)\w*\s*\(/g;
const SUPPRESS_FLAG_RE =
    /\bsilent\s*:\s*true|\bdirect\s*:\s*true|\bpopup\s*:\s*false|\blog\s*:\s*false/;

function logskillCheck() {
    const files = walkRoleFiles(ROLES_DIR, []);
    const violations = [];
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const skillRe = /^ {4}(bts_[a-zA-Z0-9_]+): \{/gm;
        let m;
        while ((m = skillRe.exec(text))) {
            const braceIdx = m.index + m[0].lastIndexOf('{');
            const close = matchingBrace(text, braceIdx);
            if (close === -1) continue;
            const objStart = m.index;
            const objEnd = close + 1;
            const skillId = m[1];
            const block = text.slice(objStart, objEnd);
            const isSuppressed = SUPPRESS_FLAG_RE.test(block);
            const hasTrigger = /\btrigger\s*:/.test(block);
            const hasEnable = /\benable\s*:/.test(block);

            const content = findMethodRegion(text, objStart, objEnd, 'content');
            if (content) {
                const body = stripCommentsAndStrings(text.slice(content.start, content.end), 0);
                if (body.includes('logSkill(') && !isSuppressed) {
                    violations.push({
                        rel, line: lineOf(text, content.start), skill: skillId, rule: 'A',
                        type: hasEnable && hasTrigger ? 'mixed(content logSkill)' : hasEnable ? 'active(content logSkill)' : 'trigger(content logSkill)',
                        msg: '非 silent 技能 content 手动 logSkill 会造成重复「发动」记录，请删除该调用（或改走 silent 例外）',
                        skip: block.includes('audit-logskill: skip'),
                    });
                }
            }

            const cost = findMethodRegion(text, objStart, objEnd, 'cost');
            if (cost) {
                const cleaned = stripCommentsAndStrings(text.slice(cost.start, cost.end), 0);
                const settleMatches = [];
                const append = (value) => { if (value != null && typeof value === 'string') settleMatches.push(value); };
                let sm;
                const playerRe = PLAYER_SETTLE_RE;
                playerRe.lastIndex = 0;
                while ((sm = playerRe.exec(cleaned))) append(sm[2]);
                const apiRe = API_SETTLE_RE;
                apiRe.lastIndex = 0;
                while ((sm = apiRe.exec(cleaned))) append(sm[0].slice(0, 40));
                if (settleMatches.length) {
                    violations.push({
                        rel, line: lineOf(text, cost.start), skill: skillId, rule: 'B',
                        type: `cost settlement: ${[...new Set(settleMatches)].join(', ')}`,
                        msg: 'cost 内做了实际结算，应只选择并移入 content 结算',
                        skip: block.includes('audit-logskill: skip'),
                    });
                }
            }
        }
    }
    const real = violations.filter((v) => !v.skip);
    for (const v of violations) {
        const kind = v.rule === 'A' ? 'logSkill' : 'cost';
        if (v.skip) log.warn(`[SKIP ${kind}] ${v.rel}:${v.line} ${v.skill} — ${v.msg}（audit-logskill: skip）`);
        else log.error(`[${kind}] ${v.rel}:${v.line} ${v.skill}（${v.type}）：${v.msg}`);
    }
    if (real.length) console.error(`\n违规 ${real.length} 处（另有 ${violations.length - real.length} 处已豁免）。`);
    else log.ok(`audit-logskill 通过：${violations.length} 处豁免/无违规，共扫描角色技能文件 ${files.length} 份。`);
    return real.length > 0;
}

// ── choosetarget：active 技能 content 选目标时机 ─────────────────────────────
const TARGET_CHOOSE_RE = /\.(?:chooseTarget|chooseCardTarget)\s*\(/g;
const SKIP_FLAG_RE = /audit-choosetarget\s*:\s*skip/;

function choosetargetCheck() {
    const files = walkRoleFiles(ROLES_DIR, []);
    const violations = [];
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const skillRe = /^ {4}(bts_[a-zA-Z0-9_]+): \{/gm;
        let m;
        while ((m = skillRe.exec(text))) {
            const braceIdx = m.index + m[0].lastIndexOf('{');
            const close = matchingBrace(text, braceIdx);
            if (close === -1) continue;
            const objStart = m.index;
            const objEnd = close + 1;
            const skillId = m[1];
            const block = text.slice(objStart, objEnd);
            const hasEnable = /\benable\s*:/.test(block);
            const hasTrigger = /\btrigger\s*:/.test(block);
            if (!hasEnable || hasTrigger) continue;
            const content = findMethodRegion(text, objStart, objEnd, 'content');
            if (!content) continue;
            const cleaned = stripCommentsAndStrings(text.slice(content.start, content.end));
            const calls = [];
            let cm;
            TARGET_CHOOSE_RE.lastIndex = 0;
            while ((cm = TARGET_CHOOSE_RE.exec(cleaned))) calls.push(cm[0].slice(1));
            if (!calls.length) continue;
            violations.push({
                rel, line: lineOf(text, content.start), skill: skillId,
                type: [...new Set(calls)].join(', '),
                msg: 'active（enable）技能的 content 内用 chooseTarget/chooseCardTarget 做选目标；应改由技能级 filterTarget/selectTarget 于发动时完成，content 只读 event.targets',
                skip: SKIP_FLAG_RE.test(block),
            });
        }
    }
    const real = violations.filter((v) => !v.skip);
    for (const v of violations) {
        if (v.skip) log.warn(`[SKIP choosetarget] ${v.rel}:${v.line} ${v.skill} — ${v.msg}（audit-choosetarget: skip）`);
        else log.error(`[choosetarget] ${v.rel}:${v.line} ${v.skill}（${v.type}）：${v.msg}`);
    }
    if (real.length) console.error(`\n违规 ${real.length} 处（另有 ${violations.length - real.length} 处已豁免）。`);
    else log.ok(`audit-choosetarget 通过：${violations.length} 处豁免/无违规，共扫描 active 技能所在的角色技能文件 ${files.length} 份。`);
    return real.length > 0;
}

// ── skins：核对 image/character 与角色 id（孤儿/缺失头像）────────────────────
function skinsCheck() {
    const ids = new Set();
    const walk = (dir) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
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
    walk(ROLES_DIR, ids);
    const charDir = join(ROOT, 'image', 'character');
    const files = existsSync(charDir) ? readdirSync(charDir).map((f) => f.slice(0, -4)) : [];
    const orphans = files.filter((f) => !ids.has(f));
    const missing = [...ids].filter((id) => !files.includes(id));
    console.log(`角色 id: ${ids.size}，文件: ${files.length}`);
    console.log(`孤儿文件: ${orphans.join(', ') || '(无)'}`);
    console.log(`缺失头像: ${missing.join(', ') || '(无)'}`);
    return missing.length > 0;
}

function printUsage() {
    console.log(`用法:
  node scripts/check.mjs --invisible [--fix]    BOM/零宽/控制字符检查（--fix 才写盘）
  node scripts/check.mjs --globals              包级标识符引用检查
  node scripts/check.mjs --logskill             logSkill/cost 约定检查
  node scripts/check.mjs --choosetarget         active 选目标时机检查
  node scripts/check.mjs --skins                头像孤儿/缺失核对
  node scripts/check.mjs                        交互选择`);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printUsage();
    const requested = args
        .filter((a) => a.startsWith('--'))
        .filter((a) => !['--help', '--fix'].includes(a))
        .map((a) => a.replace(/^--/, ''))
        .filter((a) => ['invisible', 'globals', 'logskill', 'choosetarget', 'skins'].includes(a));
    // 是否应用 invisible 修复（写盘）；命令 --fix 置 true，交互选 invisible 后用 y/N 二次确认
    let fix = args.includes('--fix');

    try {
        const interactive = requested.length === 0;
        let selected = requested;
        if (interactive) {
            const picks = await menu(
                '请选择要运行的检查（可多选，用逗号分隔序号，如 1,3）:',
                [
                    { label: 'invisible — BOM/零宽/控制字符（--invisible）', value: 'invisible' },
                    { label: 'globals — 包级标识符引用（--globals）', value: 'globals' },
                    { label: 'logskill — logSkill/cost 约定（--logskill）', value: 'logskill' },
                    { label: 'choosetarget — active 选目标时机（--choosetarget）', value: 'choosetarget' },
                    { label: 'skins — 头像孤儿/缺失（--skins）', value: 'skins' },
                ],
            );
            if (picks === null) { log.warn('已取消'); return; }
            selected = [picks.value];
            // 交互选了 invisible：y/N 确认是否应用修复（写盘清理）
            if (selected[0] === 'invisible' && !fix) {
                fix = await confirm('是否应用 invisible 修复（清理 BOM/不可见字符，会写盘）？');
            }
            closeInteractive();
        }
        if (selected.some((s) => s === 'invisible') && fix) {
            log.warn('提示：--fix 将清理不可见字符并写盘，仅对 invisible 检查生效');
        }
        const anyFailed = selected.some((name) => {
            let had = false;
            if (name === 'invisible') had = invisibleCheck({ fix });
            else if (name === 'globals') had = globalsCheck();
            else if (name === 'logskill') had = logskillCheck();
            else if (name === 'choosetarget') had = choosetargetCheck();
            else if (name === 'skins') had = skinsCheck();
            else log.warn(`未知检查：${name}`);
            return had;
        });
        if (anyFailed) process.exitCode = 1;
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