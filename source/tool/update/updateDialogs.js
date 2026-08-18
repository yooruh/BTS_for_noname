import { game } from '../../../../../noname.js';
import { dialogManager } from '../ui/dialogManager.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';
import { updateUtils as utils } from './utils.js';
import { updateEnvironment as Environment } from './repository.js';
import { watchStall } from './stallWatchdog.js';

// 将更新内容中的轻量 HTML 转为对话框可显示的纯文本（对话框使用 textContent，HTML 会被转义）
function plainText(html) {
    return String(html ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '')
        .replace(/\{\{poptip:([^}]+)\}\}/g, (_, token) => {
            const [arg, label] = token.split('|');
            return label || String(arg).replace(/^[a-z0-9_]+/i, '') || arg;
        })
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&gt;/gi, '>')
        .replace(/&lt;/gi, '<')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/gi, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ==================== UI 管理器 ====================
class UIManager {
    constructor() {
        this.dialog = dialogManager;
        this.env = Environment.getEnvironmentType();
    }

    // 卡死/停滞检测的默认配置：30 秒无活动即提示重启；可用 options.stall 覆盖或关闭（false）
    _stallOptions(options = {}) {
        const stall = options.stall;
        if (stall === false) return null;
        return {
            threshold: 30000,
            message: '检测到更新可能已卡死（进度长时间未变化），是否立即重启游戏？',
            buttonLabel: '立即重启',
            onRestart: () => game.reload(),
            ...(typeof stall === 'object' && stall ? stall : {})
        };
    }

    async showMainMenu(resumeInfo, hasToken) {
        const buttons = ['📋 更新菜单', '🔑 Token管理', '💾 版本回退', '取消'];

        const envText = this.env === 'node'
            ? '🖥️ 当前环境: Node.js（使用本体下载能力）\n'
            : this.env === 'cordova'
                ? '📱 当前环境: Cordova（使用本体移动端下载能力）\n'
                : this.env === 'electron-renderer'
                    ? '🖥️ 当前环境: Electron（使用本体下载能力）\n'
                    : '⚠️ 当前环境: 浏览器（文件接口受限，请谨慎更新）\n';

        const index = await this.dialog.choice(
            `${CONFIG.name} 更新中心`,
            `请选择操作：\n\n` +
            envText +
            `${resumeInfo.hasPendingApply ? '📦 发现已下载但尚未应用的更新文件\n' : ''}` +
            `${resumeInfo.canResume && !resumeInfo.hasPendingApply ? '⏸️ 发现未完成的下载任务\n' : ''}` +
            `${resumeInfo.hasFailures ? '⚠️ 存在上次下载失败的文件\n' : ''}` +
            `${!hasToken.github && !hasToken.gitee && this.env === 'browser' ? '💡 提示: 浏览器环境可能更容易失败\n' : ''}`,
            buttons
        );

        const choice = buttons[index];
        if (choice === '取消' || !choice) return null;
        if (choice.includes('更新菜单')) return 'update-menu';
        if (choice.includes('Token')) return 'token';
        if (choice.includes('版本回退')) return 'rollback';
        return null;
    }

