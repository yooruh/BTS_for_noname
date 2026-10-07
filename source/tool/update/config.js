

// ==================== 配置与常量 ====================

// 更新模式：auto 代码包+媒体 md5 比对；code 仅代码；full 全覆盖；
// retry_failed 仅重试失败文件（非独立模式，见 index.js isRetryMode）。
const MODES = ['auto', 'code', 'full', 'retry_failed'];
const DEFAULT_MODE = 'auto';

export function normalizeMode(mode) {
    if (mode === 'simple') return 'auto';
    return MODES.includes(mode) ? mode : DEFAULT_MODE;
}

const CONFIG = {
    name: '崩铁杀',
    urls: {
        github: 'https://github.com/yooruh/BTS_for_noname',
        gitee: 'https://gitee.com/yooruh/BTS_for_noname'
    },
    files: {
        directory: 'Directory.json',
        version: 'version.json',
        state: '.update_state.json',
        codeZip: 'code.zip',            // 代码包下载到临时目录的文件名
        codeZipSentinel: '~code.zip',   // 状态任务中代表代码包的哨兵 remote（不落盘）
        stagingDir: '_temp_update'      // 代码包解压/校验暂存目录（扩展目录内）
    },
    // 不属于扩展包内容、需在备份/清理/遍历中忽略的条目
    // （开发机上的 .git/scripts 等 + 运行时临时项，与 scripts/rebuild.mjs 的 EXCLUDES 对齐）
    ignoredDirs: ['.git', '.vscode', 'node_modules', 'scripts', 'release', '.claude', '_temp_downloading', '_temp_update'],
    ignoredFiles: ['.update_state.json', 'package.json', 'package-lock.json', 'jsconfig.json', '.gitignore', '.gitattributes'],
    previewBranch: 'main',              // 预览版固定使用的分支（main 最新代码，非已发布版）
    limits: {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 30000,
        maxConcurrent: 3,
        backupCount: 5,
        stateSaveDebounce: 1000   // 状态保存防抖(ms)
    },
    types: {
        critical: ['extension.js', 'precontent.js', 'content.js'],
        text: ['.js', '.json', '.css', '.html', '.md', '.txt', '.ts', '.xml', '.yml', '.yaml', '.csv'],
        media: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp3', '.ogg', '.wav', '.mp4', '.zip']
    }
};

export { CONFIG as UPDATE_CONFIG };
