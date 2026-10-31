#!/usr/bin/env node
/**
 * 文档引用与索引审计（只读；默认报告，--strict 失败）。
 *
 * 用法（zip/ 目录运行）：
 *   node scripts/docs-audit.mjs [--strict] [--json]
 *
 * 检查现行文档（文档/*.md、根 AGENTS.md、工具目录说明；文档归档/ 不扫描）：
 *   1. `npm run <script>` 是否存在于 zip/package.json 的 `scripts` 段；若命中 `AIscript` 段
 *      （AI 专用、npm 不识别）则单列为 npm-ai-script 并给出直调命令；
 *   2. `node scripts/...mjs` / `node _others/debug/...mjs` 脚本路径是否存在（按 zip/ 与仓库根双基准解析）；
 *   3. 反引号内的 zip/、_others/、文档/、群友投稿/ 路径是否存在；
 *   4. Markdown 链接指向的 .md 是否存在；
 *   5. 文档/README.md 索引是否覆盖全部现行文档，域名、用途、权威、关键词是否合法且不重复；
 *   6. 索引「维护」列登记的生成器是否存在，该文档页首是否有对应的 `> 生成器：` 标识；
 *   7. 《文档》+ 章节号的引用，目标文档是否真有该章节（跳过的历史记录除外）。
 *
 * 不扫描 文档归档/（历史快照，允许过时）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const WORKSPACE = resolve(ROOT, '..');
const STRICT = process.argv.includes('--strict');
const JSON_ONLY = process.argv.includes('--json');

const DOC_DIR = join(WORKSPACE, '文档');
const INDEX_FILE = join(DOC_DIR, 'README.md');
const INDEX_COLUMNS = ['文档键', '路径', '域', '用途', '权威', '触发关键词', '维护'];
const PURPOSE_TYPES = new Set(['导航', '规范', '操作参考', '任务流程', '生成清单', '历史记录']);
const AUTHORITIES = new Set(['A', 'B', 'C']);
const DOMAIN_RE = /^T[1-8]$/;
const GENERATOR_MARK = '> 生成器：';
const CN_NUM = '〇一二三四五六七八九十';
const CN_TO_AR = { 〇: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
const SECTION_REF_RE =
    /《([^》\n]{1,40})》\s*((?:§[0-9〇一二三四五六七八九十]+(?:\.[0-9]+)*|[A-Z]\d{0,3}(?:\s*篇)?)(?:\s*[、，,和及与或]\s*(?:§[0-9〇一二三四五六七八九十]+(?:\.[0-9]+)*|[A-Z]\d{0,3}(?:\s*篇)?))*)/g;

const DOC_FILES = [
    ...readdirSync(DOC_DIR)
        .filter((name) => name.endsWith('.md') && statSync(join(DOC_DIR, name)).isFile())
        .map((name) => join(DOC_DIR, name)),
    join(WORKSPACE, 'AGENTS.md'),
    join(WORKSPACE, '_others', 'smoke', 'README.md'),
    join(WORKSPACE, '_others', 'debug', 'TOOLS.md'),
    join(WORKSPACE, '_others', 'debug', 'helper-ext', 'README.md'),
].filter((file) => existsSync(file));

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = packageJson.scripts || {};
const aiScripts = packageJson.AIscript || {};
const warnings = [];
const SKIP_FILES = new Set([
    '文档/迁移工作记录.md',
    '文档/手机端启动问题排查报告.md',
    '文档/太阳神音频差异对照.md',
]);
const ALLOWED_MISSING_SCRIPTS = new Set(['build:android', 'playtest:auto']);
const SKIP_PATH_RE = /(?:^|\/)(?:xxx|\.\.\.|probe_client\.js|_tmp_keys_audit\.mjs|_tmp_serve2?\.mjs|_tmp_diff_overlay\.mjs|_tmp_suffix_keys\.mjs|_tmp_apk_[^/]+|sgsv2_src|太阳神三国杀V2|v1\.11\.6_)/;

function relOf(file) {
    return relative(WORKSPACE, file).replace(/\\/g, '/');
}

function lineOf(text, index) {
    return text.slice(0, index).split(/\r?\n/).length;
}

function add(file, index, kind, detail) {
    addAt(file, lineOf(readFileSync(file, 'utf8'), index), kind, detail);
}

function addAt(file, line, kind, detail) {
    warnings.push({ file: relOf(file), line, kind, detail });
}

function checkPath(file, index, raw, kind) {
    const value = raw
        .trim()
        .replace(/[，。；：、）】》"'`]+$/g, '')
        .replace(/:\d+(?:-\d+)?$/, ''); // 行号锚（zip/extension.js:14）
    if (!value || value.includes(' ')) return;
    if (/[*<>{}?|…]/.test(value)) return; // 通配/占位/命令片段
    if (SKIP_PATH_RE.test(value)) return;
    if (/^[a-z]+:\/\//i.test(value)) return;
    const candidates = [resolve(WORKSPACE, value)];
    if (!value.endsWith('.md')) candidates.push(resolve(WORKSPACE, `${value}.md`));
    if (candidates.some((candidate) => existsSync(candidate))) return;
    add(file, index, kind, `路径不存在：${value}`);
}

for (const file of DOC_FILES) {
    const rel = relative(WORKSPACE, file).replace(/\\/g, '/');
    if (SKIP_FILES.has(rel)) continue;
    const text = readFileSync(file, 'utf8');

    for (const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
        const name = match[1];
        if (ALLOWED_MISSING_SCRIPTS.has(name) || name.includes('xxx')) continue;
        if (Object.hasOwn(scripts, name)) continue;
        if (Object.hasOwn(aiScripts, name)) {
            add(
                file,
                match.index || 0,
                'npm-ai-script',
                `「${name}」在 package.json 的 AIscript 段（AI 专用），npm 只读 scripts → 改用 \`${aiScripts[name]}\``,
            );
            continue;
        }
        add(file, match.index || 0, 'npm-script', `package.json 缺少脚本：${name}`);
    }

    for (const match of text.matchAll(/node\s+([^\s`]+\.(?:mjs|js))/g)) {
        const value = match[1];
        if (/[<>]/.test(value) || value.includes('_tmp_kimi_fanout') || value.includes('xxx')) continue;
        const candidates = [
            value.startsWith('scripts/') ? resolve(ROOT, value) : resolve(WORKSPACE, value),
            resolve(ROOT, value), // 以 zip/ 为基准（`node ../_others/smoke/run-all.mjs` 之类）
            resolve(WORKSPACE, '_others', 'smoke', value),
            resolve(WORKSPACE, '_others', 'debug', value),
        ];
        if (!candidates.some((candidate) => existsSync(candidate))) {
            add(file, match.index || 0, 'script-path', `脚本不存在：${value}`);
        }
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
        const span = match[1];
        if (span.includes('_tmp_kimi_fanout')) continue;
        for (const pathMatch of span.matchAll(/(?:zip|_others|文档|文档归档|群友投稿)\/[^\s`'"]+/g)) {
            checkPath(file, (match.index || 0) + (pathMatch.index || 0), pathMatch[0], 'path');
        }
    }

    for (const match of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
        const value = match[1].trim();
        if (/^[a-z]+:\/\//i.test(value)) continue;
        const candidate = value.startsWith('/')
            ? resolve(WORKSPACE, value.slice(1))
            : resolve(dirname(file), value);
        if (!existsSync(candidate)) {
            add(file, match.index || 0, 'link', `文档链接不存在：${value}`);
        }
    }
}

// ── 索引契约（文档/README.md 中七列表格）──────────────────────────────────
function stripCell(cell) {
    return cell.replace(/`/g, '').trim();
}

function parseIndex(text) {
    const rows = [];
    let line = 0;
    for (const raw of text.split(/\r?\n/)) {
        line += 1;
        const trimmed = raw.trim();
        if (!trimmed.startsWith('|')) continue;
        const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(stripCell);
        if (cells.length !== INDEX_COLUMNS.length) continue;
        if (!cells[1].endsWith('.md')) continue;
        rows.push({
            line,
            key: cells[0],
            path: cells[1],
            domain: cells[2],
            purpose: cells[3],
            authority: cells[4],
            keywords: cells[5],
            maintain: cells[6],
        });
    }
    return rows;
}

const indexText = existsSync(INDEX_FILE) ? readFileSync(INDEX_FILE, 'utf8') : '';
const indexRows = parseIndex(indexText);

if (!indexRows.length) {
    addAt(INDEX_FILE, 1, 'index', '索引未解析到七列表格行');
} else {
    const indexed = new Set(indexRows.map((row) => row.path));
    for (const doc of DOC_FILES.filter((file) => dirname(file) === DOC_DIR)) {
        const rel = relOf(doc);
        if (!indexed.has(rel)) addAt(INDEX_FILE, 1, 'index-missing', `索引缺少现行文档：${rel}`);
    }

    const keywordOwner = new Map();
    const seenKeys = new Set();
    for (const row of indexRows) {
        if (!row.key) addAt(INDEX_FILE, row.line, 'index', '文档键为空');
        if (seenKeys.has(row.key)) addAt(INDEX_FILE, row.line, 'index', `文档键重复：${row.key}`);
        seenKeys.add(row.key);
        if (!DOMAIN_RE.test(row.domain)) addAt(INDEX_FILE, row.line, 'index', `域应为 T1–T8：${row.key}`);
        if (!PURPOSE_TYPES.has(row.purpose)) addAt(INDEX_FILE, row.line, 'index', `用途不合法：${row.key} → ${row.purpose}`);
        if (!AUTHORITIES.has(row.authority)) addAt(INDEX_FILE, row.line, 'index', `权威应为 A/B/C：${row.key}`);

        const tokens = row.keywords.split(/[、，,]/).map((token) => token.trim()).filter(Boolean);
        if (!tokens.length) addAt(INDEX_FILE, row.line, 'index-keyword', `触发关键词为空：${row.key}`);
        for (const token of tokens) {
            const norm = token.toLowerCase();
            const owner = keywordOwner.get(norm);
            if (owner && owner !== row.key) {
                addAt(INDEX_FILE, row.line, 'index-keyword', `关键词「${token}」已在 ${owner} 登记`);
            } else {
                keywordOwner.set(norm, row.key);
            }
        }

        if (row.maintain === '手写') continue;
        const candidates = [resolve(WORKSPACE, row.maintain), resolve(ROOT, row.maintain)];
        if (!candidates.some((candidate) => existsSync(candidate))) {
            addAt(INDEX_FILE, row.line, 'generator', `生成器不存在：${row.maintain}（${row.key}）`);
            continue;
        }
        const docPath = resolve(WORKSPACE, row.path);
        if (!existsSync(docPath)) continue; // 路径缺失已在别处报告
        const docText = readFileSync(docPath, 'utf8');
        const markAt = docText.indexOf(GENERATOR_MARK);
        if (!docText.includes(`${GENERATOR_MARK}${row.maintain}`)) {
            addAt(
                docPath,
                markAt < 0 ? 1 : lineOf(docText, markAt),
                'generator',
                markAt < 0
                    ? `缺少生成器标识（索引登记 ${row.maintain}）`
                    : `生成器标识与索引不一致（索引登记 ${row.maintain}）`,
            );
        }
    }
}

// ── 章节号引用：《文档》§x / A13 / A 篇 ─────────────────────────────────
function collectSectionIds(text) {
    const ids = new Set();
    for (const match of text.matchAll(/^#{1,4}\s+(.+)$/gm)) {
        const head = match[1].trim();
        let hit;
        if ((hit = head.match(new RegExp(`^([${CN_NUM}]+)、`)))) ids.add(hit[1]);
        if ((hit = head.match(/^(\d+(?:\.\d+)*)[.、：:\s]/))) ids.add(hit[1]);
        if ((hit = head.match(/^([A-Z])(\d{1,3})?[.、：:\s]/))) ids.add(hit[1] + (hit[2] ?? ''));
        if ((hit = head.match(/^[上下]篇\s*([A-Z])/))) ids.add(`${hit[1]} 篇`);
    }
    for (const id of [...ids]) {
        if (CN_TO_AR[id]) ids.add(CN_TO_AR[id]);
        const back = Object.entries(CN_TO_AR).find(([, ar]) => ar === id);
        if (back) ids.add(back[0]);
    }
    return ids;
}

const sectionTargets = new Map();
for (const file of DOC_FILES) {
    const text = readFileSync(file, 'utf8');
    const targets = { file, ids: collectSectionIds(text) };
    for (const name of [basename(file, '.md'), (text.match(/^#\s+(.+)$/m) || [])[1]?.trim()]) {
        if (name) sectionTargets.set(name, targets);
    }
}

for (const file of DOC_FILES) {
    if (SKIP_FILES.has(relOf(file))) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(SECTION_REF_RE)) {
        const name = match[1].replace(/^.*\//, '').replace(/\.md$/, '').trim();
        const target = sectionTargets.get(name);
        if (!target) continue; // 非现行文档，交由路径检查处理
        for (const raw of match[2].split(/[、，,和及与或]/)) {
            const spec = raw.trim();
            if (!spec) continue;
            const id = spec.replace(/^§/, '').replace(/\s*篇$/, ' 篇');
            if (!target.ids.has(id)) {
                add(file, match.index || 0, 'section', `《${name}》${spec} 在目标文档中不存在`);
            }
        }
    }
}

if (JSON_ONLY) {
    console.log(JSON.stringify({ tool: 'bts-docs-audit', files: DOC_FILES.length, warnings }, null, 2));
} else {
    if (warnings.length) {
        for (const warning of warnings) {
            console.log(`[WARN docs:${warning.kind}] ${warning.file}:${warning.line} — ${warning.detail}`);
        }
        console.log(`\ndocs-audit：${warnings.length} 处待修（默认报告；加 --strict 作为失败闸门）。`);
    } else {
        console.log(`[OK] docs-audit：${DOC_FILES.length} 份现行文档未发现失效引用。`);
    }
}

if (STRICT && warnings.length) process.exitCode = 1;
