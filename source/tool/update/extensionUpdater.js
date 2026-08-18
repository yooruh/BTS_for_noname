import { lib, game, get } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG, normalizeMode } from './config.js';
import { updateUtils as utils } from './utils.js';
import { extensionFilesPath, extensionPath } from '../utils/paths.js';
import { getFileList } from '../utils/fileSystem.js';
import { updateEnvironment as Environment, TokenManager, GitAdapter } from './repository.js';
import { StateManager } from './stateManager.js';
import { DownloadTask, SmartDownloader } from './downloader.js';
import { VersionChecker } from './versionChecker.js';
import { UpdateDialogs as UIManager } from './updateDialogs.js';
import { BackupManager } from './backupManager.js';
import { md5Hex } from './md5.js';
import { updateLogger } from './logger.js';

// 更新时需保护、绝不删除/清理的目录与文件
// 自定义 getFileList 会返回 `_`/`.` 开头的全部条目，故忽略清单覆盖开发机文件与运行时临时项
const PROTECTED_DIRS = new Set(CONFIG.ignoredDirs);
const PROTECTED_FILES = new Set([...CONFIG.ignoredFiles, CONFIG.files.directory, CONFIG.files.version]);

// ==================== 主更新器 ====================
class ExtensionUpdater {
    constructor() {
        this.repo = null;
        this.tempDir = null;
        this.stagingDir = `${extensionPath}/${CONFIG.files.stagingDir}`; // 代码包解压/校验暂存目录
        this.targetDir = extensionPath;
        this.filesDir = extensionFilesPath;
        this.tokens = new TokenManager();
        this.state = null;
        this.ui = new UIManager();
        this.backupManager = new BackupManager(this.targetDir, this.filesDir);
        this.downloader = null;
        this.tasks = []; // DownloadTask 数组
        this.mode = 'auto';
        this.codeZipMeta = null;
        this.codeZipAvailable = false;
        this.staged = {};          // 暂存目录中 路径 → md5
        this.stagedManifest = null; // 代码包内 Directory.json 解析结果
        this.stagedManifestPaths = []; // 代码包内新版本完整路径清单
        this.versionSelect = false; // 交互路径是否允许自选更新版本
        this.checkOnly = false;    // “检查更新”仅检查：已最新则短路，有差异则报告不下载
        this.previewMode = false;  // “更新至预览版”：固定 main 分支，版本/md5 差异仅警告
        this.fileCheck = null;     // 本地文件与清单 md5 比对结果（检查更新/预览使用）
        this.startTime = 0;
        this.shouldCleanup = true;
        this.totalBytes = 0;
        this.envType = Environment.getEnvironmentType();
        this.eventHandlers = {};
        this.fixedTempDirName = '_temp_downloading';
    }

