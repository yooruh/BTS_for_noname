#!/usr/bin/env node
/**
 * 语音档案维护工具（npm run voice）：角色数据经 lib/roles.mjs 直接 import（bts-loader 改道
 * noname.js 存根）；仅「注释掉的台词键」与写回定位走文本级处理（import 不见注释）。
 *
 * 台词来源：源 translate 的非注释 $ / ~ 台词键（无名杀既有）优先，文档台词仅兜底（保留手填）。
 * $ / ~ 键打包期由 audioPaths.js 归一为引擎 `#` 键（见《文案与语音规范》§2.2）。
 *
 * 用法（gen/reorganize 直接写文档；write/clear/syncdie 默认预览、--apply 才写盘）：
 *   node scripts/voice.mjs gen        按「音频 + 文档台词」重建文档（含 BGM 配齐检查）：有 mp3 一律列出、
 *       幂等、保留手填；已定义技能无 mp3 自动预留 2 个空位归「缺音频」（豁免：scripts/voice-exclude.txt）；
 *       末段列缺 BGM（主角色 audio/bgm/<角色id>.mp3，.bgm/.all 豁免）。
 *   node scripts/voice.mjs reorganize 仅重排现有清单（以文档为准、不复活手动删去的条目，不重扫音频；文档提到
 *       却缺表格的语音会补齐）。
 *   node scripts/voice.mjs write      把文档台词写回代码 translate（缺台词插入、不一致则更新）。
 *   node scripts/voice.mjs clear      清除 translate 中残留的台词键（$ / ~），便于按新规范重写。
 *   node scripts/voice.mjs syncdie    形态角色阵亡音频复用（纯形态 + _and_ 组合）：主角色 audio/die/<主>.mp3
 *       复制为形态 die 文件。
 *   node scripts/voice.mjs exclude [list|add|remove] [id…]  检查豁免清单管理（scripts/voice-exclude.txt）：
 *       后缀语义见「检查豁免清单」节；支持 * 通配；无参=交互菜单。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { menu, prompt, confirm, closeInteractive } from './lib/interactive.mjs';
import { PACKS, loadAllRoleMods, relRolePath, rolesRootOf } from './lib/roles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = resolve(root, '..', '文档', '技能语音字幕填充清单.md');
const audioSkill = join(root, 'audio', 'skill');
const audioDie = join(root, 'audio', 'die');
const audioBgm = join(root, 'audio', 'bgm');
// 各角色包的角色目录（bts / diy…；新增角色包只需登记 lib/roles.mjs 的 PACKS）
const ROLE_ROOTS = PACKS.map((pack) => rolesRootOf(pack.dir));

const cmd = process.argv[2];
// 是否写盘：命令行 --apply 置 true；交互菜单里选 write 时再用 y/N 二次确认（见 run()）
let applyWrite = process.argv.includes('--apply');

async function walk(dir, ext) {
  const out = [];
  try { async function go(d) { for (const e of await readdir(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) await go(f); else if (e.isFile() && e.name.endsWith(ext)) out.push(f); } } await go(dir); } catch {}
  return out;
}
/** 全部角色包的角色文件（bts + diy…）。 */
async function allRoleFiles() {
  const out = [];
  for (const dir of ROLE_ROOTS) out.push(...(await walk(dir, '.js')));
  return out;
}
const esc = (s) => s.replace(/\|/g, '\\|');

