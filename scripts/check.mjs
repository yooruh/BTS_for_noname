#!/usr/bin/env node

/**
 * 崩铁杀 代码/素材一致性检查（只读；`--invisible --fix` 才会写盘清理 BOM 与不可见字符）。
 * 任一处违规即以退出码 1 结束（供提交前 / CI）；无参数时进入交互菜单选择检查项。
 *
 * 用法:
 *   node scripts/check.mjs --invisible [--fix]    BOM/零宽/控制字符检查
 *   node scripts/check.mjs --globals              角色包级标识符是否被技能引用
 *   node scripts/check.mjs --logskill             logSkill 重复 + cost 结算约定检查
 *   node scripts/check.mjs --choosetarget         active 技能 content 选目标时机检查
 *   node scripts/check.mjs --skill-embed          技能效果自注册纪律（占位滤器 / rules 层代执行）
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
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { log } from './lib/shared.mjs';
import { menu, confirm, closeInteractive, wantsInteractive } from './lib/interactive.mjs';
import { PACKS, loadAllRoleMods, rolesRootOf } from './lib/roles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
// 各角色包的角色目录（bts / diy…；新增角色包只需登记 lib/roles.mjs 的 PACKS）
const ROLE_ROOTS = PACKS.map((pack) => rolesRootOf(pack.dir));

/** 全部角色包的角色文件（逐包 walkRoleFiles 合并）。 */
function allRoleFiles() {
    return ROLE_ROOTS.flatMap((root) => walkRoleFiles(root, []));
}

/** 文件所属角色包的角色目录（消息里显示包内相对路径用）。 */
function roleRootOfFile(file) {
    return ROLE_ROOTS.find((root) => file.startsWith(root + sep)) ?? ROLE_ROOTS[0];
}

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
    const files = allRoleFiles();
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
                console.log(`[引用] ${relative(roleRootOfFile(f), f)}: ${name}`);
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
    const files = allRoleFiles();
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

// ── skill-embed：技能效果自注册纪律 ────────────
// 规则 A（角色文件）：禁用无参占位滤器 `filter() { return false; }`——技能效果必须挂在
//   技能自身（trigger/content 或欢愉 bts_funny 注册字段），不得由 rules API 按 hasSkill 代执行。
// 规则 B（rules 层）：`logSkill('bts_…')` 不得跨技能代执行——日志与效果回到技能本体，
//   API 层只广播自定义事件（bts_mark_add/bts_pet_* 等）；确需者用 skip 注释豁免。
// 豁免：违规行或紧邻上一行含 `audit-skill-embed: skip`；规则 A 可在技能块内注释豁免。
const SKILL_EMBED_SKIP_RE = /audit-skill-embed\s*:\s*skip/;
function skillEmbedCheck() {
    const violations = [];
    // 规则 A：角色技能文件占位滤器
    const roleFiles = allRoleFiles();
    for (const file of roleFiles) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const re = /(?:^|\n)(\s*)filter\s*\(\s*\)\s*\{/g;
        let m;
        while ((m = re.exec(text))) {
            const braceIdx = m.index + m[0].lastIndexOf('{');
            const close = matchingBrace(text, braceIdx);
            if (close === -1) continue;
            const body = stripCommentsAndStrings(text.slice(braceIdx + 1, close), 0)
                .replace(/\s+/g, ' ')
                .trim();
            if (body !== 'return false;') continue;
            const line = lineOf(text, m.index);
            const near = text.split('\n').slice(Math.max(0, line - 4), line).join('\n');
            violations.push({
                rel, line, rule: 'A', type: 'placeholder-filter',
                msg: '永不触发的 filter 占位；效果应自注册（trigger/content/bts_funny）',
                skip: SKILL_EMBED_SKIP_RE.test(near),
            });
        }
    }
    // 规则 B：rules 层跨技能 logSkill
    const rulesRoot = resolve(ROOT, 'source', 'rules');
    const rulesFiles = [];
    const collect = (dir) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) collect(full);
            else if (entry.endsWith('.js')) rulesFiles.push(full);
        }
    };
    if (existsSync(rulesRoot)) collect(rulesRoot);
    for (const file of rulesFiles) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const lines = text.split('\n');
        const re = /\blogSkill\s*\(\s*['"`]bts_/g;
        let m;
        while ((m = re.exec(text))) {
            const line = lineOf(text, m.index);
            const near = lines.slice(Math.max(0, line - 2), line).join('\n');
            violations.push({
                rel, line, rule: 'B', type: 'rules-layer logSkill',
                msg: 'rules/API 层跨技能 logSkill；应广播事件由技能监听自记（或注释 audit-skill-embed: skip）',
                skip: SKILL_EMBED_SKIP_RE.test(near),
            });
        }
    }
    const real = violations.filter((v) => !v.skip);
    for (const v of violations) {
        if (v.skip)
            log.warn(`[SKIP ${v.rule}] ${v.rel}:${v.line} — ${v.msg}（audit-skill-embed: skip）`);
        else log.error(`[${v.rule}] ${v.rel}:${v.line}（${v.type}）：${v.msg}`);
    }
    if (real.length) console.error(`\n违规 ${real.length} 处（另有 ${violations.length - real.length} 处已豁免）。`);
    else
        log.ok(
            `audit-skill-embed 通过：0 处占位滤器/API 层代执行（规则 A 扫描 ${roleFiles.length} 份角色文件、规则 B 扫描 ${rulesFiles.length} 份 rules 文件）。`,
        );
    return real.length > 0;
}

