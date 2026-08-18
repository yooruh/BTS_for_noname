// 扩展根目录路径工具（搬运自叁岛，零修改）
// extensionPath 基于 lib.init.getCurrentFileLocation(import.meta.url) 动态计算，
// 天然适配任意安装目录，是扩展内动态 import / CSS 加载的路径基础。
// extensionFilesPath：资源根目录（noname 安装目录）下的 files/bts，
// 供配置备份/恢复（configManager/configService）使用。
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