// 读取音频
const audioSkillLines = {};
for (const f of await walk(audioSkill, '.mp3')) { const m = /^(bts_[\w]+?)(\d+)$/.exec(basename(f, '.mp3')); if (m) (audioSkillLines[m[1]] ??= new Set()).add(Number(m[2])); }
const dieFiles = new Set((await walk(audioDie, '.mp3')).map((f) => basename(f, '.mp3')));
const bgmFiles = new Set((await walk(audioBgm, '.mp3')).map((f) => basename(f, '.mp3')));
// ── 角色数据：经 lib/roles.mjs 直接 import 角色对象 ──
// mod.character（含 skills）、mod.transformCharacter（形态/_and_）、mod.skill 顶层键、mod.translate（$ / ~ 台词键）。
const roleMods = await loadAllRoleMods();
// 角色结构：cInfo(全角色/形态 id)、skillOwner(技能→所属)、dieReuse(形态→主角色)、roleFile(id→文件)、comboIds(_and_ 组合)。
const cInfo = {}, skillOwner = {}, nameById = {}, dieReuse = {}, roleFile = {};
const comboIds = new Set();
const cjk = (s) => /[一-鿿]/.test(s);
for (const [full, mod] of roleMods) {
  const rel = relRolePath(full);
  const fileStem = basename(rel, '.js');
  const faction = dirname(rel);
  const chars = Object.entries(mod.character ?? {}).map(([id, def]) => ({ id, skills: def?.skills ?? [] }));
  const morphs = Object.entries(mod.transformCharacter ?? {}).map(([id, def]) => ({ id, skills: def?.skills ?? [] }));
  const charKey = chars[0]?.id || `bts_ch_${fileStem}`; // 主形态（兜底文件名）
  // 技能归属：优先按各块 skills[] 归到真正所属 id（形态专属技能不再并到主形态）
  const seen = new Set();
  for (const c of chars) for (const s of c.skills) if (!seen.has(s)) { skillOwner[s] = c.id; seen.add(s); }
  for (const mb of morphs) for (const s of mb.skills) if (!seen.has(s)) { skillOwner[s] = mb.id; seen.add(s); }
  // 兜底：文件级 skill 对象里、未归属任一 skills 的技能归主形态（本扩展技能都带 bts_ 前缀，
  // 过滤掉 group/mark 等块内属性键）
  for (const k of Object.keys(mod.skill ?? {})) if (!skillOwner[k] && /^bts_/.test(k)) skillOwner[k] = charKey;
  // 中文名：translate 直取 1-10 字短字符串（排除长 info/英文）；同键多值时仅 CJK 值可覆盖已有值。
  for (const [k, v] of Object.entries(mod.translate ?? {})) {
    if (!/^bts_[\w]+$/.test(k) || typeof v !== 'string' || v.length < 1 || v.length > 10) continue;
    if (nameById[k] == null || cjk(v)) nameById[k] = v;
  }
  // 主形态
  cInfo[charKey] = { faction, name: nameById[charKey] || fileStem.slice(7) };
  roleFile[charKey] = full;
  // 形态：纯形态(非 _and_)进 cInfo 并复用主形态阵亡；组合(_and_)计入 comboIds
  for (const mb of morphs) {
    if (/_and_/.test(mb.id)) { comboIds.add(mb.id); roleFile[mb.id] = full; continue; }
    cInfo[mb.id] = { faction, name: nameById[mb.id] || mb.id };
    dieReuse[mb.id] = charKey;
    roleFile[mb.id] = full;
  }
}

