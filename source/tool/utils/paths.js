// 扩展路径工具：extensionPath 基于 getCurrentFileLocation(import.meta.url) 计算，
// 适配任意安装目录、供动态 import/CSS 加载。

// extensionFilesPath 指向 noname 安装目录下的 files/bts，供配置备份/恢复使用。
import { lib } from '../../../../../noname.js';

const currentFilePath = lib.init.getCurrentFileLocation(import.meta.url);
const sourceSuffix = '/source/tool/utils/paths.js';

export const extensionPath = currentFilePath.slice(
    0,
    currentFilePath.lastIndexOf(sourceSuffix),
);
export const extensionFilesPath =
    currentFilePath.slice(0, currentFilePath.lastIndexOf('extension')) +
    'files/bts';
