import { game } from '../../../../../noname.js';
import { UPDATE_CONFIG as CONFIG } from './config.js';
import { updateUtils as utils } from './utils.js';
import { updateEnvironment as Environment } from './repository.js';
import { md5Hex } from './md5.js';
import { updateLogger } from './logger.js';

// ==================== 下载任务实体 ====================
class DownloadTask {
    constructor(info) {
        this.remote = info.remote;
        this.temp = info.temp;
        this.target = info.target;
        this.size = info.size || 0;
        this.type = info.type;
        this.critical = info.critical;
        this.priority = info.priority || 0;
        this.skip = info.skip || false;
        this.md5 = info.md5 || null;           // 清单中的期望 md5（null 表示跳过校验）
        this.kind = info.kind || 'file';       // 'file' 普通文件 | 'zip' 代码包哨兵
        this.urls = Array.isArray(info.urls) && info.urls.length > 0 ? info.urls : null; // 显式下载地址列表
        this.downloadedBytes = 0;
    }
}

// ==================== 智能下载器 ====================
class SmartDownloader {
    constructor(repo, tokenManager) {
        this.repo = repo;
        this.tokens = tokenManager;
        this.env = Environment.getEnvironmentType();
        this.activeRequests = new Set();
        this.isCancelled = false;
        this.lenientMd5 = false;          // 预览模式：md5 不一致仅警告，不删临时文件、不失败
        this.lenientMismatches = [];      // 宽松模式下被接受的 md5 不符文件（供汇总警告）
    }

    cancelAll() {
        this.isCancelled = true;
        this.activeRequests.clear();
    }

    // 将 AggregateError/cause 中的底层网络错误展开，保留可用于分类和展示的信息
    formatError(error) {
        const seen = new Set();
        const messages = [];
        const visit = (item) => {
            if (!item || seen.has(item)) return;
            if (typeof item === 'object') seen.add(item);

            const code = item?.code ? `[${item.code}] ` : '';
            const message = item?.message || (typeof item === 'string' ? item : '');
            if (code || message) messages.push(`${code}${message}`.trim());
            if (Array.isArray(item?.errors)) item.errors.forEach(visit);
            if (item?.cause) visit(item.cause);
        };
        visit(error);
        return [...new Set(messages)].join('；') || String(error || '未知错误');
    }

    // 统一错误分类
    classifyError(error) {
        const msg = this.formatError(error).toUpperCase();
        if (msg.includes('401') || msg.includes('TOKEN_INVALID')) {
            return { type: 'token', recoverable: true };
        }
        if (msg.includes('403') || msg.includes('CORS')) {
            return { type: 'cors', recoverable: true };
        }
        if (/TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND|NETWORK|SOCKET HANG UP/.test(msg)) {
            return { type: 'network', recoverable: true };
        }
        if (/ENOSPC|EACCES|EPERM|PERMISSION/.test(msg)) {
            return { type: 'disk', recoverable: false };
        }
        if (msg.includes('NOT_FOUND') || msg.includes('404')) {
            // 404 只代表当前源没有该文件，继续尝试下一镜像，不应中断整条下载链
            return { type: 'not_found', recoverable: true };
        }
        if (msg.includes('MD5校验失败') || msg.includes('MD5')) {
            return { type: 'md5', recoverable: true };
        }
        if (msg.includes('下载已取消')) {
            return { type: 'cancelled', recoverable: true };
        }
        return { type: 'unknown', recoverable: true };
    }

