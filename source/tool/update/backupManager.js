import { game } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';
import { updateLogger } from './logger.js';
import { getFileList } from '../utils/fileSystem.js';

// ==================== 备份管理器 ====================
class BackupManager {
    constructor(targetDir, filesDir) {
        this.targetDir = targetDir;
        this.filesDir = filesDir;
    }

    async listBackups() {
        try {
            const [folders] = await getFileList(this.filesDir);
            const backups = [];

            for (const folder of folders) {
                if (folder.startsWith('backup_')) {
                    const timestamp = parseInt(folder.replace('backup_', ''));
                    if (!isNaN(timestamp)) {
                        let fileCount = 0;
                        try {
                            const [, files] = await getFileList(`${this.filesDir}/${folder}`);
                            fileCount = files.length;
                        } catch (e) { }

                        backups.push({
                            name: folder,
                            timestamp,
                            fileCount,
                            path: `${this.filesDir}/${folder}`
                        });
                    }
                }
            }

            return backups.sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            return [];
        }
    }

    async createBackup(onProgress = null) {
        const backupDir = `${this.filesDir}/backup_${Date.now()}`;
        try {
            const dirExists = await game.promises.checkDir(this.targetDir);
            if (dirExists === 1) {
                game.print(`[备份] 创建备份: ${backupDir}`);
                // 忽略清单（_temp_*、.git、scripts 等）已由 copyDirectoryRecursive 默认处理
                await this.copyDirectoryRecursive(this.targetDir, backupDir, { onProgress });
                await this.cleanupOldBackups(CONFIG.limits.backupCount);
                return { success: true, path: backupDir };
            }
            return { success: false, error: '目标目录不存在' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async rollbackToBackup(backup, onProgress = null) {
        const tempBackup = `${this.filesDir}/rollback_temp_${Date.now()}`;

        try {
            const exists = await game.promises.checkDir(this.targetDir);
            if (exists === 1) {
                if (typeof onProgress === 'function') onProgress('正在备份当前版本，防止回滚失败...');
                await this.copyDirectoryRecursive(this.targetDir, tempBackup, { onProgress });
            }

            if (typeof onProgress === 'function') onProgress('正在移除当前版本...');
            await game.promises.removeDir(this.targetDir);
            if (typeof onProgress === 'function') onProgress('正在恢复备份文件...');
            await this.copyDirectoryRecursive(backup.path, this.targetDir, { onProgress });

            try {
                if (typeof onProgress === 'function') onProgress('正在清理临时文件...');
                await game.promises.removeDir(tempBackup);
            } catch (e) { }

            return { success: true };
        } catch (error) {
            // 回滚失败，恢复原状
            try {
                if (typeof onProgress === 'function') onProgress('回滚失败，正在恢复原状...');
                await game.promises.removeDir(this.targetDir);
                await this.copyDirectoryRecursive(tempBackup, this.targetDir, { onProgress });
                await game.promises.removeDir(tempBackup);
            } catch (e) { }

            return { success: false, error: error.message };
        }
    }

    async deleteBackup(backup) {
        try {
            await game.promises.removeDir(backup.path);
            return true;
        } catch (e) {
            return false;
        }
    }

    async cleanupOldBackups(maxCount) {
        const backups = await this.listBackups();
        if (backups.length <= maxCount) return;

        const toDelete = backups.slice(maxCount);
        for (const backup of toDelete) {
            try {
                await game.promises.removeDir(backup.path);
                updateLogger.info('备份', `删除旧备份: ${backup.name}`);
            } catch (e) {
                updateLogger.warn('备份', `删除旧备份失败: ${backup.name} ${String(e?.message || e)}`);
            }
        }
    }

    async copyDirectoryRecursive(src, dest, options = {}) {
        const { skipDirs = new Set(), skipFiles = new Set(), onProgress = null } = options;
        // 默认忽略清单合并调用方额外指定的跳过项（自定义 getFileList 返回全部条目，含 `_`/`.` 开头）
        const effectiveSkipDirs = new Set([...CONFIG.ignoredDirs, ...skipDirs]);
        const effectiveSkipFiles = new Set([...CONFIG.ignoredFiles, ...skipFiles]);
        const [folders, files] = await getFileList(src);
        await game.promises.createDir(dest);

        for (const file of files) {
            if (effectiveSkipFiles.has(file)) continue;
            if (typeof onProgress === 'function') onProgress(`正在复制 ${src}/${file}`);
            const content = await game.promises.readFile(`${src}/${file}`);
            await game.promises.writeFile(content, dest, file);
        }

        for (const folder of folders) {
            if (effectiveSkipDirs.has(folder)) continue;
            await this.copyDirectoryRecursive(`${src}/${folder}`, `${dest}/${folder}`, options);
        }
    }
}

export { BackupManager };
