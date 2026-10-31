#!/usr/bin/env node
/**
 * 新角色骨架生成器（只创建角色文件；默认自动 rebuild 索引）。
 *
 * 用法（zip/ 目录运行）：
 *   node scripts/scaffold.mjs role <shortName> --name <中文名> --faction <阵营>
 *        [--hp 4] [--sex male|female|none] [--title "属性·命途·称号"]
 *        [--pack bts|diy] [--dry-run] [--force] [--no-rebuild]
 *
 * 约定：
 *   - shortName 只用小写字母/数字/下划线，不带 bts_ 前缀；
 *   - 角色 ID = bts_ch_<shortName>（diy 包 = bts_diy_ch_<shortName>）；
 *   - 文件名必须等于资源主名（rebuild 校验）；
 *   - 不生成机制/技能占位对象，避免占位滤器触发审计；技能实现后把 id 加进 character.skills。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const FACTIONS = new Set([
    'xingqionglieche',
    'xinghelieshou',
    'heitakongjianzhan',
    'yaliluo',
    'pinuokangni',
    'xianzhou',
    'huangjinyi',
    'erxiangleyuan',
    'yinhe',
    'yijie',
    'xunhaiyouxia',
    'gongsi',
]);
const PACKS = {
    bts: { idPrefix: 'bts_ch_' },
    diy: { idPrefix: 'bts_diy_ch_' },
};

const argv = process.argv.slice(2);
const command = argv[0] || '';
const shortName = argv[1] || '';
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback = '') => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : argv[index + 1] || fallback;
};

if (command !== 'role') {
    console.error('用法：node scripts/scaffold.mjs role <shortName> --name <中文名> --faction <阵营> [--hp 4] [--sex female] [--title ...] [--pack bts|diy] [--dry-run] [--force] [--no-rebuild]');
    process.exit(2);
}
if (!/^[a-z0-9_]+$/.test(shortName)) {
    console.error('shortName 只能包含小写字母、数字、下划线（不带 bts_ 前缀）。');
    process.exit(2);
}
const name = valueOf('--name', '').trim();
if (!name) {
    console.error('缺少 --name <中文名>。');
    process.exit(2);
}
const faction = valueOf('--faction', '').trim();
if (!FACTIONS.has(faction)) {
    console.error(`--faction 必须是：${[...FACTIONS].join(' / ')}`);
    process.exit(2);
}
const pack = valueOf('--pack', 'bts').trim();
if (!PACKS[pack]) {
    console.error('--pack 只能是 bts 或 diy。');
    process.exit(2);
}
const hp = Number(valueOf('--hp', '4'));
if (!Number.isInteger(hp) || hp < 1 || hp > 10) {
    console.error('--hp 必须是 1-10 的整数。');
    process.exit(2);
}
const sex = valueOf('--sex', 'none').trim();
if (!['male', 'female', 'none'].includes(sex)) {
    console.error('--sex 只能是 male / female / none。');
    process.exit(2);
}
const title = valueOf('--title', '待定').trim() || '待定';
const id = `${PACKS[pack].idPrefix}${shortName}`;
const file = join(ROOT, 'source', 'character', pack, 'roles', faction, `${shortName}.js`);
const dryRun = has('--dry-run');
const force = has('--force');
const noRebuild = has('--no-rebuild');

const content = `// ${name}（scaffold 生成）—— 待实现。
// 目标：一个角色 + 若干技能；技能实现后把 bts_sk_* 加入 character.skills，并补齐 translate。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = '${faction}';
export const title = '${title.replace(/'/g, "\\'")}'; // 属性·命途·称号
export const intro = \`\${B('${name}')}：待补简略说明。\`;

export const character = {
    ${id}: {
        sex: '${sex}',
        group: '${faction}',
        hp: ${hp},
        skills: [],
    },
};

export const skill = {
    // 技能占位：实现技能对象后，把 id 加入上面的 character.skills。
    // bts_sk_${shortName}_x: { ... },
};

export const translate = {
    ${id}: '${name}',
    // bts_sk_${shortName}_x: '技能名',
};
`;

if (dryRun) {
    console.log(content);
    console.log(`目标文件：${file}`);
    process.exit(0);
}
if (existsSync(file) && !force) {
    console.error(`文件已存在：${file}（用 --force 覆盖）`);
    process.exit(1);
}
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, content, 'utf8');
console.log(`已创建：${file}`);

if (!noRebuild) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'rebuild.mjs'), '--write'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 60_000,
    });
    if (result.status !== 0) {
        console.error(`rebuild 失败：\n${(result.stdout || '').concat(result.stderr || '').trim().slice(-1200)}`);
        process.exitCode = 1;
    } else {
        console.log('已重建角色索引 / Directory.json。');
    }
}

console.log('下一步：');
console.log(`  1) 实现技能后运行 node scripts/verify.mjs --fast（AIscript 段，不能用 npm run）`);
console.log(`  2) 实机：npm run playtest -- open --test --char ${id}`);
