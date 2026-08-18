import { game } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';

// ==================== 状态管理 ====================
class StateManager {
    constructor(tempDir) {
        this.path = `${tempDir}/${CONFIG.files.state}`;
        this.data = null;
        this.saveTimer = null;
        this.pendingSave = false;
        this.syncSaveQueue = []; // 同步保存队列
    }

    async load() {
        try {
            const exists = await game.promises.checkFile(this.path);
            if (!exists) return null;

            const content = await game.promises.readFileAsText(this.path);
            this.data = JSON.parse(content);

            // 数据完整性检查：将上次中断的 'downloading' 状态重置为 'pending'
            if (this.data?.files) {
                let needsSave = false;
                for (const file of this.data.files) {
                    if (file.status === 'downloading') {
                        file.status = 'pending';
                        file.downloadedBytes = 0;
                        needsSave = true;
                    }
                }
                if (needsSave) {
                    await this.save(true);
                }
            }

            return this.data;
        } catch (e) {
            return null;
        }
    }

    // 防抖保存（用于非关键更新）
    async save(immediate = false) {
        if (!this.data) return;

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        const doSave = async () => {
            try {
                const dir = this.path.substring(0, this.path.lastIndexOf('/'));
                const name = this.path.substring(this.path.lastIndexOf('/') + 1);
                await game.promises.writeFile(
                    JSON.stringify(this.data, null, 2),
                    dir,
                    name
                );
                this.pendingSave = false;
            } catch (e) {
                console.error('[State] 保存失败:', e);
            }
        };

        if (immediate) {
            await doSave();
        } else {
            this.pendingSave = true;
            this.saveTimer = setTimeout(doSave, CONFIG.limits.stateSaveDebounce);
        }
    }

    // 强制刷新所有挂起的保存
    async flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.pendingSave && this.data) {
            await this.save(true);
        }
    }

    async init(repo, branch, mode, files, zipMeta = null, previewMode = false) {
        this.data = {
            timestamp: Date.now(),
            repo: { platform: repo.platform, owner: repo.owner, repo: repo.repo, branch },
            mode: mode,
            phase: 'downloading', // 新增：阶段标记
            previewMode: previewMode, // 预览模式标记（断点续传时恢复，保证应用阶段走预览路径）
            zipMeta: zipMeta || null, // 代码包元数据（断点续传时无需重取 version.json）
            files: files.map(f => ({
                path: f.remote,
                size: f.size,
                type: f.type,
                critical: f.critical,
                md5: f.md5 || null,
                kind: f.kind || 'file',
                status: 'pending',
                retries: 0,
                error: null,
                errorType: null,
                downloadedBytes: 0,
                tempVerified: false,
                applied: false
            })),
            stats: {
                total: files.length,
                success: 0,
                failed: 0,
                skipped: 0,
                bytes: 0,
                totalBytes: files.filter(f => !f.skip).reduce((s, f) => s + (f.size || 0), 0)
            },
            completed: false,
            hasFailures: false
        };
        await this.save(true);
    }

    async updateFile(path, status, error = null, errorType = null, bytes = 0, immediate = false) {
        if (!this.data) return;
        const file = this.data.files.find(f => f.path === path);
        if (file) {
            const oldStatus = file.status;

            // 状态流转验证
            const validTransitions = {
                'pending': ['downloading', 'skipped'],
                'downloading': ['success', 'failed'],
                'failed': ['pending', 'downloading', 'skipped'],
                'success': ['applied'],
                'applied': [],
                'skipped': []
            };

            if (oldStatus !== status && validTransitions[oldStatus] && !validTransitions[oldStatus].includes(status)) {
                console.warn(`[State] 非法状态流转: ${oldStatus} -> ${status} (${path})`);
            }

            file.status = status;
            if (error) {
                file.error = error;
                file.errorType = errorType;
            }

            if (oldStatus !== status) {
                if (status === 'success') {
                    this.data.stats.success++;
                    this.data.stats.bytes += bytes;
                    file.tempVerified = true;
                    file.applied = false;
                } else if (status === 'failed') {
                    if (oldStatus !== 'pending' && oldStatus !== 'downloading') {
                        file.retries++;
                    }
                    this.data.stats.failed++;
                    file.applied = false;
                } else if (status === 'skipped') {
                    this.data.stats.skipped++;
                    file.applied = false;
                } else if (status === 'applied') {
                    file.applied = true;
                }

                if (status === 'pending' && (oldStatus === 'failed' || oldStatus === 'downloading')) {
                    this.data.stats.failed = Math.max(0, this.data.stats.failed - 1);
                }
            }

            await this.save(immediate);
        }
    }

    async updateProgress(path, bytes, immediate = false) {
        if (!this.data) return;
        const file = this.data.files.find(f => f.path === path);
        if (file) {
            file.downloadedBytes = bytes;
            await this.save(immediate);
        }
    }

    // 将下载失败标记为待下载
    async resetFailedToPending() {
        if (!this.data) return false;
        let changed = false;
        for (const file of this.data.files) {
            if (file.status === 'failed') {
                this.data.stats.failed--;
                file.status = 'pending';
                file.error = null;
                file.errorType = null;
                file.downloadedBytes = 0;
                file.tempVerified = false;
                file.applied = false;
                changed = true;
            }
        }
        if (changed) {
            this.data.completed = false;
            this.data.phase = 'downloading';
            await this.save(true);
        }
        return changed;
    }

    // 将下载失败标记为跳过（代码包除外——代码包失败必须重试，跳过会导致应用阶段被阻止）
    async markAllFailedAsSkipped() {
        if (!this.data) return;
        for (const file of this.data.files) {
            if (file.status === 'failed' && file.kind !== 'zip') {
                file.status = 'skipped';
            }
        }
        await this.save(true);
    }

    // 设置更新阶段
    async setPhase(phase, immediate = true) {
        if (!this.data) return;
        const validPhases = ['downloading', 'staging', 'extracting', 'verifying', 'backing_up', 'moving', 'completed'];
        if (validPhases.includes(phase)) {
            this.data.phase = phase;
            await this.save(immediate);
        }
    }

    getPending() {
        if (!this.data) return [];
        return this.data.files.filter(f => f.status === 'pending');
    }

    getDownloading() {
        if (!this.data) return [];
        return this.data.files.filter(f => f.status === 'downloading');
    }

    getFailed() {
        if (!this.data) return [];
        return this.data.files.filter(f => f.status === 'failed');
    }

    getSkipped() {
        if (!this.data) return [];
        return this.data.files.filter(f => f.status === 'skipped');
    }

    canResume() {
        if (!this.data) return false;
        // 凡处于未收尾的阶段（下载/暂存/校验/覆盖中）都可恢复，恢复时按当前进度重放
        return ['downloading', 'staging', 'extracting', 'verifying', 'moving'].includes(this.data.phase);
    }

    hasPendingApply() {
        if (!this.data) return false;
        return this.data.files.some(f => f.status === 'success' && f.tempVerified && !f.applied);
    }

    isCompletedWithFailures() {
        return this.data?.completed === true && this.data?.hasFailures === true;
    }

    async clear() {
        try {
            await game.promises.removeFile(this.path);
        } catch (e) { }
        this.data = null;
    }

    complete(hasFailures = false) {
        if (this.data) {
            this.data.completed = true;
            this.data.endTime = Date.now();
            this.data.hasFailures = hasFailures;
            this.data.phase = 'completed';
            this.save(true);
        }
    }
}

export { StateManager };