    // 二级菜单：更新菜单（检查更新 / 更新至预览版 / 更新至发布版 / 继续上次 / 重试失败）
    async showUpdateMenu(resumeInfo, hasToken) {
        const buttons = ['🔍 检查更新', '⬇️ 更新至预览版', '🚀 更新至发布版'];
        if (resumeInfo.canResume) buttons.push(resumeInfo.hasPendingApply ? '📦 继续应用已下载文件' : '⏸️ 继续上次更新');
        if (resumeInfo.hasFailures) buttons.push('🔄 仅重试失败文件');
        buttons.push('返回');

        const envText = this.env === 'node'
            ? '🖥️ 当前环境: Node.js（使用本体下载能力）\n'
            : this.env === 'cordova'
                ? '📱 当前环境: Cordova（使用本体移动端下载能力）\n'
                : this.env === 'electron-renderer'
                    ? '🖥️ 当前环境: Electron（使用本体下载能力）\n'
                    : '⚠️ 当前环境: 浏览器（文件接口受限，请谨慎更新）\n';

        const index = await this.dialog.choice(
            `${CONFIG.name} 更新菜单`,
            `请选择操作：\n\n` +
            envText +
            `🔍 检查更新：仅比对本地与线上文件，不下载\n` +
            `⬇️ 更新至预览版：main 分支最新代码，差异仅警告\n` +
            `🚀 更新至发布版：已发布版本（可选更新模式）\n` +
            `${resumeInfo.hasPendingApply ? '📦 发现已下载但尚未应用的更新文件\n' : ''}` +
            `${resumeInfo.canResume && !resumeInfo.hasPendingApply ? '⏸️ 发现未完成的下载任务\n' : ''}` +
            `${resumeInfo.hasFailures ? '⚠️ 存在上次下载失败的文件\n' : ''}` +
            `${!hasToken.github && !hasToken.gitee && this.env === 'browser' ? '💡 提示: 浏览器环境可能更容易失败\n' : ''}`,
            buttons
        );

        const choice = buttons[index];
        if (choice === '返回' || !choice) return null;
        if (choice.includes('检查更新')) return 'check';
        if (choice.includes('预览版')) return 'preview';
        if (choice.includes('发布版')) return 'update';
        if (choice.includes('继续应用已下载文件')) return 'resume';
        if (choice.includes('继续上次')) return 'resume';
        if (choice.includes('重试失败')) return 'retry_failed';
        return null;
    }

    async showTokenManager(tokens) {
        const githubStatus = tokens.has('github') ? '✅ 已设置' : '❌ 未设置';
        const giteeStatus = tokens.has('gitee') ? '✅ 已设置' : '❌ 未设置';
        const envHint = this.env === 'node'
            ? 'Node 模式下通常无需 Token，但配置后可提高 API 限额'
            : '浏览器模式下强烈建议配置 Token，避免 Gitee 403 错误';

        const index = await this.dialog.choice(
            'Token 管理',
            `GitHub Token: ${githubStatus}\n` +
            `Gitee Token: ${giteeStatus}\n\n` +
            `${envHint}\n\n` +
            `GitHub: github.com/settings/tokens (需 repo 权限)\n` +
            `Gitee: gitee.com/profile/personal_access_tokens`,
            ['设置GitHub Token', '设置Gitee Token', '清除GitHub Token', '清除Gitee Token', '返回']
        );

        if (index === 0) return { action: 'set', platform: 'github' };
        if (index === 1) return { action: 'set', platform: 'gitee' };
        if (index === 2) return { action: 'clear', platform: 'github' };
        if (index === 3) return { action: 'clear', platform: 'gitee' };
        return null;
    }

    async inputToken(platform) {
        const name = platform === 'gitee' ? 'Gitee' : 'GitHub';
        const url = platform === 'gitee'
            ? 'https://gitee.com/profile/personal_access_tokens'
            : 'https://github.com/settings/tokens';

        const result = await this.dialog.input(
            `设置 ${name} Token`,
            `请输入私人令牌(Token)\n获取地址：${url}\n\n留空可清除现有 Token`,
            '',
            { placeholder: 'ghp_xxxx 或 gitee_token_xxxx', selectAll: false }
        );

        return result?.trim() || null;
    }

    async showRollbackManager(backups, currentVersion) {
        if (backups.length === 0) {
            await this.dialog.alert('版本回退', '暂无备份记录');
            return null;
        }

        const items = backups.map((b, i) => ({
            text: `[${i === 0 ? '当前' : `#${i + 1}`}] ${utils.formatDate(b.timestamp)} - ${b.fileCount}个文件`,
            value: b.timestamp.toString(),
            type: i === 0 ? 'current' : 'backup'
        }));

        const result = await this.dialog.filesManager(
            '版本回退管理',
            '选择要恢复的备份（仅可选一个回退，可多选删除）：\n💡 回退会覆盖当前版本，请先确认已备份重要数据',
            items,
            {
                // 备份目录不支持文本编辑，隐藏共享组件里的“编辑”按钮，避免误点后静默退出
                showEdit: false,
                applyText: '恢复此版本'
            }
        );

        if (!result) return null;

        if (result.action === 'apply' && result.files.length === 1) {
            const backup = backups.find(b => b.timestamp.toString() === result.files[0]);
            return { action: 'rollback', backup };
        }

        if (result.action === 'delete' && result.files.length > 0) {
            const toDelete = result.files.map(ts => backups.find(b => b.timestamp.toString() === ts)).filter(Boolean);
            return { action: 'delete', backups: toDelete };
        }

        return null;
    }

