#!/usr/bin/env node

// 崩铁杀源码索引提取器：从太阳神 Lua 源（animal.lua）提取武将/技能/翻译锚点，生成结构化 JSON。
// 用法：node scripts/extract-index.mjs <animal.lua 路径> [输出目录]
// 输出：<输出目录>/generals.json（武将+技能+行号）、translations.json（角色名/称号/技能名/描述/台词）
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const srcPath = process.argv[2];
const outDir = process.argv[3] || path.resolve(process.cwd(), '.index');

if (!srcPath) {
    console.error(
        '用法：node scripts/extract-index.mjs <animal.lua> [输出目录]',
    );
    process.exit(1);
}

const source = await readFile(srcPath, 'utf8');
const lines = source.split(/\r?\n/);

// 1. 武将定义：NAME = sgs.General(extension_st|boss, "id", "阵营"[, hp, ...])
const generalRe =
    /(\w+)\s*=\s*sgs\.General\((extension_st|extension_boss)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"(?:\s*,\s*(\d+))?/g;
const generals = [];
for (const m of source.matchAll(generalRe)) {
    const line = source.slice(0, m.index).split(/\r?\n/).length;
    generals.push({
        line,
        varName: m[1],
        pkg: m[2],
        id: m[3],
        faction: m[4],
        hp: m[5] ? Number(m[5]) : null,
        skills: [],
    });
}

// 2. 每个武将的 addSkill / addRelateSkill（到下一个武将定义前）
for (let i = 0; i < generals.length; i++) {
    const g = generals[i];
    const end = i + 1 < generals.length ? generals[i + 1].line : lines.length;
    const block = lines.slice(g.line - 1, end).join('\n');
    const skillRe = new RegExp(
        `\\b${g.varName}:add(?:Relate)?Skill\\s*\\(\\s*"?([^"()]+)"?\\s*\\)`,
        'g',
    );
    for (const m of block.matchAll(skillRe)) {
        const name = m[1].trim();
        if (!g.skills.includes(name)) g.skills.push(name);
    }
}

// 3. 翻译表：sgs.LoadTranslationTable{ ... }（文件末尾）
const transStart = source.indexOf('sgs.LoadTranslationTable{');
const transEnd = source.length;
const transBody = source.slice(transStart, transEnd);
const trans = {
    name: {}, // ["id"] = "武将名"
    title: {}, // ["#id"] = "称号"
    skill: {}, // ["skill"] = "技能名"
    skillInfo: {}, // [":skill"] = "描述"
    skillLines: {}, // ["$skillN"] = "台词"
    dieLines: {}, // ["~id"] = "阵亡台词"
};
const entryRe = /\[\s*"([^"]+)"\s*\]\s*=\s*"([^"]*)"/g;
for (const m of transBody.matchAll(entryRe)) {
    const key = m[1];
    const value = m[2];
    if (key.startsWith('$')) trans.skillLines[key] = value;
    else if (key.startsWith('~')) trans.dieLines[key] = value;
    else if (key.startsWith(':')) trans.skillInfo[key] = value;
    else if (key.startsWith('#')) trans.title[key] = value;
    else if (key.startsWith('@'))
        continue; // 标记名，另表处理
    else if (
        trans.name[key] === undefined &&
        generals.some((g) => g.id === key)
    )
        trans.name[key] = value;
    else if (/^(st_|st_|fanshi_|bts_|#)/.test(key)) trans.skill[key] = value;
    else if (
        key.startsWith('#') === false &&
        value &&
        !['StarRail', 'StarRailCard'].includes(key)
    ) {
        // 阵营/元素/通用键，暂不录入技能表
    }
}

// 4. 补充：把技能名与描述直接按 key 记录（便于迁移时查找）
const out = {
    sourceLineCount: lines.length,
    generals,
    translations: trans,
    meta: {
        generalCount: generals.length,
        bossCount: generals.filter((g) => g.pkg === 'extension_boss').length,
        playableCount: generals.filter((g) => g.pkg === 'extension_st').length,
    },
};

await mkdir(outDir, { recursive: true });
await writeFile(
    path.join(outDir, 'generals.json'),
    JSON.stringify(generals, null, 2),
    'utf8',
);
await writeFile(
    path.join(outDir, 'translations.json'),
    JSON.stringify(trans, null, 2),
    'utf8',
);
await writeFile(
    path.join(outDir, 'index.json'),
    JSON.stringify(out, null, 2),
    'utf8',
);

console.log(
    `✓ 提取完成：${generals.length} 个武将（主包 ${out.meta.playableCount}，BOSS ${out.meta.bossCount}）`,
);
console.log(
    `  翻译：角色名 ${Object.keys(trans.name).length}、称号 ${Object.keys(trans.title).length}、技能名 ${Object.keys(trans.skill).length}、技能描述 ${Object.keys(trans.skillInfo).length}、台词 ${Object.keys(trans.skillLines).length}`,
);
console.log(`  输出：${outDir}`);
