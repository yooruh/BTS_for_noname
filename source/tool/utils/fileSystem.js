// ==================== 文件系统访问 ====================
import { game } from '../../../../../noname.js';

// 取 Node 版 fs；移动端（Capacitor/Cordova）与浏览器没有 window.require，返回 null
function getNodeFs() {
    if (typeof window === 'undefined' || typeof window.require !== 'function') return null;
    try {
        const fs = window.require('fs');
        return fs?.promises?.readdir ? fs : null;
    } catch (e) {
        return null;
    }
}

// 目录列举：
// 桌面（Node）用 fs 读目录——引擎版会过滤 `_`/`.` 开头条目（见 noname/init/node.js），本实现全部返回；
// 移动端/浏览器没有 Node fs，退回引擎文件接口 game.promises.getFileList（调用方已用忽略清单过滤临时项）。
export async function getFileList(dir) {
    const fs = getNodeFs();
    if (!fs) {
        return await game.promises.getFileList(dir);
    }
    const path = window.require('path');
    // 与 downloader.js 一致：路径相对游戏根目录，需基于 window.__dirname 解析
    const absDir =
        typeof window.__dirname === 'string'
            ? path.resolve(window.__dirname, dir)
            : dir;
    const entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    const folders = [];
    const files = [];
    for (const entry of entries) {
        if (entry.isDirectory()) folders.push(entry.name);
        else files.push(entry.name);
    }
    folders.sort();
    files.sort();
    return [folders, files];
}

// ==================== 轻量 stat ====================
// 更新比对只要 size + mtime 就能跳过整文件读取与哈希（见 update/localMd5Cache.js）。
// 目前只在**桌面（Node fs）**实现：移动端/Cordova/Capacitor 的路径基准（Filesystem 根 vs 扩展目录）
// 与引擎 file 接口并不一致，猜错会把「存在」判成「不存在」，反而让更新器误判——这里一律返回不支持，
// 调用方自动退回「checkFile + readFile + md5」的原路径，行为与优化前一致。
let statSupported = null; // null=未探测

/** 是否具备轻量 stat 能力（同步、缓存结果） */
export function isStatSupported() {
    if (statSupported === null) statSupported = !!getNodeFs();
    return statSupported;
}

/**
 * 取文件 size/mtime。
 * @param {string} file 相对游戏根目录的路径（与 getFileList 同口径）
 * @returns {Promise<{exists: boolean, size?: number, mtime?: number}|null>} 不支持时返回 null
 */
export async function statFile(file) {
    if (!isStatSupported()) return null;
    const fs = getNodeFs();
    const path = window.require('path');
    const abs =
        typeof window.__dirname === 'string'
            ? path.resolve(window.__dirname, file)
            : file;
    try {
        const st = await fs.promises.stat(abs);
        return { exists: true, size: st.size, mtime: st.mtimeMs };
    } catch (e) {
        return { exists: false };
    }
}
