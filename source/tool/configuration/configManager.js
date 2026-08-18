import { game } from '../../../../../noname.js';
import { configService } from './configService.js';
import { dialogManager } from '../ui/dialogManager.js';
import { extensionFilesPath } from '../utils/paths.js';

/**
 * 管理用户交互流程，协调其他模块
 * 公开接口: main
 */
const ConfigFlow = (() => {
    let _reloadTimer = null;
    let _isReloading = false;

    const _applyRecommendation = async (platform) => {
        const isWin = platform === 0;
        const filename = isWin ? 'win11.0.nncfg' : 'android_wide11.0.nncfg';
        const displayName = isWin ? 'Windows端推荐配置' : 'Android端推荐配置';
        const description = isWin
            ? '该配置针对桌面端优化，包含：\n• 角色候选个数调整\n• 修改样式展示细节\n• 开启/关闭部分武将包、卡包和其他扩展'
            : '该配置针对移动端优化，包含：\n• 角色候选个数调整\n• 滑动手势调出菜单\n• 界面布局适配宽屏\n• 保持屏幕常亮\n• 开启/关闭部分武将包、卡包和其他扩展';

        const confirmAction = await dialogManager.choice(
            '确认应用',
            `即将应用【${displayName}】\n\n${description}\n\n是否备份当前配置？`,
            ['备份并应用', '直接应用', '取消']
        );

        if (confirmAction === -1) return;

        let backupName = null;
        if (confirmAction === 0) {
            try {
                backupName = await configService.backupCurrentConfig();
                if (backupName) {
                    await dialogManager.alert("✅ 配置已备份！", `备份文件名：${backupName}\n保存位置：资源根目录/files/bts`);
                }
            } catch (backupError) {
                const continueAnyway = await dialogManager.confirm(
                    '备份失败',
                    `备份配置时出错：${backupError.message}\n\n是否继续应用新配置？（建议先手动备份）`,
                    '继续应用',
                    '取消操作'
                );
                if (!continueAnyway) return;
            }
        }

        const finalConfirm = await dialogManager.confirm(
            '最终确认',
            `确定要应用【${displayName}】吗？\n\n应用后游戏将自动重启。`,
            '确定应用',
            '再考虑一下'
        );

        if (!finalConfirm) return;

        try {
            const loading = await dialogManager.loading('请稍候', '正在应用配置...');
            try {
                await configService.loadAndApplyConfig(filename);
            } finally {
                loading.close();
            }
            await _showSuccessAndReload('配置应用成功！', displayName);
        } catch (applyError) {
            dialogManager.closeAll();

            if (backupName) {
                const restore = await dialogManager.confirm(
                    '应用配置失败',
                    `应用配置时出错：${applyError.message}\n\n检测到有备份文件 ${backupName}，是否恢复备份？`,
                    '恢复备份',
                    '忽略'
                );

                if (restore) {
                    try {
                        await configService.applyFromBackupFile(`${extensionFilesPath}/${backupName}`);
                        await dialogManager.alert('✅ 成功', '已恢复备份配置！');
                    } catch (restoreError) {
                        await dialogManager.alert('❌ 恢复备份失败', `错误详情：${restoreError.message}`);
                    }
                }
            } else {
                await dialogManager.alert('❌ 应用配置失败', `${applyError.message}\n\n请检查配置文件是否完整。`);
            }
        }
    };

    const _manageFiles = async () => {
        try {
            const { items, backupDir } = await configService.getAvailableConfigFiles();

            if (items.length === 0) {
                await dialogManager.alert('未找到配置文件', '请先创建备份文件。');
                return;
            }

            const result = await dialogManager.filesManager(
                '配置文件管理',
                `找到 ${items.length} 个配置文件：\n\n请选择文件并点击下方按钮执行操作：`,
                items
            );

            if (!result) return;

            const { action, files } = result;
            const fullPaths = files.map(f => `${backupDir}/${f}`);

            switch (action) {
                case 'delete':
                    await _deleteFiles(fullPaths);
                    break;
                case 'edit':
                    const editResult = await _editBackupConfig(fullPaths[0]);
                    if (editResult === false) {
                        await _manageFiles();
                    }
                    break;
                case 'apply':
                    await _applyConfigFile(fullPaths[0]);
                    break;
            }
        } catch (error) {
            dialogManager.closeAll();
            await dialogManager.alert('❌ 操作失败', `错误详情：${error.message}`);
        }
    };

    const _editBackupConfig = async (filePath) => {
        if (!filePath) return;

        let jsonFilePath = null;
        let jsonContent = '';
        let isNewEdit = false;
        let editState = {
            selectionStart: 0,
            selectionEnd: 0,
            scrollTop: 0
        };

        while (true) {
            try {
                if (!jsonFilePath) {
                    const loading = await dialogManager.loading('请稍候', '正在读取文件内容...');

                    try {
                        if (filePath.endsWith('.json')) {
                            jsonFilePath = filePath;
                            jsonContent = await game.promises.readFileAsText(filePath);
                            isNewEdit = !filePath.includes('bts_editing_');
                        } else {
                            jsonFilePath = await configService.decodeBackupToJson(filePath);
                            jsonContent = await game.promises.readFileAsText(jsonFilePath);
                            isNewEdit = true;
                        }
                    } finally {
                        loading.close();
                    }

                    if (!jsonContent) {
                        await dialogManager.alert('❌ 错误', '文件内容为空或无法读取');
                        if (isNewEdit) {
                            await game.promises.removeFile(jsonFilePath).catch(() => { });
                        }
                        return false;
                    }
                }

                const originalFileName = filePath.split('/').pop();

                const editResult = await dialogManager.textEditor(
                    '配置文件编辑器',
                    `正在编辑：${originalFileName}\n编辑提示：\n• 请勿修改JSON的整体结构\n• 确保键名和格式正确\n• 语法错误将导致编码失败\n• 闪退后可在文件管理器中找到临时文件继续编辑`,
                    jsonContent,
                    {
                        deleteTempFile: true,
                        selectionStart: editState.selectionStart,
                        selectionEnd: editState.selectionEnd,
                        scrollTop: editState.scrollTop
                    }
                );

                if (!editResult) {
                    if (isNewEdit) {
                        await game.promises.removeFile(jsonFilePath).catch(() => { });
                    }
                    return false;
                }

                editState = {
                    selectionStart: editResult.selectionStart,
                    selectionEnd: editResult.selectionEnd,
                    scrollTop: document.querySelector('.lit-ui-textarea')?.scrollTop || 0
                };

                if (editResult.action === 'save') {
                    const dir = jsonFilePath.substring(0, jsonFilePath.lastIndexOf('/'));
                    const filename = jsonFilePath.split('/').pop();
                    await game.promises.writeFile(editResult.content, dir, filename);

                    await dialogManager.alert(
                        '✅ 暂存成功！',
                        `文件已暂存：${filename}\n您可以稍后继续编辑此文件。`
                    );
                    return false;
                }

                try {
                    JSON.parse(editResult.content);
                } catch (jsonError) {
                    await dialogManager.alert(
                        `❌ JSON格式验证失败\n\n错误位置：${jsonError.message}\n\n请修正语法错误后再试。`,
                        '错误提示'
                    );

                    const dir = jsonFilePath.substring(0, jsonFilePath.lastIndexOf('/'));
                    const filename = jsonFilePath.split('/').pop();
                    await game.promises.writeFile(editResult.content, dir, filename);

                    jsonContent = editResult.content;
                    continue;
                }

                const dir = jsonFilePath.substring(0, jsonFilePath.lastIndexOf('/'));
                const filename = jsonFilePath.split('/').pop();
                await game.promises.writeFile(editResult.content, dir, filename);
                jsonContent = editResult.content;

                let newFilePath;
                try {
                    newFilePath = await configService.encodeJsonToNewConfig(jsonFilePath);
                } catch (encodeError) {
                    await dialogManager.alert(
                        '❌ 编码失败', `错误详情：${encodeError.message}\n\n请检查JSON内容格式，修正后重试。`
                    );
                    continue;
                }

                const newFileName = newFilePath.split('/').pop();

                if (editResult.deleteTempFile) {
                    try {
                        await game.promises.removeFile(jsonFilePath).catch(() => { });
                    } catch (cleanupError) {
                        console.warn('清理临时文件失败:', cleanupError);
                    }
                }

                await dialogManager.alert(
                    '✅ 编码完成！',
                    `配置文件已成功处理！\n\n新文件：${newFileName}\n保存位置：${extensionFilesPath}\n${editResult.deleteTempFile
                        ? '临时JSON文件已自动删除。'
                        : '临时JSON文件已保留，可手动清理。'
                    }`
                );

                return true;

            } catch (error) {
                dialogManager.closeAll();
                await dialogManager.alert(
                    '❌ 编辑配置失败', `错误详情：${error.message}`
                );
                return false;
            }
        }
    };

    const _applyConfigFile = async (filePath) => {
        try {
            const loading = await dialogManager.loading('请稍候', '正在应用配置...');
            try {
                if (filePath.endsWith('.json')) {
                    const jsonContent = await game.promises.readFileAsText(filePath);
                    const configData = JSON.parse(jsonContent);
                    await configService.applyConfigData(configData);
                } else {
                    await configService.applyFromBackupFile(filePath);
                }
            } finally {
                loading.close();
            }

            await _showSuccessAndReload('配置应用成功！');
        } catch (error) {
            dialogManager.closeAll();
            await dialogManager.alert(`❌ 应用配置失败：${error.message}`);
        }
    };

    const _deleteFiles = async (filePaths) => {
        const fileNames = filePaths.map(p => p.split('/').pop()).join('\n• ');

        const confirm = await dialogManager.confirm(
            '确认删除',
            `确定要删除以下 ${filePaths.length} 个文件吗？\n\n• ${fileNames}\n\n删除后无法恢复！`,
            '确定删除',
            '取消'
        );

        if (!confirm) return;

        const loading = await dialogManager.loading('请稍候', '正在删除文件...');
        let successCount = 0;
        try {
            for (const filePath of filePaths) {
                try {
                    await game.promises.removeFile(filePath);
                    successCount++;
                } catch (e) {
                    console.error(`删除文件失败: ${filePath}`, e);
                }
            }
        } finally {
            loading.close();
        }

        await dialogManager.alert(
            `✅ 删除完成`,
            `成功删除 ${successCount}/${filePaths.length} 个文件。`
        );
    };

    const _showSuccessAndReload = async (message, detail = '') => {
        if (_isReloading) return;
        _isReloading = true;

        let countdown = 3;
        const fullMessage = detail
            ? `${message}\n\n${detail}\n\n游戏将在 ${countdown} 秒后自动重启...`
            : `${message}\n\n游戏将在 ${countdown} 秒后自动重启...`;

        dialogManager.showCountdownDialog('操作成功', fullMessage, {
            onConfirm: _executeReload,
            onCancel: () => {
                _isReloading = false;
            },
            countdownTime: countdown
        });
    };

    const _executeReload = () => {
        if (_reloadTimer) {
            clearTimeout(_reloadTimer);
            _reloadTimer = null;
        }
        game.reload();
    };

    return {
        async main() {
            if (_reloadTimer) {
                clearTimeout(_reloadTimer);
                _reloadTimer = null;
            }
            _isReloading = false;

            const mainAction = await dialogManager.choice(
                '配置方案选择',
                '请选择配置方案：\n\n1. Windows端推荐 - 针对桌面端优化的配置\n2. Android端推荐 - 针对移动端优化的配置\n3. 恢复或编辑配置 - 管理备份文件（删除/编辑/应用）\n\n注：应用新配置后会重启游戏',
                ['Windows端推荐', 'Android端推荐', '恢复或编辑配置', '取消']
            );
            switch (mainAction) {
                case 0: case 1:
                    await _applyRecommendation(mainAction);
                    break;
                case 2:
                    await _manageFiles();
                    break;
                case 3: default: return;
            }
        },
    };
})();

// 主API对象
export const configManager = {
    async showUI() {
        await ConfigFlow.main();
    }
};
