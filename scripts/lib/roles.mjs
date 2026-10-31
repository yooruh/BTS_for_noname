/**
 * 崩铁杀构建工具链 — 角色模块共享加载器。
 * 角色文件顶层 `import ... from 'noname.js'`，Node 须经 bts-loader 的 noname.js→存根
 * 重定向后方可 import（Node ≥22）。缓存结果供 rebuild/generate/voice/check 复用，
 * 替代「读文件 + 正则解析」（能 import 就不正则）。
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installBtsLoader } from './bts-loader.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 角色包清单（构建侧唯一来源）：新增角色包只登记这里。
 * dir = source/character/<dir>；keyPrefix = 包内全部注册键的前缀（键归属判定）；
 * idPrefix = 角色 ID 前缀（= keyPrefix + 'ch_'，rebuild 校验「文件名 = 资源主名」用）。
 */
export const PACKS = [
    { dir: 'bts', keyPrefix: 'bts_', idPrefix: 'bts_ch_' },
    { dir: 'diy', keyPrefix: 'bts_diy_', idPrefix: 'bts_diy_ch_' },
];

/** 角色包的角色目录（source/character/<dir>/roles）。 */
export function rolesRootOf(dir) {
    return resolve(ROOT, 'source', 'character', dir, 'roles');
}

/** 角色包入口（source/character/<dir>/index.js）。 */
export function packIndexPathOf(dir) {
    return resolve(ROOT, 'source', 'character', dir, 'index.js');
}

/** 默认包（bts）角色目录；旧引用兼容。 */
export const ROLES_ROOT = rolesRootOf('bts');

/** 键归属包（最长前缀优先：bts_diy_ 先于 bts_ 命中）。无归属返回 null。 */
export function packOfKey(key) {
    let hit = null;
    for (const pack of PACKS) {
        if (!key.startsWith(pack.keyPrefix)) continue;
        if (!hit || pack.keyPrefix.length > hit.keyPrefix.length) hit = pack;
    }
    return hit;
}

/**
 * 递归列出角色目录下所有 .js 文件全路径（稳定排序）。
 * 与 rebuild.mjs scanRoles 的约定一致：跳过 `_` 前缀的文件/目录。
 */
export function listRoleFiles(rolesRoot = ROLES_ROOT) {
    const out = [];
    const go = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('_')) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) go(full);
            else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
        }
    };
    go(rolesRoot);
    return out.sort();
}

/** 相对路径（roles/<阵营>/<文件>）；不传 rolesRoot 时按 PACKS 自动定位所属包目录。 */
export function relRolePath(full, rolesRoot) {
    let root = rolesRoot;
    if (!root) {
        const hit = PACKS.map((pack) => rolesRootOf(pack.dir)).find((candidate) =>
            full.startsWith(candidate + sep),
        );
        root = hit ?? ROLES_ROOT;
    }
    return full.slice(root.length + 1).replace(/\\/g, '/');
}

const cache = new Map();

/**
 * 加载一个角色包的角色模块（进程内按角色目录缓存；重复调用返回同一批模块）。
 * 返回 Map<文件全路径, 模块>。模块顶层依赖 noname.js，须先 installBtsLoader()。
 * 角色文件语法错误会直接抛出（构建期硬错误，与 generate.mjs 行为一致）。
 */
export async function loadRoleMods(rolesRoot = ROLES_ROOT) {
    if (cache.has(rolesRoot)) return cache.get(rolesRoot);
    installBtsLoader();
    const mods = new Map();
    for (const full of listRoleFiles(rolesRoot)) {
        mods.set(full, await import(pathToFileURL(full).href));
    }
    cache.set(rolesRoot, mods);
    return mods;
}

/** 加载全部角色包的角色模块（合并为 Map<文件全路径, 模块>）。 */
export async function loadAllRoleMods() {
    const all = new Map();
    for (const pack of PACKS) {
        for (const [full, mod] of await loadRoleMods(rolesRootOf(pack.dir)))
            all.set(full, mod);
    }
    return all;
}
