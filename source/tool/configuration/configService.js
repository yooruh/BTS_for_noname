import { lib, game } from '../../../../../noname.js';
import { extensionFilesPath, extensionPath } from '../utils/paths.js';
import { getFileList } from '../utils/fileSystem.js';

/**
 * 处理配置的加载、备份、恢复等操作
 * 公开接口: getAvailableConfigFiles, decodeBackupToJson, encodeJsonToNewConfig, loadAndApplyConfig, backupCurrentConfig, applyFromBackupFile, applyConfigData
 */
const ConfigService = (() => {
    const _applyToIndexedDB = async (configData) => {
        const { config = {}, data = {} } = configData;
        Object.assign(lib.config, config);

        const promises = [];
        for (const [key, value] of Object.entries(config)) {
            promises.push(_putDBAsync('config', key, value));
        }
        for (const [key, value] of Object.entries(data)) {
            promises.push(_putDBAsync('data', key, value));
        }

        await Promise.all(promises);
    };

    const _applyToLocalStorage = async (configData) => {
        const { config = {} } = configData;
        const vitalKeys = _getVitalKeys();
        const vitalValues = _backupVitalValues(vitalKeys);
        _clearOldConfigs();
        _restoreVitalValues(vitalValues);
        _writeNewConfigs(config);
    };

    const _getVitalKeys = () => {
        const candidates = [
            'noname_inited',
            `${lib.configprefix}key`,
            `${lib.configprefix}version`,
            `${lib.configprefix}mode`,
            `${lib.configprefix}name`,
            `${lib.configprefix}avatar`
        ];
        return candidates.filter(key => localStorage.getItem(key) !== null);
    };

    const _backupVitalValues = (vitalKeys) => {
        const backup = {};
        vitalKeys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value !== null) backup[key] = value;
        });
        return backup;
    };

    const _clearOldConfigs = () => {
        const prefix = lib.configprefix;
        const toRemove = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                toRemove.push(key);
            }
        }

        toRemove.forEach(key => localStorage.removeItem(key));
    };

    const _restoreVitalValues = (vitalValues) => {
        Object.entries(vitalValues).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                try {
                    localStorage.setItem(key, value);
                } catch (e) {
                    console.warn(`恢复关键配置项 ${key} 失败:`, e);
                }
            }
        });
    };

    const _writeNewConfigs = (config) => {
        Object.entries(config).forEach(([key, value]) => {
            try {
                const prefixedKey = key.startsWith(lib.configprefix)
                    ? key
                    : `${lib.configprefix}${key}`;
                localStorage.setItem(prefixedKey, value);
            } catch (e) {
                console.error(`写入配置 ${key} 失败:`, e);
            }
        });
    };

    const _putDBAsync = async (type, key, value) => {
        return new Promise((resolve, reject) => {
            game.putDB(type, key, value, (success) => {
                if (success) {
                    resolve();
                } else {
                    reject(new Error(`保存 ${type}.${key} 失败`));
                }
            });
        });
    };

    const _getCurrentConfigData = async () => {
        return new Promise((resolve, reject) => {
            try {
                if (!lib.db) {
                    const data = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(lib.configprefix)) {
                            data[key] = localStorage.getItem(key);
                        }
                    }
                    resolve({ config: data });
                } else {
                    game.getDB("config", null, (configData) => {
                        game.getDB("data", null, (dataData) => {
                            resolve({
                                config: configData || {},
                                data: dataData || {}
                            });
                        });
                    });
                }
            } catch (error) {
                reject(new Error(`获取当前配置失败：${error.message}`));
            }
        });
    };

    return {
        async getAvailableConfigFiles() {
            const backupDir = extensionFilesPath;
            let fileList = [];

            try {
                const [, files] = await getFileList(backupDir);
                fileList = files || [];
            } catch (error) {
                console.warn('读取文件列表失败:', error);
                fileList = [];
            }

            const configFiles = fileList
                .filter(f => f && typeof f === 'string' && (f.endsWith('.nncfg') || f.endsWith('.json')))
                .sort((a, b) => b.localeCompare(a));

            const items = configFiles.map(f => {
                const match = f.match(/^bts_([^_]+)_(.+)\.(nncfg|json)$/);
                let displayName;
                let type = '';

                if (match) {
                    type = match[1];
                    const timestamp = match[2];
                    const formattedTime = timestamp.replace(/_(\d{2})-(\d{2})-(\d{2})$/, ' $1:$2:$3');

                    const typeMap = {
                        backup: '备份于',
                        fixed: '修改于',
                        editing: '编辑中'
                    };
                    displayName = `${typeMap[type] || type + '于'} ${formattedTime}`;
                } else {
                    displayName = f.replace(/\.(nncfg|json)$/, '');
                }

                return {
                    value: f,
                    text: displayName,
                    type: type,
                    fullPath: `${backupDir}/${f}`
                };
            });

            return { files: configFiles, items, backupDir };
        },

        async decodeBackupToJson(backupFilePath) {
            try {
                const encodedData = await game.promises.readFileAsText(backupFilePath);
                if (!encodedData) {
                    throw new Error('备份文件为空');
                }

                const decodedData = lib.init.decode(encodedData);
                if (!decodedData) {
                    throw new Error('备份文件解码失败，可能已损坏');
                }

                const timestamp = new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
                const dir = backupFilePath.substring(0, backupFilePath.lastIndexOf('/'));
                const jsonFileName = `bts_editing_${timestamp}.json`;

                await game.promises.writeFile(decodedData, dir, jsonFileName);

                return `${dir}/${jsonFileName}`;
            } catch (error) {
                throw new Error(`解码备份文件失败：${error.message}`);
            }
        },

        async encodeJsonToNewConfig(jsonFilePath) {
            try {
                const jsonContent = await game.promises.readFileAsText(jsonFilePath);
                if (!jsonContent) {
                    throw new Error('JSON文件为空或无法读取');
                }

                try {
                    JSON.parse(jsonContent);
                } catch (jsonError) {
                    throw new Error(`JSON格式错误：${jsonError.message}`);
                }

                const encodedData = lib.init.encode(jsonContent);
                if (!encodedData) {
                    throw new Error('JSON文件编码失败');
                }

                const timestamp = new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
                const newFileName = `bts_fixed_${timestamp}.nncfg`;
                const dir = jsonFilePath.substring(0, jsonFilePath.lastIndexOf('/'));

                await game.promises.writeFile(encodedData, dir, newFileName);

                return `${dir}/${newFileName}`;
            } catch (error) {
                throw new Error(`编码JSON文件失败：${error.message}`);
            }
        },

        async loadAndApplyConfig(filename) {
            const filePath = `${extensionPath}/style/nncfg/${filename}`;

            try {
                await game.promises.checkFile(filePath);
            } catch (error) {
                throw new Error(`配置文件不存在：${filename}`);
            }

            const encodedData = await game.promises.readFileAsText(filePath);
            if (!encodedData || encodedData.trim() === '') {
                throw new Error('配置文件为空或无法读取');
            }

            const decodedData = lib.init.decode(encodedData);
            if (!decodedData) {
                throw new Error('配置文件解码失败，可能已损坏');
            }

            try {
                let configData = JSON.parse(decodedData);
                if (!configData || typeof configData !== 'object') {
                    throw new Error('配置文件格式错误');
                }
                await this.applyConfigData(configData);
            } catch (parseError) {
                throw new Error(`配置文件解析失败：${parseError.message}`);
            }
        },

        async backupCurrentConfig() {
            const backupDir = extensionFilesPath;

            try {
                await game.promises.ensureDirectory([backupDir]);
            } catch (error) {
                throw new Error(`创建备份目录失败：${error.message}`);
            }

            const timestamp = new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-');
            const backupName = `bts_backup_${timestamp}.nncfg`;
            const configData = await _getCurrentConfigData();
            const content = lib.init.encode(JSON.stringify(configData, null, 2));

            try {
                await game.promises.writeFile(content, backupDir, backupName);
                console.log('备份成功:', backupName, '大小:', content.length, '字节');
                return backupName;
            } catch (error) {
                throw new Error(`保存备份文件失败：${error.message}`);
            }
        },

        async applyFromBackupFile(filePath) {
            try {
                const encodedData = await game.promises.readFileAsText(filePath);
                if (!encodedData) {
                    throw new Error('备份文件为空');
                }

                const decodedData = lib.init.decode(encodedData);
                if (!decodedData) {
                    throw new Error('备份文件解码失败，可能已损坏');
                }

                const configData = JSON.parse(decodedData);
                await this.applyConfigData(configData);
            } catch (error) {
                throw new Error(`恢复备份失败：${error.message}`);
            }
        },

        async applyConfigData(configData) {
            console.log('开始应用配置数据:', configData);
            if (lib.db) {
                await _applyToIndexedDB(configData);
            } else {
                await _applyToLocalStorage(configData);
            }
            console.log('配置应用完成');
        }
    };
})();

export const configService = ConfigService;