// ── choosetarget：active 技能 content 选目标时机 ─────────────────────────────
const TARGET_CHOOSE_RE = /\.(?:chooseTarget|chooseCardTarget)\s*\(/g;
const SKIP_FLAG_RE = /audit-choosetarget\s*:\s*skip/;

function choosetargetCheck() {
    const files = allRoleFiles();
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
async function skinsCheck() {
    const ids = new Set();
    // 直接 import 读 character/transformCharacter 的 id（lib/roles.mjs 缓存；
    // 注释掉的块 import 不可见，不会误计为角色）
    for (const [, mod] of await loadAllRoleMods()) {
        for (const id of Object.keys(mod.character ?? {})) ids.add(id);
        for (const id of Object.keys(mod.transformCharacter ?? {})) ids.add(id);
    }
    const charDir = join(ROOT, 'image', 'character');
    const files = existsSync(charDir) ? readdirSync(charDir).map((f) => f.slice(0, -4)) : [];
    const orphans = files.filter((f) => !ids.has(f));
    // 已知缺头像（太阳神无专属图/原创角色立绘待补，缺口清单/迁移工作记录已声明，待后续补图；不判失败）
    const KNOWN_MISSING_AVATAR = new Set(['bts_ch_yinlang_lv999', 'bts_ch_aha']);
    const missingAll = [...ids].filter((id) => !files.includes(id));
    const missing = missingAll.filter((id) => !KNOWN_MISSING_AVATAR.has(id));
    console.log(`角色 id: ${ids.size}，文件: ${files.length}`);
    console.log(`孤儿文件: ${orphans.join(', ') || '(无)'}`);
    console.log(`缺失头像: ${missing.join(', ') || '(无)'}`);
    if (missingAll.length) {
        const known = missingAll.filter((id) => KNOWN_MISSING_AVATAR.has(id));
        if (known.length) console.log(`已知缺头像（豁免待补）: ${known.join(', ')}`);
    }
    return missing.length > 0;
}

// ── marks：角色/规则标记键全覆盖审计 ─────────────────────────────────────────
// 校验角色与规则文件里直接写死的标记键（addMark/countMark/removeMark/setMark）都在
// 生成表 MARKS_REGISTRY（source/generated/buffRegistry.js）或 INTERNAL_MARKS 允许清单内。
// 瞬时内部计数（不注册不显示，无 translate 需求）收进 INTERNAL_MARKS；漏定义/漏登记才报错。
const INTERNAL_MARKS = new Set([
    // 瞬时内部计数/动态键族：不经 addMark→addSkill 生命周期，不显示、无需注册。
    // 由 node scripts/check.mjs --marks 实测清单收口（与生成注册表对照）。
    // ── 动态键族（前缀，运行时拼 playerid / 阶段后缀）──
    'bts_damage_link_',
    'bts_recover_link_',
    // ── 阶段/回合内部计数（-play/-start/-clear/-time/_used/_done/_pending/_counter）──
    'bts_mk_baihua-start',
    // ── 技能内部状态标记（仅 countMark/addMark，无显示）──
    'bts_pet_xiaoyika',
    // ── 真技能内部状态（mark:true / 挂技能上的键，随技能 ID 走 sk）──
    'bts_sk_chengsheng',
    'bts_sk_duanjie',
    'bts_sk_feihuo',
    'bts_sk_gangzheng',
    'bts_sk_huoying',
    'bts_sk_jingxi',
    'bts_sk_luxin',
    'bts_sk_qianguang_funny',
    'bts_sk_quxu',
    'bts_sk_shuoya',
    'bts_sk_xiaolv',
    'bts_sk_xinyan',
    'bts_sk_yuqi',
    'bts_sk_zaixian',
    'bts_sk_zhitong',
]);
const MARK_METHOD_RE =
    /\.(?:addMark|countMark|removeMark|setMark|changeMark)\s*\(\s*['"]([^'"]+)['"]/g;

async function marksCheck() {
    const generated = await import(
        pathToFileURL(resolve(ROOT, 'source', 'generated', 'buffRegistry.js')).href
    );
    const known = new Set(Object.values(generated.MARKS_REGISTRY).flat());
    const used = new Map();
    const scan = (dir) => {
        for (const f of walkRoleFiles(dir, [])) {
            const text = readFileSync(f, 'utf8');
            const rel = relative(ROOT, f).replace(/\\/g, '/');
            let m;
            MARK_METHOD_RE.lastIndex = 0;
            while ((m = MARK_METHOD_RE.exec(text))) {
                if (!used.has(m[1])) used.set(m[1], new Set());
                used.get(m[1]).add(rel);
            }
        }
    };
    for (const root of ROLE_ROOTS) scan(root);
    scan(resolve(ROOT, 'source', 'rules'));
    const unknown = [...used.keys()]
        .filter((k) => !known.has(k) && !INTERNAL_MARKS.has(k))
        .sort();
    for (const k of unknown) {
        log.error(
            `标记键未登记：${k}（使用于 ${[...used.get(k)].join(', ')}；应加定义或列入 INTERNAL_MARKS）`,
        );
    }
    console.log(
        unknown.length
            ? `共 ${unknown.length} 个未登记标记键`
            : `标记键全覆盖：${used.size} 个键均在注册表或允许清单内`,
    );
    return unknown.length > 0;
}

// ── mirror：双源码树字节一致校验（zip/source ↔ 冒烟镜像 source）──────────────
const MIRROR_ROOT = resolve(
    ROOT,
    '..',
    '_others',
    'smoke',
    'app',
    'extension',
    '崩铁杀',
    'source',
);

function treeFiles(dir, base, out = []) {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const rel = relative(base, full).replace(/\\/g, '/');
        if (statSync(full).isDirectory()) treeFiles(full, base, out);
        else out.push(rel);
    }
    return out;
}

function mirrorCheck() {
    const srcRoot = join(ROOT, 'source');
    const srcFiles = treeFiles(srcRoot, srcRoot);
    const mirrorFiles = new Set(treeFiles(MIRROR_ROOT, MIRROR_ROOT));
    const errors = [];
    for (const rel of srcFiles) {
        const src = join(srcRoot, rel);
        const dest = join(MIRROR_ROOT, rel);
        if (!mirrorFiles.has(rel)) {
            errors.push(`镜像缺文件：${rel}`);
            continue;
        }
        if (!readFileSync(src).equals(readFileSync(dest))) {
            errors.push(`镜像内容不一致：${rel}`);
        }
    }
    for (const rel of mirrorFiles) {
        if (!srcFiles.includes(rel)) errors.push(`镜像孤儿文件：${rel}`);
    }
    if (errors.length) {
        for (const e of errors) log.error(e);
        console.error(
            `\n镜像不一致 ${errors.length} 处（运行 node scripts/sync.mjs mirror 同步）`,
        );
    } else {
        log.ok(`双源码树一致：${srcFiles.length} 个文件逐字节相同`);
    }
    return errors.length > 0;
}

// ── pitfalls：历史 bug 家族静态审计（先报告、后闸门）──────────────────────────
// 规则来源见《技能开发规范》B 篇与《迁移工作记录》的事故家族。
// 默认只报告（WARN）；加 --strict 才作为失败闸门。豁免锚：audit-pitfalls: skip（整块）
// 或 audit-<规则>: skip（如 audit-targets: skip）。
const PITFALL_RULES = {
    targets: {
        label: 'selectTarget 缺 filterTarget',
        check(block, cleaned) {
            if (!/\n {8}selectTarget\s*:/.test(cleaned)) return [];
            // filterTarget 既可能是 `filterTarget: ...`，也可能是方法简写 `filterTarget(...) {`
            if (/\n {8}filterTarget\s*[:(]/.test(cleaned)) return [];
            return [{
                message:
                    '技能级 selectTarget 未声明 filterTarget；引擎目标选择短路 check()>0，可能放行空目标',
                index: cleaned.search(/\n {8}selectTarget\s*:/),
                snippet: 'selectTarget',
            }];
        },
    },
    triggername: {
        label: '触发技误用 trigger.name 判后缀',
        check(block, cleaned) {
            if (!/\n {8}trigger\s*:/.test(cleaned)) return [];
            const hits = [];
            const re = /\btrigger\??\.name\b/g;
            let match;
            while ((match = re.exec(cleaned))) {
                hits.push({
                    message:
                        '触发技用 trigger.name 判触发变体；后缀在 triggername / event.triggername',
                    index: match.index,
                    snippet: 'trigger.name',
                });
            }
            return hits;
        },
    },
    getparent: {
        label: '主动技裸用 trigger.getParent',
        check(block, cleaned) {
            if (/\n {8}trigger\s*:/.test(cleaned)) return [];
            if (!/\n {8}enable\s*:/.test(cleaned)) return [];
            // 只看技能自身 content；subSkill 内的 content 有真实 trigger，不属本规则。
            const region = findMethodRegion(block, 0, block.length, 'content');
            if (!region) return [];
            const body = stripCommentsAndStrings(block.slice(region.start, region.end));
            const hits = [];
            const re = /\btrigger\.getParent\b/g;
            let match;
            while ((match = re.exec(body))) {
                const prefix = body.slice(Math.max(0, match.index - 2), match.index + 3);
                if (prefix.includes('?.')) continue;
                hits.push({
                    message:
                        '主动技 content 直接读 trigger.getParent；trigger 可能为 null（用 trigger?.getParent 或 _status.event 回退）',
                    index: region.start + match.index,
                    snippet: 'trigger.getParent',
                });
            }
            return hits;
        },
    },
    alive: {
        label: '跨玩家 filter 缺 isAlive 门',
        check(block) {
            const hits = [];
            for (const method of ['filter', 'filterTarget']) {
                const region = findMethodRegion(block, 0, block.length, method);
                if (!region) continue;
                const body = stripCommentsAndStrings(block.slice(region.start, region.end));
                if (!body.includes('isDamaged()')) continue;
                if (body.includes('isAlive()')) continue;
                hits.push({
                    message:
                        `${method} 使用 isDamaged() 但无 isAlive()；isDamaged() 对尸体恒真（死者回血非法态家族）`,
                    index: region.start,
                    snippet: method,
                });
            }
            return hits;
        },
    },
    controls: {
        label: 'chooseControl 数组参数误用',
        check(block, cleaned) {
            const hits = [];
            const re = /\.chooseControl\s*\(\s*\[/g;
            let match;
            while ((match = re.exec(cleaned))) {
                hits.push({
                    message:
                        'chooseControl 首个参数是数组；应传字符串选项或字符串数组（[键,文案] 误用族）',
                    index: match.index,
                    snippet: 'chooseControl([',
                });
            }
            return hits;
        },
    },
    multitarget: {
        label: '多目标技能缺 multitarget',
        check(block, cleaned) {
            // 只看技能级（8 空格缩进）的可多选目标：①数组形态 [min, max] 上限 >1（含 Infinity/null）；
            // ②函数形态 selectTarget() 返回数组。cost 内 chooseCardTarget 的 selectTarget 走触发路径
            //（content 每次触发只执行一次），不适用。
            let multi = false;
            const range = /\n {8}selectTarget\s*:\s*\[([^\]]*)\]/.exec(cleaned);
            if (range) multi = /Infinity|null|\b(?:[2-9]|\d{2,})\b/.test(range[1]);
            if (!multi) {
                const selector = findMethodRegion(block, 0, block.length, 'selectTarget');
                if (selector) {
                    const body = stripCommentsAndStrings(
                        block.slice(selector.start, selector.end),
                    );
                    multi = /return\s*\[/.test(body);
                }
            }
            if (!multi) return [];
            if (/\n {8}multitarget\s*:/.test(cleaned)) return [];
            // 只看技能自身 content；subSkill 的事件不属于技能结算体。
            const region = findMethodRegion(block, 0, block.length, 'content');
            if (!region) return [];
            const body = stripCommentsAndStrings(block.slice(region.start, region.end));
            const index = body.search(/event\.targets/);
            if (index === -1) return [];
            return [{
                message:
                    '可选多目标且 content 读取 event.targets；未声明 multitarget: true 时引擎按目标重跑 content（重复结算，见《技能开发规范》B14）',
                index: region.start + index,
                snippet: 'event.targets',
            }];
        },
    },
};
const PITFALL_NAMES = Object.keys(PITFALL_RULES);
const PITFALL_SKIP_RE = /audit-pitfalls\s*:\s*skip/;

function pitfallsCheck({ strict = false, only = null } = {}) {
    const selected = only ? [only] : PITFALL_NAMES;
    const files = allRoleFiles();
    const warnings = [];
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(roleRootOfFile(file), file).replace(/\\/g, '/');
        const skillRe = /^ {4}(bts_[a-zA-Z0-9_]+): \{/gm;
        let match;
        while ((match = skillRe.exec(text))) {
            const braceIdx = match.index + match[0].lastIndexOf('{');
            const close = matchingBrace(text, braceIdx);
            if (close === -1) continue;
            const block = text.slice(match.index, close + 1);
            if (PITFALL_SKIP_RE.test(block)) continue;
            const cleaned = stripCommentsAndStrings(block);
            const skillId = match[1];
            for (const name of selected) {
                const rule = PITFALL_RULES[name];
                if (!rule) continue;
                if (new RegExp(`audit-${name}\\s*:\\s*skip`).test(block)) continue;
                const hits = rule.check(block, cleaned);
                for (const hit of hits) {
                    const local = Math.max(0, hit.index || 0);
                    warnings.push({
                        rule: name,
                        label: rule.label,
                        rel,
                        line: lineOf(text, match.index + local),
                        skill: skillId,
                        message: hit.message,
                        snippet: block
                            .split(/\r?\n/)
                            .find((line) => line.includes(hit.snippet))?.trim()
                            .slice(0, 160) || hit.snippet,
                    });
                }
            }
        }
    }
    for (const warning of warnings) {
        console.log(
            `[WARN pitfalls:${warning.rule}] ${warning.rel}:${warning.line} ${warning.skill} — ${warning.message}`,
        );
        if (warning.snippet) console.log(`    ${warning.snippet}`);
    }
    if (warnings.length) {
        console.log(
            `\npitfalls：${warnings.length} 处待复核（默认报告模式；加 --strict 作为失败闸门）。豁免锚：audit-<规则>: skip）。`,
        );
    } else {
        log.ok(`pitfalls 通过：${selected.join(' / ')} 未发现问题（扫描 ${files.length} 个角色文件）`);
    }
    return strict && warnings.length > 0;
}

// ── privacy：公开仓库内容不得含本机信息与密钥 ──────────────────────────────
// 仓库根是 zip/，发布后对外公开。注释、配置、文档里只允许出现 zip 内的相对路径、
// 公开 URL，或与 zip 无关但对本机无指向性的占位符（如 D:/path/to/...）。
const PRIVACY_SKIP_DIRS = new Set([
    '.git', '.claude', '.vscode', '.codex', 'node_modules', 'image', 'audio',
    'release', '_others', '.zips-worktree', '.version-worktree',
]);
// 本机覆盖配置：.gitignore 忽略、不入库，按设计保存本机绝对路径
const PRIVACY_SKIP_FILES = new Set(['scripts/lib/dev-config.local.json']);
const PRIVACY_TEXT_EXT = new Set([
    '.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml',
]);
// 私有目录名本身也属于禁止内容，故拆成片段拼接，规则文本中不出现完整字面量
const PRIVACY_PRIVATE_DIRS = [
    ['sgs', 'fork'].join('_'),
    ['hupan', '666'].join(''),
    ['Program', 'Code'].join(''),
    ['noname - 新', '版'].join(''),
    'U盘',
];
const PRIVACY_RULES = [
    {
        id: 'abs-home',
        re: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]{1,2}(?:Users|用户)[\\/]{1,2}[^\s'"`)]*/gi,
        message: '本机用户目录绝对路径',
    },
    {
        id: 'unix-home',
        re: /(?<![A-Za-z0-9])\/(?:home|Users)\/[^\s'"`)]+/g,
        message: '本机用户目录绝对路径',
    },
    {
        id: 'private-dir',
        re: new RegExp(`(?:${PRIVACY_PRIVATE_DIRS.join('|')})`, 'g'),
        message: '私有目录或本机专属目录名',
    },
    {
        id: 'secret',
        re: /(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g,
        message: '疑似密钥或令牌',
    },
    {
        id: 'email',
        re: /[\w.+-]+@(?!example\.)[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g,
        message: '个人邮箱',
    },
];

function walkPrivacyFiles(directory, files = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!PRIVACY_SKIP_DIRS.has(entry.name)) walkPrivacyFiles(full, files);
            continue;
        }
        if (!entry.isFile() || full === SELF_PATH) continue;
        if (PRIVACY_SKIP_FILES.has(relative(ROOT, full).replace(/\\/g, '/'))) continue;
        const ext = extname(entry.name).toLowerCase();
        if (PRIVACY_TEXT_EXT.has(ext) || entry.name === '.gitignore' || entry.name === '.gitattributes') {
            files.push(full);
        }
    }
    return files;
}

function privacyCheck() {
    const files = walkPrivacyFiles(ROOT);
    const hits = [];
    for (const file of files) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        for (const [index, line] of lines.entries()) {
            for (const rule of PRIVACY_RULES) {
                for (const match of line.matchAll(rule.re)) {
                    hits.push({ rel, line: index + 1, id: rule.id, message: rule.message, text: match[0] });
                }
            }
        }
    }
    for (const hit of hits) {
        console.log(`[WARN privacy:${hit.id}] ${hit.rel}:${hit.line} — ${hit.message}：${hit.text}`);
    }
    if (hits.length) {
        console.log(
            `\nprivacy：${hits.length} 处待处理（公开仓库只允许 zip 内相对路径、公开 URL 和无本机指向的占位符）。`,
        );
        return true;
    }
    log.ok(`privacy 通过：${files.length} 个文本文件未发现本机路径、私有目录名、密钥或邮箱`);
    return false;
}

function printUsage() {
    console.log(`用法:
  node scripts/check.mjs --invisible [--fix]    BOM/零宽/控制字符检查（--fix 才写盘）
  node scripts/check.mjs --globals              包级标识符引用检查
  node scripts/check.mjs --logskill             logSkill/cost 约定检查
  node scripts/check.mjs --choosetarget         active 选目标时机检查
  node scripts/check.mjs --skill-embed          技能效果自注册纪律（占位滤器 / rules 层代执行）
  node scripts/check.mjs --skins                头像孤儿/缺失核对
  node scripts/check.mjs --marks                标记键全覆盖审计（对照生成注册表）
  node scripts/check.mjs --mirror               双源码树字节一致校验（zip/source ↔ 冒烟镜像）
  node scripts/check.mjs --pitfalls [--strict]  历史 bug 家族审计（默认报告；--strict 失败）
      单项：--targets / --triggername / --getparent / --alive / --controls / --multitarget
  node scripts/check.mjs --privacy              公开仓库隐私检查（本机路径/私有目录/密钥/邮箱）
  node scripts/check.mjs --interactive          交互选择（人类调试用；AI 勿用）
无参数时打印本用法，不进入菜单。`);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printUsage();
    const requested = args
        .filter((a) => a.startsWith('--'))
        .filter((a) => !['--help', '--fix', '--strict'].includes(a))
        .map((a) => a.replace(/^--/, ''))
        .filter((a) =>
            [
                'invisible', 'globals', 'logskill', 'choosetarget', 'skill-embed',
                'skins', 'marks', 'mirror', 'pitfalls', 'privacy', ...PITFALL_NAMES,
            ].includes(a),
        );
    // 是否应用 invisible 修复（写盘）；命令 --fix 置 true，交互选 invisible 后用 y/N 二次确认
    let fix = args.includes('--fix');
    const strict = args.includes('--strict');

    try {
        const interactive = wantsInteractive(args);
        if (!interactive && requested.length === 0) {
            printUsage();
            return;
        }
        let selected = requested;
        if (interactive) {
            const picks = await menu(
                '请选择要运行的检查（可多选，用逗号分隔序号，如 1,3）:',
                [
                    { label: 'invisible — BOM/零宽/控制字符（--invisible）', value: 'invisible' },
                    { label: 'globals — 包级标识符引用（--globals）', value: 'globals' },
                    { label: 'logskill — logSkill/cost 约定（--logskill）', value: 'logskill' },
                    { label: 'choosetarget — active 选目标时机（--choosetarget）', value: 'choosetarget' },
                    { label: 'skill-embed — 技能效果自注册纪律（--skill-embed）', value: 'skill-embed' },
                    { label: 'skins — 头像孤儿/缺失（--skins）', value: 'skins' },
                    { label: 'marks — 标记键全覆盖审计（--marks）', value: 'marks' },
                    { label: 'mirror — 双源码树一致校验（--mirror）', value: 'mirror' },
                    { label: 'pitfalls — 历史 bug 家族审计（--pitfalls）', value: 'pitfalls' },
                    { label: 'privacy — 公开仓库隐私检查（--privacy）', value: 'privacy' },
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
        let anyFailed = false;
        for (const name of selected) {
            let had = false;
            if (name === 'invisible') had = invisibleCheck({ fix });
            else if (name === 'globals') had = globalsCheck();
            else if (name === 'logskill') had = logskillCheck();
            else if (name === 'choosetarget') had = choosetargetCheck();
            else if (name === 'skill-embed') had = skillEmbedCheck();
            else if (name === 'skins') had = await skinsCheck();
            else if (name === 'marks') had = await marksCheck();
            else if (name === 'mirror') had = mirrorCheck();
            else if (name === 'pitfalls') had = pitfallsCheck({ strict });
            else if (name === 'privacy') had = privacyCheck();
            else if (PITFALL_NAMES.includes(name)) had = pitfallsCheck({ strict, only: name });
            else log.warn(`未知检查：${name}`);
            if (had) anyFailed = true;
        }
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