    async confirmRollback(backup) {
        return await this.dialog.confirm(
            '确认回退',
            `确定要回退到以下版本吗？\n\n时间: ${utils.formatDate(backup.timestamp)}\n文件数: ${backup.fileCount}\n\n⚠️ 此操作将覆盖当前所有文件，且无法撤销！`,
            '确认回退',
            '取消'
        );
    }

    // 选择更新源（Gitee / GitHub），取消返回 null
    async selectPlatform() {
        const platforms = ['Gitee（国内推荐）', 'GitHub（国际）'];
        const platIndex = await this.dialog.choice('选择更新源', '请选择下载服务器：', platforms);
        if (platIndex === -1) return null;
        return platIndex === 0 ? 'gitee' : 'github';
    }

    async showUpdateConfig(platform, hasResume, hasFailed) {
        const selectedPlatform = await this.selectPlatform();
        if (!selectedPlatform) return null;

        let modeMessage =
            '自动选择：代码整包校验后更新；媒体按 MD5 比对，未改动的媒体跳过下载（省流量）\n' +
            '仅代码：只更新代码文件，媒体文件完全不动\n' +
            '完整覆写：代码 + 全部媒体无条件覆盖（适合首次安装/修复损坏）';
        let modeButtons = ['自动选择', '仅代码', '完整覆写'];

        if (hasFailed) {
            modeMessage = '⚠️ 发现上次有失败的下载\n\n仅重试失败：只下载上次失败的文件\n' + modeMessage;
            modeButtons.unshift('仅重试失败文件');
        }

        modeButtons.push('取消');

        const modeIndex = await this.dialog.choice('选择更新模式', modeMessage, modeButtons);
        if (modeIndex === -1) return null;

        let mode = 'auto';
        if (hasFailed && modeIndex === 0) {
            mode = 'retry_failed';
        } else {
            const offset = hasFailed ? 1 : 0;
            mode = modeIndex === offset ? 'auto' : modeIndex === offset + 1 ? 'code' : 'full';
        }

        return { platform: selectedPlatform, mode };
    }

    // 计算下载进度
    async createDownloadProgress(title, totalBytes, totalFiles, mode, options = {}) {
        const controller = await this.dialog.complexLoading(
            title,
            mode === 'retry_failed' ? '正在重试失败的文件...' : '准备下载...',
            {
                width: 'min(520px, 92vw)',
                minHeight: '280px',
                indeterminate: false,
                initialStatus: '连接中...',
                initialDetail: totalBytes > 0
                    ? `已下载 ${utils.padSize(0)} / 共 ${utils.padSize(totalBytes)} · 剩余 ${utils.padSize(totalBytes)}`
                    : `共 ${totalFiles} 个文件 · 大小未知`,
                fileBar: true,
                initialFileName: '等待开始...'
            }
        );

        // 卡死/停滞检测（默认开启）：30s 无进度即在底部追加“是否重启”提示，不打断下载
        const stallCfg = this._stallOptions(options);
        const stallWatch = stallCfg ? watchStall(controller, stallCfg) : null;

        const files = new Map();
        const queue = [];
        const startTime = Date.now();
        let lastSpeedTime = startTime;
        let lastSpeedBytes = 0;
        let sampledSpeed = 0;
        let activeName = null;
        let activeReady = false;
        let processing = false;
        let closed = false;
        let msgStarted = false;

        const notify = (file) => {
            file.waiters.splice(0).forEach(resolve => resolve());
        };

        const ensureFile = (name, size = 0) => {
            let file = files.get(name);
            if (!file) {
                file = {
                    name,
                    size: Number(size) || 0,
                    received: 0,
                    total: Number(size) || 0,
                    percent: 0,
                    complete: false,
                    success: false,
                    timedOut: false,
                    queued: false,
                    waiters: [],
                    timeoutId: null
                };
                files.set(name, file);
            } else if (size > 0) {
                file.size = Number(size);
                file.total = Math.max(file.total, Number(size));
            }
            return file;
        };

        const waitForChange = file => new Promise(resolve => file.waiters.push(resolve));

        const enqueueFile = (file) => {
            if (file.queued) return;
            file.queued = true;
            queue.push(file.name);
        };

        const armFileTimeout = (file) => {
            if (file.timeoutId) clearTimeout(file.timeoutId);
            file.timeoutId = setTimeout(() => {
                if (file.complete || closed) return;
                file.complete = true;
                file.success = false;
                file.timedOut = true;
                enqueueFile(file);
                notify(file);
                scheduleQueue();
            }, 180000);
        };

        // 取路径最后一段作为文件名，长路径被截断时关键信息仍保持可见
        const basenameOf = (name) => name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);