    // 事件订阅机制
    on(event, handler) {
        if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
    }

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(h => h(data));
        }
    }

    async init(platform, mode = 'simple') {
        const url = CONFIG.urls[platform];
        if (!url) throw new Error('无效的平台');

        this.repo = new GitAdapter(url);
        this.mode = normalizeMode(mode);
        this.tempDir = `${this.targetDir}/${this.fixedTempDirName}`;
        this.state = new StateManager(this.tempDir);
        this.downloader = new SmartDownloader(this.repo, this.tokens);
        this.downloader.lenientMd5 = !!this.previewMode; // 预览模式：md5 不一致仅警告
        this.shouldCleanup = true;
        this.totalBytes = 0;
        this.tasks = [];

        updateLogger.setContext({
            '更新源': this.repo.platform,
            '更新模式': this.mode,
            '运行环境': this.envType,
            '目标分支': this.repo.branch,
            '类型': this.previewMode ? '预览版(main)' : this.checkOnly ? '仅检查' : '发布版'
        });
        updateLogger.info('更新器', `初始化: 平台=${platform}, 环境=${this.envType}, 模式=${mode}${this.previewMode ? ', 预览版(main)' : ''}`);
    }

    async resumeFromState(tempDir) {
        this.tempDir = tempDir;
        this.state = new StateManager(this.tempDir);
        const loaded = await this.state.load();

        if (loaded) {
            // 验证阶段合法性
            const RESUMABLE_PHASES = ['downloading', 'staging', 'extracting', 'verifying', 'moving'];
            if (loaded.phase && !RESUMABLE_PHASES.includes(loaded.phase)) {
                updateLogger.warn('恢复', `上次更新停留在阶段: ${loaded.phase}，可能未完整应用`);
                if (loaded.phase === 'completed') {
                    return false; // 已完成的不恢复
                }
            }

            this.repo = new GitAdapter(CONFIG.urls[loaded.repo.platform]);
            this.repo.switchBranch(loaded.repo.branch);
            this.mode = normalizeMode(loaded.mode);
            updateLogger.setContext({
                '更新源': this.repo.platform,
                '更新模式': this.mode,
                '目标分支': this.repo.branch,
                '类型': loaded.previewMode ? '预览版(main)' : '发布版'
            });
            updateLogger.info('恢复', `恢复上次状态：平台=${loaded.repo.platform}，分支=${loaded.repo.branch}，模式=${loaded.mode}，阶段=${loaded.phase}，文件=${loaded.files?.length || 0} 个`);
            // 恢复预览模式标记，保证续传后的应用阶段仍走预览路径（不要求代码包）
            this.previewMode = !!loaded.previewMode;
            this.downloader = new SmartDownloader(this.repo, this.tokens);
            this.downloader.lenientMd5 = !!this.previewMode;

            // 恢复代码包元数据（断点续传时不重新下载 version.json）
            this.codeZipMeta = loaded.zipMeta || null;
            this.codeZipAvailable = !!(this.codeZipMeta && this.codeZipMeta.filename);

            // 恢复任务列表，验证临时文件存在性
            this.tasks = [];
            for (const f of loaded.files) {
                const isZip = f.kind === 'zip';
                const task = new DownloadTask({
                    remote: f.path,
                    temp: isZip ? `${this.tempDir}/${CONFIG.files.codeZip}` : `${this.tempDir}/${f.path}`,
                    target: isZip ? '' : `${this.targetDir}/${f.path}`,
                    size: f.size,
                    type: f.type,
                    critical: f.critical,
                    priority: f.type === 'text' ? 0 : (f.type === 'media' ? 2 : 1),
                    skip: f.status === 'skipped',
                    md5: f.md5 || null,
                    kind: f.kind || 'file',
                    urls: isZip ? this.repo.getZipURLs(loaded.zipMeta || {}) : null
                });

                // 验证已下载文件的临时文件是否存在
                if ((f.status === 'success' || f.status === 'applied') && f.tempVerified) {
                    try {
                        const exists = await game.promises.checkFile(task.temp);
                        if (exists !== 1 && f.status !== 'applied') {
                            updateLogger.warn('恢复', `临时文件丢失，重置为pending: ${f.path}`);
                            f.status = 'pending';
                            f.downloadedBytes = 0;
                            f.tempVerified = false;
                            f.applied = false;
                            task.skip = false;
                        }
                    } catch (e) {
                        if (f.status !== 'applied') {
                            f.status = 'pending';
                            f.tempVerified = false;
                            f.applied = false;
                        }
                    }
                }

                this.tasks.push(task);
            }
            // 预览模式恢复完整路径清单（供清理失效文件用；Directory.json 受保护无需列入）
            if (this.previewMode) {
                this.stagedManifestPaths = this.tasks.map(t => t.remote);
            }
            // 修正统计
            this.totalBytes = this.tasks.reduce((sum, t) => sum + (t.skip ? 0 : (t.size || 0)), 0);
            this.recalculateStats();

            // 保存修正后的状态
            await this.state.save(true);
            return true;
        }
        return false;
    }

    async checkResume() {
        try {
            // 检查固定名称的临时目录是否存在
            const tempDir = `${this.targetDir}/${this.fixedTempDirName}`;
            const exists = await game.promises.checkDir(tempDir);

            if (exists === 1) {
                // 尝试从该目录加载状态
                if (await this.resumeFromState(tempDir)) {
                    return {
                        canResume: this.state.canResume(),
                        hasFailures: this.state.isCompletedWithFailures(),
                        hasPendingApply: this.state.hasPendingApply(),
                        tempDir: this.tempDir,
                        phase: this.state.data?.phase || 'downloading'
                    };
                }
            }
        } catch (e) { }
        return { canResume: false, hasFailures: false, tempDir: null };
    }

    recalculateStats() {
        if (!this.state.data) return;

        const stats = {
            total: this.state.data.files.length,
            success: 0,
            failed: 0,
            skipped: 0,
            bytes: 0,
            totalBytes: 0
        };

        for (const f of this.state.data.files) {
            if (f.status === 'success' || f.status === 'applied') {
                stats.success++;
                stats.bytes += f.size || 0;
            } else if (f.status === 'failed') {
                stats.failed++;
            } else if (f.status === 'skipped') {
                stats.skipped++;
            }

            if (f.status !== 'skipped') {
                stats.totalBytes += f.size || 0;
            }
        }

        this.state.data.stats = stats;
    }

    // 将清单中所有含 md5 的文件（代码 + 媒体等全部条目）与本地比对，
    // 用于“检查更新”的已最新判定与预览版的差异警告/跳过复用。
    async compareLocalFiles(directory) {
        const mismatched = [];
        const missing = [];
        const matchedPaths = new Set();
        let checked = 0;
        for (const [path, info] of Object.entries(directory)) {
            if (!info?.md5) continue; // 清单无 md5（如 Directory.json 自身）跳过
            try {
                if (await game.promises.checkFile(`${this.targetDir}/${path}`) === 1) {
                    const local = await game.promises.readFile(`${this.targetDir}/${path}`);
                    checked++;
                    if (md5Hex(local) === info.md5) {
                        matchedPaths.add(path);
                    } else {
                        mismatched.push(path);
                    }
                } else {
                    missing.push(path);
                }
            } catch (e) {
                missing.push(path);
            }
        }
        updateLogger.info('校验', `本地 vs 远端清单比对：含 md5 条目 ${checked}，md5 不符 ${mismatched.length}，缺失 ${missing.length} → ${mismatched.length === 0 && missing.length === 0 ? '已是最新' : '存在更新'}`);
        if (mismatched.length) updateLogger.info('校验', `md5 不符文件(前10): ${mismatched.slice(0, 10).join(', ')}`);
        if (missing.length) updateLogger.info('校验', `缺失文件(前10): ${missing.slice(0, 10).join(', ')}`);
        return {
            checked,
            mismatched,
            missing,
            matchedPaths,
            upToDate: mismatched.length === 0 && missing.length === 0
        };
    }

    async prepareFileList(targetBranch = null, verInfo = null) {
        if (targetBranch) this.repo.switchBranch(targetBranch);
        // 下载文件列表
        const listTask = new DownloadTask({
            remote: CONFIG.files.directory,
            temp: `${this.tempDir}/Directory.json`,
            size: 0,
            type: 'json'
        });

        let result = await this.downloader.download(listTask);
        // 显式指定分支但拉取版本清单失败（分支不存在/不可用）→ 回退到 v+版本号 分支重试一次
        if (!result.success && !result.needToken && !this.previewMode && verInfo?.branch) {
            const fallbackBranch = `v${utils.stripV(verInfo.extensionVersion)}`;
            if (fallbackBranch && fallbackBranch !== verInfo.branch) {
                updateLogger.warn('分支', `从分支 ${verInfo.branch} 拉取 ${CONFIG.files.directory} 失败（${result.error}），尝试回退分支 ${fallbackBranch}`);
                this.repo.switchBranch(fallbackBranch);
                result = await this.downloader.download(listTask);
                if (result.success) {
                    updateLogger.info('分支', `已回退到 ${fallbackBranch} 分支拉取版本清单`);
                }
            }
        }
        if (!result.success) {
            if (result.needToken) {
                // 动态请求 Token
                const token = await this.ui.promptForToken(this.repo.platform, 'cors');
                if (token) {
                    this.tokens.set(this.repo.platform, token);
                    this.downloader = new SmartDownloader(this.repo, this.tokens);
                    return this.prepareFileList(targetBranch, verInfo); // 重试
                }
            }
            const error = new Error(`获取文件列表失败: ${result.error}`);
            error.updateStage = 'download';
            error.errorType = result.errorType;
            throw error;
        }

        const content = await game.promises.readFileAsText(listTask.temp);
        let directory;
        try {
            directory = JSON.parse(content);
        } catch (e) {
            throw new Error('Directory.json文件列表格式错误');
        }

        // 检查更新 / 预览 / 交互式“更新至发布版·自动”：比对清单中全部含 md5 的文件与本地，
        // 供已最新判定与差异警告/跳过复用。（quickUpdate 等非交互路径不计算，保持原行为）
        this.fileCheck = (this.checkOnly || this.previewMode || (this.mode === 'auto' && this.versionSelect))
            ? await this.compareLocalFiles(directory) : null;

        // 解析文件列表
        const excludes = {
            dirs: ['.git', '.vscode', 'node_modules', '__temp__'],
            files: ['.gitignore', '.DS_Store', CONFIG.files.state],
            exts: ['.tmp', '.log', '.bak']
        };

        this.tasks = [];
        this.totalBytes = 0;

        for (const [path, info] of Object.entries(directory)) {
            if (!path) continue;
            const parts = path.split('/').filter(p => p);
            const fileName = parts[parts.length - 1];

            if (parts.some(p => excludes.dirs.includes(p))) continue;
            if (excludes.files.includes(fileName)) continue;
            if (excludes.exts.some(ext => fileName.endsWith(ext))) continue;
            if (fileName.startsWith('.')) continue;

            const cleanPath = parts.join('/');

            // 代码文件随代码包整包更新；媒体（image/audio）走逐文件任务。
            // code 模式不建立任何逐文件任务。预览模式例外：代码逐文件下载。
            if (!this.previewMode && (utils.isCodePath(cleanPath) || this.mode === 'code')) continue;

            // 预览模式：Directory.json 已下载到临时目录，不重复建任务，由 refreshLocalDirectoryJson 统一写回
            if (this.previewMode && cleanPath === CONFIG.files.directory) continue;

            const type = utils.getFileType(fileName);
            const size = info?.size || 0;
            const md5 = info?.md5 || null;

            const task = new DownloadTask({
                remote: cleanPath,
                temp: `${this.tempDir}/${cleanPath}`,
                target: `${this.targetDir}/${cleanPath}`,
                size,
                type,
                critical: utils.isCritical(fileName),
                priority: type === 'text' ? 0 : (type === 'media' ? 2 : 1),
                md5
            });

            // auto 模式：媒体本地 md5 与清单一致则跳过下载（未改动）
            if (this.mode === 'auto' && task.priority > 0) {
                try {
                    if (await game.promises.checkFile(task.target) === 1) {
                        if (md5) {
                            const local = await game.promises.readFile(task.target);
                            if (md5Hex(local) === md5) task.skip = true;
                        } else {
                            // 过渡期：清单暂无 md5 时回退为“存在即跳过”
                            task.skip = true;
                        }
                    }
                } catch (e) { }
            }
            // 预览模式：代码逐文件下载，本地 md5 与清单一致则跳过（复用已算好的比对结果）
            if (this.previewMode && utils.isCodePath(cleanPath) && this.fileCheck?.matchedPaths?.has(cleanPath)) {
                task.skip = true;
            }

            this.tasks.push(task);
            if (!task.skip) this.totalBytes += size;
        }

        // 代码包哨兵任务（正常模式走代码包；priority -1 保证最先下载）。
        // 预览模式没有对应当前 main 代码的发布代码包，代码改为逐文件下载。
        const zipMeta = verInfo?.zip || null;
        if (!this.previewMode && zipMeta && zipMeta.filename) {
            this.codeZipMeta = zipMeta;
            this.codeZipAvailable = true;
            this.tasks.push(new DownloadTask({
                remote: CONFIG.files.codeZipSentinel,
                temp: `${this.tempDir}/${CONFIG.files.codeZip}`,
                target: '',
                size: zipMeta.size || 0,
                type: 'zip',
                critical: true,
                priority: -1,
                md5: zipMeta.md5 || null,
                kind: 'zip',
                urls: this.repo.getZipURLs(zipMeta)
            }));
            this.totalBytes += zipMeta.size || 0;
        } else {
            this.codeZipAvailable = false;
        }

        if (!this.codeZipAvailable && !this.previewMode) {
            throw new Error('未找到代码包信息（version.json 缺少 zip 元数据），暂无法在线更新，请等待版本发布完整');
        }

        // 预览模式：以 main 分支清单作为新版本完整路径清单（供清理失效文件用）
        if (this.previewMode) {
            this.stagedManifest = directory;
            this.stagedManifestPaths = Object.keys(directory);
        }

        // 按优先级排序（关键文件优先，代码包最先）
        this.tasks.sort((a, b) => {
            if (a.critical !== b.critical) return a.critical ? -1 : 1;
            return a.priority - b.priority;
        });

        const skipCount = this.tasks.filter(t => t.skip).length;
        updateLogger.info('准备', `文件任务构建完成：${this.tasks.length} 个任务，跳过 ${skipCount} 个` +
            `${this.codeZipMeta ? `，代码包 ${this.codeZipMeta.filename}(${this.codeZipMeta.size}B md5=${this.codeZipMeta.md5})` : '，无代码包（预览逐文件）'}` +
            `，分支=${this.repo.branch}`);
        await this.state.init(this.repo, this.repo.branch, this.mode, this.tasks, this.codeZipMeta, this.previewMode);

        return {
            fileCount: this.tasks.length,
            skipCount,
            totalBytes: this.totalBytes,
            zipSize: this.codeZipMeta?.size || 0,
            fileCheck: this.fileCheck
        };
    }

    // 核心下载逻辑
    async downloadFiles(onProgress, onFileStart, onFileComplete) {
        const pending = this.state.getPending()
            .map(p => this.tasks.find(t => t.remote === p.path))
            .filter(Boolean);

        if (pending.length === 0) return this.state.data.stats;

        const downloadable = pending.filter(task => !task.skip);
        if (downloadable.length === 0) {
            for (const task of pending) {
                await this.state.updateFile(task.remote, 'skipped', null, null, 0, true);
            }
            await this.state.flush();
            return this.state.data.stats;
        }

        let completedCount = 0;
        let totalDownloadedBytes = 0;
        let roundTotalBytes = downloadable.reduce((sum, task) => sum + (task.size || 0), 0);
        let unknownSizeCount = downloadable.filter(task => !(task.size > 0)).length;
        let lastForceSaveTime = Date.now();
        const FORCE_SAVE_INTERVAL = 5000; // 每5秒强制保存一次

        // 并发下载
        await utils.asyncPool(CONFIG.limits.maxConcurrent, pending, async (task) => {
            if (task.skip) {
                await this.state.updateFile(task.remote, 'skipped', null, null, 0, true);
                return;
            }

            if (onFileStart) onFileStart(task.remote, task.size);

            let accountedBytes = 0;
            let accountedTotal = task.size || 0;
            let lastProgressSave = Date.now();
            let lastUiTime = 0;
            let result = null;

            const reportProgress = (received, fileTotal, force = false) => {
                const normalized = Math.max(accountedBytes, Number(received) || 0);
                const delta = normalized - accountedBytes;
                if (delta > 0) {
                    totalDownloadedBytes += delta;
                    accountedBytes = normalized;
                }
                if (normalized > accountedTotal) {
                    roundTotalBytes += normalized - accountedTotal;
                    accountedTotal = normalized;
                }

                totalDownloadedBytes = Math.min(totalDownloadedBytes, roundTotalBytes);
                if (onProgress && (force || delta > 0)) {
                    onProgress(
                        task.remote,
                        normalized,
                        fileTotal,
                        totalDownloadedBytes,
                        unknownSizeCount > 0 ? 0 : roundTotalBytes,
                        completedCount,
                        downloadable.length
                    );
                }
            };

            try {
                result = await this.downloader.download(task, async (received, total) => {
                    task.downloadedBytes = received;
                    const fileTotal = task.size || total || 0;
                    const delta = Math.max(0, received - accountedBytes);
                    const now = Date.now();
                    const completed = fileTotal > 0 && received >= fileTotal;

                    // 每次网络数据事件都刷新UI；状态落盘仍由 StateManager 自身防抖。
                    if (delta > 0 || completed || now - lastUiTime >= 500) {
                        reportProgress(received, fileTotal, true);
                        lastUiTime = now;

                        // 每2秒或完成时强制保存进度
                        if (now - lastProgressSave > 2000 || completed) {
                            await this.state.updateProgress(task.remote, received, true);
                            lastProgressSave = now;
                        } else {
                            await this.state.updateProgress(task.remote, received, false);
                        }
                    }

                    // 定期强制刷新所有状态
                    if (now - lastForceSaveTime > FORCE_SAVE_INTERVAL) {
                        await this.state.flush();
                        lastForceSaveTime = now;
                    }
                }, this.state); // 传入 stateManager 以便内部管理状态流转

                if (result.success) {
                    const actualSize = result.size || task.size || accountedBytes;
                    // 清单大小与实际大小不一致时同步修正本轮分母，保证最终收敛到100%。
                    roundTotalBytes = Math.max(0, roundTotalBytes + actualSize - accountedTotal);
                    accountedTotal = actualSize;
                    if (!(task.size > 0)) unknownSizeCount = Math.max(0, unknownSizeCount - 1);
                    completedCount++;
                    reportProgress(actualSize, actualSize, true);
                } else if (result.needToken && !this._tokenPrompted) {
                    // 失败状态已在 download 方法中保存；动态 Token 提示
                    this._tokenPrompted = true;
                    const token = await this.ui.promptForToken(this.repo.platform, result.errorType);
                    if (token) {
                        this.tokens.set(this.repo.platform, token);
                        this.downloader = new SmartDownloader(this.repo, this.tokens);
                    }
                }
            } catch (error) {
                updateLogger.error('下载', `${task.remote} 异常: ${String(error?.message || error)}`);
                result = { success: false, error: String(error?.message || error), errorType: 'network' };
                try {
                    await this.state.updateFile(task.remote, 'failed', result.error, result.errorType, 0, true);
                } catch (stateError) {
                    updateLogger.error('下载', `${task.remote} 保存失败状态异常: ${String(stateError?.message || stateError)}`);
                }
            } finally {
                if (onFileComplete) {
                    onFileComplete(
                        task.remote,
                        result?.success ? (result.size || task.size || accountedBytes) : (task.size || accountedBytes),
                        !!result?.success
                    );
                }
            }
        });

        // 最终强制刷新
        await this.state.flush();
        return this.state.data.stats;
    }

    // 仅重试失败文件
    async retryFailedFiles(onProgress, onFileStart, onFileComplete) {
        const failed = this.state.getFailed();
        if (failed.length === 0) return this.state.data.stats;

        // 重置失败状态为 pending
        await this.state.resetFailedToPending();

        // 重新计算总字节数（仅失败文件）
        this.totalBytes = failed.reduce((sum, f) => sum + (f.size || 0), 0);

        return this.downloadFiles(onProgress, onFileStart, onFileComplete);
    }

    async applyUpdate() {
        // 代码包未就绪时禁止应用（即使勾选“忽略失败”），杜绝本次事故的“缺必需文件继续覆盖”。
        // 预览模式无代码包（逐文件下载），跳过该硬性检查。
        if (!this.previewMode) {
            const zipState = this.state.data?.files?.find(f => f.kind === 'zip');
            if (!zipState || zipState.status !== 'success' || !zipState.tempVerified) {
                const error = new Error('代码包未就绪（下载失败或未完成），无法应用更新，请重试下载');
                error.updateStage = 'apply';
                throw error;
            }
        }

        // 应用阶段（备份/解压/覆写）耗时较长，显示“请稍候”避免 UI 空窗
        const loading = await this.ui.showLoading('正在应用更新', '正在备份并覆写文件，请稍候...');
        const report = (msg) => loading.updateText(msg);

        let backup = null;
        try {
            // 1) 解压并校验代码包到暂存目录 —— 此阶段不触碰正式目录（预览模式跳过）
            if (!this.previewMode) {
                report('正在解压并校验代码包...');
                await this.prepareCodeStaging(report);
                await this.verifyCodeStaging(report);
            }

            // 2) 备份当前版本（正式目录首次被触碰）
            report('正在备份当前版本...');
            await this.state.setPhase('backing_up', true);
            const backupResult = await this.backupManager.createBackup(report);
            if (!backupResult.success) {
                updateLogger.warn('备份', `创建失败，继续更新: ${String(backupResult.error || '')}`);
            } else {
                backup = backupResult;
            }

            // 3) 覆盖：先媒体（临时文件）后代码（已校验的暂存目录）。
            //    预览模式无代码包，代码已作为逐文件任务由 applyDownloadedFiles 一并写入。
            report('正在覆写文件，请稍候...');
            await this.state.setPhase('moving', true);
            await this.applyDownloadedFiles(report);
            if (!this.previewMode) {
                await this.applyCodeFromStaging(report);
                await this.postVerifyCode(report);
            }

            // 4) 清理失效文件（按模式过滤）
            report('正在清理旧文件...');
            const oldFileList = await this.readLocalDirectoryJson();
            await this.removeObsoleteFiles(oldFileList, this.stagedManifestPaths, report);

            // 5) 写回新清单、清理临时与暂存
            await this.refreshLocalDirectoryJson();
            await this.cleanup();
        } catch (error) {
            updateLogger.error('应用', `应用更新失败: ${String(error?.message || error)}`);
            // 回滚到备份，确保正式目录不被半更新状态破坏
            if (backup) await this.rollback(backup, report);
            await this.state.setPhase('downloading', true);
            if (!error.updateStage) error.updateStage = 'apply';
            throw error;
        } finally {
            loading.close();
        }
    }

    // 将代码包解压到暂存目录（_temp_update），不触碰正式目录
    async prepareCodeStaging(onProgress = null) {
        await this.state.setPhase('staging', true);
        const codeZipTemp = `${this.tempDir}/${CONFIG.files.codeZip}`;
        const exists = await game.promises.checkFile(codeZipTemp);
        if (exists !== 1) {
            const error = new Error('代码包文件缺失，无法解压');
            error.updateStage = 'verify';
            throw error;
        }

        // 清空并重建暂存目录
        try {
            if (await game.promises.checkDir(this.stagingDir) === 1) {
                await game.promises.removeDir(this.stagingDir);
            }
        } catch (e) { }
        await game.promises.ensureDirectory(this.stagingDir);

        const buf = await game.promises.readFile(codeZipTemp);
        const zipMd5 = md5Hex(buf);
        updateLogger.info('校验', `code.zip 读取：size=${buf.byteLength}B md5=${zipMd5}${this.codeZipMeta?.md5 ? ` 期望=${this.codeZipMeta.md5}${zipMd5 === this.codeZipMeta.md5 ? '（一致）' : '（不一致！）'}` : ''}`);
        let zip;
        try {
            zip = await get.promises.zip();
            // jszip 2.7：同步 load，checkCRC32 对每个条目做 CRC 校验，损坏/截断即抛
            zip.load(buf, { checkCRC32: true });
            updateLogger.info('校验', `code.zip CRC32 校验通过（${Object.keys(zip.files).filter(n => !n.endsWith('/')).length} 个条目）`);
        } catch (e) {
            updateLogger.error('校验', `code.zip CRC32 校验失败: ${e.message}`);
            const error = new Error(`代码包损坏（CRC32 校验失败）: ${e.message}`);
            error.updateStage = 'verify';
            throw error;
        }

        this.staged = {};
        await this.state.setPhase('extracting', true);
        try {
            for (const name of Object.keys(zip.files)) {
                if (!name || name.endsWith('/')) continue; // 跳过目录条目
                const cleanName = name.replace(/^\/+/, '');
                if (!cleanName) continue;
                const data = zip.files[name].asUint8Array();
                const slashIdx = cleanName.lastIndexOf('/');
                const dir = slashIdx >= 0 ? `${this.stagingDir}/${cleanName.slice(0, slashIdx)}` : this.stagingDir;
                const fileName = cleanName.slice(slashIdx + 1);
                if (typeof onProgress === 'function') onProgress(`正在解压 ${cleanName} ...`);
                await game.promises.ensureDirectory(dir);
                // writeFile 需要 ArrayBuffer/Buffer；取视图对应的精确字节
                const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                await game.promises.writeFile(ab, dir, fileName);
                this.staged[cleanName] = md5Hex(data);
            }
        } catch (e) {
            const error = new Error(`解压代码包失败: ${e.message}`);
            error.updateStage = 'verify';
            throw error;
        }

        // 代码包内 Directory.json 为新版本完整清单（权威）
        this.stagedManifest = null;
        this.stagedManifestPaths = [];
        try {
            const manifestText = await game.promises.readFileAsText(`${this.stagingDir}/${CONFIG.files.directory}`);
            this.stagedManifest = JSON.parse(manifestText);
            this.stagedManifestPaths = Object.keys(this.stagedManifest);
        } catch (e) {
            const error = new Error(`代码包内缺少有效的 Directory.json，无法校验`);
            error.updateStage = 'verify';
            throw error;
        }
    }

    // 校验暂存树：代码文件齐全 + md5 与清单一致（写盘前的“缺必需文件”防线）
    async verifyCodeStaging(onProgress = null) {
        await this.state.setPhase('verifying', true);
        const missing = [];
        const mismatched = [];
        for (const path of this.stagedManifestPaths) {
            if (!utils.isCodePath(path)) continue; // 媒体不随代码包，跳过
            if (typeof onProgress === 'function') onProgress(`正在校验代码包 ${path} ...`);
            if (!this.staged[path]) {
                missing.push(path);
                continue;
            }
            const expected = this.stagedManifest[path]?.md5;
            if (expected && this.staged[path] !== expected) {
                mismatched.push(path);
                updateLogger.warn('校验', `暂存文件 md5 不符: ${path} 期望=${expected} 实际=${this.staged[path]}`);
            }
        }
        updateLogger.info('校验', `代码包暂存树校验：缺失 ${missing.length}，md5 不符 ${mismatched.length}`);
        if (missing.length) updateLogger.info('校验', `暂存缺失(前10): ${missing.slice(0, 10).join(', ')}`);
        if (missing.length > 0 || mismatched.length > 0) {
            const error = new Error(
                `代码包校验失败：缺失 ${missing.length} 个文件、MD5 不符 ${mismatched.length} 个\n` +
                (missing.slice(0, 5).join('\n'))
            );
            error.updateStage = 'verify';
            throw error;
        }
    }

    // 从暂存目录写入代码文件（暂存已整体校验通过）
    async applyCodeFromStaging(onProgress = null) {
        for (const path of Object.keys(this.staged)) {
            if (typeof onProgress === 'function') onProgress(`正在写入代码文件 ${path} ...`);
            const slashIdx = path.lastIndexOf('/');
            const dir = slashIdx >= 0 ? `${this.targetDir}/${path.slice(0, slashIdx)}` : this.targetDir;
            const fileName = path.slice(slashIdx + 1);
            const content = await game.promises.readFile(`${this.stagingDir}/${path}`);
            await game.promises.ensureDirectory(dir);
            await game.promises.writeFile(content, dir, fileName);
        }
    }

    // 覆盖后复验：已写入的代码文件 md5 与清单一致，不符则回滚
    async postVerifyCode(onProgress = null) {
        for (const path of Object.keys(this.staged)) {
            const expected = this.stagedManifest[path]?.md5;
            if (!expected) continue; // Directory.json 自身等 md5 为 null 的文件跳过
            if (typeof onProgress === 'function') onProgress(`正在校验 ${path} ...`);
            const local = await game.promises.readFile(`${this.targetDir}/${path}`);
            if (md5Hex(local) !== expected) {
                updateLogger.error('校验', `覆盖后复验失败: ${path} 期望=${expected} 实际=${md5Hex(local)}`);
                const error = new Error(`覆盖后校验失败: ${path}`);
                error.updateStage = 'verify';
                throw error;
            }
        }
        updateLogger.info('校验', '覆盖后复验通过：全部代码文件 md5 与包内清单一致');
    }

    // 回滚到备份，并清理暂存目录
    async rollback(backup, onProgress = null) {
        if (!backup || !backup.path) return;
        try {
            const result = await this.backupManager.rollbackToBackup(backup, onProgress);
            if (result.success) {
                updateLogger.info('回滚', '已恢复到备份版本');
            } else {
                updateLogger.error('回滚', `失败: ${String(result.error || '')}`);
                await this.ui.alert('回滚失败', `更新失败且自动回滚未成功，可手动从备份恢复：\n${backup.path}`);
            }
        } catch (e) {
            updateLogger.error('回滚', `异常: ${e.message}`);
        } finally {
            try {
                if (await game.promises.checkDir(this.stagingDir) === 1) {
                    await game.promises.removeDir(this.stagingDir);
                }
            } catch (e) { }
        }
    }

    // 读取本地（旧）Directory.json 的文件路径列表；缺失或解析失败返回 null
    async readLocalDirectoryJson() {
        try {
            const exists = await game.promises.checkFile(`${this.targetDir}/${CONFIG.files.directory}`);
            if (exists !== 1) return null;
            const content = await game.promises.readFileAsText(`${this.targetDir}/${CONFIG.files.directory}`);
            return Object.keys(JSON.parse(content));
        } catch (e) {
            updateLogger.warn('清理', `读取本地文件清单失败: ${e.message}`);
            return null;
        }
    }

    // 删除新版本已移除的本地文件，并清理空目录
    // 正常路径按「旧清单 − 新清单」差集删除；本地缺少 Directory.json 无法对比时，
    // 回退为清空式清理：删除本地所有不在新清单中的文件（等效"全部删除再重下"）
    // 新清单必须是完整清单（代码包内 Directory.json 的全部路径），且按模式过滤：
    // code 模式绝不触碰媒体文件。
    async removeObsoleteFiles(oldFileList, newManifestPaths, onProgress = null) {
        const newSet = new Set(newManifestPaths || []);
        if (newSet.size === 0) {
            updateLogger.warn('清理', '新版本文件清单为空，跳过清理');
            return;
        }

        let candidates;
        if (oldFileList && oldFileList.length > 0) {
            // 正常路径：仅清理旧清单中有、新清单中没有的文件
            candidates = oldFileList.filter(p => !newSet.has(p));
        } else {
            // 回退路径：无本地清单可对比，删除本地所有不在新清单中的文件
            const localFiles = await this.walkLocalFiles();
            candidates = localFiles.filter(p => !newSet.has(p));
        }

        // code 模式：媒体完全不动
        if (this.mode === 'code') {
            candidates = candidates.filter(utils.isCodePath);
        }

        for (const relPath of candidates) {
            if (PROTECTED_FILES.has(relPath)) continue; // Directory.json / version.json 保护
            if (typeof onProgress === 'function') onProgress(`正在清理旧文件 ${relPath} ...`);
            const target = `${this.targetDir}/${relPath}`;
            try {
                const exists = await game.promises.checkFile(target);
                if (exists === 1) {
                    await game.promises.removeFile(target);
                    updateLogger.info('清理', `清理失效文件: ${relPath}`);
                }
            } catch (e) {
                updateLogger.warn('清理', `删除失败: ${relPath} ${String(e?.message || e)}`);
            }
        }
        await this.pruneEmptyDirs();
    }

    // 递归收集扩展目录下所有文件的相对路径（跳过保护目录/文件）
    async walkLocalFiles() {
        const result = [];
        const prefix = this.targetDir.length + 1;
        const walk = async (dir) => {
            let folders = [], files = [];
            try {
                [folders, files] = await getFileList(dir);
            } catch (e) {
                return;
            }
            for (const f of files) {
                if (PROTECTED_FILES.has(f)) continue;
                result.push(`${dir}/${f}`.slice(prefix));
            }
            for (const f of folders) {
                if (PROTECTED_DIRS.has(f)) continue;
                await walk(`${dir}/${f}`);
            }
        };
        await walk(this.targetDir);
        return result;
    }

    // 自底向上删除扩展目录下的空目录（保护系统目录）
    async pruneEmptyDirs() {
        const walk = async (dir) => {
            let isEmpty = false;
            try {
                const [folders, files] = await getFileList(dir);
                const removable = [];
                for (const f of folders) {
                    if (PROTECTED_DIRS.has(f)) continue;
                    const sub = `${dir}/${f}`;
                    if (await walk(sub)) removable.push(f);
                }
                for (const f of removable) {
                    await game.promises.removeDir(`${dir}/${f}`);
                }
                const [folders2, files2] = await getFileList(dir);
                isEmpty = folders2.filter(f => !PROTECTED_DIRS.has(f)).length === 0 && files2.length === 0;
            } catch (e) { }
            return isEmpty;
        };
        await walk(this.targetDir);
    }

    // 将新版本的文件清单写回本地，保持后续更新的差集准确
    // 新版本清单已包含 Directory.json 时会随下载应用；此处仅兜底旧分支等未分发清单的情况
    async refreshLocalDirectoryJson() {
        try {
            // 优先写回代码包内的 Directory.json（权威），其次使用临时下载的副本
            let content = null;
            if (await game.promises.checkFile(`${this.stagingDir}/${CONFIG.files.directory}`) === 1) {
                content = await game.promises.readFileAsText(`${this.stagingDir}/${CONFIG.files.directory}`);
            } else if (await game.promises.checkFile(`${this.tempDir}/${CONFIG.files.directory}`) === 1) {
                content = await game.promises.readFileAsText(`${this.tempDir}/${CONFIG.files.directory}`);
            }
            if (content == null) return;
            await game.promises.writeFile(content, this.targetDir, CONFIG.files.directory);
            updateLogger.info('应用', '已更新本地文件清单 Directory.json');
        } catch (e) {
            updateLogger.warn('应用', `更新本地文件清单失败: ${e.message}`);
        }
    }

    async applyDownloadedFiles(onProgress = null) {
        const successFiles = this.state.data.files.filter(f => f.status === 'success' && f.tempVerified && !f.applied);
        for (const fileState of successFiles) {
            const task = this.tasks.find(t => t.remote === fileState.path);
            if (!task) continue;
            if (task.kind === 'zip') continue; // 代码包由 applyCodeFromStaging 处理

            try {
                if (typeof onProgress === 'function') onProgress(`正在写入 ${fileState.path} ...`);
                const content = await game.promises.readFile(task.temp);
                const targetDir = task.target.substring(0, task.target.lastIndexOf('/'));
                const targetName = task.target.split('/').pop();
                await game.promises.ensureDirectory(targetDir);
                await game.promises.writeFile(content, targetDir, targetName);
                await this.state.updateFile(fileState.path, 'applied', null, null, fileState.size || 0, true);
                await game.promises.removeFile(task.temp);
            } catch (e) {
                updateLogger.error('应用', `应用文件失败: ${fileState.path} - ${e.message}`);
                const error = new Error(`应用文件失败: ${fileState.path} - ${e.message}`);
                error.updateStage = 'apply';
                error.errorType = 'apply';
                throw error;
            }
        }
    }

    async cleanup() {
        for (const dir of [this.tempDir, this.stagingDir]) {
            if (!dir) continue;
            try {
                const exists = await game.promises.checkDir(dir);
                if (exists === 1) {
                    await game.promises.removeDir(dir);
                    updateLogger.info('清理', `已删除临时目录: ${dir}`);
                }
            } catch (e) {
                updateLogger.warn('清理', `删除临时目录失败: ${dir} ${String(e?.message || e)}`);
            }
        }
    }

    // Token 管理
    async manageTokens() {
        while (true) {
            const action = await this.ui.showTokenManager(this.tokens);
            if (!action) break;

            if (action.action === 'set') {
                const token = await this.ui.inputToken(action.platform);
                if (token !== null) {
                    if (token === '') {
                        this.tokens.clear(action.platform);
                        await this.ui.alert('清除成功', `${action.platform} Token 已清除`);
                    } else {
                        this.tokens.set(action.platform, token);
                        await this.ui.alert('设置成功', `${action.platform} Token 已保存`);
                    }
                }
            } else if (action.action === 'clear') {
                this.tokens.clear(action.platform);
                await this.ui.alert('清除成功', `${action.platform} Token 已清除`);
            }
        }
    }

    // 版本回退
    async manageRollback() {
        while (true) {
            const backups = await this.backupManager.listBackups();
            const currentVersion = 'current'; // 可扩展为读取当前版本

            const action = await this.ui.showRollbackManager(backups, currentVersion);
            if (!action) break;

            if (action.action === 'rollback') {
                const confirmed = await this.ui.confirmRollback(action.backup);
                if (confirmed) {
                    // 回退涉及整目录复制/删除，耗时较长，用加载框展示当前行为
                    const loading = await this.ui.showLoading('正在回退版本', '正在备份当前版本...');
                    let result;
                    try {
                        result = await this.backupManager.rollbackToBackup(
                            action.backup,
                            (msg) => loading.updateText(msg)
                        );
                    } finally {
                        loading.close();
                    }
                    if (result.success) {
                        await this.ui.alert('回退成功', '版本已回退，建议立即重启游戏');
                        if (await this.ui.confirm('重启确认', '是否立即重启？', '立即重启', '稍后')) {
                            game.reload();
                        }
                        break;
                    } else {
                        await this.ui.alert('回退失败', result.error);
                    }
                }
            } else if (action.action === 'delete') {
                const confirm = await this.ui.confirm(
                    '删除确认',
                    `确定删除选中的 ${action.backups.length} 个备份吗？此操作不可恢复。`,
                    '删除', '取消'
                );
                if (confirm) {
                    const loading = await this.ui.showLoading('正在删除备份', '正在删除选中的备份...');
                    let deleted = 0;
                    try {
                        for (const backup of action.backups) {
                            loading.updateText(`正在删除 ${backup.name} ...`);
                            if (await this.backupManager.deleteBackup(backup)) deleted++;
                        }
                    } finally {
                        loading.close();
                    }
                    await this.ui.alert('删除成功', `已删除 ${deleted} 个备份`);
                }
            }
        }
    }

    // 全新下载：版本检查、自选版本、文件列表准备与确认
    async prepareFreshDownload() {
        const gameVer = lib.version || '1.0.0';

        // 阶段一：请求版本信息（version.json）—— 网络耗时，显示“请稍候”避免 UI 空窗
        const loadInfo = await this.ui.showLoading('正在获取更新信息', '正在请求更新信息，请稍候...');
        let verInfo = null;
        let candidates = null;
        try {
            if (this.previewMode) {
                // 预览版：固定 main 分支，版本信息仅作兼容性警告，不据此选版本
                this.repo.switchBranch(CONFIG.previewBranch);
                const versions = await new VersionChecker(this.repo, this.tokens, this.envType).list(gameVer);
                verInfo = versions.find(v => v.branch === CONFIG.previewBranch) || versions[0] || null;
                if (!verInfo || !verInfo.compatible) {
                    const reason = verInfo
                        ? `预览版（main 分支）声明的兼容游戏版本为 ${verInfo.gameVersion}，与当前无名杀版本（${gameVer}）不一致`
                        : '获取预览版版本信息失败（可能 version.json 暂缺）';
                    game.print(`[警告] ${reason}，仅警告不中断`);
                    await this.ui.alert('预览版兼容性警告', `${reason}。\n\n预览版仅作警示，可继续下载，但可能无法正常运行。`);
                }
            } else {
                // 更新至发布版：必须从 version.json 选到可用的发布版本。
                // 所有分支/版本失效时直接报错，绝不回退到 main（main 仅用于预览版）。
                const versions = await new VersionChecker(this.repo, this.tokens, this.envType).list(gameVer);
                if (versions.length === 0) {
                    const error = new Error('未能获取有效的发布版本信息（version.json 为空或解析失败），所有分支失效，无法更新到发布版');
                    error.updateStage = 'version';
                    throw error;
                }
                candidates = versions.filter(v => v.compatible);
                if (candidates.length === 0) {
                    const error = new Error(`没有兼容当前无名杀版本（${gameVer}）的发布版本，全部分支失效；可改用“更新至预览版”进行尝试`);
                    error.updateStage = 'version';
                    throw error;
                }
                verInfo = candidates[0]; // 默认选最新兼容版本
            }
        } finally {
            loadInfo.close();
        }

        // 交互路径且存在多个候选时允许自选版本（loading 已关闭）
        if (this.versionSelect && candidates && candidates.length > 1) {
            const picked = await this.ui.showVersionSelect(candidates);
            if (!picked) {
                await this.cleanup();
                return { cancelled: true };
            }
            verInfo = picked;
        }

        // 预览模式强制 main 分支，不随版本信息切换
        if (!this.previewMode && verInfo && verInfo.branch && verInfo.branch !== this.repo.branch) {
            this.repo.switchBranch(verInfo.branch);
        }
        updateLogger.setContext({ '目标版本': verInfo?.extensionVersion || '(main 最新)', '目标分支': this.repo.branch });
        updateLogger.info('版本', `目标版本=${verInfo?.extensionVersion || '未知'}，目标分支=${this.repo.branch}`);

        // 阶段二：下载文件清单并建立任务（Directory.json）—— 同样耗时，显示“请稍候”
        const loadList = await this.ui.showLoading('正在准备更新清单', '正在下载文件清单，请稍候...');
        let prepared;
        try {
            prepared = await this.prepareFileList(undefined, verInfo);
        } finally {
            loadList.close();
        }

        const { fileCount, skipCount, totalBytes, zipSize, fileCheck } = prepared;

        // “检查更新”入口：全部含 md5 的文件均与清单一致 → 已是最新，不下载
        if (this.checkOnly && fileCheck?.upToDate) {
            await this.cleanup();
            return { upToDate: true, fileCheck };
        }
        // “检查更新”入口：存在差异 → 仅报告，不下载（是否更新由用户决定）
        if (this.checkOnly) {
            await this.cleanup();
            return { needsUpdate: true, fileCheck };
        }
        // “更新至预览版”：本地文件与 main 清单完全一致 → 已是最新预览版，不再询问是否更新
        if (this.previewMode && fileCheck?.upToDate) {
            await this.cleanup();
            return { upToDate: true, fileCheck };
        }
        // 预览版：md5 差异仅警告，继续下载
        if (this.previewMode && fileCheck && !fileCheck.upToDate) {
            const { mismatched, missing } = fileCheck;
            const diffLines = [
                ...mismatched.slice(0, 5).map(p => `・ ${p}（md5 不一致）`),
                ...missing.slice(0, 5).map(p => `・ ${p}（缺失）`),
            ];
            const totalDiff = mismatched.length + missing.length;
            const more = totalDiff > diffLines.length ? `\n...等 ${totalDiff} 个文件` : '';
            game.print(`[警告] 预览版：${mismatched.length} 个文件与 main 清单不一致，${missing.length} 个文件缺失（仅警告，继续下载）`);
            updateLogger.warn('版本', `预览版与 main 清单差异：${mismatched.length} 不一致，${missing.length} 缺失`);
            updateLogger.warn('版本', `差异文件：${diffLines.join('；')}${more}`);
        }

        // “更新至发布版·自动”：全部含 md5 的文件均与清单一致 → 已是最新，不下载。
        // 仅交互式自动模式生效；仅代码/完整覆写仍强制更新（checkOnly 分支已先行处理）。
        if (this.mode === 'auto' && this.versionSelect && fileCheck?.upToDate) {
            await this.cleanup();
            return { upToDate: true, fileCheck };
        }

        const confirmed = await this.ui.confirmStart({
            version: verInfo?.extensionVersion,
            description: verInfo?.description,
            highlights: verInfo?.highlights,
            branch: this.repo.branch,
            platform: this.repo.platform,
            mode: this.mode,
            fileCount,
            skipCount,
            totalSize: utils.parseSize(totalBytes),
            zipSize,
            envType: this.envType,
            preview: this.previewMode
        });

        if (!confirmed) {
            await this.cleanup();
            return { cancelled: true };
        }
        return {};
    }

    // 主更新流程
    async update(force = false, resumeMode = false, retryMode = false) {
        this.startTime = Date.now();
        let progressUI = null;
        this._tokenPrompted = false;

        updateLogger.info('更新', `开始更新任务：模式=${resumeMode ? '断点续传' : retryMode ? '重试失败' : '全新下载'}`);

        try {
            // 断点续传模式：保持现有状态继续下载
            if (resumeMode) {
                // 检查是否有可恢复的任务
                if (!this.state || !this.state.data || !this.state.canResume()) {
                    throw new Error('没有可恢复的下载任务');
                }

                if (this.state.hasPendingApply()) {
                    game.print(`[恢复] 继续应用已下载文件: ${this.state.data.stats.success}/${this.state.data.stats.total} 文件已就绪`);
                } else {
                    game.print(`[断点续传] 恢复下载: ${this.state.data.stats.success}/${this.state.data.stats.total} 文件已完成`);
                }
            }
            // 重试模式：只处理失败的文件
            else if (retryMode) {
                // 如果没有失败的文件，直接返回
                if (!this.state || !this.state.data) {
                    throw new Error('没有可重试的失败文件');
                }

                const failedCount = this.state.getFailed().length;
                if (failedCount === 0) {
                    return { success: true, stats: this.state.data.stats, message: '没有失败的文件需要重试' };
                }
            }
            // 正常模式：全新下载或检查版本
            else {
                // 如果有可恢复的状态，询问用户是否继续
                if (this.state.data && this.state.canResume() && !force) {
                    const choice = await this.ui.confirm(
                        '发现未完成任务',
                        '检测到上次未完成的下载任务，是否继续下载？\n\n选择"取消"将开始新的下载任务并删除之前的进度。',
                        '继续下载',
                        '开始新任务'
                    );

                    if (choice) {
                        // 用户选择继续，保持现有状态
                        if (this.state.hasPendingApply()) {
                            game.print(`[恢复] 继续应用已下载文件: ${this.state.data.stats.success}/${this.state.data.stats.total} 文件已就绪`);
                        } else {
                            game.print(`[断点续传] 恢复下载: ${this.state.data.stats.success}/${this.state.data.stats.total} 文件已完成`);
                        }
                    } else {
                        // 用户选择新任务，清理并重新开始
                        await this.cleanup();
                        this.tasks = [];
                        this.totalBytes = 0;

                        const prepared = await this.prepareFreshDownload();
                        if (prepared.cancelled) return prepared;
                        if (prepared.upToDate) return { success: true, upToDate: true, message: '当前已是最新版本' };
                        if (prepared.needsUpdate) return { needsUpdate: true, fileCheck: prepared.fileCheck };
                    }
                } else {
                    // 全新下载：版本检查、自选版本、文件列表准备与确认
                    const prepared = await this.prepareFreshDownload();
                    if (prepared.cancelled) return prepared;
                    if (prepared.upToDate) return { success: true, upToDate: true, message: '当前已是最新版本' };
                    if (prepared.needsUpdate) return { needsUpdate: true, fileCheck: prepared.fileCheck };
                }
            }

            // 获取本轮真正需要下载的文件；auto 模式中已命中本地校验的 skip 项不计入进度分母。
            const pendingFiles = retryMode
                ? this.state.getFailed()
                : this.state.getPending().filter(file => {
                    const task = this.tasks.find(item => item.remote === file.path);
                    return task && !task.skip;
                });
            const pendingCount = pendingFiles.length;
            const totalBytes = pendingFiles.reduce((sum, file) => sum + (file.size || 0), 0);

            if (pendingCount === 0 && !this.state.hasPendingApply()) {
                return { success: true, stats: this.state.data.stats, message: '所有文件已是最新' };
            }

            if (pendingCount > 0) {
                progressUI = await this.ui.createDownloadProgress(
                    retryMode ? '重试失败文件' : '下载更新',
                    totalBytes,
                    pendingCount,
                    this.mode
                );
            }

            if (pendingCount > 0) {
                // 执行下载（区分正常下载、断点续传和重试下载）
                const onProgress = (name, fileRec, fileTot, totalRec, totalTot, idx, tot) => {
                    progressUI.updateProgress(name, fileRec, fileTot, totalRec, totalTot, idx, tot);
                };
                const onFileStart = (name, size) => {
                    progressUI.setFile(name, size);
                };
                const onFileComplete = (name, size, success) => {
                    progressUI.finishFile(name, size, success);
                };
                const downloadMethod = retryMode
                    ? () => this.retryFailedFiles(onProgress, onFileStart, onFileComplete)
                    : () => this.downloadFiles(onProgress, onFileStart, onFileComplete);

                await downloadMethod();
                await progressUI.drain();
                progressUI.close();

                // 预览模式：汇总被接受的 md5 不符文件（仅警告）
                if (this.previewMode && this.downloader.lenientMismatches?.length > 0) {
                    const list = this.downloader.lenientMismatches
                        .slice(0, 5)
                        .map(p => `・ ${p}`)
                        .join('\n');
                    const more = this.downloader.lenientMismatches.length > 5
                        ? `\n...等 ${this.downloader.lenientMismatches.length} 个文件`
                        : '';
                    game.print(`[警告] 预览版：${this.downloader.lenientMismatches.length} 个文件下载后 md5 与清单不符（已接受，仅警告）`);
                    updateLogger.warn('校验', `预览版已接受的 md5 不符文件：${list}${more}`);
                }
            }

            const failed = this.state.getFailed();
            if (failed.length > 0) {
                this.shouldCleanup = false;
                this.state.complete(true);
                const action = await this.ui.showCompleteResult(
                    {
                        stats: this.state.data.stats,
                        elapsed: ((Date.now() - this.startTime) / 1000).toFixed(1),
                        platform: this.repo.platform,
                        mode: this.mode
                    },
                    failed.map(f => ({
                        path: f.path,
                        error: f.error,
                        errorType: f.errorType,
                        kind: f.kind // 'zip' = code.zip 哨兵任务；其余为 'file'
                    }))
                );

                if (action === 'retry') {
                    // 仅重试失败
                    return await this.update(false, false, true);
                }
                if (action === 'ignore') {
                    await this.state.markAllFailedAsSkipped();
                    await this.applyUpdate(); // 确保执行备份、替换和清理
                    return {
                        success: true,
                        partial: true,
                        stats: this.state.data.stats,
                        message: '已跳过失败文件完成更新'
                    };
                }
                if (action === 'restart') {
                    game.reload();
                    return {
                        success: true,
                        stats: this.state.data.stats,
                        message: '更新已完成'
                    };
                }
                return { retryLater: true, failed };
            } else {
                await this.applyUpdate();
                const result = {
                    success: true,
                    partial: false,
                    stats: this.state.data.stats,
                    elapsed: ((Date.now() - this.startTime) / 1000).toFixed(1),
                    platform: this.repo.platform,
                    mode: this.mode
                };

                const action = await this.ui.showCompleteResult(result, []);
                if (action === 'restart') {
                    game.reload();
                    return {
                        success: true,
                        stats: this.state.data.stats,
                        message: '更新已完成'
                    };
                }
                return result;
            }
        } catch (error) {
            if (progressUI) progressUI.close();

            if (error.message === '下载已取消') {
                this.shouldCleanup = false;
                return { cancelled: true, canResume: true };
            }

            throw error;
        }
    }
}

export { ExtensionUpdater };