// ── 检查豁免清单（scripts/voice-exclude.txt；.die/.all 与 rebuild --audio 共用）────────────────────────────
// 每行一个条目；# 注释、空行忽略；* 通配；剥后缀后须 bts_ 开头（防误配）。
// 后缀语义：
//   无后缀    技能语音——gen 不预留「缺音频」空位、reorganize 剔除条目、write 跳过其台词行；
//   <id>.die  阵亡语音（按主角色判定，形态/组合随主）——gen 不列其占位、write 跳过其 ~ 台词行；
//   <id>.bgm  BGM 配齐检查（主角色）——“源侧与仓库均无、留空”者不列缺；
//   <id>.all  整个角色——技能 + 阵亡 + BGM 全部豁免（技能语义同无后缀，作用于该角色名下技能）。
const EXCLUDE_FILE = join(root, 'scripts', 'voice-exclude.txt');
const EXCL_SUFFIX = /\.(bgm|die|all)$/;
const globToRe = (p) => new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
const exclEntries = [];
{
  let raw = '';
  try { raw = await readFile(EXCLUDE_FILE, 'utf8'); } catch { console.warn(`⚠ 豁免清单不存在（按空处理）：${EXCLUDE_FILE}`); }
  for (const line of raw.split(/\r?\n/)) {
    const p = line.replace(/#.*$/, '').trim();
    if (!p) continue;
    const sm = EXCL_SUFFIX.exec(p);
    const scope = sm ? sm[1] : 'skill';
    const id = sm ? p.slice(0, -sm[0].length) : p;
    if (!/^bts_/.test(id)) { console.warn(`⚠ 豁免清单忽略非法条目（须 bts_ 开头）：${p}`); continue; }
    if (!exclEntries.some((e) => e.p === p)) exclEntries.push({ p, id, scope, re: globToRe(id), hits: [] });
  }
}
const matchesExcl = (id, scopes) => exclEntries.some((e) => scopes.includes(e.scope) && e.re.test(id));
// 技能豁免：技能 id 直接命中（无后缀/整角条目）或所属角色被 .all 命中
const isExcluded = (id) => matchesExcl(id, ['skill']) || (skillOwner[id] ? matchesExcl(skillOwner[id], ['all']) : false);
// 阵亡豁免：按主角色判定（纯形态→主；_and_ 组合→主段）；也可直接写形态/组合 id 条目
const dieOwnerOf = (id) => {
  if (dieReuse[id]) return dieReuse[id];
  const mm = /^(bts_[a-z0-9_]+?)_and_/.exec(id);
  return mm ? mm[1] : id;
};
const isDieExcluded = (id) => matchesExcl(id, ['die', 'all']) || (dieOwnerOf(id) !== id && matchesExcl(dieOwnerOf(id), ['die', 'all']));
// BGM 豁免：主角色 id 命中 .bgm/.all
const isBgmExcluded = (id) => matchesExcl(id, ['bgm', 'all']);
// 命中统计（各 scope 检查域）：技能 / 角色（阵亡按 cInfo 全量、BGM 按主角色）
const allSkillIds = [...new Set([...Object.keys(skillOwner), ...Object.keys(audioSkillLines)])].sort();
const mainCharIds = Object.keys(cInfo).filter((id) => !dieReuse[id]).sort();
// 阵亡条目的检查域 = 角色表 + die 音频文件集（换肤等无角色注册的遗留文件也能命中）
const dieDomain = [...new Set([...Object.keys(cInfo), ...dieFiles])];
for (const e of exclEntries) {
  e.hits = [...new Set([
    ...(e.scope === 'skill' || e.scope === 'all' ? allSkillIds.filter((id) => e.re.test(id)) : []),
    ...(e.scope === 'die' || e.scope === 'all' ? dieDomain.filter((id) => e.re.test(id)) : []),
    ...(e.scope === 'bgm' || e.scope === 'all' ? mainCharIds.filter((id) => e.re.test(id)) : []),
  ])];
}
const exclMatched = [...new Set(exclEntries.flatMap((e) => e.hits))].sort();
const EXCL_SCOPE_NAME = { skill: '技能', die: '阵亡', bgm: 'BGM', all: '整角' };
const exclHeaderLine = () => `> 检查豁免：${exclEntries.length} 条（${Object.entries(EXCL_SCOPE_NAME).map(([s, n]) => `${n} ${exclEntries.filter((e) => e.scope === s).length}`).join(' / ')}）；清单文件 \`zip/scripts/voice-exclude.txt\`，\`node scripts/voice.mjs exclude\` 管理。`;

// ── 读文档台词（跨次保留；仅作代码台词的兜底）──────────────────────────────
const userText = new Map();
try { for (const line of (await readFile(DOC, 'utf8')).split('\n')) { const m = /audio\/(?:skill|die)\/[A-Za-z0-9_]+\.mp3/.exec(line); if (!m || !line.includes('|')) continue; const cells = line.split('|'); const t = (cells[cells.length - 2] || '').trim(); if (t) userText.set(m[0], t); } } catch {}
// ── 源 translate 台词键（非注释 $ / ~ 键）→ 首选台词来源 ────────────────────
// 代码台词（无名杀既有）优先于文档；文档台词仅兜底（保留手填）。
// 注释掉的台词键（'$bts_<技能><N>' / '~bts_<资源名>'）import 不可见，天然不读。
const codeVoice = new Map();
for (const [, mod] of roleMods) {
  for (const [k, v] of Object.entries(mod.translate ?? {})) {
    if (typeof v !== 'string') continue;
    let m = /^\$(bts_[\w]+?)(\d+)$/.exec(k);
    if (m) { codeVoice.set(`audio/skill/${m[1]}${m[2]}.mp3`, v); continue; }
    m = /^~(bts_[A-Za-z0-9_]+)$/.exec(k);
    if (m) codeVoice.set(`audio/die/${m[1]}.mp3`, v);
  }
}

// ═════════════════════════  gen：重建文档  ═════════════════════════════
// 已定义技能无 mp3 → 预留 RESERVE_SIZE 个空位（缺音频占位）；不需要语音的（mod技等）加 scripts/voice-exclude.txt 豁免，其余自动。
const RESERVE_SIZE = 2;

// ── BGM 配齐检查（主角色 ↔ zip/audio/bgm/<角色id>.mp3）──────────────────────
function collectBgmRows() {
  const missing = [], exempt = [], exemptWithData = [];
  for (const ck of mainCharIds) {
    const has = bgmFiles.has(ck);
    if (isBgmExcluded(ck)) { exempt.push(ck); if (has) exemptWithData.push(ck); continue; }
    if (!has) missing.push(ck);
  }
  return { missing, exempt, exemptWithData };
}
function pushBgmSection(md, bgmRows, nameOf) {
  md.push('---', '## BGM 配齐（主公跟随 / 技能切换用）', '', '> 数据源：`zip/audio/bgm/<角色id>.mp3`（角色专属曲）。缺 BGM 的角色若「太阳神源侧与仓库均无」属留空，在豁免清单写 `<角色id>.bgm` 后不再列出。', '');
  const fmt = (k) => `${nameOf(k)}（${k}）`;
  md.push(`### 缺 BGM（${bgmRows.missing.length}）`, '', bgmRows.missing.length ? bgmRows.missing.map(fmt).join('、') : '（无——未豁免的主角色全部配有 BGM）', '');
  if (bgmRows.exempt.length) md.push(`### 已豁免（${bgmRows.exempt.length}）`, '', bgmRows.exempt.map(fmt).join('、'), '');
}

async function gen() {
  const DONE = '已配齐', TEXT = '缺台词', AUDIO = '缺音频';
  const st = (a, t) => (!a ? AUDIO : (t ? DONE : TEXT));
  const rowsByChar = {};
  const push = (k, r) => (rowsByChar[k] ??= []).push(r);
  const cell = (mp3, has) => has ? `[${mp3}](../zip/${mp3})` : `\`${mp3}\`（待补）`;
  // 技能来源统一过滤 bts_ 前缀（排除 group/mark 误判）；userText 仅保留规范前缀（bts_sk_/bts_mk_ 等），防旧键自续。
  const sk = new Set([...Object.keys(audioSkillLines),
    ...[...userText.keys()].filter((p) => /^audio\/skill\/bts_(?:sk|mk|bless|abnormal|n|pet|shield|curse)_/.test(p)).map((p) => p.slice(12).replace(/\d+\.mp3$/, '')),
    ...Object.keys(skillOwner)].filter((s) => /^bts_/.test(s)));
  const excludedWithData = [];
  for (const s of [...sk].sort()) {
    const idx = audioSkillLines[s] || new Set();
    const dn = [...userText.keys()].filter((p) => new RegExp(`^audio/skill/${s}\\d+\\.mp3$`).test(p)).map((p) => Number(p.slice(12 + s.length, -4)));
    // 排除清单：无语音技能完全跳过（若检测到其已有音频/台词，记录异常供复核）
    if (isExcluded(s)) { if (idx.size || dn.length) excludedWithData.push(s); continue; }
    // 完全无 mp3 的技能：自动预留 RESERVE_SIZE 个空位（缺音频占位）
    let maxN = Math.max(...idx, ...dn, 0);
    if (idx.size === 0 && dn.length === 0) maxN = Math.max(maxN, RESERVE_SIZE);
    if (!maxN) continue;
    const label = nameById[s] ? `${nameById[s]}（${s}）` : s;
    for (let n = 1; n <= maxN; n++) {
      const mp3 = `audio/skill/${s}${n}.mp3`; const a = idx.has(n);
      // 台词优先级：代码（无名杀既有台词）> 文档（兜底保留手填）
      const text = codeVoice.get(mp3) || userText.get(mp3) || '';
      const t = !!text;
      // 无音频也无台词的空位：作为缺音频占位列出（排除清单已在循环头跳过）
      if (!a && !t) { push(skillOwner[s] || '未归属', { type: '技能', label, mp3: cell(mp3, false), status: AUDIO, text: '' }); continue; }
      push(skillOwner[s] || '未归属', { type: '技能', label, mp3: cell(mp3, a), status: st(a, t), text });
    }
  }
  // 阵亡：按 cInfo 的角色（含形态）。形态角色复用主角色 die（音频用 syncdie 复制文件、台词取主）。
  // 两缺（无 mp3 且无台词）：主角色/独立角色列为「缺音频」占位（供对照太阳神源补齐）；纯形态随主角色行体现。
  const dieExemptWithData = [];
  for (const ck of Object.keys(cInfo)) {
    const reuse = dieReuse[ck]; // 形态→主
    const srcId = reuse || ck;
    const mp3 = `audio/die/${ck}.mp3`;
    const srcMp3 = reuse ? `audio/die/${srcId}.mp3` : mp3;
    const a = dieFiles.has(ck);
    // 台词优先级：代码（无名杀既有台词）> 文档（兜底保留手填）
    const text = codeVoice.get(srcMp3) || userText.get(srcMp3) || '';
    const t = !!text;
    // 阵亡豁免（.die/.all，按主角色判定）：不进清单；若检测到已有音频/台词记录告警
    if (isDieExcluded(ck)) { if (a || t) dieExemptWithData.push(ck); continue; }
    if (!a && !t) {
      if (!reuse) push(ck, { type: '阵亡', label: `${cInfo[ck].name} 阵亡`, mp3: cell(mp3, false), status: AUDIO, text: '' });
      continue;
    }
    push(ck, { type: '阵亡', label: `${cInfo[ck].name} 阵亡`, mp3: cell(mp3, a), status: !a ? AUDIO : (t ? DONE : TEXT), text });
  }
  // 组合阵亡：音频与台词均复用主角色（_and_ 台词严格取 audio/die/<主>.mp3 的 $ ~ 文本，同纯形态）。
  const combos = [];
  for (const d of [...dieFiles].sort()) { if (Object.hasOwn(cInfo, d)) continue; if (!/_and_/.test(d)) { combos.push({ label: `${nameById[d] ? nameById[d] : d}`, mp3: cell(`audio/die/${d}.mp3`, true), text: codeVoice.get(`audio/die/${d}.mp3`) || userText.get(`audio/die/${d}.mp3`) || '' }); continue; } const mm = /^(bts_[a-z0-9_]+?)_and_/.exec(d); combos.push({ label: `${d}（复用 ${mm[1]}）`, mp3: cell(`audio/die/${d}.mp3`, true), text: codeVoice.get(`audio/die/${mm[1]}.mp3`) || userText.get(`audio/die/${mm[1]}.mp3`) || '' }); }
  // 输出
  const STAT_ORDER = [DONE, TEXT, AUDIO], STAT_TITLE = { [DONE]: '已配齐', [TEXT]: '缺台词', [AUDIO]: '缺音频' };
  const byStatus = {};
  const bgmRows = collectBgmRows();
  const nameOf = (k) => cInfo[k]?.name || k.replace(/^bts_ch_/, '');
  const factionOf = (k) => cInfo[k]?.faction || '';
  const cmpChar = (a, b) => { const fa = factionOf(a), fb = factionOf(b); return fa === fb ? nameOf(a).localeCompare(nameOf(b), 'zh') : fa.localeCompare(fb, 'zh'); };
  for (const [ck, rows] of Object.entries(rowsByChar)) for (const r of rows) { (byStatus[r.status] ??= {})[ck] ??= []; byStatus[r.status][ck].push(r); }
  let md = ['# 技能语音字幕维护清单', '', '> 状态：**缺音频**（待补 mp3）、**缺台词**（有 mp3、无台词）、**已配齐**（有 mp3、有台词）。台词来源：代码（源 translate 非注释 $ / ~ 键）优先，文档兜底（保留手填）。', '> `node scripts/voice.mjs gen` 重建（有 mp3 一律列出，删掉的技能/阵亡归回缺台词类）；`write [--apply]` 写回代码。', exclHeaderLine(), ''];
  for (const s of STAT_ORDER) { const ck = Object.keys(byStatus[s] || {}).sort(cmpChar); if (!ck.length) continue; const n = ck.reduce((x, k) => x + byStatus[s][k].length, 0); md.push(`## ${STAT_TITLE[s]}（${n}）`, ''); for (const k of ck) { md.push(`### ${nameOf(k)}（${k}）　〔${factionOf(k)}〕`, '', '| 类型 | 条目 | 音频文件 | 台词 |', '|---|---|---|---|'); for (const r of byStatus[s][k]) md.push(`| ${r.type} | ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`); md.push(''); } }
  if (combos.length) { md.push('---', '## 组合阵亡（复用主角色）', '', '| 条目 | 音频文件 | 台词 |', '|---|---|---|'); for (const r of combos) md.push(`| ${esc(r.label)} | ${r.mp3} | ${esc(r.text)} |`); md.push(''); }
  pushBgmSection(md, bgmRows, nameOf);
  await writeFile(DOC, md.join('\n'), 'utf8');
  const all = Object.values(rowsByChar).flat();
  console.log(`✓ gen 完成：主条目 ${all.length}（已配齐 ${all.filter((r) => r.status === DONE).length}，缺台词 ${all.filter((r) => r.status === TEXT).length}，缺音频 ${all.filter((r) => r.status === AUDIO).length}）；组合阵亡 ${combos.length}。`);
  console.log(`  · 豁免清单：${exclEntries.length} 条（${Object.entries(EXCL_SCOPE_NAME).map(([s, n]) => `${n} ${exclEntries.filter((e) => e.scope === s).length}`).join(' / ')}）命中 ${exclMatched.length} 项。`);
  console.log(`  · BGM：缺 ${bgmRows.missing.length}（已豁免 ${bgmRows.exempt.length}）。`);
  const exclUnmatched = exclEntries.filter((e) => !e.hits.length);
  if (exclUnmatched.length) console.log(`  ⚠ 未命中任何对象的条目（拼写/已删？）：${exclUnmatched.map((e) => e.p).join('、')}`);
  if (excludedWithData.length) console.log(`  ⚠ 豁免技能检测到已有音频/台词（建议复核）：${excludedWithData.join('、')}`);
  if (dieExemptWithData.length) console.log(`  ⚠ 阵亡豁免检测到已有音频/台词（建议复核）：${dieExemptWithData.join('、')}`);
  if (bgmRows.exemptWithData.length) console.log(`  ⚠ BGM 豁免检测到已有曲目（建议复核）：${bgmRows.exemptWithData.join('、')}`);
}

// ═════════════════════════  write：doc→code  ═════════════════════════════
// ── 台词块辅助：新台词插 translate 末尾、按 skills 排序、阵亡最后 ──
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
  for (const full of await allRoleFiles()) {
    const src = await readFile(full, 'utf8');
    const mod = roleMods.get(full);
    const fileStem = basename(relRolePath(full), '.js');
    const charKey = Object.keys(mod?.character ?? {})[0] || `bts_ch_${fileStem}`;
    // 活动台词键（非注释 $ / ~）：import 只见非注释键，直接读 translate 对象；
    // 注释掉的台词键（// '$…'/ '~…'）import 不可见，仍用文本扫（write 跳过、不误判为待插）
    for (const [k, v] of Object.entries(mod?.translate ?? {})) {
      if (typeof v !== 'string') continue;
      let m = /^\$(bts_[\w]+?)(\d+)$/.exec(k);
      if (m) { activeVal[`${m[1]}|${m[2]}`] = v; continue; }
      m = /^~(bts_[A-Za-z0-9_]+)$/.exec(k);
      if (m) activeVal[`die:${m[1]}`] = v;
    }
    for (const m of src.matchAll(/^[ \t]*\/\/\s*['"]?\$(bts_[\w]+?)(\d+)/gm)) keptKeys.add(`${m[1]}|${m[2]}`);
    for (const m of src.matchAll(/^[ \t]*\/\/\s*['"]?~(bts_[A-Za-z0-9_]+)/gm)) keptKeys.add(`die:${m[1]}`);
  }
  const charFile = roleFile; // 用全局 id→文件 映射（含 character/transformCharacter 的形态 id——纯形态与 _and_ 组合的阵亡键均可写回各自角色文件）
  const ins = new Map(), upd = new Map(), skip = [];
  for (const line of (await readFile(DOC, 'utf8')).split('\n')) { const m3 = /audio\/(?:skill|die)\/[A-Za-z0-9_]+\.mp3/.exec(line); if (!m3 || !line.trim().startsWith('|')) continue; const c = line.split('|'); const text = (c[c.length - 2] || '').trim(); if (!text) continue; const p = m3[0];
    let key, kid, ck;
    if (p.startsWith('audio/skill/')) { const m = /^audio\/skill\/(bts_[\w]+?)(\d+)\.mp3$/.exec(p); if (!m) continue; if (isExcluded(m[1])) { skip.push(`'$${m[1]}${m[2]}'（已豁免）`); continue; } key = `'$${m[1]}${m[2]}'`; kid = `${m[1]}|${m[2]}`; ck = skillOwner[m[1]]; }
    else { const m = /^audio\/die\/(bts_[A-Za-z0-9_]+)\.mp3$/.exec(p); if (!m) continue; if (isDieExcluded(m[1])) { skip.push(`'~${m[1]}'（已豁免）`); continue; } key = `'~${m[1]}'`; kid = `die:${m[1]}`; ck = m[1]; }
    if (!ck || !charFile[ck]) { skip.push(`${key}（无归属）`); continue; }
    const old = activeVal[kid];
    if (old !== undefined) { if (old === text) continue; if (!upd.has(charFile[ck])) upd.set(charFile[ck], new Map()); upd.get(charFile[ck]).set(key, { jsonVal: JSON.stringify(text), old }); }
    else if (keptKeys.has(kid)) { skip.push(`${key}（代码注释）`); }
    else { if (!ins.has(charFile[ck])) ins.set(charFile[ck], new Map()); ins.get(charFile[ck]).set(key, JSON.stringify(text)); } }
  const ANCHOR = /export\s+const\s+translate\s*=\s*\{/; let ni = 0, nu = 0;
  for (const f of new Set([...ins.keys(), ...upd.keys()])) { let src = await readFile(f, 'utf8'); const mod = roleMods.get(f);
    if (ins.has(f)) {
      // 新台词统一插到 translate 末尾，前面空一行，按主形态 character.skills 顺序、阵亡最后
      const end = translateEnd(src);
      if (end < 0) { console.log(`✗ 无 translate 块: ${basename(f)}`); continue; }
      const skills = Object.values(mod?.character ?? {})[0]?.skills?.filter((s) => /^bts_/.test(s)) ?? [];
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
  let excludedDropped = 0, excludedDieDropped = 0;

  for (const [mp3, text] of docMp3) {
    if (mp3.startsWith('audio/skill/')) {
      const m = /^audio\/skill\/(bts_[\w]+?)(\d+)\.mp3$/.exec(mp3);
      if (!m) continue;
      if (isExcluded(m[1])) { excludedDropped++; continue; }
      const a = (audioSkillLines[m[1]] ?? new Set()).has(Number(m[2]));
      const owner = skillOwner[m[1]] || '未归属';
      const label = nameById[m[1]] ? `${nameById[m[1]]}（${m[1]}）` : m[1];
      push(owner, { type: '技能', label, mp3: cell(mp3, a), status: st(a, !!text), text });
    } else {
      const m = /^audio\/die\/(bts_[A-Za-z0-9_]+)\.mp3$/.exec(mp3);
      if (!m) continue;
      const d = m[1];
      if (isDieExcluded(d)) { excludedDieDropped++; continue; }
      const a = dieFiles.has(d);
      // 组合 / 无 cInfo 归属的独立阵亡音频 → 组合阵亡区（与 gen 的 dieFiles 分流一致）
      if (/_and_/.test(d) || !cInfo[d]) {
        const mm = /^(bts_[a-z0-9_]+?)_and_/.exec(d);
        // 组合台词严格复用主角色（与 gen 一致：取主角色文档行；主行无台词时保留本行现值）
        const inherit = mm ? docMp3.get(`audio/die/${mm[1]}.mp3`) : '';
        combos.push({ label: mm ? `${d}（复用 ${mm[1]}）` : nameById[d] ? nameById[d] : d, mp3: cell(mp3, a), text: inherit || text });
        continue;
      }
      push(d, { type: '阵亡', label: `${cInfo[d].name} 阵亡`, mp3: cell(mp3, a), status: st(a, !!text), text });
    }
  }

  // 输出：三大状态 → 角色；再附组合阵亡与 BGM 配齐
  const STAT_ORDER = [DONE, TEXT, AUDIO], STAT_TITLE = { [DONE]: '已配齐', [TEXT]: '缺台词', [AUDIO]: '缺音频' };
  const nameOf = (k) => cInfo[k]?.name || k.replace(/^bts_ch_/, '');
  const factionOf = (k) => cInfo[k]?.faction || '';
  const byStatus = {};
  const bgmRows = collectBgmRows();
  for (const [ck, rows] of Object.entries(rowsByChar)) for (const r of rows) { (byStatus[r.status] ??= {})[ck] ??= []; byStatus[r.status][ck].push(r); }
  const cmpChar = (a, b) => { const fa = factionOf(a), fb = factionOf(b); return fa === fb ? nameOf(a).localeCompare(nameOf(b), 'zh') : fa.localeCompare(fb, 'zh'); };

  let md = ['# 技能语音字幕维护清单', '', '> 状态：**缺音频**（待补 mp3）、**缺台词**（有 mp3、无台词）、**已配齐**（有 mp3、有台词）。台词来源：代码（源 translate 非注释 $ / ~ 键）优先，文档兜底（保留手填）。', '> `voice.mjs reorganize` 仅重排（以文档现有语音为准、尊重手动删除，文档提到但缺表格的语音补齐）；`gen` 以音频为准全量列出；`write [--apply]` 写回代码。', exclHeaderLine(), ''];
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

  pushBgmSection(md, bgmRows, nameOf);
  await writeFile(DOC, md.join('\n'), 'utf8');
  const all = Object.values(rowsByChar).flat();
  console.log(`✓ reorganize 完成：主条目 ${all.length}（已配齐 ${all.filter((r) => r.status === DONE).length}，缺台词 ${all.filter((r) => r.status === TEXT).length}，缺音频 ${all.filter((r) => r.status === AUDIO).length}）；组合阵亡 ${combos.length}。`);
  if (excludedDropped) console.log(`  · 豁免清单跳过 ${excludedDropped} 行（技能）。`);
  if (excludedDieDropped) console.log(`  · 豁免清单跳过 ${excludedDieDropped} 行（阵亡）。`);
  console.log(`  · BGM：缺 ${bgmRows.missing.length}（已豁免 ${bgmRows.exempt.length}）。`);
}

// ═════════════════════════  clear：删除 translate 中残留的台词键（$ / ~）═══
// 把每个角色 translate 里已经写下的台词键（'$bts_<技能><N>' / '~bts_<资源名>'）全部删除，
// 使 translate 只留普通翻译键（角色名/技能名/info）。配合 write 按新规范（末尾、skills 顺序）
// 重新写入，用于清理早期「台词散落在 translate 前部」的旧结构。默认预览，--apply 才写盘。
const VOICE_KEY_LINE = /^\s*(?:['"]?)((?:\$bts_[\w]+\d)|(?:~bts_[\w]+))['"]?\s*:/;
async function clearVoiceKeys() {
  let removed = 0, files = 0;
  for (const full of await allRoleFiles()) {
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
// 含 transformCharacter 的角色：主形态 die 音频（audio/die/<主>.mp3）复制为各形态 id 文件（含 _and_ 组合）；台词同用主角色。
async function syncDie() {
  let copied = 0, files = 0;
  const missingMain = new Set();
  for (const full of await allRoleFiles()) {
    const mod = roleMods.get(full);
    const chars = Object.keys(mod?.character ?? {});
    const morphs = Object.keys(mod?.transformCharacter ?? {});
    const main = chars[0];
    if (!main || !morphs.length) continue;
    let mainBuf = null;
    try { mainBuf = await readFile(join(audioDie, `${main}.mp3`)); } catch { missingMain.add(main); continue; }
    let changedHere = false;
    for (const mb of morphs) {
      const dst = join(audioDie, `${mb}.mp3`);
      let same = false;
      try { same = (await readFile(dst)).equals(mainBuf); } catch { /* 目标不存在 */ }
      if (same) continue;
      if (!applyWrite) console.log(`◇ 复用 ${main}.mp3 → ${mb}.mp3`);
      else await writeFile(dst, mainBuf);
      copied++; changedHere = true;
    }
    if (changedHere) files++;
  }
  console.log(`syncDie ${applyWrite ? '完成' : '预览'}：将${applyWrite ? '已' : ''}为 ${files} 个文件复制 ${copied} 个形态阵亡音频${applyWrite ? '' : '（--apply 写盘）'}。`);
  if (missingMain.size) console.log(`  ⚠ 主角色缺阵亡音频（无法复用，跳过）：${[...missingMain].join(', ')}`);
}

// ═════════════════════════  exclude：检查豁免清单管理  ═════════════════════
// 清单 scripts/voice-exclude.txt（后缀语义见上）；支持 * 通配；list 显示命中详情，add/remove 直接编辑文件。
async function listExcludes() {
  console.log(`豁免清单（${EXCLUDE_FILE}）：`);
  if (!exclEntries.length) { console.log('  （空）'); return; }
  for (const e of exclEntries) console.log(`  ${e.p}  [${EXCL_SCOPE_NAME[e.scope]}] → ${e.hits.length ? `${e.hits.length} 项：${e.hits.join('、')}` : '⚠ 未命中任何对象'}`);
  console.log(`  合计命中 ${exclMatched.length} 项。`);
}
async function addExcludes(ids) {
  if (!ids.length) { console.log('用法: node scripts/voice.mjs exclude add <id…>（技能/角色 id，可带 .bgm/.die/.all 后缀；支持 * 通配）'); return; }
  const trimmed = ids.map((s) => s.trim()).filter(Boolean);
  const okExcl = (s) => /^bts_/.test(s.replace(EXCL_SUFFIX, ''));
  const bad = trimmed.filter((s) => !okExcl(s));
  if (bad.length) console.log(`✗ 忽略非法条目（须 bts_ 开头）：${bad.join('、')}`);
  const clean = [...new Set(trimmed.filter(okExcl))];
  let raw = '';
  try { raw = await readFile(EXCLUDE_FILE, 'utf8'); } catch { console.log(`（清单文件不存在，将新建：${EXCLUDE_FILE}）`); }
  const existing = new Set(raw.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean));
  const add = clean.filter((p) => !existing.has(p));
  if (!add.length) { console.log('无新增（条目已存在或输入非法）。'); return; }
  const sep = raw && !raw.endsWith('\n') ? '\n' : '';
  await writeFile(EXCLUDE_FILE, raw + sep + add.map((p) => `${p}\n`).join(''), 'utf8');
  console.log(`✓ 已添加 ${add.length} 条：${add.join('、')}（重跑 \`node scripts/voice.mjs gen\` 生效）。`);
}
async function removeExcludes(ids) {
  if (!ids.length) { console.log('用法: node scripts/voice.mjs exclude remove <id…>'); return; }
  let raw = '';
  try { raw = await readFile(EXCLUDE_FILE, 'utf8'); } catch { console.log(`（清单文件不存在：${EXCLUDE_FILE}）`); return; }
  const want = new Set(ids.map((s) => s.trim()).filter(Boolean));
  const kept = []; const removed = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(/#.*$/, '').trim();
    if (t && want.has(t)) { removed.push(t); continue; }
    kept.push(line);
  }
  if (!removed.length) { console.log('未找到匹配条目。当前清单：'); await listExcludes(); return; }
  let out = kept.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  await writeFile(EXCLUDE_FILE, out, 'utf8');
  console.log(`✓ 已移除 ${removed.length} 条：${removed.join('、')}（重跑 \`node scripts/voice.mjs gen\` 生效）。`);
}
async function excludeInteractive() {
  for (;;) {
    const choice = await menu('检查豁免清单（技能/阵亡/BGM/整角；gen/write 跳过清单内条目）:', [
      { label: 'list — 查看清单与命中详情', value: 'list' },
      { label: 'add — 添加条目（支持 .bgm/.die/.all 后缀、* 通配、逗号/空格分隔）', value: 'add' },
      { label: 'remove — 移除条目', value: 'remove' },
    ]);
    if (!choice) return;
    if (choice.value === 'list') { await listExcludes(); continue; }
    const ans = await prompt(choice.value === 'add' ? '输入要添加的 id（技能/角色，可带后缀）: ' : '输入要移除的 id / 条目: ');
    const ids = (ans || '').split(/[\s,，]+/).filter(Boolean);
    if (choice.value === 'add') await addExcludes(ids); else await removeExcludes(ids);
  }
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
      { label: 'exclude — 检查豁免清单管理（技能/阵亡/BGM/整角）', value: 'exclude' },
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
    // exclude 需保持交互会话（list/add/remove），处理完再关闭
    if (action === 'exclude') { await excludeInteractive(); closeInteractive(); return; }
    closeInteractive();
  }
  if (action === 'gen') await gen();
  else if (action === 'reorganize') await reorganize();
  else if (action === 'write') await writeBack();
  else if (action === 'clear') await clearVoiceKeys();
  else if (action === 'syncdie') await syncDie();
  else if (action === 'exclude') {
    const sub = process.argv[3]; const ids = process.argv.slice(4);
    if (sub === 'add') await addExcludes(ids);
    else if (sub === 'remove') await removeExcludes(ids);
    else if (!sub || sub === 'list') await listExcludes();
    else console.log('用法: node scripts/voice.mjs exclude [list|add|remove] [id…]');
  }
  else console.log('用法: node scripts/voice.mjs gen|reorganize|write|clear|syncdie|exclude');
}

await run();