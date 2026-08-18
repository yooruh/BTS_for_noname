import { lib, game, ui, get, ai, _status } from '../../../../../noname.js';
import { extensionPath } from '../utils/paths.js'
import { themeManager } from './themeManager.js';

/**
 * 样式隔离的对话框组件 - 重构版
 * 公开接口: loading, complexLoading, alert, confirm, choice, input, filesManager, showCountdownDialog, showDocModal, textEditor, closeAll
 */
const DialogManager = (() => {
    // ========== 私有变量 ==========
    let _zIndex = 50000;
    let _cssLoaded = false;
    let _dialogStack = []; // 对话框堆栈，用于管理多层对话框
    let _isClosing = false;

    // ========== 基础私有方法==========
    const _injectFallbackStyles = () => {
        if (document.getElementById('lit-ui-fallback-styles')) return true;

        const style = document.createElement('style');
        style.id = 'lit-ui-fallback-styles';
        style.textContent = `
            .lit-ui-overlay { position: fixed; inset: 0; margin: 0; padding: 24px; box-sizing: border-box; background: rgba(0, 0, 0, 0.72); display: flex; align-items: center; justify-content: center; z-index: 50000; }
            .lit-ui-dialog { position: relative; left: auto; top: auto; background: linear-gradient(#3e3e3e, #2a2a2a); border: 1px solid #111; border-radius: 8px; padding: 20px; box-sizing: border-box; color: #f8f8f8; text-shadow: #000 0 1px 1px; display: flex; flex-direction: column; min-width: 320px; max-width: 90vw; max-height: 85vh; box-shadow: 0 0 0 1px rgba(0,0,0,.8), 0 8px 22px rgba(0,0,0,.66); }
            .lit-ui-content { font: 400 16px/1.5 system-ui, sans-serif; color: #d4d4d4; display: block; position: relative; flex-grow: 1; flex-shrink: 1; overflow-y: auto; margin-bottom: 20px; white-space: pre-wrap; height: auto; }
            .lit-ui-button { min-height: 34px; padding: 7px 17px; border: 1px solid #111; border-radius: 4px; background: linear-gradient(#545454, #383838); color: #f8f8f8; text-shadow: #000 0 1px 1px; font-weight: 700; cursor: pointer; }
            .lit-ui-button.primary,
            .lit-ui-button[data-cancel="true"] { background: linear-gradient(#4589c9, #2f6596); color: white; }
            .lit-ui-loading-spinner { width: 40px; height: 40px; margin: 4px auto 14px; border: 4px solid rgba(255,255,255,.18); border-top-color: #4285c5; border-radius: 50%; animation: lit-spin 0.9s linear infinite; display: block !important; position: relative !important; }
            @keyframes lit-spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
        return true;
    };

    const _initCSS = async () => {
        if (_cssLoaded) return;
        try {
            await new Promise((resolve, reject) => {
                lib.init.css(`${extensionPath}/style/css`, 'dialogManager', () => {
                    _cssLoaded = true;
                    resolve();
                });

                setTimeout(() => {
                    if (!_cssLoaded) {
                        reject(new Error('CSS加载超时'));
                    }
                }, 2000);
            });
        } catch (error) {
            _cssLoaded = _injectFallbackStyles();
        }
    };

    // ========== 关闭管理方法 ==========
    /**
     * 统一关闭入口 - 所有关闭方式都经过这里
     * @param {HTMLElement} overlay - 遮罩层元素
     * @param {Function} callback - 关闭后的回调
     * @param {string} reason - 关闭原因：'esc' | 'back' | 'overlay' | 'button' | 'programmatic'
     * @param {*} result - 关闭时返回的结果
     */
    const _close = (overlay, callback, reason = 'programmatic', result) => {
        if (_isClosing || !overlay || overlay._isClosed) return Promise.resolve(false);
        _isClosing = true;
        overlay._isClosed = true;

        // 从堆栈中移除
        const stackIndex = _dialogStack.findIndex(d => d.overlay === overlay);
        if (stackIndex > -1) {
            _dialogStack.splice(stackIndex, 1);
        }

        // 执行清理
        const cleanup = overlay._cleanup;
        if (typeof cleanup === 'function') {
            try {
                cleanup(reason);
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        }

        // 移除 DOM
        _safeRemoveOverlay(overlay);

        // 执行回调
        if (typeof callback === 'function') {
            try {
                callback(result);
            } catch (e) {
                console.error('Close callback error:', e);
            }
        }

        // 延迟释放锁，防止连续触发
        // setTimeout(() => {
        //     _isClosing = false;
        // }, 50);
        _isClosing = false;
        return Promise.resolve(true);
    };

    /**
     * 设置事件处理器 - 统一绑定所有关闭方式
     */
    const _bindEvents = (overlay, onClose, options = {}) => {
        // 统一关闭配置
        const defaultOptions = {
            enableEsc: true,
            enableBack: true,
            enableOverlayClick: true,
            closeOnConfirm: true,       // 点击确认按钮后是否关闭
            closeOnCancel: true,        // 点击取消按钮后是否关闭
            preventDefault: false,      // 是否阻止默认关闭行为（用于自定义处理）
            defaultResult: undefined    // 默认的关闭后返回结果
        };
        const opts = { ...defaultOptions, ...options };
        const handlers = [];

        // ESC 键关闭
        if (opts.enableEsc) {
            const handler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    _close(overlay, onClose, 'esc', opts.defaultResult);
                }
            };
            document.addEventListener('keydown', handler);
            handlers.push(() => document.removeEventListener('keydown', handler));
        }

        // 返回键/历史记录管理
        if (opts.enableBack) {
            const backHandler = _createBackHandler(overlay, onClose, opts.defaultResult);
            handlers.push(backHandler);
        }

        // 遮罩点击关闭
        if (opts.enableOverlayClick) {
            const handler = (e) => {
                if (e.target === overlay) {
                    e.stopPropagation();
                    _close(overlay, onClose, 'overlay', opts.defaultResult);
                }
            };
            overlay.addEventListener('pointerdown', handler);
            handlers.push(() => overlay.removeEventListener('pointerdown', handler));
        }

        // 返回统一的清理函数
        return (reason) => {
            handlers.forEach(cleanup => {
                try {
                    cleanup(reason);
                } catch (e) {
                    console.error('Handler cleanup error:', e);
                }
            });
        };
    };

    /**
     * 重写返回键处理 - 使用 Hash 方案替代 History API
     * 避免历史记录污染，移动端兼容性更好
     */
    const _createBackHandler = (overlay, onClose, result) => {
        // 使用 hash 变化来捕获返回键，更可靠
        const hashKey = `dialog-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

        // 如果当前没有 hash，添加一个
        const originalHash = window.location.hash;
        const needPushHash = !originalHash.includes('dialog=');

        if (needPushHash) {
            window.location.hash = `dialog=${hashKey}`;
        }

        const handleHashChange = (e) => {
            // 如果 hash 被移除（用户点击返回），关闭对话框
            if (!window.location.hash.includes(`dialog=${hashKey}`)) {
                // 阻止默认返回行为
                if (e) e.preventDefault();

                _close(overlay, onClose, 'back', result);

                // 恢复原始 hash（如果需要）
                if (originalHash && window.history.length > 1) {
                    window.history.replaceState(null, '', originalHash);
                }
            }
        };

        // 监听 hash 变化
        window.addEventListener('hashchange', handleHashChange);

        // 同时保留 popstate 作为后备方案
        const handlePopState = (e) => {
            if (overlay._isClosed) return;
            // 如果检测到回退且当前对话框还在，关闭它
            handleHashChange(e);
        };
        window.addEventListener('popstate', handlePopState);

        return (reason) => {
            window.removeEventListener('hashchange', handleHashChange);
            window.removeEventListener('popstate', handlePopState);

            // 清理 hash，但只有在不是被其他对话框使用时
            if (window.location.hash.includes(`dialog=${hashKey}`) && reason !== 'back') {
                // 使用 replaceState 避免产生新的历史记录
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        };
    };

    // ========== UI窗口方法 ==========
    const _createOverlay = () => {
        const overlay = document.createElement('div');
        overlay.className = 'lit-ui-overlay';
        overlay.style.zIndex = `${_zIndex++}`;

        // 阻止移动端的触摸穿透
        overlay.addEventListener('touchend', (e) => {
            if (e.target === overlay) {
                e.preventDefault();
            }
        }, { passive: false });
        return overlay;
    };

    const _createDialog = (title, message, options = {}) => {
        const dialog = document.createElement('div');
        dialog.className = 'lit-ui-dialog lit-material-surface';

        if (!options.titleSize) options.titleSize = '20px';
        if (options.width) dialog.style.width = `${options.width}`;
        if (options.minHeight) dialog.style.minHeight = `${options.minHeight}`;
        if (options.maxHeight) dialog.style.maxHeight = `${options.maxHeight}`;

        if (title) {
            const titleEl = document.createElement('h3');
            titleEl.className = 'lit-ui-title';

            const size = typeof options.titleSize === 'number'
                ? `${options.titleSize}px`
                : options.titleSize;
            titleEl.style.setProperty('font-size', size, 'important');

            if (options.titleCenter) {
                titleEl.style.setProperty('text-align', 'center', 'important');
            }

            titleEl.textContent = title;
            dialog.appendChild(titleEl);
        }

        if (message) {
            const contentEl = document.createElement('div');
            contentEl.className = 'lit-ui-content lit-ui-scrollable';
            contentEl.textContent = message;
            dialog.appendChild(contentEl);
        }

        return dialog;
    };

    const _createButton = (text, options = {}) => {
        const button = document.createElement('button');
        button.className = `lit-ui-button ${options.isPrimary ? 'primary' : 'secondary'}${options.isDestructive ? ' destructive' : ''}`;
        button.textContent = text;

        if (options.isCancel) button.dataset.cancel = 'true';
        if (options.minWidth) button.style.minWidth = `${options.minWidth}`;
        if (options.disabled) button.disabled = true;

        let clicked = false;
        button.onclick = (e) => {
            e.stopPropagation();
            if (!clicked && !button.disabled) {
                clicked = true;
                if (options.onClick) options.onClick();
                setTimeout(() => { clicked = false; }, 500);
            }
        };

        return button;
    };

    const _createButtonRow = (configs) => {
        const row = document.createElement('div');
        row.className = 'lit-ui-button-row';

        configs.forEach(config => {
            // 取消类按钮（文本含“取消”或被显式标记）统一走「返回」式强调样式
            const isCancel = config.isCancel || config.text === 'Cancel' || String(config.text).includes('取消');
            const button = _createButton(config.text, {
                isPrimary: config.isPrimary,
                isDestructive: config.isDestructive,
                minWidth: config.minWidth,
                isCancel,
                onClick: config.onClick,
                disabled: config.disabled
            });
            if (config.action) button.dataset.action = config.action;
            row.appendChild(button);
        });

        return row;
    };

    const _safeRemoveOverlay = (overlay) => {
        if (overlay && overlay.parentNode === document.body) {
            document.body.removeChild(overlay);
        }
    };

    const _createSafeCallback = (callback) => {
        return (...args) => {
            if (_isClosing) return;
            _isClosing = true;
            try {
                return callback(...args);
            } finally {
                // 确保状态锁释放
                setTimeout(() => { _isClosing = false; }, 350);
            }
        };
    };

    // ========== 重构后的公开方法 ==========

    return {
        /**
         * 统一创建对话框的基础方法
         * 所有具体对话框类型都基于此方法构建
         */
        async createBaseDialog(config) {
            await _initCSS();

            return new Promise((resolve) => {
                const overlay = _createOverlay();
                const dialog = _createDialog(config.title, config.message, config.dialogOptions || {});

                // 构建自定义内容
                if (config.buildContent) {
                    config.buildContent(dialog, overlay);
                }

                // 统一的关闭处理
                const handleClose = (result) => {
                    if (overlay.exCleanup) overlay.exCleanup();
                    if (dialog._themeCleanup) dialog._themeCleanup();
                    resolve(result);
                }

                // 绑定按钮
                if (config.buttons && config.buttons.length > 0) {
                    const buttonRow = _createButtonRow(
                        config.buttons.map(btn => ({
                            ...btn,
                            onClick: () => {
                                if (btn.onClick) btn.onClick();
                                if (btn.closeOnClick !== false) {
                                    _close(overlay, handleClose, 'button',
                                        typeof btn.result === 'function' ? btn.result() : btn.result
                                    );
                                }
                            }
                        }))
                    );
                    dialog.appendChild(buttonRow);
                }

                // 设置事件
                const closeOptions = {
                    enableEsc: config.closeOnEsc !== false,
                    enableBack: config.closeOnBack !== false,
                    enableOverlayClick: config.closeOnOverlay !== false,
                    defaultResult: config.defaultResult
                };

                // 暴露关闭方法供外部调用
                overlay._cleanup = _bindEvents(overlay, handleClose, closeOptions);
                overlay.close = (result) => _close(overlay, handleClose, 'programmatic', result);

                // 添加到堆栈
                _dialogStack.push({ overlay, config });

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                if (config.onDialogCreated) {
                    config.onDialogCreated(overlay, dialog);
                }
            });
        },

        // ========== 基于统一基础方法重构具体对话框 ==========

        async choice(title, message, buttons, primaryIdx) {
            if (!primaryIdx && buttons) primaryIdx = buttons.length - 1;
            return await this.createBaseDialog({
                title,
                message,
                defaultResult: -1,
                buttons: buttons.map((text, index) => ({
                    text,
                    isPrimary: index === primaryIdx,
                    result: ['取消', 'Cancel'].includes(text) ? -1 : index  // 返回按钮索引
                }))
            });
        },

        /**
         * 转圈加载框：适用于没有进度回调、无法显示确定进度的场景。
         * 与 complexLoading（确定进度条）区分开，避免显示不会更新的“假”进度条。
         * 返回控制器 { updateText, close }；禁止遮罩/Esc/返回键关闭。
         */
        async loading(title, message, options = {}) {
            await _initCSS();
            return new Promise((resolve) => {
                const overlay = _createOverlay();
                let lastActivityAt = Date.now();

                const dialog = _createDialog(title, "", {
                    width: options.width || 'min(420px, 90vw)',
                    minHeight: options.minHeight || 'auto'
                });
                dialog.classList.add('lit-loading-dialog');

                // 转圈加载动画（无进度语义，仅表示“处理中”）
                const spinnerEl = document.createElement('div');
                spinnerEl.className = 'lit-ui-loading-spinner';
                dialog.appendChild(spinnerEl);

                const msgEl = document.createElement('div');
                msgEl.className = 'lit-ui-content lit-ui-message lit-loading-message';
                msgEl.textContent = message || '';
                dialog.appendChild(msgEl);

                // 底部提示行（默认隐藏）：供外部信号追加“是否重启”等提示，不干扰上方内容
                const promptRow = document.createElement('div');
                promptRow.className = 'lit-loading-prompt';
                promptRow.style.display = 'none';
                dialog.appendChild(promptRow);

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // 绑定事件（禁用所有关闭方式）
                overlay._cleanup = _bindEvents(overlay, () => { }, {
                    enableEsc: false,
                    enableBack: false,
                    enableOverlayClick: false,
                });

                // 添加到堆栈
                _dialogStack.push({ overlay, config: { type: 'loading' } });
                overlay.close = () => _close(overlay, () => { }, 'programmatic');

                resolve({
                    updateText: (text) => {
                        lastActivityAt = Date.now();
                        msgEl.textContent = text;
                    },
                    // 在底部追加一行提示（文本居左 + 按钮居右），保持上方内容不变；供停滞检测等外部信号调用
                    showPromptRow: (text, buttonLabel, onClick) => {
                        lastActivityAt = Date.now();
                        promptRow.style.display = 'flex';
                        promptRow.innerHTML = '';
                        const textEl = document.createElement('span');
                        textEl.className = 'lit-loading-prompt-text';
                        textEl.textContent = text || '';
                        promptRow.appendChild(textEl);
                        if (buttonLabel) {
                            promptRow.appendChild(_createButton(buttonLabel, { isPrimary: true, onClick }));
                        }
                    },
                    // 最近一次界面活动的时刻（停滞检测据此判断是否卡死）
                    getLastActivityAt: () => lastActivityAt,
                    close: overlay.close
                });
            });
        },

        async complexLoading(title, message, options = {}) {
            await _initCSS();
            return new Promise((resolve) => {
                // 百分比固定为最宽（100%）的宽度，用空格占位，避免数字变化时画面跳动
                const padPercent = (n) => `${String(n).padStart(3, ' ')}%`;
                const overlay = _createOverlay();
                let lastActivityAt = Date.now();

                const dialog = _createDialog(title, "", {
                    width: options.width || 'min(480px, 90vw)',
                    minHeight: options.minHeight || 'auto'
                });
                dialog.classList.add('lit-complex-loading-dialog');

                // 主消息文本
                const msgEl = document.createElement('div');
                msgEl.className = 'lit-ui-content lit-ui-message lit-complex-loading-message';
                msgEl.textContent = message;
                dialog.appendChild(msgEl);

                // 总进度区域
                const totalSection = document.createElement('div');
                totalSection.className = 'lit-complex-loading-section lit-complex-loading-total';

                const totalTitleEl = document.createElement('div');
                totalTitleEl.className = 'lit-complex-loading-section-title';
                totalTitleEl.textContent = '总进度';
                totalSection.appendChild(totalTitleEl);

                // 进度信息行（状态 + 百分比）
                const infoRow = document.createElement('div');
                infoRow.className = 'lit-complex-loading-info';
                const percentEl = document.createElement('span');
                percentEl.className = 'lit-complex-loading-percent';
                percentEl.textContent = padPercent(0);
                const statusEl = document.createElement('span');
                statusEl.className = 'lit-complex-loading-status';
                statusEl.textContent = options.initialStatus || '准备就绪';

                infoRow.appendChild(statusEl);
                infoRow.appendChild(percentEl);
                totalSection.appendChild(infoRow);

                // 详细信息（总大小或已下载大小）
                const detailEl = document.createElement('div');
                detailEl.className = 'lit-complex-loading-detail';
                detailEl.style.display = options.initialDetail ? 'block' : 'none';
                if (options.initialDetail) detailEl.textContent = options.initialDetail;
                totalSection.appendChild(detailEl);

                // 主进度条（总进度）
                const progressContainer = document.createElement('div');
                progressContainer.className = 'lit-complex-loading-bar-container';

                // 确定性进度填充条
                const progressFill = document.createElement('div');
                progressFill.className = 'lit-complex-loading-bar-fill';
                progressFill.style.width = '0%';

                // 不确定进度动画条（无限循环）
                const indeterminateBar = document.createElement('div');
                indeterminateBar.className = 'lit-complex-loading-indeterminate';
                indeterminateBar.style.display = options.indeterminate ? 'block' : 'none';

                progressContainer.appendChild(progressFill);
                progressContainer.appendChild(indeterminateBar);
                totalSection.appendChild(progressContainer);
                dialog.appendChild(totalSection);

                // 当前文件区域（仅 options.fileBar 时显示）
                const fileSection = document.createElement('div');
                fileSection.className = 'lit-complex-loading-section lit-complex-loading-file';
                fileSection.style.display = options.fileBar ? 'block' : 'none';

                const fileTitleEl = document.createElement('div');
                fileTitleEl.className = 'lit-complex-loading-file-title';
                fileTitleEl.textContent = '当前下载队列的首个文件';
                fileSection.appendChild(fileTitleEl);

                const fileLabelEl = document.createElement('div');
                fileLabelEl.className = 'lit-complex-loading-file-label';
                const fileNameEl = document.createElement('div');
                fileNameEl.className = 'lit-complex-loading-file-name';
                const fileInfoEl = document.createElement('div');
                fileInfoEl.className = 'lit-complex-loading-file-info';
                fileLabelEl.appendChild(fileNameEl);
                fileLabelEl.appendChild(fileInfoEl);
                if (options.fileBar && options.initialFileName) fileNameEl.textContent = options.initialFileName;
                fileSection.appendChild(fileLabelEl);

                const fileBarContainer = document.createElement('div');
                fileBarContainer.className = 'lit-complex-loading-filebar-container';
                const fileBarFill = document.createElement('div');
                fileBarFill.className = 'lit-complex-loading-filebar-fill';
                fileBarFill.style.width = '0%';
                fileBarContainer.appendChild(fileBarFill);
                fileSection.appendChild(fileBarContainer);
                dialog.appendChild(fileSection);

                // 操作按钮区域（可选，setError/重试使用）
                const actionRow = document.createElement('div');
                actionRow.className = 'lit-complex-loading-actions';
                actionRow.style.display = 'none';
                dialog.appendChild(actionRow);

                // 底部提示行（默认隐藏）：供外部信号追加“是否重启”等提示，独立于 actionRow，不干扰上方显示
                const promptRow = document.createElement('div');
                promptRow.className = 'lit-loading-prompt';
                promptRow.style.display = 'none';
                dialog.appendChild(promptRow);

                overlay.appendChild(dialog);
                document.body.appendChild(overlay);

                // 绑定事件（禁用所有关闭方式）
                overlay._cleanup = _bindEvents(overlay, () => { }, {
                    enableEsc: false,
                    enableBack: false,
                    enableOverlayClick: false,
                });

                // 添加到堆栈
                _dialogStack.push({ overlay, config: { type: 'complexLoading' } });
                overlay.close = () => _close(overlay, () => { }, 'programmatic');

                // 内部状态
                let currentProgress = 0;
                let currentFileProgress = 0;
                let isIndeterminate = options.indeterminate || false;

                // 返回控制器对象
                resolve({
                    updateText: (text) => {
                        lastActivityAt = Date.now();
                        msgEl.textContent = text;
                    },

                    updateProgress: (value, total, opts = {}) => {
                        lastActivityAt = Date.now();
                        let percent = 0;

                        if (typeof value === 'object') {
                            opts = value;
                            percent = opts.percent !== undefined ? opts.percent : currentProgress;
                        } else if (total !== undefined && total > 0) {
                            percent = Math.round((value / total) * 100);
                        } else {
                            percent = Math.round(value);
                        }

                        percent = Math.max(0, Math.min(100, percent));
                        currentProgress = percent;

                        if (!isIndeterminate) {
                            progressFill.style.width = `${percent}%`;
                            percentEl.textContent = padPercent(percent);
                            percentEl.style.display = 'block';
                        } else {
                            percentEl.style.display = 'none';
                        }

                        if (opts.status) {
                            statusEl.textContent = opts.status;
                        }

                        if (opts.detail !== undefined) {
                            detailEl.textContent = opts.detail;
                            detailEl.style.display = opts.detail ? 'block' : 'none';
                        }

                        if (opts.state || opts.type) {
                            const state = opts.state || opts.type;
                            progressFill.classList.remove('lit-state-success', 'lit-state-error');
                            percentEl.classList.remove('lit-state-success', 'lit-state-error');
                            if (state) {
                                progressFill.classList.add(`lit-state-${state}`);
                                percentEl.classList.add(`lit-state-${state}`);
                            }
                        }

                        // 次级进度条（当前文件进度）
                        if (opts.filePercent !== undefined) {
                            currentFileProgress = Math.max(0, Math.min(100, Math.round(opts.filePercent)));
                            fileBarFill.style.width = `${currentFileProgress}%`;
                        }
                        if (opts.fileName !== undefined) {
                            fileNameEl.textContent = opts.fileName;
                        }
                        if (opts.fileInfo !== undefined) {
                            fileInfoEl.textContent = opts.fileInfo;
                        }
                    },

                    setIndeterminate: (enable = true, statusText) => {
                        lastActivityAt = Date.now();
                        isIndeterminate = enable;
                        if (enable) {
                            progressFill.style.display = 'none';
                            indeterminateBar.style.display = 'block';
                            percentEl.style.display = 'none';
                            if (statusText) statusEl.textContent = statusText;
                        } else {
                            progressFill.style.display = 'block';
                            indeterminateBar.style.display = 'none';
                            percentEl.style.display = 'block';
                            progressFill.style.width = `${currentProgress}%`;
                            percentEl.textContent = padPercent(currentProgress);
                        }
                    },

                    complete: (message, autoCloseDelay = 0) => {
                        lastActivityAt = Date.now();
                        isIndeterminate = false;
                        progressFill.style.display = 'block';
                        indeterminateBar.style.display = 'none';
                        percentEl.style.display = 'block';
                        currentProgress = 100;
                        progressFill.style.width = '100%';
                        percentEl.textContent = padPercent(100);
                        progressFill.classList.add('lit-state-success');
                        percentEl.classList.add('lit-state-success');
                        if (options.fileBar) fileBarFill.style.width = '100%';
                        if (message) {
                            msgEl.textContent = message;
                            statusEl.textContent = '完成';
                        }
                        if (autoCloseDelay > 0) {
                            setTimeout(() => {
                                _close(overlay, () => { }, 'programmatic');
                            }, autoCloseDelay);
                        }
                    },

                    setError: (message, showRetryButton = false, onRetry) => {
                        lastActivityAt = Date.now();
                        isIndeterminate = false;
                        progressFill.style.display = 'block';
                        indeterminateBar.style.display = 'none';
                        percentEl.style.visibility = 'visible';

                        progressFill.classList.add('lit-state-error');
                        percentEl.classList.add('lit-state-error');
                        dialog.classList.add('lit-loading-error');
                        if (options.fileBar) {
                            fileBarFill.classList.add('lit-state-error');
                            fileLabelEl.classList.add('lit-state-error');
                        }

                        if (message) {
                            msgEl.textContent = message;
                            statusEl.textContent = '失败';
                        }

                        if (showRetryButton && onRetry) {
                            actionRow.style.display = 'flex';
                            actionRow.innerHTML = '';
                            const retryBtn = _createButton('重试', {
                                isPrimary: true,
                                onClick: onRetry
                            });
                            actionRow.appendChild(retryBtn);
                        }
                    },

                    setStatus: (text) => {
                        lastActivityAt = Date.now();
                        statusEl.textContent = text;
                    },

                    setDetail: (text) => {
                        lastActivityAt = Date.now();
                        detailEl.textContent = text;
                        detailEl.style.display = text ? 'block' : 'none';
                    },

                    // 更新次级进度条：文件名标签与当前文件进度百分比（均可选）
                    setFileBar: (label, percent, opts = {}) => {
                        lastActivityAt = Date.now();
                        // label 支持结构化 { name, info }：第一行文件名、第二行进度信息，由本方法合并渲染
                        if (label !== undefined && label !== null) {
                            if (typeof label === 'object') {
                                if (label.name != null) fileNameEl.textContent = String(label.name);
                                if (label.info != null) fileInfoEl.textContent = String(label.info);
                            } else {
                                fileNameEl.textContent = String(label);
                            }
                            fileLabelEl.style.display = 'block';
                        }
                        if (percent !== undefined && percent !== null) {
                            currentFileProgress = Math.max(0, Math.min(100, Math.round(percent)));
                            if (opts.immediate) {
                                const transition = fileBarFill.style.transition;
                                fileBarFill.style.transition = 'none';
                                fileBarFill.style.width = `${currentFileProgress}%`;
                                void fileBarFill.offsetWidth;
                                fileBarFill.style.transition = transition;
                            } else {
                                fileBarFill.style.width = `${currentFileProgress}%`;
                            }
                        }
                    },

                    waitForFileBar: (target = currentFileProgress, timeout = 700) => {
                        const expected = Math.max(0, Math.min(100, Math.round(target)));
                        if (currentFileProgress !== expected) return Promise.resolve(false);

                        const rendered = parseFloat(getComputedStyle(fileBarFill).width) || 0;
                        const totalWidth = fileBarContainer.getBoundingClientRect().width;
                        const renderedPercent = totalWidth > 0 ? (rendered / totalWidth) * 100 : expected;
                        if (Math.abs(renderedPercent - expected) < 0.5) return Promise.resolve(true);

                        return new Promise(resolveWait => {
                            let settled = false;
                            const finish = (result) => {
                                if (settled) return;
                                settled = true;
                                clearTimeout(timer);
                                fileBarFill.removeEventListener('transitionend', onEnd);
                                resolveWait(result);
                            };
                            const onEnd = (event) => {
                                if (event.target === fileBarFill && event.propertyName === 'width') finish(true);
                            };
                            const timer = setTimeout(() => finish(false), timeout);
                            fileBarFill.addEventListener('transitionend', onEnd);
                        });
                    },

                    nextFrame: () => new Promise(resolveFrame => {
                        // 双 rAF 建立动画起点；后台标签页 rAF 会被挂起，
                        // 加超时兜底避免文件动画队列在此处永久卡住。
                        let done = false;
                        const finish = () => {
                            if (done) return;
                            done = true;
                            resolveFrame();
                        };
                        requestAnimationFrame(() => requestAnimationFrame(finish));
                        setTimeout(finish, 120);
                    }),

                    getProgress: () => currentProgress,

                    // 在底部追加一行提示（文本居左 + 按钮居右），保持上方显示不变；供停滞检测等外部信号调用
                    showPromptRow: (text, buttonLabel, onClick) => {
                        lastActivityAt = Date.now();
                        promptRow.style.display = 'flex';
                        promptRow.innerHTML = '';
                        const textEl = document.createElement('span');
                        textEl.className = 'lit-loading-prompt-text';
                        textEl.textContent = text || '';
                        promptRow.appendChild(textEl);
                        if (buttonLabel) {
                            promptRow.appendChild(_createButton(buttonLabel, { isPrimary: true, onClick }));
                        }
                    },

                    // 最近一次界面活动的时刻（停滞检测据此判断是否卡死）
                    getLastActivityAt: () => lastActivityAt,

                    close: overlay.close
                });
            });
        },

        async alert(title, message) {
            return this.createBaseDialog({
                title,
                message,
                defaultResult: true,
                buttons: [{ text: '确定', isPrimary: true, result: true }],
            });
        },

        async confirm(title, message, confirmText = '确定', cancelText = '取消') {
            return await this.createBaseDialog({
                title,
                message,
                defaultResult: false,
                buttons: [
                    { text: cancelText, result: false },
                    { text: confirmText, isPrimary: true, result: true }
                ],
            });
        },

        async input(title, message, initialValue = '', options = {}) {
            let inputEl;

            const result = await this.createBaseDialog({
                title,
                message: null,
                dialogOptions: {
                    width: options.width || 'min(500px, 90vw)',
                    minHeight: options.minHeight || 'auto'
                },
                buildContent: (dialog) => {
                    if (message) {
                        const msgEl = document.createElement('div');
                        msgEl.className = 'lit-ui-content lit-ui-message';
                        msgEl.style.marginBottom = '15px';
                        msgEl.textContent = message;
                        dialog.appendChild(msgEl);
                    }

                    const inputContainer = document.createElement('div');
                    inputContainer.className = 'lit-ui-input-container';

                    const rows = options.rows || (options.password ? 1 : 3);

                    if (options.password) {
                        inputEl = document.createElement('input');
                        inputEl.type = 'password';
                        inputEl.className = 'lit-ui-input';
                    } else if (rows === 1) {
                        inputEl = document.createElement('input');
                        inputEl.type = 'text';
                        inputEl.className = 'lit-ui-input';
                    } else {
                        inputEl = document.createElement('textarea');
                        inputEl.className = 'lit-ui-input lit-ui-input-textarea';
                        inputEl.rows = rows;
                        inputEl.style.resize = 'vertical';
                    }

                    inputEl.value = initialValue;
                    if (options.placeholder) inputEl.placeholder = options.placeholder;

                    inputContainer.appendChild(inputEl);
                    dialog.appendChild(inputContainer);

                    // 自动聚焦
                    setTimeout(() => {
                        inputEl.focus();
                        if (options.selectAll) {
                            inputEl.select();
                        } else {
                            const len = inputEl.value.length;
                            inputEl.setSelectionRange(len, len);
                        }
                    }, 100);

                    // 单行输入时支持回车键快捷确认
                    if (rows === 1 || options.password) {
                        inputEl.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                // 模拟点击确认按钮
                                const confirmBtn = dialog.querySelector('.lit-ui-button.primary');
                                if (confirmBtn) confirmBtn.click();
                            }
                        });
                    }
                },
                defaultResult: null,
                buttons: [
                    {
                        text: options.cancelText || '取消',
                        result: null
                    },
                    {
                        text: options.confirmText || '确定',
                        isPrimary: true,
                        result: () => inputEl.value  // 使用函数延迟获取值
                    }
                ],
                closeOnEsc: true,
                closeOnBack: true,
                closeOnOverlay: options.closeOnOverlay !== false
            });

            // 处理 result 可能是函数的情况（获取最终输入值）
            return typeof result === 'function' ? result() : result;
        },

        async showCountdownDialog(title, message, options = {}) {
            const {
                onConfirm = () => { },
                onCancel = () => { },
                countdownTime = 3
            } = options;

            return await this.createBaseDialog({
                title,
                message,
                dialogOptions: {
                    width: 'min(500px, 90vw)',
                    minHeight: '250px'
                },
                buildContent: (dialog) => {
                    const countdownEl = document.createElement('div');
                    countdownEl.className = "lit-ui-countdown";
                    countdownEl.textContent = `${countdownTime} 秒`;
                    dialog.appendChild(countdownEl);
                    dialog.countdownEl = countdownEl;
                },
                defaultResult: () => {
                    onCancel();
                    return false;
                },
                // 倒计时重启属于关键操作收尾，只允许通过按钮取消，
                // 防止点到遮罩空白处/Esc/返回键时静默取消重启。
                closeOnEsc: false,
                closeOnBack: false,
                closeOnOverlay: false,
                buttons: [
                    {
                        text: '立即重启',
                        isPrimary: true,
                        result: () => {
                            onConfirm();
                            return true;
                        }
                    },
                    {
                        text: '取消重启',
                        isCancel: true,
                        result: () => {
                            onCancel();
                            return false;
                        }
                    }
                ],
                onDialogCreated: (overlay, dialog) => {
                    let countdown = countdownTime;
                    let timerId = null;
                    const countdownEl = dialog.countdownEl;

                    const updateCountdown = () => {
                        countdownEl.textContent = `${countdown} 秒`;

                        if (countdown <= 0) {
                            clearTimeout(timerId);
                            const confirmBtn = dialog.querySelector('.lit-ui-button.primary');
                            if (confirmBtn) confirmBtn.click();
                        } else {
                            countdown--;
                            timerId = setTimeout(updateCountdown, 1000);
                        }
                    };
                    timerId = setTimeout(updateCountdown, 0);
                    overlay.exCleanup = () => {
                        if (timerId) clearTimeout(timerId);
                    }
                },
            });
        },

        async filesManager(title, message, items, options = {}) {
            // 选中项集合：提升到方法作用域，供 buildContent 与按钮 result 共享
            // （按钮闭包无法访问 createBaseDialog 内的局部 dialog，故不在此查询 dialog）
            const selectedFiles = new Set();
            return await this.createBaseDialog({
                title,
                message: null,
                dialogOptions: {
                    width: 'min(600px, 90vw)',
                    maxHeight: '85vh'
                },
                buildContent: (dialog) => {
                    if (message) {
                        const msgEl = document.createElement('div');
                        msgEl.className = 'lit-ui-content lit-ui-message';
                        msgEl.style.marginBottom = '15px';
                        msgEl.textContent = message;
                        dialog.appendChild(msgEl);
                    }

                    const listContainer = document.createElement('div');
                    listContainer.className = 'lit-ui-content lit-ui-scrollable lit-ui-list';
                    listContainer.style.maxHeight = '400px';

                    items.forEach((item, index) => {
                        const itemEl = document.createElement('div');
                        itemEl.className = 'lit-ui-list-item';
                        itemEl.dataset.value = item.value;
                        if (item.type) itemEl.dataset.type = item.type;

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.style.marginRight = '10px';
                        checkbox.style.pointerEvents = 'none';

                        const number = document.createElement('span');
                        number.className = 'lit-ui-list-number';
                        number.textContent = `${index + 1}.`;

                        const textSpan = document.createElement('span');
                        textSpan.className = 'lit-ui-list-text';
                        textSpan.textContent = item.text;
                        textSpan.style.flex = '1';

                        itemEl.appendChild(checkbox);
                        itemEl.appendChild(number);
                        itemEl.appendChild(textSpan);

                        itemEl.addEventListener('click', () => {
                            const isSelected = selectedFiles.has(item.value);
                            if (isSelected) {
                                selectedFiles.delete(item.value);
                                checkbox.checked = false;
                                itemEl.classList.remove('selected');
                            } else {
                                selectedFiles.add(item.value);
                                checkbox.checked = true;
                                itemEl.classList.add('selected');
                            }

                            // 更新按钮状态（按 data-action 定位，按钮数量可配置）
                            const deleteBtn = dialog.querySelector('.lit-ui-button-row [data-action="delete"]');
                            const editBtn = dialog.querySelector('.lit-ui-button-row [data-action="edit"]');
                            const applyBtn = dialog.querySelector('.lit-ui-button-row [data-action="apply"]');

                            if (deleteBtn && applyBtn) {
                                const count = selectedFiles.size;
                                deleteBtn.disabled = count === 0;
                                applyBtn.disabled = count !== 1;
                                if (editBtn) editBtn.disabled = count !== 1;

                                [deleteBtn, editBtn, applyBtn].forEach(btn => {
                                    if (!btn) return;
                                    btn.style.opacity = btn.disabled ? '0.5' : '1';
                                    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
                                });
                            }
                        });

                        listContainer.appendChild(itemEl);
                    });

                    dialog.appendChild(listContainer);
                },
                defaultResult: null,
                buttons: (() => {
                    const list = [
                        {
                            text: '删除',
                            action: 'delete',
                            isDestructive: true,
                            result: () => ({
                                action: 'delete',
                                files: Array.from(selectedFiles)
                            }),
                            disabled: true
                        }];
                    if (options.showEdit !== false) {
                        list.push({
                            text: '编辑',
                            action: 'edit',
                            result: () => ({
                                action: 'edit',
                                files: Array.from(selectedFiles)
                            }),
                            disabled: true
                        });
                    }
                    list.push({
                        text: options.applyText || '应用配置',
                        action: 'apply',
                        isPrimary: true,
                        result: () => ({
                            action: 'apply',
                            files: Array.from(selectedFiles)
                        }),
                        disabled: true
                    });
                    list.push({
                        text: '取消',
                        isCancel: true,
                        action: 'cancel',
                        result: null
                    });
                    return list;
                })(),
            });
        },

        async showDocModal(url, title, dataProcessor = null) {
            return await this.createBaseDialog({
                title,
                message: null,
                dialogOptions: {
                    titleSize: 24,
                    titleCenter: true,
                    width: 'min(96vw, 1200px)',
                    maxHeight: '95vh'
                },
                buildContent: (dialog) => {
                    dialog.className = 'lit-ui-dialog lit-material-surface lit-doc-modal-dialog';

                    const iframeContainer = document.createElement('div');
                    iframeContainer.className = 'lit-ui-content lit-doc-modal-content';
                    iframeContainer.style.padding = '0';
                    iframeContainer.style.margin = '0';

                    const iframe = document.createElement('iframe');
                    iframe.className = 'lit-doc-modal-iframe';

                    const loadingTip = document.createElement('div');
                    loadingTip.className = 'lit-ui-content lit-doc-modal-loading';
                    loadingTip.textContent = '正在加载文档，请稍候...';

                    iframe.style.display = 'none';
                    iframeContainer.appendChild(loadingTip);
                    iframeContainer.appendChild(iframe);
                    dialog.appendChild(iframeContainer);

                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'lit-doc-modal-close';
                    closeBtn.setAttribute('aria-label', '关闭');
                    closeBtn.onclick = () => {
                        const overlay = dialog.closest('.lit-ui-overlay');
                        if (overlay && overlay.close) overlay.close();
                    };
                    dialog.appendChild(closeBtn);

                    // 加载文档内容
                    const oReq = new XMLHttpRequest();
                    oReq.addEventListener('load', function () {
                        let content = this.responseText;
                        if (dataProcessor && typeof dataProcessor === 'function') {
                            content = dataProcessor(content);
                        }
                        content = themeManager.injectThemeAttribute(content);
                        loadingTip.remove();
                        iframe.style.display = '';
                        iframe.onload = () => {
                            try {
                                themeManager.registerDocumentFrame(iframe);
                            } catch (e) { }
                        };
                        iframe.srcdoc = content;
                    });

                    oReq.addEventListener('error', (err) => {
                        console.error(`加载文档失败: ${url}`, err);
                        loadingTip.textContent = '文档加载失败';
                        const overlay = dialog.closest('.lit-ui-overlay');
                        if (overlay && overlay.close) overlay.close();
                    });

                    const previousCleanup = dialog._themeCleanup;
                    dialog._themeCleanup = () => {
                        previousCleanup?.();
                        themeManager.unregisterDocumentFrame(iframe);
                    };

                    oReq.open('GET', url);
                    oReq.send();
                },
                buttons: [],
            });
        },

        async textEditor(title, message, initialContent, options = {}) {
            let textarea, checkbox;

            return await this.createBaseDialog({
                title,
                message: null,
                dialogOptions: {
                    width: 'min(900px, 95vw)',
                    maxHeight: '95vh'
                },
                buildContent: (dialog) => {
                    dialog.className += ' lit-text-editor-dialog';

                    if (message) {
                        const msgEl = document.createElement('div');
                        msgEl.className = 'lit-ui-content lit-ui-message';
                        msgEl.style.fontSize = '14px';
                        msgEl.style.color = '#666';
                        msgEl.textContent = message;
                        dialog.appendChild(msgEl);
                    }

                    const editorContainer = document.createElement('div');
                    editorContainer.className = 'lit-ui-editor-container';

                    textarea = document.createElement('textarea');
                    textarea.className = 'lit-ui-textarea lit-ui-scrollable';
                    textarea.value = initialContent;
                    textarea.spellcheck = false;

                    editorContainer.appendChild(textarea);

                    const optionsRow = document.createElement('div');
                    optionsRow.className = 'lit-ui-editor-options';

                    checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = 'deleteTempFile';
                    checkbox.checked = options.deleteTempFile !== false;

                    const label = document.createElement('label');
                    label.htmlFor = 'deleteTempFile';
                    label.textContent = '编码成功后，删除临时json文件';
                    label.style.cursor = 'pointer';

                    optionsRow.appendChild(checkbox);
                    optionsRow.appendChild(label);
                    editorContainer.appendChild(optionsRow);

                    dialog.appendChild(editorContainer);

                    // 焦点管理
                    setTimeout(() => {
                        textarea.focus();
                        if (options.selectionStart !== undefined) {
                            textarea.selectionStart = options.selectionStart;
                            textarea.selectionEnd = options.selectionEnd || options.selectionStart;
                            textarea.scrollTop = options.scrollTop || 0;
                        }
                    }, 100);
                },
                defaultResult: null,
                buttons: [
                    { text: '取消', result: null },
                    {
                        text: '暂存并退出',
                        result: () => ({
                            content: textarea.value,
                            action: 'save',
                            selectionStart: textarea.selectionStart,
                            selectionEnd: textarea.selectionEnd
                        })
                    },
                    {
                        text: '保存并编码',
                        isPrimary: true,
                        result: () => ({
                            content: textarea.value,
                            action: 'encode',
                            deleteTempFile: checkbox.checked,
                            selectionStart: textarea.selectionStart,
                            selectionEnd: textarea.selectionEnd
                        })
                    }
                ],
                // 编辑器不允许遮罩/Esc/返回关闭，必须通过按钮
                closeOnEsc: false,
                closeOnBack: false,
                closeOnOverlay: false
            });
        },

        /**
         * 关闭所有对话框
         */
        closeAll() {
            // 从后往前关闭，避免索引问题
            [..._dialogStack].reverse().forEach(({ overlay }) => {
                if (overlay && overlay.close) {
                    overlay.close();
                }
            });
            _dialogStack = [];
            _isClosing = false;
        },

        /**
         * 获取当前打开的对话框数量
         */
        getDialogCount() {
            return _dialogStack.length;
        },
    };
})();

// 导出UI模块
export const dialogManager = DialogManager;
