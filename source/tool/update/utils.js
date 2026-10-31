import { UPDATE_CONFIG as CONFIG } from './config.js';

// ==================== 工具函数 ====================
const utils = {
    parseSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // 百分比固定为最宽（100%）的宽度，用空格占位，避免数字变化时画面跳动（如 "  1%"、" 12%"、"100%"）
    padPercent(n) {
        return String(n).padStart(3, ' ') + '%';
    },

    // 字节数固定宽度（parseSize 最大输出 "1023.99 GB" 为 10 字符），等宽字体下列对齐
    padSize(bytes) {
        return this.parseSize(bytes).padStart(10, ' ');
    },

    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '计算中...';
        if (seconds < 60) return Math.ceil(seconds) + '秒';
        if (seconds < 3600) return Math.floor(seconds / 60) + '分' + Math.ceil(seconds % 60) + '秒';
        return Math.floor(seconds / 3600) + '时' + Math.floor((seconds % 3600) / 60) + '分';
    },

    // 去掉版本号前导的 v（如 v26.8.7.3 → 26.8.7.3）；未传或非字符串时返回空串
    stripV(v) {
        return String(v ?? '').replace(/^v/, '');
    },

    compareVersion(v1, v2) {
        const a = String(v1).replace(/^v/, '').split('.').map(Number);
        const b = String(v2).replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const x = a[i] || 0, y = b[i] || 0;
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    },

    // 匹配对应版本
    matchVersion(gameVer, rule) {
        if (!rule || rule === '*') return true;
        gameVer = String(gameVer).replace(/^v/, '');

        // 支持数组格式：['1.2.0', '1.3.x', '>=2.0.0']
        if (Array.isArray(rule)) {
            return rule.some(r => this.matchSingleVersion(gameVer, r));
        }

        // 支持字符串或分隔：'1.2.0 || 1.3.x || >=2.0.0'
        if (typeof rule === 'string' && rule.includes('||')) {
            const rules = rule.split('||').map(r => r.trim());
            return rules.some(r => this.matchSingleVersion(gameVer, r));
        }

        // 支持复合区间：'>=1.0.0 <2.0.0' 表示 [1.0.0, 2.0.0)
        if (typeof rule === 'string' && rule.includes(' ') && !rule.includes('||')) {
            const conditions = rule.split(/\s+/).filter(Boolean);
            return conditions.every(cond => this.matchSingleVersion(gameVer, cond));
        }

        return this.matchSingleVersion(gameVer, rule);
    },

    // 单例匹配
    matchSingleVersion(gameVer, rule) {
        rule = String(rule).trim();
        if (rule === '*') return true;

        if (rule.startsWith('>=')) return this.compareVersion(gameVer, rule.slice(2)) >= 0;
        if (rule.startsWith('<=')) return this.compareVersion(gameVer, rule.slice(2)) <= 0;
        if (rule.startsWith('>')) return this.compareVersion(gameVer, rule.slice(1)) > 0;
        if (rule.startsWith('<')) return this.compareVersion(gameVer, rule.slice(1)) < 0;

        // 处理 1.2.x / 1.2.* / 1.2.X 通配
        if (/[\dxX*]/.test(rule)) {
            const base = rule.split(/[xX*]/)[0].replace(/\.+$/, '');
            if (base) return gameVer.startsWith(base);
        }

        return this.compareVersion(gameVer, rule) === 0;
    },

    getFileType(filename) {
        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        if (CONFIG.types.text.includes(ext)) return 'text';
        if (CONFIG.types.media.includes(ext)) return 'media';
        return 'binary';
    },

    isCritical(filename) {
        return CONFIG.types.critical.some(c => filename.includes(c));
    },

    // 代码路径：除 image/、audio/ 外的全部文件（随代码包整包更新）
    isCodePath(path) {
        return !path.startsWith('image/') && !path.startsWith('audio/');
    },

    // 媒体路径：image/、audio/ 下的文件（逐文件增量更新）
    isMediaPath(path) {
        return path.startsWith('image/') || path.startsWith('audio/');
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },

    // 并发控制工具（Promise池）
    async asyncPool(poolLimit, array, iteratorFn) {
        const ret = [];
        const executing = new Set();
        for (const item of array) {
            const p = Promise.resolve().then(() => iteratorFn(item));
            ret.push(p);
            executing.add(p);
            const clean = () => executing.delete(p);
            p.then(clean).catch(clean);
            if (executing.size >= poolLimit) {
                await Promise.race(executing);
            }
        }
        return Promise.all(ret);
    }
};

export { utils as updateUtils };
