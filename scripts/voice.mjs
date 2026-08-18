#!/usr/bin/env node
/**
 * 语音档案维护工具（并入 npm run voice，不新增脚本）。
 *
 * 文档《技能语音字幕填充清单.md》是唯一真实台词来源；代码旧台词已被判定为 AI 捏造并清空。
 *
 * 用法：
 *   node scripts/voice.mjs gen              按「音频 + 文档台词」重建文档。
 *        ——有 mp3 一律列出；有台词归「已配齐」，无台词归「缺台词」（你删掉技能/阵亡也会归回
 *           缺台词类）；凡已定义技能无 mp3，自动预留 2 个空位归「缺音频」（见 VOICE_EXCLUDE_SKILLS 排除清单）。
 *           可点链接、幂等、保留你填的台词。
 *   node scripts/voice.mjs reorganize       仅重排现有清单（以文档内容为准、尊重手动删除，不重扫音频；
 *        ——但文档里提到（引用）过却缺表格的技能/阵亡语音，会补齐表格本身）。
 *   node scripts/voice.mjs write [--apply]  把文档台词写回代码 translate（缺台词插入、已配齐不一致则更新）；
 *        ——默认预览，--apply 才写盘。
 *   node scripts/voice.mjs clear [--apply]  删除 translate 中残留的台词键（$ / ~，便于按新规范重写）；
 *        ——默认预览，--apply 才写盘。
 *   node scripts/voice.mjs syncdie [--apply] 形态角色阵亡音频复用：把主角色 die 音频复制为形态 die 文件；
 *        ——默认预览，--apply 才写盘。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { menu, confirm, closeInteractive } from './lib/interactive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = resolve(root, '..', '文档', '技能语音字幕填充清单.md');
const audioSkill = join(root, 'audio', 'skill');
const audioDie = join(root, 'audio', 'die');
const rolesRoot = join(root, 'source', 'character', 'bts', 'roles');

const cmd = process.argv[2];
// 是否写盘：命令行 --apply 置 true；交互菜单里选 write 时再用 y/N 二次确认（见 run()）
let applyWrite = process.argv.includes('--apply');

async function walk(dir, ext) {
  const out = [];
  try { async function go(d) { for (const e of await readdir(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) await go(f); else if (e.isFile() && e.name.endsWith(ext)) out.push(f); } } await go(dir); } catch {}
  return out;
}
function topKeys(src, exportName) { /* translate/skill 对象顶层键 */
  const dec = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\{`).exec(src);
  if (!dec) return [];
  const keys = []; let i = src.indexOf('{', dec.index) + 1, depth = 1, q = '';
  while (i < src.length && depth) { const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 1 && /[A-Za-z_$]/.test(c)) { const s = i; while (/[\w$]/.test(src[i])) i++; const k = src.slice(s, i).replace(/^['"]|['"]$/g, ''); while (/\s/.test(src[i])) i++; if (src[i] === ':') keys.push(k); }
    i++; }
  return keys;
}
function valueOf(line) { const c = line.indexOf(':'); if (c < 0) return ''; let v = line.slice(c + 1).trim().replace(/,$/, '').trim(); if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1); return v; }
const esc = (s) => s.replace(/\|/g, '\\|');

// ── 形态角色解析：character / transformCharacter 各块的 id 与 skills ──────────
// 用于 skill 归属（形态专属技能归形态）、阵亡复用（形态复用主角色 die）、写回文件定位。
function braceEnd(src, open) {
  let d = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
function blockSkills(body) {
  const m = /\bskills\s*:\s*\[([\s\S]*?)\]/.exec(body);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter((s) => /^bts_/.test(s));
}
/** 把注释（//、/*…*​/）替换为空白，字符串保留；避免顶层块被前导注释挡住 */
function stripC(s) {
  let out = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { out += c + (s[i + 1] || ''); i++; continue; } if (c === q) q = null; out += c; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; out += '\n'; continue; }
    out += c;
  }
  return out;
}
/** 提取 `export const <exportName> = { id: {...}, ... }` 的所有顶层角色块 [{id, skills}] */
function roleBlocks(src, exportName) {
  const dec = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\{`).exec(src);
  if (!dec) return [];
  const open = src.indexOf('{', dec.index);
  const close = braceEnd(src, open);
  if (close < 0) return [];
  const body = stripC(src.slice(open + 1, close)); // 剥注释再分块（块前常有 // 注释）
  const blocks = [];
  const re = /(?:^|,|\{)\s*(?:'|")?(bts_[\w]+)(?:'|")?\s*:\s*\{/g;
  let m;
  while ((m = re.exec(body))) {
    const bo = body.indexOf('{', m.index + m[0].length);
    const bc = braceEnd(body, bo);
    if (bc < 0) break;
    blocks.push({ id: m[1], skills: blockSkills(body.slice(bo + 1, bc)) });
    re.lastIndex = bc;
  }
  return blocks;
}

// 读取音频
const audioSkillLines = {};
for (const f of await walk(audioSkill, '.mp3')) { const m = /^(bts_[\w]+?)(\d+)$/.exec(basename(f, '.mp3')); if (m) (audioSkillLines[m[1]] ??= new Set()).add(Number(m[2])); }
const dieFiles = new Set((await walk(audioDie, '.mp3')).map((f) => basename(f, '.mp3')));
// 角色结构：cInfo(所有角色/形态 id)、skillOwner(技能→所属角色,按各块 skills 归属)、
// dieReuse(形态 id→主角色 id,阵亡复用)、roleFile(id→所在文件)、comboIds(_and_ 组合)。
const cInfo = {}, skillOwner = {}, nameById = {}, dieReuse = {}, roleFile = {};
const comboIds = new Set();
for (const full of await walk(rolesRoot, '.js')) {
  const src = await readFile(full, 'utf8');
  const rel = full.slice(rolesRoot.length + 1).replace(/\\/g, '/');
  const fileStem = basename(rel, '.js');
  const faction = dirname(rel);
  const chars = roleBlocks(src, 'character');
  const morphs = roleBlocks(src, 'transformCharacter');
  const charKey = chars[0]?.id || `bts_${fileStem}`; // 主形态（兜底文件名）
  // 技能归属：优先按各块 skills[] 归到真正所属 id（形态专属技能不再并到主形态）
  const seen = new Set();
  for (const c of chars) for (const s of c.skills) if (!seen.has(s)) { skillOwner[s] = c.id; seen.add(s); }
  for (const mb of morphs) for (const s of mb.skills) if (!seen.has(s)) { skillOwner[s] = mb.id; seen.add(s); }
  // 兜底：文件级 skill 对象里、未归属任一 skills 的技能归主形态（本扩展技能都带 bts_ 前缀，
  // 过滤掉 group/mark 等会被 topKeys 误当顶层键的块内属性）
  for (const k of topKeys(src, 'skill')) if (!skillOwner[k] && /^bts_/.test(k)) skillOwner[k] = charKey;
  // 中文名（translate 的空 json 值忽略，只取短名）
  for (const m of src.matchAll(/^[ \t]*(?:'|")?(bts_(?:max|st|wanglai)_[\w]+?)(?:'|")?\s*:\s*'([^']{1,10})',$/gm)) nameById[m[1]] = m[2];
  for (const nm of src.matchAll(/^[ \t]*(?:'|")?(bts_[\w]+)(?:'|")?\s*:\s*'([^']{1,10})',$/gm)) {
    if (nameById[nm[1]] == null) nameById[nm[1]] = nm[2]; // 首位中文名优先，避免被英文/替代名覆盖
  }
  // 主形态
  cInfo[charKey] = { faction, name: nameById[charKey] || fileStem.slice(4) };
  roleFile[charKey] = full;
  // 形态：纯形态(非 _and_)进 cInfo 并复用主形态阵亡；组合(_and_)计入 comboIds
  for (const mb of morphs) {
    if (/_and_/.test(mb.id)) { comboIds.add(mb.id); roleFile[mb.id] = full; continue; }
    cInfo[mb.id] = { faction, name: nameById[mb.id] || mb.id };
    dieReuse[mb.id] = charKey;
    roleFile[mb.id] = full;
  }
}

// ── 读文档台词（唯一真实来源，跨次保留）────────────────────────────────────
const userText = new Map();
try { for (const line of (await readFile(DOC, 'utf8')).split('\n')) { const m = /audio\/(?:skill|die)\/[A-Za-z0-9_]+\.mp3/.exec(line); if (!m || !line.includes('|')) continue; const cells = line.split('|'); const t = (cells[cells.length - 2] || '').trim(); if (t) userText.set(m[0], t); } } catch {}

// ═════════════════════════  gen：重建文档  ═════════════════════════════
// 缺配音自动扫描：凡「已定义技能」无任何 mp3 → 自动在文档为其预留 RESERVE_SIZE 个空位（缺音频占位）。
// 个别技能若不需要语音、也不要空位，加进 VOICE_EXCLUDE_SKILLS 硬编码排除清单即可（其余全部自动）。
const RESERVE_SIZE = 2;
const VOICE_EXCLUDE_SKILLS = new Set([
  // 例：'bts_st_xxx'  // 该技能没有语音文件、也不需要空位
]);

async function gen() {
  const DONE = '已配齐', TEXT = '缺台词', AUDIO = '缺音频';
  const st = (a, t) => (!a ? AUDIO : (t ? DONE : TEXT));
  const rowsByChar = {};
  const push = (k, r) => (rowsByChar[k] ??= []).push(r);
  const cell = (mp3, has) => has ? `[${mp3}](../zip/${mp3})` : `\`${mp3}\`（待补）`;
  // 所有技能来源统一过滤 bts_ 前缀（排除被误判的块内属性如 group/mark，并阻断文档里已有占位自续）
  const sk = new Set([...Object.keys(audioSkillLines),
    ...[...userText.keys()].filter((p) => /^audio\/skill\/bts_/.test(p)).map((p) => p.slice(12).replace(/\d+\.mp3$/, '')),
    ...Object.keys(skillOwner)].filter((s) => /^bts_/.test(s)));
  for (const s of [...sk].sort()) {
    const idx = audioSkillLines[s] || new Set();
    const dn = [...userText.keys()].filter((p) => new RegExp(`^audio/skill/${s}\\d+\\.mp3$`).test(p)).map((p) => Number(p.slice(12 + s.length, -4)));
    const excluded = VOICE_EXCLUDE_SKILLS.has(s);
    // 完全无 mp3 的非排除技能：自动预留 RESERVE_SIZE 个空位（缺音频占位）
    let maxN = Math.max(...idx, ...dn, 0);
    if (!excluded && idx.size === 0 && dn.length === 0) maxN = Math.max(maxN, RESERVE_SIZE);
    if (!maxN) continue;
    const label = nameById[s] ? `${nameById[s]}（${s}）` : s;
    for (let n = 1; n <= maxN; n++) {
      const mp3 = `audio/skill/${s}${n}.mp3`; const a = idx.has(n); const t = !!userText.get(mp3);
      // 无音频也无台词的空位：排除清单跳过（不留空位），否则作为缺音频占位列出
      if (!a && !t) { if (!excluded) push(skillOwner[s] || '未归属', { type: '技能', label, mp3: cell(mp3, false), status: AUDIO, text: '' }); continue; }
      push(skillOwner[s] || '未归属', { type: '技能', label, mp3: cell(mp3, a), status: st(a, t), text: userText.get(mp3) || '' });
    }
  }
  // 阵亡：按 cInfo 的角色（含形态）。形态角色复用主角色 die（音频用 syncdie 复制文件、台词取主）
  for (const ck of Object.keys(cInfo)) {
    const reuse = dieReuse[ck]; // 形态→主
    const srcId = reuse || ck;
    const mp3 = `audio/die/${ck}.mp3`;
    const a = dieFiles.has(ck);
    const t = reuse ? !!userText.get(`audio/die/${srcId}.mp3`) : !!userText.get(mp3);
    if (!a && !t) continue;
    const text = reuse ? (userText.get(`audio/die/${srcId}.mp3`) || '') : (userText.get(mp3) || '');
    push(ck, { type: '阵亡', label: `${cInfo[ck].name} 阵亡`, mp3: cell(mp3, a), status: !a ? AUDIO : (t ? DONE : TEXT), text });
  }
  // 组合阵亡
  const combos = [];
  for (const d of [...dieFiles].sort()) { if (Object.hasOwn(cInfo, d)) continue; if (!/_and_/.test(d)) { combos.push({ label: d, mp3: cell(`audio/die/${d}.mp3`, true), text: userText.get(`audio/die/${d}.mp3`) || '' }); continue; } const mm = /^(bts_[a-z0-9_]+?)_and_/.exec(d); combos.push({ label: `${d}（复用 ${mm[1]}）`, mp3: cell(`audio/die/${d}.mp3`, true), text: userText.get(`audio/die/${d}.mp3`) || '' }); }
  // 输出
  const STAT_ORDER = [DONE, TEXT, AUDIO], STAT_TITLE = { [DONE]: '已配齐', [TEXT]: '缺台词', [AUDIO]: '缺音频' };
  const byStatus = {}; const cmpChar = (a, b) => { const fa = cInfo[a]?.faction || '', fb = cInfo[b]?.faction || ''; return fa === fb ? cInfo[a].name.localeCompare(cInfo[b].name, 'zh') : fa.localeCompare(fb, 'zh'); };
  for (const [ck, rows] of Object.entries(rowsByChar)) for (const r of rows) { (byStatus[r.status] ??= {})[ck] ??= []; byStatus[r.status][ck].push(r); }
  let md = ['# 技能语音字幕维护清单', '', '> 文档是唯一真实台词来源。状态：**缺音频**（待补 mp3）、**缺台词**（有 mp3、无台词）、**已配齐**（有 mp3、有台词）。', '> `node scripts/voice.mjs gen` 重建（有 mp3 一律列出，删掉的技能/阵亡归回缺台词类）；`write [--apply]` 写回代码。', ''];
  for (const s of STAT_ORDER) { const ck = Object.keys(byStatus[s] || {}).sort(cmpChar); if (!ck.length) continue; const n = ck.reduce((x, k) => x + byStatus[s][k].length, 0); md.push(`## ${STAT_TITLE[s]}（${n}）`, ''); for (const k of ck) { md.push(`### ${cInfo[k].name}（${k}）　〔${cInfo[k].faction}〕`, '', '| 类型 | 条目 | 音频文件 | 台词 |', '|---|---|---|---|'); for (const r of byStatus[s][k]) md.push(`| ${r.type} | ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`); md.push(''); } }
  if (combos.length) { md.push('---', '## 组合阵亡（复用主角色）', '', '| 条目 | 音频文件 | 台词 |', '|---|---|---|'); for (const r of combos) md.push(`| ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`); md.push(''); }
  await writeFile(DOC, md.join('\n'), 'utf8');
  const all = Object.values(rowsByChar).flat();
  console.log(`✓ gen 完成：主条目 ${all.length}（已配齐 ${all.filter((r) => r.status === DONE).length}，缺台词 ${all.filter((r) => r.status === TEXT).length}，缺音频 ${all.filter((r) => r.status === AUDIO).length}）；组合阵亡 ${combos.length}。`);
}

// ═════════════════════════  write：doc→code  ═════════════════════════════
// ── 台词块辅助：把新台词插到 translate 末尾、按 character.skills 排序、阵亡最后 ──
/** 取 role 文件 character.skills 的技能 ID 顺序数组 */
function getSkills(src) {
  const m = /\bskills\s*:\s*\[([\s\S]*?)\]/m.exec(src);
  if (!m) return [];
  return m[1].split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => /^bts_/.test(s));
}
/** 台词键排序基数：技能按 skills 下标+N；阵亡（~/~）最后 */
function cmpVoiceKey(raw, idx) {
  const k = raw.replace(/^['"]|['"]$/g, '');
  if (k[0] === '~') return 1e15; // 阵亡最后
  const m = /^\$(bts_[\w]+?)(\d+)$/.exec(k);
  if (!m) return 1e16;
  const i = idx.has(m[1]) ? idx.get(m[1]) : 1000;
  return i * 1000 + Number(m[2]);
}
/** 返回 translate 对象闭合 `}` 的字符下标；未找到返回 -1 */
function translateEnd(src) {
  const am = /\bexport\s+const\s+translate\s*=\s*\{/m.exec(src);
  if (!am) return -1;
  const open = src.indexOf('{', am.index);
  let depth = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i += 1; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

async function writeBack() {
  const activeVal = {}, keptKeys = new Set();
  for (const full of await walk(rolesRoot, '.js')) { const src = await readFile(full, 'utf8'); const rel = full.slice(rolesRoot.length + 1).replace(/\\/g, '/'); const fileStem = basename(rel, '.js'); const charKey = (/export\s+const\s+character\s*=\s*\{\s*['"]?(bts_\w+)/.exec(src) || [])[1] || `bts_${fileStem}`;
    for (const k of topKeys(src, 'skill')) if (!skillOwner[k]) skillOwner[k] = charKey;
    for (const m of src.matchAll(/^[ \t]*(['"]?)\$(bts_[\w]+?)(\d+)[ '"]*:(.*)$/gm)) activeVal[`${m[2]}|${m[3]}`] = valueOf(m[0]);
    for (const m of src.matchAll(/^[ \t]*\/\/\s*['"]?\$(bts_[\w]+?)(\d+)/gm)) keptKeys.add(`${m[1]}|${m[2]}`);
    for (const m of src.matchAll(/^[ \t]*(['"]?)~(bts_[A-Za-z0-9_]+)['"]?\s*:(.*)$/gm)) activeVal[`die:${m[2]}`] = valueOf(m[0]);
    for (const m of src.matchAll(/^[ \t]*\/\/\s*['"]?~(bts_[A-Za-z0-9_]+)/gm)) keptKeys.add(`die:${m[1]}`); }
  const charFile = roleFile; // 用全局 id→文件 映射（含 character/transformCharacter 的形态 id，形态阵亡键可写回对应文件）
  const ins = new Map(), upd = new Map(), skip = [];
  for (const line of (await readFile(DOC, 'utf8')).split('\n')) { const m3 = /audio\/(?:skill|die)\/[A-Za-z0-9_]+\.mp3/.exec(line); if (!m3 || !line.trim().startsWith('|')) continue; const c = line.split('|'); const text = (c[c.length - 2] || '').trim(); if (!text) continue; const p = m3[0];
    let key, kid, ck;
    if (p.startsWith('audio/skill/')) { const m = /^audio\/skill\/(bts_[\w]+?)(\d+)\.mp3$/.exec(p); if (!m) continue; key = `'$${m[1]}${m[2]}'`; kid = `${m[1]}|${m[2]}`; ck = skillOwner[m[1]]; }
    else { const m = /^audio\/die\/(bts_[A-Za-z0-9_]+)\.mp3$/.exec(p); if (!m) continue; if (/_and_/.test(m[1])) continue; key = `'~${m[1]}'`; kid = `die:${m[1]}`; ck = m[1]; }
    if (!ck || !charFile[ck]) { skip.push(`${key}（无归属）`); continue; }
    const old = activeVal[kid];
    if (old !== undefined) { if (old === text) continue; if (!upd.has(charFile[ck])) upd.set(charFile[ck], new Map()); upd.get(charFile[ck]).set(key, { jsonVal: JSON.stringify(text), old }); }
    else if (keptKeys.has(kid)) { skip.push(`${key}（代码注释）`); }
    else { if (!ins.has(charFile[ck])) ins.set(charFile[ck], new Map()); ins.get(charFile[ck]).set(key, JSON.stringify(text)); } }
  const ANCHOR = /export\s+const\s+translate\s*=\s*\{/; let ni = 0, nu = 0;
  for (const f of new Set([...ins.keys(), ...upd.keys()])) { let src = await readFile(f, 'utf8');
    if (ins.has(f)) {
      // 新台词统一插到 translate 末尾，前面空一行，按 character.skills 顺序、阵亡最后
      const end = translateEnd(src);
      if (end < 0) { console.log(`✗ 无 translate 块: ${basename(f)}`); continue; }
      const skills = getSkills(src);
      const idx = new Map(skills.map((s, i) => [s, i]));
      const ordered = [...ins.get(f).keys()].sort((a, b) => cmpVoiceKey(a, idx) - cmpVoiceKey(b, idx));
      const blk = ordered.map((k) => `    ${k}: ${ins.get(f).get(k)},`).join('\n');
      // 原 translate 末尾普通键行自带换行（…,” + \n + };）。这里只再补 1 个 \n → 1 空行，不与普通键间成 2 行。
      src = src.slice(0, end) + '\n' + blk + '\n' + src.slice(end);
      ni += ins.get(f).size;
      if (!applyWrite) console.log(`◇ 插入 ${basename(f)}：${ins.get(f).size}（translate 末尾，按 skills 顺序）`);
    }
    if (upd.has(f)) { for (const [k, { jsonVal, old }] of upd.get(f)) { const r = new RegExp(`^([ \\t]*)${k.replace(/[$.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*:\\s*).*$`, 'm'); if (!r.test(src)) continue; src = src.replace(r, `$1${k}$2${jsonVal},`); nu++; if (!applyWrite) console.log(`◇ 更新 ${basename(f)} ${k}：${old} → ${JSON.parse(jsonVal)}`); } }
    if (applyWrite) await writeFile(f, src); }
  console.log(`write 预览：插入 ${ni}、更新 ${nu}、跳过 ${skip.length}。${applyWrite ? '已写盘。' : '加 --apply 写盘。'}`);
}

// ═════════════════════════  reorganize：仅重排（尊重手动删除，补齐缺表格语音）═══
// 以「当前文档」为准重排分组：不重扫音频，因此你手动删掉的条目不会复活；
// 但文档里只要提到（引用）过某技能/阵亡语音、而它没有对应表格行，就把表格补上。
async function reorganize() {
  const docText = await readFile(DOC, 'utf8');
  // 扫描全文所有 mp3 引用作为「文档条目」来源；台词取该行表格最后一句（非空才覆盖已有）。
  const docMp3 = new Map(); // mp3 -> 台词
  for (const line of docText.split('\n')) {
    const m = /audio\/(?:skill|die)\/[A-Za-z0-9_]+\.mp3/.exec(line);
    if (!m) continue;
    const p = m[0];
    let text = '';
    if (line.includes('|')) {
      const cells = line.split('|');
      text = (cells[cells.length - 2] || '').trim();
    }
    if (text || !docMp3.has(p)) docMp3.set(p, text);
  }

  const DONE = '已配齐', TEXT = '缺台词', AUDIO = '缺音频';
  const st = (a, t) => (!a ? AUDIO : (t ? DONE : TEXT));
  const cell = (mp3, has) => has ? `[${mp3}](../zip/${mp3})` : `\`${mp3}\`（待补）`;
  const rowsByChar = {};
  const push = (k, r) => (rowsByChar[k] ??= []).push(r);
  const combos = [];

  for (const [mp3, text] of docMp3) {
    if (mp3.startsWith('audio/skill/')) {
      const m = /^audio\/skill\/(bts_[\w]+?)(\d+)\.mp3$/.exec(mp3);
      if (!m) continue;
      const a = (audioSkillLines[m[1]] ?? new Set()).has(Number(m[2]));
      const owner = skillOwner[m[1]] || '未归属';
      const label = nameById[m[1]] ? `${nameById[m[1]]}（${m[1]}）` : m[1];
      push(owner, { type: '技能', label, mp3: cell(mp3, a), status: st(a, !!text), text });
    } else {
      const m = /^audio\/die\/(bts_[A-Za-z0-9_]+)\.mp3$/.exec(mp3);
      if (!m) continue;
      const d = m[1];
      const a = dieFiles.has(d);
      if (/_and_/.test(d)) {
        const mm = /^(bts_[a-z0-9_]+?)_and_/.exec(d);
        combos.push({ label: mm ? `${d}（复用 ${mm[1]}）` : d, mp3: cell(mp3, a), text });
        continue;
      }
      push(cInfo[d] ? d : '未归属', { type: '阵亡', label: `${cInfo[d]?.name || d} 阵亡`, mp3: cell(mp3, a), status: st(a, !!text), text });
    }
  }

  // 输出：三大状态 → 角色；再附组合阵亡
  const STAT_ORDER = [DONE, TEXT, AUDIO], STAT_TITLE = { [DONE]: '已配齐', [TEXT]: '缺台词', [AUDIO]: '缺音频' };
  const nameOf = (k) => cInfo[k]?.name || k.replace(/^bts_/, '');
  const factionOf = (k) => cInfo[k]?.faction || '';
  const byStatus = {};
  for (const [ck, rows] of Object.entries(rowsByChar)) for (const r of rows) { (byStatus[r.status] ??= {})[ck] ??= []; byStatus[r.status][ck].push(r); }
  const cmpChar = (a, b) => { const fa = factionOf(a), fb = factionOf(b); return fa === fb ? nameOf(a).localeCompare(nameOf(b), 'zh') : fa.localeCompare(fb, 'zh'); };

  let md = ['# 技能语音字幕维护清单', '', '> 文档是唯一真实台词来源。状态：**缺音频**（待补 mp3）、**缺台词**（有 mp3、无台词）、**已配齐**（有 mp3、有台词）。', '> `voice.mjs reorganize` 仅重排（以文档现有语音为准、尊重手动删除，文档提到但缺表格的语音补齐）；`gen` 以音频为准全量列出；`write [--apply]` 写回代码。', ''];
  for (const s of STAT_ORDER) {
    const ck = Object.keys(byStatus[s] || {}).sort(cmpChar);
    if (!ck.length) continue;
    const n = ck.reduce((x, k) => x + byStatus[s][k].length, 0);
    md.push(`## ${STAT_TITLE[s]}（${n}）`, '');
    for (const k of ck) {
      md.push(`### ${nameOf(k)}（${k}）　〔${factionOf(k)}〕`, '', '| 类型 | 条目 | 音频文件 | 台词 |', '|---|---|---|---|');
      for (const r of byStatus[s][k]) md.push(`| ${r.type} | ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`);
      md.push('');
    }
  }
  if (combos.length) { md.push('---', '## 组合阵亡（复用主角色）', '', '| 条目 | 音频文件 | 台词 |', '|---|---|---|'); for (const r of combos) md.push(`| ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`); md.push(''); }

  await writeFile(DOC, md.join('\n'), 'utf8');
  const all = Object.values(rowsByChar).flat();
  console.log(`✓ reorganize 完成：主条目 ${all.length}（已配齐 ${all.filter((r) => r.status === DONE).length}，缺台词 ${all.filter((r) => r.status === TEXT).length}，缺音频 ${all.filter((r) => r.status === AUDIO).length}）；组合阵亡 ${combos.length}。`);
}

// ═════════════════════════  clear：删除 translate 中残留的台词键（$ / ~）═══
// 把每个角色 translate 里已经写下的台词键（'$bts_<技能><N>' / '~bts_<资源名>'）全部删除，
// 使 translate 只留普通翻译键（角色名/技能名/info）。配合 write 按新规范（末尾、skills 顺序）
// 重新写入，用于清理早期「台词散落在 translate 前部」的旧结构。默认预览，--apply 才写盘。
const VOICE_KEY_LINE = /^\s*(?:['"]?)((?:\$bts_[\w]+\d)|(?:~bts_[\w]+))['"]?\s*:/;
async function clearVoiceKeys() {
  let removed = 0, files = 0;
  for (const full of await walk(rolesRoot, '.js')) {
    const src = await readFile(full, 'utf8');
    const lines = src.split('\n');
    const start = lines.findIndex((l) => /\bexport\s+const\s+translate\s*=\s*\{/.test(l));
    if (start < 0) continue;
    const endChar = translateEnd(src);
    if (endChar < 0) continue;
    // 闭 } 所在行号（0 基）
    const endLine = src.slice(0, endChar).split('\n').length - 1;
    const toRemove = new Set();
    for (let i = start; i <= endLine; i++) if (VOICE_KEY_LINE.test(lines[i])) toRemove.add(i);
    if (!toRemove.size) continue;
    // 重组 translate：保留声明行与闭行，中间去掉台词键行，压缩多余空行（连续空行≤1、去首尾空行）
    const core = [];
    let prevEmpty = false;
    for (let i = start + 1; i < endLine; i++) {
      if (toRemove.has(i)) continue;
      const empty = lines[i].trim() === '';
      if (empty) { if (!prevEmpty) core.push(''); prevEmpty = true; }
      else { core.push(lines[i]); prevEmpty = false; }
    }
    while (core.length && core[0].trim() === '') core.shift();
    while (core.length && core[core.length - 1].trim() === '') core.pop();
    const head = lines.slice(0, start + 1);
    const tail = lines.slice(endLine);
    const next = head.join('\n') + (core.length ? '\n' + core.join('\n') : '') + '\n' + tail.join('\n');
    if (!applyWrite) console.log(`◇ clear ${basename(full)}：删除台词键 ${toRemove.size}`);
    else await writeFile(full, next);
    removed += toRemove.size; files++;
  }
  console.log(`clear 预览：将删除 ${removed} 个台词键（${files} 个文件）。${applyWrite ? '已写盘。' : '加 --apply 写盘。'}`);
}

// ═════════════════════════  syncDie：形态角色阵亡音频复用主角色  ═════════════════
// 把每个含 transformCharacter 的角色的「主形态 array 音频」(audio/die/<主>.mp3)
// 复制为各纯形态 id 的 die 文件（audio/die/<形态id>.mp3），使形态角色也能播放阵亡。
// 台词用主角色（gen 已对形态条目取主台词）。默认预览，--apply 才写盘。
async function syncDie() {
  let copied = 0, files = 0;
  const missingMain = new Set();
  for (const full of await walk(rolesRoot, '.js')) {
    const src = await readFile(full, 'utf8');
    const chars = roleBlocks(src, 'character');
    const morphs = roleBlocks(src, 'transformCharacter').filter((b) => !/_and_/.test(b.id));
    const main = chars[0]?.id;
    if (!main || !morphs.length) continue;
    let mainBuf = null;
    try { mainBuf = await readFile(join(audioDie, `${main}.mp3`)); } catch { if (applyWrite) missingMain.add(main); continue; }
    let changedHere = false;
    for (const mb of morphs) {
      const dst = join(audioDie, `${mb.id}.mp3`);
      let same = false;
      try { same = (await readFile(dst)).equals(mainBuf); } catch { /* 目标不存在 */ }
      if (same) continue;
      if (!applyWrite) console.log(`◇ 复用 ${main}.mp3 → ${mb.id}.mp3`);
      else await writeFile(dst, mainBuf);
      copied++; changedHere = true;
    }
    if (changedHere) files++;
  }
  console.log(`syncDie ${applyWrite ? '完成' : '预览'}：将${applyWrite ? '已' : ''}为 ${files} 个文件复制 ${copied} 个形态阵亡音频${applyWrite ? '' : '（--apply 写盘）'}。`);
  if (missingMain.size) console.log(`  ⚠ 主角色缺阵亡音频（无法复用，跳过）：${[...missingMain].join(', ')}`);
}

async function run() {
  const interactive = !cmd;
  let action = cmd;
  // 无参数（未显式子命令）：交互菜单选择 + 可能的“是否应用”二次确认，
  // 都在同一交互会话内完成，最后统一关闭（避免管道/终端多行输入被提前丢弃）。
  if (interactive) {
    const choice = await menu('请选择语音清单操作:', [
      { label: 'gen — 重建技能语音字幕填充清单（doc ← code）', value: 'gen' },
      { label: 'reorganize — 仅重排现有清单（尊重手动删除，补齐缺表格的语音）', value: 'reorganize' },
      {
        label: `write — 写回台词到角色 translate（doc → code；${applyWrite ? '写盘' : '预览，选中后再确认是否写盘'}）`,
        value: 'write',
      },
      { label: 'clear — 删除 translate 中残留的台词键（$ / ~，便于重排）', value: 'clear' },
      { label: 'syncdie — 形态角色阵亡音频复用（复制主角色 die 文件）', value: 'syncdie' },
    ]);
    if (!choice) {
      console.log('已取消');
      return;
    }
    action = choice.value;
    // 只有需要“写盘”的操作才做二次确认；其它（gen/reorganize 本就旨在写文档）直接用
    if (['write', 'clear', 'syncdie'].includes(action) && !applyWrite) {
      const verb = action === 'clear' ? '删除 translate 台词键并写盘' : action === 'syncdie' ? '复制形态阵亡音频文件' : '将台词写入角色代码（translate）';
      applyWrite = await confirm(`是否真正${verb}？`);
    }
    closeInteractive();
  }
  if (action === 'gen') await gen();
  else if (action === 'reorganize') await reorganize();
  else if (action === 'write') await writeBack();
  else if (action === 'clear') await clearVoiceKeys();
  else if (action === 'syncdie') await syncDie();
  else console.log('用法: node scripts/voice.mjs gen|reorganize|write|clear|syncdie');
}

await run();