/**
 * 崩铁杀构建工具链 — 引擎存根加载器（Node ≥22）。
 * 用途：build 期（generate.mjs）直接 import 内容模块读标签生成派生数据，而模块顶层的
 * `import ... from '../../../../../noname.js'` 在 Node 下不可加载；本加载器把解析到
 * `<...>/noname.js` 的 specifier 改道到内存存根（镜像 _others/smoke/app/noname.js）。
 *
 * 注意：
 *  - 仅供 build 期使用，随 zip/scripts 分发、不进安装包。
 *  - 用 `module.register`（Node ≥20.6）；勿用需 ≥22.20 的 registerHooks；会打印
 *    ExperimentalWarning，无害。
 *  - 兜底（防将来 Node 升级）：数据读取改回正则解析（见 lib/roles.mjs）；校验逻辑抽共用。
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// ── 引擎最小存根（镜像 _others/smoke/app/noname.js）──────────────────────────
// 仅提供模块加载所需的最小命名空间；build 期不执行技能逻辑，够用即可。
const STUB_SOURCE = `// 构建期引擎存根（scripts/lib/bts-loader.mjs 生成，勿手动编辑）。
export const lib = {
    translate: {},
    skill: { global: [] },
    character: {},
    init: {
        css() {},
        // paths.js 在模块顶层据此算 extensionPath（需含 /source/tool/utils/paths.js 后缀）。
        getCurrentFileLocation() { return 'bts://extension/source/tool/utils/paths.js'; },
    },
};
export const game = {};
export const get = {
    // 专有名词 poptip 桩：技能描述模板串在模块加载时调用本方法，返回可辨识标记。
    poptip(id) { return '⟨' + id + '⟩'; },
    translation(value) { return String(value); },
    infoMaxHp(hp) { return typeof hp === 'number' ? hp : 0; },
};
export const ui = {};
export const ai = {};
export const _status = {};
globalThis.lib = lib;
globalThis.game = game;
globalThis.get = get;
globalThis.ui = ui;
globalThis.ai = ai;
globalThis._status = _status;
if (typeof Array.prototype.add !== 'function') {
    Object.defineProperty(Array.prototype, 'add', {
        configurable: true, enumerable: false, writable: true,
        value(...args) { this.push(...args); return this; },
    });
}
if (typeof Array.prototype.addArray !== 'function') {
    Object.defineProperty(Array.prototype, 'addArray', {
        configurable: true, enumerable: false, writable: true,
        value(...args) { for (const arr of args) for (const item of arr) this.push(item); return this; },
    });
}
`;

const STUB_URL =
    'data:text/javascript;base64,' + Buffer.from(STUB_SOURCE, 'utf8').toString('base64');

// ── 加载器钩子（data: URL 内联，独立于本模块实例）──────────────────────────
const HOOK_SOURCE = `
const STUB_URL = ${JSON.stringify(STUB_URL)};
export async function resolve(specifier, context, nextResolve) {
    if (typeof specifier === 'string' && specifier.endsWith('noname.js')) {
        try {
            const url = new URL(specifier, context.parentURL);
            if (url.pathname.endsWith('/noname.js')) {
                return { url: STUB_URL, shortCircuit: true };
            }
        } catch {
            /* 裸说明符（引擎自身）不拦截 */
        }
    }
    return nextResolve(specifier, context);
}
`;

const HOOK_URL =
    'data:text/javascript;base64,' + Buffer.from(HOOK_SOURCE, 'utf8').toString('base64');

let installed = false;

/** 注册 noname.js → 存根 的加载器；需在 import 任何内容模块前调用。幂等。 */
export function installBtsLoader() {
    if (installed) return;
    register(HOOK_URL, { parentURL: import.meta.url });
    installed = true;
}

/** 供测试/诊断：导出存根内容。 */
export function getStubUrl() {
    return STUB_URL;
}

// 直接运行本文件时自安装（便于 node scripts/lib/bts-loader.mjs 单独验证）。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    installBtsLoader();
    console.log('bts-loader installed (stub url: ' + STUB_URL.slice(0, 40) + '…)');
}