        // 进度信息拆为「文件名」「百分比/大小」两个独立字符串，由 UI 合并渲染为两行（不再拼接 \n）
        const formatFileLabel = (file, percent = file.percent) => {
            const total = file.total || file.size;
            const name = `${basenameOf(file.name)}: ${file.name}`;
            let info;
            if (total <= 0) {
                info = `${utils.padPercent(percent)} · 大小未知`;
            } else {
                const received = Math.min(Math.max(0, file.received), total);
                const remaining = Math.max(0, total - received);
                info = `${utils.padPercent(percent)} · 剩余 ${utils.padSize(remaining)} · ${utils.padSize(received)} / ${utils.padSize(total)}`;
            }
            return { name, info };
        };

        const processQueue = async () => {
            if (processing || closed) return;
            processing = true;

            try {
                while (queue.length > 0 && !closed) {
                    const name = queue[0];
                    const file = files.get(name);
                    if (!file) {
                        queue.shift();
                        continue;
                    }

                    activeName = name;
                    activeReady = false;
                    // 切换文件时先立即落到0%，跨两帧后再应用缓存目标，确保浏览器能建立动画起点。
                    controller.setFileBar(formatFileLabel({ ...file, received: 0 }, 0), 0, { immediate: true });
                    await controller.nextFrame();
                    activeReady = true;

                    // 应用等待动画帧期间积累的最新进度；之后由 updateProgress 直接实时刷新。
                    if (!file.complete) {
                        const target = Math.min(99, file.percent);
                        controller.setFileBar(formatFileLabel(file, target), target);
                    }

                    while (!file.complete && !closed) await waitForChange(file);

                    if (closed) break;
                    if (file.success) {
                        file.received = file.total || file.size || file.received;
                        file.percent = 100;
                        controller.setFileBar(formatFileLabel(file, 100), 100);
                        // 动画只负责展示，不阻塞流程：不等 transition 结束就继续下一个文件，
                        // 避免“主进度条已完成、子进度条动画未播完”时整体卡住。
                        controller.waitForFileBar(100).catch(() => { });
                    } else {
                        const reason = file.timedOut ? '进度等待超时' : '下载失败';
                        controller.setFileBar({ name: `${reason} · ${basenameOf(file.name)}`, info: file.name }, file.percent);
                    }

                    queue.shift();
                    activeName = null;
                    activeReady = false;
                }
            } finally {
                activeName = null;
                activeReady = false;
                processing = false;
            }
        };

        const scheduleQueue = () => {
            processQueue().catch(error => {
                console.error('[更新进度] 文件动画队列异常:', error);
                queue.length = 0;
                activeName = null;
                activeReady = false;
                processing = false;
            });
        };

        const close = () => {
            closed = true;
            if (stallWatch) stallWatch.stop();
            files.forEach(file => {
                if (file.timeoutId) clearTimeout(file.timeoutId);
                file.timeoutId = null;
                notify(file);
            });
            queue.length = 0;
            activeName = null;
            activeReady = false;
            processing = false;
            controller.close();
        };