    // TLS 证书校验类错误（UNABLE_TO_VERIFY_LEAF_SIGNATURE / CERT_* 等）。
    // 常见于国内网络/代理中间证书场景下访问 raw.githubusercontent.com 等站点，
    // 是 downloadViaNode 降级为宽松校验重试的触发条件。
    isCertError(error) {
        const code = error?.code || '';
        return /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_CERT_ALTNAME_INVALID|CERT_)/.test(code);
    }

    async emitProgress(onProgress, received, total) {
        if (!onProgress) return;
        try {
            await onProgress(received, total);
        } catch (error) {
            console.warn('[下载进度] 回调失败:', error);
        }
    }

    async downloadViaNode(url, tempPath, onProgress, redirectsLeft = 5, relaxTls = false) {
        const require = window.require;
        const fs = require('fs');
        const path = require('path');
        const { URL } = require('url');
        const targetPath = path.resolve(window.__dirname, tempPath);
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

        return await new Promise((resolve, reject) => {
            let request = null;
            let file = null;
            let settled = false;
            let received = 0;

            const cleanupFile = async () => {
                try {
                    await fs.promises.rm(targetPath, { force: true });
                } catch (e) { }
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                if (request && !request.destroyed) request.destroy();
                if (file && !file.destroyed) file.destroy();
                cleanupFile().finally(() => reject(error instanceof Error ? error : new Error(String(error))));
            };

            let parsed;
            try {
                parsed = new URL(url);
                const transport = parsed.protocol === 'https:' ? require('https') : require('http');
                request = transport.get(parsed, {
                    headers: { 'User-Agent': 'AppleWebkit' },
                    // 默认严格校验证书；relaxTls（证书错误降级）时关闭，保证国内网络/代理下仍可下载
                    ...(parsed.protocol === 'https:' ? { rejectUnauthorized: !relaxTls } : {})
                });
            } catch (error) {
                fail(error);
                return;
            }

            request.once('error', (error) => {
                // TLS 证书校验失败 → 清理后以宽松校验对该 URL 重试一次
                if (!relaxTls && this.isCertError(error)) {
                    updateLogger.warn('下载', `证书校验失败，自动降级为宽松校验重试: ${url}`);
                    if (request && !request.destroyed) request.destroy();
                    cleanupFile().then(() => {
                        this.downloadViaNode(url, tempPath, onProgress, redirectsLeft, true)
                            .then(resolve, reject);
                    });
                    return;
                }
                fail(error);
            });
            request.setTimeout(CONFIG.limits.timeout, () => {
                const error = new Error(`下载超时: ${url}`);
                error.code = 'ETIMEDOUT';
                fail(error);
            });

            request.once('response', (response) => {
                const status = response.statusCode || 0;
                const location = response.headers.location;
                if ([301, 302, 303, 307, 308].includes(status) && location) {
                    response.resume();
                    if (redirectsLeft <= 0) {
                        fail(new Error(`重定向次数过多: ${url}`));
                        return;
                    }
                    settled = true;
                    request.destroy();
                    cleanupFile()
                        .then(() => this.downloadViaNode(new URL(location, parsed).href, tempPath, onProgress, redirectsLeft - 1, relaxTls))
                        .then(resolve, reject);
                    return;
                }
                if (status < 200 || status >= 300) {
                    response.resume();
                    const error = new Error(`HTTP ${status}: ${url}`);
                    error.code = `HTTP_${status}`;
                    fail(error);
                    return;
                }

                const total = Number(response.headers['content-length']) || 0;
                try {
                    file = fs.createWriteStream(targetPath);
                } catch (error) {
                    response.destroy();
                    fail(error);
                    return;
                }

                response.once('error', fail);
                file.once('error', fail);
                // 手动写入以支持异步进度回调背压，保证UI事件按字节顺序到达。
                response.on('data', (chunk) => {
                    response.pause();
                    received += chunk.length;
                    const resume = () => {
                        if (!settled) response.resume();
                    };
                    Promise.all([
                        this.emitProgress(onProgress, received, total),
                        new Promise((resolveWrite, rejectWrite) => {
                            file.write(chunk, error => error ? rejectWrite(error) : resolveWrite());
                        })
                    ]).then(resume, fail);
                });
                response.once('end', () => {
                    if (!settled) file.end();
                });
                file.once('finish', () => {
                    if (settled) return;
                    response.destroy();
                    file.close(async (error) => {
                        if (error) {
                            fail(error);
                            return;
                        }
                        try {
                            await this.emitProgress(onProgress, received, total || received);
                            const data = await fs.promises.readFile(targetPath);
                            settled = true;
                            resolve({ data, size: data.byteLength });
                        } catch (readError) {
                            fail(readError);
                        }
                    });
                });
            });
        });
    }

    async downloadViaGame(url, tempPath, onProgress) {
        this.activeRequests.add(tempPath);
        try {
            if (this.env === 'node' || this.env === 'electron-renderer') {
                return await this.downloadViaNode(url, tempPath, onProgress);
            }
            await game.promises.download(url, tempPath, null, (received, total) => {
                void this.emitProgress(onProgress, received, total);
            });
            const content = await game.promises.readFile(tempPath);
            const size = content?.byteLength ?? content?.length ?? 0;
            await this.emitProgress(onProgress, size, size);
            return { data: content, size };
        } finally {
            this.activeRequests.delete(tempPath);
        }
    }

    async removeTempFile(path) {
        try {
            const exists = await game.promises.checkFile(path);
            if (exists === 1) {
                await game.promises.removeFile(path);
            }
        } catch (e) { }
    }

    // 主下载方法
    async download(task, onProgress, stateManager = null) {
        if (this.isCancelled) throw new Error('下载已取消');

        // 显式 URL 列表（代码包哨兵）或默认的 raw + 镜像 + 备用源
        // （github 平台：raw.githubusercontent → gitee 镜像 → jsdelivr；gitee 平台：gitee raw → github raw）
        const urls = task.urls && task.urls.length > 0
            ? task.urls.slice()
            : [this.repo.getURL(task.remote), this.repo.getMirrorURL(task.remote), this.repo.getFallbackURL(task.remote)];
        const attempts = [...new Set(urls.filter(Boolean))];

        if (stateManager) {
            await stateManager.updateFile(task.remote, 'downloading', null, null, 0, true);
        }

        let lastError = null;
        for (let index = 0; index < attempts.length; index++) {
            const currentUrl = attempts[index];
            try {
                await this.removeTempFile(task.temp);
                updateLogger.info('下载', `${task.remote} 尝试源 ${index + 1}/${attempts.length}: ${currentUrl}${task.md5 ? ` 期望md5=${task.md5}` : ''}`);
                const result = await this.downloadViaGame(currentUrl, task.temp, onProgress);
                const actual = result?.data ? md5Hex(result.data) : null;

                // 内容完整性校验：与清单 md5 不一致视为失败（媒体逐文件与代码包共用此钩子）。
                // 预览模式（lenientMd5）下不一致仅警告并接受，不强制中断。
                if (task.md5) {
                    if (actual !== task.md5) {
                        if (this.lenientMd5) {
                            updateLogger.warn('下载', `${task.remote} md5 不一致，预览模式已接受：size=${result.size}B 实际=${actual} 期望=${task.md5}`);
                            this.lenientMismatches.push(task.remote);
                        } else {
                            updateLogger.warn('下载', `${task.remote} md5 校验失败：size=${result.size}B 实际=${actual} 期望=${task.md5}`);
                            await this.removeTempFile(task.temp);
                            throw new Error(`MD5校验失败: ${task.remote}`);
                        }
                    } else {
                        updateLogger.info('下载', `${task.remote} md5 校验通过：size=${result.size}B md5=${actual}`);
                    }
                } else {
                    updateLogger.info('下载', `${task.remote} 下载完成（清单无 md5，跳过校验）：size=${result.size}B`);
                }

                if (stateManager) {
                    await stateManager.updateFile(task.remote, 'success', null, null, result.size, true);
                }

                return {
                    success: true,
                    size: result.size,
                    mode: this.env,
                    source: index === 0 ? 'primary' : 'fallback'
                };
            } catch (error) {
                const detail = this.formatError(error);
                lastError = new Error(detail);
                if (error?.code) lastError.code = error.code;
                const { type, recoverable } = this.classifyError(error);
                const hasMoreAttempts = index < attempts.length - 1;
                updateLogger.warn('下载', `${task.remote} 源 ${index + 1}/${attempts.length} 失败: ${detail}（类型=${type}${recoverable ? '' : '，不可恢复'}）`);

                if (!recoverable || !hasMoreAttempts) break;
                game.print(index === 0 ? '🔄 主源失败，尝试备用源...' : '🔄 下载失败，重试其他来源...');
                await utils.sleep(CONFIG.limits.retryDelay);
            }
        }

        const { type } = this.classifyError(lastError);
        updateLogger.error('下载', `${task.remote} 全部源失败，最终判定：${String(lastError?.message || lastError || '下载失败')}（类型=${type}）`);
        if (stateManager && String(lastError?.message || lastError) !== '下载已取消') {
            await stateManager.updateFile(task.remote, 'failed', String(lastError?.message || lastError), type, 0, true);
        }

        return {
            success: false,
            error: String(lastError?.message || lastError || '下载失败'),
            errorType: type,
            needToken: false
        };
    }
}

export { DownloadTask, SmartDownloader };
