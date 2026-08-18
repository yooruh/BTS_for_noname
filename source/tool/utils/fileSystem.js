// ==================== 文件系统访问（搬运自叁岛，零修改） ====================
// 自定义目录列举：用 Node fs 替代 game.promises.getFileList。
// 引擎 getFileList 会过滤以 `_` / `.` 开头的条目（见 noname/init/node.js），
// 本实现返回全部条目，由调用方自行按需过滤/保护。
export async function getFileList(dir) {
    if (typeof window === 'undefined' || typeof window.require !== 'function') {
        throw new Error('当前环境不支持文件系统访问');
    }
    const fs = window.require('fs');
    const path = window.require('path');
    if (!fs?.promises?.readdir) {
        throw new Error('当前环境不支持文件系统访问');
    }
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