        return {
            setFile: (name, size) => {
                if (!msgStarted) {
                    controller.updateText('正在下载...');
                    msgStarted = true;
                }
                const file = ensureFile(name, size);
                enqueueFile(file);
                armFileTimeout(file);
                scheduleQueue();
            },

            // 基于实际下载字节或文件数的进度计算
            updateProgress: (name, fileReceived, fileTotal, totalReceived, totalSize, currentFileIndex, totalFilesCount) => {
                const now = Date.now();
                const elapsed = (now - startTime) / 1000;
                const normalizedTotal = Math.max(0, Number(totalSize) || 0);
                const normalizedReceived = normalizedTotal > 0
                    ? Math.min(normalizedTotal, Math.max(0, Number(totalReceived) || 0))
                    : Math.max(0, Number(totalReceived) || 0);
                const file = ensureFile(name, fileTotal);
                enqueueFile(file);

                file.received = Math.max(file.received, Number(fileReceived) || 0);
                file.total = Math.max(file.total, Number(fileTotal) || 0);
                armFileTimeout(file);
                file.percent = file.total > 0
                    ? Math.min(100, Math.round((file.received / file.total) * 100))
                    : 0;

                let totalPercent;
                let status;
                let detail;
                // 文件计数固定宽度，避免数字变化时画面跳动
                const paddedIndex = String(currentFileIndex).padStart(String(totalFilesCount).length, ' ');

                if (normalizedTotal === 0) {
                    totalPercent = totalFilesCount > 0
                        ? Math.min(100, Math.round((currentFileIndex / totalFilesCount) * 100))
                        : 0;
                    const remainingFiles = Math.max(0, totalFilesCount - currentFileIndex);
                    const avgTimePerFile = elapsed > 0 && currentFileIndex > 0 ? elapsed / currentFileIndex : 0;
                    const eta = avgTimePerFile > 0 ? remainingFiles * avgTimePerFile : 0;
                    status = `文件 ${paddedIndex}/${totalFilesCount}` + (eta > 0 ? ` · 剩余 ${utils.formatTime(eta)}` : '');
                    detail = `已完成 ${paddedIndex}/${totalFilesCount} 个文件 · 大小未知`;
                } else {
                    totalPercent = Math.min(100, Math.round((normalizedReceived / normalizedTotal) * 100));
                    const speedDeltaTime = (now - lastSpeedTime) / 1000;
                    if (speedDeltaTime >= 0.5) {
                        sampledSpeed = Math.max(0, normalizedReceived - lastSpeedBytes) / speedDeltaTime;
                        lastSpeedBytes = normalizedReceived;
                        lastSpeedTime = now;
                    }

                    const remainingBytes = Math.max(0, normalizedTotal - normalizedReceived);
                    const eta = sampledSpeed > 0 ? remainingBytes / sampledSpeed : 0;
                    status = sampledSpeed > 0
                        ? `${utils.padSize(sampledSpeed)}/s · 剩余 ${utils.formatTime(eta)} · 文件 ${paddedIndex}/${totalFilesCount}`
                        : `文件 ${paddedIndex}/${totalFilesCount}`;
                    detail = `已下载 ${utils.padSize(normalizedReceived)} / 共 ${utils.padSize(normalizedTotal)} · 剩余 ${utils.padSize(remainingBytes)}`;
                }

                controller.updateProgress({ percent: totalPercent, status, detail });

                // 当前正在展示的文件直接刷新标签和目标宽度；队列只负责文件间的0%/100%切换。
                if (activeReady && activeName === name && !file.complete) {
                    const target = Math.min(99, file.percent);
                    controller.setFileBar(formatFileLabel(file, target), target);
                }
                notify(file);
                scheduleQueue();
            },

            finishFile: (name, size, success) => {
                const file = ensureFile(name, size);
                enqueueFile(file);
                if (size > 0) {
                    file.size = Number(size);
                    file.total = Number(size);
                }
                if (file.timeoutId) {
                    clearTimeout(file.timeoutId);
                    file.timeoutId = null;
                }
                file.success = !!success;
                file.complete = true;
                if (file.success) {
                    file.received = file.total || file.size || file.received;
                    file.percent = 100;
                }
                notify(file);
                scheduleQueue();
            },

            // 排空仅表示“下载数据已全部处理完”。动画队列是装饰性的，
            // 调用方（extensionUpdater/index）都在下载全部结束后才调用，
            // 因此立即返回，避免下一步等子进度条动画播完。
            drain: () => Promise.resolve(),

            setError: (msg) => controller.setError(msg),
            complete: (msg, delay) => controller.complete(msg, delay),
            close,
            showRetry: (onRetry) => {
                controller.setError('部分文件下载失败', true, onRetry);
            },
            // 供其他代码发送信号：在底部追加“是否重启”等提示，不干扰下载显示
            showPromptRow: (text, buttonLabel, onClick) => controller.showPromptRow(text, buttonLabel, onClick),
            getLastActivityAt: () => controller.getLastActivityAt()
        };
    }

    async showCompleteResult(result, failedFiles) {
        const { stats, elapsed, platform, mode } = result;
        const totalSize = utils.parseSize(stats.bytes);
        const isPartialSuccess = stats.failed > 0;

        let title = isPartialSuccess ? '更新完成（部分成功）' : '更新完成';

        // 分析失败原因
        const corsErrors = failedFiles.filter(f => f.errorType === 'cors');
        const tokenErrors = failedFiles.filter(f => f.errorType === 'token');
        const networkErrors = failedFiles.filter(f => f.errorType === 'network');
        const diskErrors = failedFiles.filter(f => f.errorType === 'disk');
        const notFoundErrors = failedFiles.filter(f => f.errorType === 'not_found');

        let message = `⏱️ 耗时: ${elapsed}秒\n` +
            `✅ 成功: ${stats.success} 个文件 (${totalSize})\n`;

        if (stats.skipped > 0) message += `⏭️ 跳过: ${stats.skipped} 个（未改动）\n`;
        if (isPartialSuccess) message += `❌ 失败: ${stats.failed} 个文件\n\n`;

        // 针对性提示
        if (corsErrors.length > 0 && this.env === 'browser') {
            message += `⚠️ ${corsErrors.length} 个文件因浏览器网络限制失败\n` +
                `💡 建议：改用客户端环境继续更新\n\n`;
        } else if (tokenErrors.length > 0) {
            message += `🔑 ${tokenErrors.length} 个文件因 Token 无效失败\n` +
                `💡 建议：在 Token 管理中重新配置\n\n`;
        } else if (networkErrors.length > 0) {
            message += `🌐 ${networkErrors.length} 个文件因网络超时或连接中断失败\n` +
                `💡 建议：检查网络连接后使用“继续更新”或“仅重试失败文件”\n\n`;
        } else if (diskErrors.length > 0) {
            message += `💾 ${diskErrors.length} 个文件因磁盘错误失败（空间不足或无权限）\n` +
                `💡 建议：确认存储空间和写入权限后再继续\n\n`;
        } else if (notFoundErrors.length > 0) {
            message += `🧩 ${notFoundErrors.length} 个文件在更新源中未找到\n` +
                `💡 建议：检查分支/版本配置，或切换更新源后重试\n\n`;
        }

        if (isPartialSuccess) {
            message += `失败文件示例：\n` +
                failedFiles.slice(0, 3).map(f => `• ${f.path}`).join('\n') +
                (failedFiles.length > 3 ? `\n...等${failedFiles.length}个` : '');

            // 代码包失败时不允许忽略：applyUpdate() 硬性要求 zip 状态为 success，
            // 且 markAllFailedAsSkipped() 已排除 kind==='zip'，点了「忽略」也必然报错，
            // 因此此时不提供「忽略失败并应用」选项。
            const zipFailed = failedFiles.some(f => f.kind === 'zip');
            let buttons;
            if (zipFailed) {
                message += `\n\n⚠️ 代码包（code.zip）下载失败，无法跳过。\n` +
                    `代码包是本次更新的必需部分，请点击“立即重试失败项”重新下载后再应用。`;
                buttons = ['🔄 立即重试失败项', '💾 保存进度稍后处理'];
            } else {
                buttons = ['🔄 立即重试失败项', '⏭️ 忽略失败并应用', '💾 保存进度稍后处理'];
            }

            const choice = await this.dialog.choice(title, message, buttons);
            // 按钮数量可变，按位置映射：0=重试；中间=忽略（仅三按钮时存在）；最后=稍后处理
            const actions = zipFailed ? ['retry', 'later'] : ['retry', 'ignore', 'later'];
            return actions[choice] || 'later';
        } else {
            const shouldRestart = await this.dialog.confirm(
                title,
                message + '\n\n✨ 更新完全成功！建议立即重启以应用更改。',
                '立即重启',
                '稍后手动重启'
            );
            return shouldRestart ? 'restart' : 'done';
        }
    }

    // 自选更新版本：单选列表，返回选中的版本对象或 null
    async showVersionSelect(versions) {
        let selected = 0;

        return await this.dialog.createBaseDialog({
            title: '选择更新版本',
            message: null,
            dialogOptions: {
                width: 'min(560px, 92vw)',
                maxHeight: '85vh'
            },
            buildContent: (dialog) => {
                const msgEl = document.createElement('div');
                msgEl.className = 'lit-ui-content lit-ui-message';
                msgEl.style.marginBottom = '10px';
                msgEl.textContent = versions.some(v => !v.compatible)
                    ? '没有与当前无名杀版本匹配的版本，以下版本可能不兼容：'
                    : '当前无名杀版本可选以下更新版本：';
                dialog.appendChild(msgEl);

                const list = document.createElement('div');
                list.className = 'lit-ui-content lit-ui-scrollable lit-ui-list';
                list.style.maxHeight = '360px';

                const highlight = (el, on) => {
                    el.classList.toggle('selected', on);
                };

                versions.forEach((v, i) => {
                    const item = document.createElement('div');
                    item.className = 'lit-ui-list-item';
                    item.style.cursor = 'pointer';

                    const text = document.createElement('span');
                    text.className = 'lit-ui-list-text';
                    text.textContent = `${v.extensionVersion}${v.compatible ? '' : '（不兼容）'} — ${v.description || ''}`;
                    text.style.flex = '1';
                    item.appendChild(text);

                    if (i === 0) highlight(item, true);
                    item.addEventListener('click', () => {
                        selected = i;
                        list.querySelectorAll('.lit-ui-list-item').forEach(el => highlight(el, false));
                        highlight(item, true);
                    });
                    list.appendChild(item);
                });

                dialog.appendChild(list);
            },
            defaultResult: null,
            buttons: [
                { text: '取消', result: null },
                {
                    text: '使用此版本更新',
                    isPrimary: true,
                    result: () => versions[selected]
                }
            ]
        });
    }

    async confirmStart(info) {
        const { version, description, highlights, branch, platform, mode, fileCount, skipCount, totalSize, envType, preview } = info;

        const modeText = mode === 'auto' ? '自动选择（代码整包 + 媒体按需）'
            : mode === 'code' ? '仅代码（媒体不动）'
                : mode === 'retry_failed' ? '失败重试'
                    : '完整覆写（全部覆盖）';
        const platformText = platform === 'gitee' ? 'Gitee（国内）' : 'GitHub（国际）';
        const envText = envType === 'node'
            ? 'Node.js 本体下载'
            : envType === 'cordova'
                ? 'Cordova 本体下载'
                : envType === 'electron-renderer'
                    ? 'Electron 本体下载'
                    : '浏览器文件接口';

        let message = `📋 更新详情确认\n\n`;
        if (preview) {
            // 预览版警示横幅：逐文件、跳过整包校验、版本/md5 差异仅警告
            message += `⚠️ 预览版（main 分支最新代码）\n` +
                `・ 未经完整测试，可能不稳定\n` +
                `・ 逐文件下载，跳过代码包整包校验\n` +
                `・ 版本兼容性与文件 md5 差异仅作警告，不强制中断\n\n`;
        }
        if (version) {
            message += preview
                ? `目标版本: 预览版（main 分支最新，version.json 反映最近一次发布）\n`
                : `目标版本: ${version}\n`;
        }
        message += `版本分支: ${branch}\n` +
            `更新平台: ${platformText}\n` +
            `运行环境: ${envText}\n` +
            `更新模式: ${modeText}\n`;
        if (info.zipSize && !preview) message += `代码包: ${utils.parseSize(info.zipSize)}（整包校验后原子更新）\n`;
        message += `文件总数: ${fileCount}个`;

        if (skipCount > 0) message += `（将跳过${skipCount}个未改动的媒体文件）`;
        message += `\n预估大小: ${totalSize || '未知'}\n\n` +
            `💾 自动备份: 更新前将创建完整备份\n` +
            `🔄 断点续传: 支持中断后恢复下载`;

        if (Array.isArray(highlights) && highlights.length > 0) {
            message += `\n\n—— 本次更新内容 ——\n` +
                highlights.map(h => `・ ${plainText(h)}`).join('\n');
        }

        if (envType === 'browser' && platform === 'gitee') {
            message += `\n\n⚠️ 注意：浏览器环境访问 Gitee 可能受限，如遇失败请改用客户端或切换更新源`;
        }

        return await this.dialog.confirm('确认开始更新', message, '开始更新', '取消');
    }

    async promptForToken(platform, errorType) {
        const name = platform === 'gitee' ? 'Gitee' : 'GitHub';
        const reason = errorType === 'token' ? 'Token 无效或已过期' : '访问被限制（可能需要 Token）';

        const shouldSet = await this.dialog.confirm(
            `${name} 访问受限`,
            `${reason}\n\n是否立即配置 ${name} Token 以提高下载成功率？\n\n` +
            `您可以：\n• 配置 Token 后自动继续下载\n• 取消并尝试备用源（可能失败）`,
            `配置 ${name} Token`,
            '取消并继续'
        );

        if (shouldSet) {
            const token = await this.inputToken(platform);
            if (token) return token;
        }
        return null;
    }

    // 显示不可交互的“处理中，请稍候”模态框（转圈动画），返回 { close, updateText, showPromptRow, getLastActivityAt } 控制器。
    // 用于版本信息请求、文件清单下载、更新覆写等耗时阶段，避免 UI 空窗让用户误以为卡死。
    // 这些阶段没有进度回调，使用转圈加载框（loading），而不是 complexLoading 的确定进度条。
    async showLoading(title, message, options = {}) {
        const controller = await this.dialog.loading(title, message, {
            width: 'min(420px, 90vw)'
        });
        // 卡死/停滞检测（默认开启）：30s 无活动即在底部追加“是否重启”提示，不打断进行中的操作
        const stallCfg = this._stallOptions(options);
        const stallWatch = stallCfg ? watchStall(controller, stallCfg) : null;
        const close = () => {
            if (stallWatch) stallWatch.stop();
            controller.close();
        };
        return {
            updateText: (text) => controller.updateText(text),
            close,
            // 供其他代码发送信号：在底部追加“是否重启”等提示，不干扰上方内容
            showPromptRow: (text, buttonLabel, onClick) => controller.showPromptRow(text, buttonLabel, onClick),
            getLastActivityAt: () => controller.getLastActivityAt()
        };
    }

    async alert(title, message) {
        await this.dialog.alert(title, message);
    }

    async confirm(title, message, confirmText = '确定', cancelText = '取消') {
        return await this.dialog.confirm(title, message, confirmText, cancelText);
    }

    // 展示可复制的更新失败日志；filePath 为已存档的文件路径（可空）。
    // 文本框内容可直接全选复制，也可点“复制日志”按钮复制后发到群里排查。
    async showLogReport(logText, filePath) {
        return await this.dialog.createBaseDialog({
            title: '更新失败 · 日志',
            message: null,
            dialogOptions: {
                width: 'min(720px, 94vw)',
                maxHeight: '88vh'
            },
            buildContent: (dialog) => {
                const note = document.createElement('div');
                note.className = 'lit-ui-content lit-ui-message';
                note.style.marginBottom = '8px';
                note.style.whiteSpace = 'pre-line';
                note.textContent = filePath
                    ? `📄 日志已保存至：${filePath}\n可打开该文件全选复制，或直接点下方「复制日志」后发到群里排查。`
                    : '📄 本次更新失败，日志未写入文件，可直接复制下方内容发到群里排查。';
                dialog.appendChild(note);

                const copyBtn = document.createElement('button');
                copyBtn.textContent = '复制日志';
                copyBtn.style.cssText = 'margin-bottom:8px;padding:6px 16px;cursor:pointer;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;font-size:14px;';
                copyBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(logText);
                    } catch (e) {
                        // 兜底：选中后触发复制命令
                        try {
                            ta.focus();
                            ta.select();
                            document.execCommand('copy');
                        } catch (e2) { }
                    }
                    copyBtn.textContent = '已复制 ✓';
                    copyBtn.style.opacity = '0.7';
                };
                dialog.appendChild(copyBtn);

                const ta = document.createElement('textarea');
                ta.readOnly = true;
                ta.value = logText;
                ta.style.cssText = 'width:100%;height:min(420px, 52vh);box-sizing:border-box;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.5;white-space:pre;resize:vertical;border:1px solid currentColor;border-radius:6px;padding:8px;color:inherit;background:transparent;';
                dialog.appendChild(ta);
            },
            defaultResult: null,
            buttons: [
                { text: '关闭', result: null }
            ]
        });
    }
}

export { UIManager as UpdateDialogs };
