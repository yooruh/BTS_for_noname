import { game } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';
import { updateUtils as utils } from './utils.js';
import { TokenManager, Environment } from './repository.js';
import { StateManager } from './stateManager.js';
import { DownloadTask } from './downloader.js';
import { ExtensionUpdater } from './extensionUpdater.js';
import { updateLogger } from './logger.js';

// ==================== 对外接口 ====================
export const extensionUpdateManager = {
    async showUI() {
        const updater = new ExtensionUpdater();
        updateLogger.reset(); // 开始新的更新会话，清空上次日志

        try {
            const resumeInfo = await updater.checkResume();
            const hasToken = {
                github: updater.tokens.has('github'),
                gitee: updater.tokens.has('gitee')
            };

            // 一级菜单：更新中心
            const mainChoice = await updater.ui.showMainMenu(resumeInfo, hasToken);
            if (!mainChoice) return;

            if (mainChoice === 'token') {
                await updater.manageTokens();
                return;
            }

            if (mainChoice === 'rollback') {
                await updater.manageRollback();
                return;
            }

            // 二级菜单：更新菜单（检查更新 / 更新至预览版 / 更新至发布版 / 继续上次 / 重试失败）
            const choice = await updater.ui.showUpdateMenu(resumeInfo, hasToken);
            if (!choice) return;

            let mode = 'simple';
            let isResumeMode = false;
            let isRetryMode = false;

            if (choice === 'resume') {
                // 断点续传模式：使用现有状态继续下载
                if (!updater.state || !updater.state.data) {
                    throw new Error('恢复状态失败，请重新开始更新');
                }
                if (resumeInfo.canResume && resumeInfo.tempDir) {
                    updater.tempDir = resumeInfo.tempDir;
                    await updater.resumeFromState(resumeInfo.tempDir);
                }
                isResumeMode = true;
                if (updater.state.hasPendingApply()) {
                    game.print(`[恢复] 继续应用已下载文件: ${updater.state.data.stats.success}/${updater.state.data.stats.total} 文件已就绪`);
                } else {
                    game.print(`[断点续传] 恢复下载: ${updater.state.data.stats.success}/${updater.state.data.stats.total} 文件已完成`);
                }
            } else if (choice === 'retry_failed') {
                // 仅重试失败模式
                if (!updater.state || !updater.state.data) {
                    throw new Error('没有可重试的失败文件');
                }
                if (resumeInfo.canResume && resumeInfo.tempDir) {
                    updater.tempDir = resumeInfo.tempDir;
                    await updater.resumeFromState(resumeInfo.tempDir);
                }
                isRetryMode = true;
            } else if (choice === 'check') {
                // 检查更新：仅检查本地与线上 md5，不下载
                const platform = await updater.ui.selectPlatform();
                if (!platform) return;
                await updater.init(platform, 'auto');
                updater.checkOnly = true;
                updater.versionSelect = false; // 检查针对最新兼容分支，不弹版本选择
            } else if (choice === 'preview') {
                // 更新至预览版：固定 main 分支，版本/md5 差异仅警告
                const platform = await updater.ui.selectPlatform();
                if (!platform) return;
                if (resumeInfo.tempDir) {
                    const cleaning = await updater.ui.showLoading('正在清理', '正在清理旧的临时文件...');
                    try {
                        await updater.cleanup();
                    } finally {
                        cleaning.close();
                    }
                }
                updater.previewMode = true; // 先于 init 设置，init 据此配置下载器宽松校验
                await updater.init(platform, 'auto');
                updater.versionSelect = false;
            } else {
                // 更新至发布版：新任务（选源 + 选模式 + 下载应用）
                const config = await updater.ui.showUpdateConfig(
                    'github',
                    resumeInfo.canResume,
                    resumeInfo.hasFailures
                );
                if (!config) return;

                // 清理旧临时目录
                if (resumeInfo.tempDir && config.mode !== 'retry_failed') {
                    const cleaning = await updater.ui.showLoading('正在清理', '正在清理旧的临时文件...');
                    try {
                        await updater.cleanup();
                    } finally {
                        cleaning.close();
                    }
                }

                await updater.init(config.platform, config.mode);
                updater.versionSelect = true; // 交互路径允许自选更新版本
            }

            const result = await updater.update(false, isResumeMode, isRetryMode);

            // 已是最新版本（检查更新 / 更新至发布版·自动 均可能触发）
            if (result.upToDate) {
                game.print('当前已是最新版本');
                await updater.ui.alert('在线更新', '当前已是最新版本');
                return;
            }

            // 检查更新：存在差异，报告并询问是否更新（仅检查可随时退出）
            if (result.needsUpdate) {
                const fileCheck = result.fileCheck || {};
                const mismatched = fileCheck.mismatched || [];
                const missing = fileCheck.missing || [];
                const diffLines = [
                    ...mismatched.slice(0, 8).map(p => `・ ${p}（md5 不一致）`),
                    ...missing.slice(0, 8).map(p => `・ ${p}（缺失）`),
                ];
                const totalDiff = mismatched.length + missing.length;
                const more = totalDiff > diffLines.length ? `\n...等 ${totalDiff} 个文件` : '';
                const proceed = await updater.ui.confirm(
                    '检查更新',
                    `发现 ${mismatched.length} 个文件与线上不一致，${missing.length} 个文件缺失：\n\n` +
                    `${diffLines.join('\n')}${more}\n\n是否立即更新至发布版？`,
                    '更新至发布版',
                    '取消'
                );
                if (!proceed) {
                    game.print('[检查更新] 已检查，未执行下载');
                    return;
                }
                // 更新至发布版：选模式后重新走更新流程
                updater.checkOnly = false;
                const config = await updater.ui.showUpdateConfig('github', false, false);
                if (!config) return;
                await updater.init(config.platform, config.mode);
                updater.versionSelect = true;
                const result2 = await updater.update(false, false, false);
                await this.handleUpdateResult(updater, result2);
                return;
            }

            await this.handleUpdateResult(updater, result);

        } catch (error) {
            console.error('[更新失败]', error);

            // 细化错误提示
            const stage = error.updateStage || 'download';
            const isApplyStage = stage === 'apply';
            let errorTitle = isApplyStage ? '应用更新失败' : (stage === 'version' ? '无可用发布版本' : '下载更新失败');
            let errorMsg = error.message;

            if (error.message.includes('CORS') || error.message.includes('403')) {
                errorMsg += '\n\n建议解决方案：\n1. 使用客户端环境\n2. 切换更新源\n3. 稍后重试';
            }
            if (isApplyStage) {
                errorMsg += '\n\n当前已保留已下载文件，可稍后继续应用，无需重新完整下载。';
            } else {
                errorMsg += '\n\n当前可保留下载进度，稍后继续更新。';
            }

            await updater.ui.alert(errorTitle, errorMsg);

            // 失败后：先存档日志到临时下载目录（赶在用户清理临时目录之前），再展示可复制日志
            updateLogger.error('更新', `更新失败: ${errorMsg}`);
            const logPath = await updateLogger.writeToFile(updater.tempDir);

            if (error.message !== '下载已取消' && updater.tempDir) {
                const canResume = await updater.ui.confirm(
                    '恢复提示',
                    isApplyStage ? '是否保留当前进度，以便稍后继续应用已下载文件？' : '是否保留当前进度以便稍后重试？',
                    '保留进度',
                    '清空临时文件'
                );
                if (!canResume) {
                    const cleaning = await updater.ui.showLoading('正在清空', '正在清空临时文件...');
                    try {
                        await updater.cleanup();
                    } finally {
                        cleaning.close();
                    }
                }
            }

            await updater.ui.showLogReport(updateLogger.format(), logPath);
        }
    },

    // 存档日志文件到临时下载目录，并弹出可复制日志（供发群排查）
    async archiveAndShowLog(updater, summary) {
        updateLogger.error('更新', summary);
        const logPath = await updateLogger.writeToFile(updater.tempDir);
        await updater.ui.showLogReport(updateLogger.format(), logPath);
    },

    // 处理 update() 返回结果的共同部分（cancelled / retryLater / 部分完成）。
    // upToDate / needsUpdate 已由 showUI 单独处理。
    async handleUpdateResult(updater, result) {
        if (result.cancelled) {
            game.print('[更新] 已取消，进度已保存');
            return false;
        }

        if (result.retryLater) {
            let msg = '已保留下载进度，下次可继续';
            await updater.ui.alert('进度已保存', msg);
            // 下载失败（如 code.zip 失败）：存档日志并弹可复制日志
            await this.archiveAndShowLog(updater, `下载失败：${result.failed?.length || 0} 个文件未完成，进度已保存`);
            return false;
        }

        if (result.success && result.partial) {
            game.print(`[更新] 部分完成: ${result.message}`);
            // 部分文件下载失败（已忽略并应用）：同样存档日志供排查
            await this.archiveAndShowLog(updater, `部分完成：${result.stats?.failed || 0} 个文件下载失败`);
        }
        return true;
    },

    // 快速更新（后台模式）
    async quickUpdate(platform = 'gitee', mode = 'simple', force = false) {
        const updater = new ExtensionUpdater();
        try {
            await updater.init(platform, mode);

            const resumeInfo = await updater.checkResume();
            if (resumeInfo.canResume && !force) {
                game.print(resumeInfo.hasPendingApply ? '[更新] 发现已下载但未应用的文件，继续应用...' : '[更新] 发现未完成任务，继续下载...');
            }

            const result = await updater.update(force, resumeInfo.canResume && !force, mode === 'retry_failed');

            if (result.retryLater) {
                game.print(`[${CONFIG.name}] 部分文件下载失败，已保存进度`);
                return result;
            }

            if (result.success) {
                const msg = result.partial ?
                    `部分完成: ${result.stats.success}成功, ${result.stats.failed}失败` :
                    `更新完成: ${result.stats.success}个文件`;
                game.print(`[${CONFIG.name}] ${msg}`);
            }
            return result;
        } catch (error) {
            game.print(`[${CONFIG.name}] 更新失败: ${error.message}`);
            throw error;
        }
    },

    // 快速下载指定文件
    async quickDownload(fileList, options = {}) {
        const { platform = 'gitee', onProgress, silent = false } = options;
        const updater = new ExtensionUpdater();

        try {
            await updater.init(platform, 'full');
            const tasks = fileList.map((file, index) => {
                if (typeof file === 'string') {
                    return new DownloadTask({
                        remote: file,
                        temp: `${updater.tempDir}/${file}`,
                        target: `${updater.targetDir}/${file}`,
                        size: 0,
                        type: utils.getFileType(file),
                        priority: index
                    });
                } else {
                    return new DownloadTask({
                        remote: file.path || file.remote,
                        temp: `${updater.tempDir}/${file.path || file.remote}`,
                        target: file.target || `${updater.targetDir}/${file.path || file.remote}`,
                        size: file.size || 0,
                        type: file.type || utils.getFileType(file.path || file.remote),
                        priority: file.priority || index
                    });
                }
            });

            updater.tasks = tasks;
            updater.totalBytes = tasks.reduce((s, t) => s + (t.size || 0), 0);
            updater.state = new StateManager(updater.tempDir);
            await updater.state.init(updater.repo, updater.repo.branch, 'full', tasks);

            if (!silent) game.print(`[快速下载] 开始下载 ${tasks.length} 个文件...`);

            let progressUI = null;
            if (!silent) {
                const knownTotalBytes = tasks.every(task => task.size > 0) ? updater.totalBytes : 0;
                progressUI = await updater.ui.createDownloadProgress('快速下载', knownTotalBytes, tasks.length, 'full');
            }

            let completedFileCount = 0;
            let totalDownloadedBytes = 0;
            let roundTotalBytes = updater.totalBytes;
            let unknownSizeCount = tasks.filter(task => !(task.size > 0)).length;
            await utils.asyncPool(CONFIG.limits.maxConcurrent, tasks, async (task) => {
                if (progressUI) progressUI.setFile(task.remote, task.size || 0);
                let accountedBytes = 0;
                let accountedTotal = task.size || 0;
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

                    if (progressUI && (force || delta > 0)) {
                        progressUI.updateProgress(
                            task.remote,
                            normalized,
                            fileTotal,
                            totalDownloadedBytes,
                            unknownSizeCount > 0 ? 0 : roundTotalBytes,
                            completedFileCount,
                            tasks.length
                        );
                    }
                };

                try {
                    result = await updater.downloader.download(task, (rec, tot) => {
                        if (onProgress) onProgress(task.remote, rec, tot);
                        reportProgress(rec, task.size || tot || 0, true);
                    }, updater.state);

                    if (result.success) {
                        const actualSize = result.size || task.size || accountedBytes;
                        roundTotalBytes = Math.max(0, roundTotalBytes + actualSize - accountedTotal);
                        accountedTotal = actualSize;
                        if (!(task.size > 0)) unknownSizeCount = Math.max(0, unknownSizeCount - 1);
                        completedFileCount++;
                        reportProgress(actualSize, actualSize, true);
                    } else if (!silent) {
                        console.warn(`[快速下载] 失败: ${task.remote} - ${result.error}`);
                    }
                    return result;
                } catch (error) {
                    console.error(`[快速下载] ${task.remote} 异常:`, error);
                    result = { success: false, error: String(error?.message || error), errorType: 'network' };
                    try {
                        await updater.state.updateFile(task.remote, 'failed', result.error, result.errorType, 0, true);
                    } catch (stateError) {
                        console.error(`[快速下载] ${task.remote} 保存失败状态异常:`, stateError);
                    }
                    return result;
                } finally {
                    if (progressUI) {
                        progressUI.finishFile(
                            task.remote,
                            result?.success ? (result.size || task.size || accountedBytes) : (task.size || accountedBytes),
                            !!result?.success
                        );
                    }
                }
            });

            if (progressUI) {
                await progressUI.drain();
                progressUI.close();
            }

            const failedTasks = updater.state.getFailed();
            if (failedTasks.length) {
                const summary = failedTasks.reduce((acc, file) => {
                    const key = file.errorType || 'unknown';
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});
                if (!silent) {
                    const parts = Object.entries(summary).map(([type, count]) => `${type}:${count}`).join('，');
                    game.print(`[快速下载] ${failedTasks.length} 个文件下载失败（${parts}）`);
                }
                return { success: false, tasks, failed: failedTasks, summary };
            }

            if (silent) {
                await updater.applyDownloadedFiles();
                await updater.cleanup();
            } else {
                // 写入/清理阶段同样耗时，用加载框提示当前行为
                const loading = await updater.ui.showLoading('正在应用下载', '正在写入文件...');
                try {
                    await updater.applyDownloadedFiles((msg) => loading.updateText(msg));
                    await updater.cleanup();
                } finally {
                    loading.close();
                }
            }

            if (!silent) game.print('[快速下载] 完成');
            return { success: true, tasks, stats: updater.state?.data?.stats };
        } catch (error) {
            console.error('[快速下载] 失败:', error);
            throw error;
        }
    },

    async manageTokens() {
        const updater = new ExtensionUpdater();
        await updater.manageTokens();
    },

    async manageRollback() {
        const updater = new ExtensionUpdater();
        await updater.manageRollback();
    },

    token: {
        set: (platform, token) => new TokenManager().set(platform, token),
        get: (platform) => new TokenManager().get(platform),
        clear: (platform) => new TokenManager().clear(platform),
        has: (platform) => new TokenManager().has(platform)
    },

    getEnvironment() {
        return {
            type: Environment.getEnvironmentType(),
            details: Environment
        };
    }
};

