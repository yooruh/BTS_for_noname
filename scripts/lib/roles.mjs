/**
 * 崩铁杀构建工具链 — 角色模块共享加载器。
 * 角色文件顶层 `import ... from 'noname.js'`，Node 须经 bts-loader 的 noname.js→存根
 * 重定向后方可 import（Node ≥22）。缓存结果供 rebuild/generate/voice/check 复用，
 * 替代「读文件 + 正则解析」（能 import 就不正则）。
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installBtsLoader } from './bts-loader.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROLES_ROOT = resolve(ROOT, 'source', 'character', 'bts', 'roles');

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

/** 相对路径（roles/<阵营>/<文件>），与 generate.mjs 的 modules 约定一致。 */
export function relRolePath(full, rolesRoot = ROLES_ROOT) {
    return full.slice(rolesRoot.length + 1).replace(/\\/g, '/');
}

let cache = null;

/**
 * 加载全部角色模块（进程内缓存；重复调用返回同一批模块）。
 * 返回 Map<文件全路径, 模块>。模块顶层依赖 noname.js，须先 installBtsLoader()。
 * 角色文件语法错误会直接抛出（构建期硬错误，与 generate.mjs 行为一致）。
 */
export async function loadRoleMods(rolesRoot = ROLES_ROOT) {
    if (cache) return cache;
    installBtsLoader();
    const mods = new Map();
    for (const full of listRoleFiles(rolesRoot)) {
        mods.set(full, await import(pathToFileURL(full).href));
    }
    cache = mods;
    return mods;
}
