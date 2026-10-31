import { game } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';
import { isStatSupported } from '../utils/fileSystem.js';
import { updateLogger } from './logger.js';

// ==================== 本地 md5 缓存 ====================
// 把已确认的本地 md5 连同 size + mtime 落盘到扩展目录内的 .md5_cache.json：
// 下一轮比对先比 size + mtime，一致即采信缓存值，不读文件、不算哈希。
// 失效条件：size / mtime 变化、结构版本不匹配、JSON 损坏、扩展目录被整体回滚。
// 该文件在 CONFIG.ignoredFiles 中：不参与备份、不随备份回滚、不被清理逻辑删除，
// 卸载或删目录时随扩展目录一起消失。
const CACHE_VERSION = 1;

class LocalMd5Cache {
    constructor(targetDir) {
        this.targetDir = targetDir;
        this.path = `${targetDir}/${CONFIG.files.md5Cache}`;
        this.entries = new Map(); // 路径 → { size, mtime, md5 }
        this.dirty = false;
    }

    // 建立/读取缓存；环境缺 stat 能力时返回 false（调用方退回全量读取比对）
    async load() {
        if (!isStatSupported()) {
            updateLogger.info('缓存', '当前环境无轻量 stat 能力，本地 md5 缓存不启用');
            return false;
        }
        try {
            if (await game.promises.checkFile(this.path) !== 1) return true; // 首次运行：空缓存
            const data = JSON.parse(await game.promises.readFileAsText(this.path));
            if (data?.version !== CACHE_VERSION || !data.entries || typeof data.entries !== 'object') {
                updateLogger.warn('缓存', '本地 md5 缓存的版本或结构不匹配，按空缓存重建');
                return true;
            }
            for (const [path, entry] of Object.entries(data.entries)) {
                const size = Number(entry?.size);
                const mtime = Number(entry?.mtime);
                if (typeof entry?.md5 !== 'string' || !(size >= 0) || !(mtime > 0)) continue;
                this.entries.set(path, { size, mtime, md5: entry.md5 });
            }
            updateLogger.info('缓存', `本地 md5 缓存已加载：${this.entries.size} 条`);
        } catch (e) {
            updateLogger.warn('缓存', `本地 md5 缓存读取失败，按空缓存重建: ${String(e?.message || e)}`);
            this.entries.clear();
        }
        return true;
    }

    // 命中条件：size 与 mtime 完全一致。mtime 不做容差——宁可重算，也不把改动过的文件当未改动
    lookup(path, stat) {
        if (!stat?.exists || !(stat.mtime > 0)) return null;
        const entry = this.entries.get(path);
        if (!entry || entry.size !== stat.size || entry.mtime !== stat.mtime) return null;
        return entry;
    }

    set(path, stat, md5) {
        if (!stat?.exists || !(stat.mtime > 0) || !md5) return;
        this.entries.set(path, { size: stat.size, mtime: stat.mtime, md5 });
        this.dirty = true;
    }

    delete(path) {
        if (this.entries.delete(path)) this.dirty = true;
    }

    // 只保留仍然有效的路径（清单里已删除的文件不再占位置，缓存不会无限增长）
    retain(paths) {
        for (const path of [...this.entries.keys()]) {
            if (paths.has(path)) continue;
            this.entries.delete(path);
            this.dirty = true;
        }
    }

    async save() {
        if (!this.dirty) return;
        this.dirty = false;
        try {
            const payload = {
                version: CACHE_VERSION,
                generatedAt: Date.now(),
                entries: Object.fromEntries(this.entries)
            };
            await game.promises.writeFile(JSON.stringify(payload), this.targetDir, CONFIG.files.md5Cache);
        } catch (e) {
            updateLogger.warn('缓存', `本地 md5 缓存写入失败: ${String(e?.message || e)}`);
        }
    }

    // 回滚 / 整目录替换后缓存必然失效：删除缓存文件与内存条目，下次比对重新建立
    async invalidate() {
        this.entries.clear();
        this.dirty = false;
        try {
            if (await game.promises.checkFile(this.path) === 1) await game.promises.removeFile(this.path);
        } catch (e) { }
    }
}

export { LocalMd5Cache };
