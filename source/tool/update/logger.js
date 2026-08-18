import { game } from '../../../../../noname.js';

// ==================== 更新日志器 ====================
// 统一收集更新流程日志（时间/级别/标签/内容），失败时写入临时下载目录，
// 便于用户把日志文件内容复制到群里排查。
// 所有日志同时透出到浏览器控制台（console），方便开发时直接查看。
class UpdateLogger {
    constructor() {
        this.entries = [];
        this.context = {}; // 会话上下文（平台/模式/环境/目标版本/分支等），写入文件时附在头部
    }

    reset() {
        this.entries = [];
        this.context = {};
    }

    // 追加/更新会话上下文（如平台、模式、目标版本、分支）
    setContext(partial) {
        Object.assign(this.context, partial);
    }

    _push(level, tag, message) {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        this.entries.push({
            time: `${hh}:${mm}:${ss}.${ms}`,
            level,
            tag: tag || '',
            message: String(message ?? '')
        });
    }

    info(tag, message) {
        this._push('INFO', tag, message);
        console.log(`[${tag}] ${message}`);
    }

    warn(tag, message) {
        this._push('WARN', tag, message);
        console.warn(`[${tag}] ${message}`);
    }

    error(tag, message) {
        this._push('ERROR', tag, message);
        console.error(`[${tag}] ${message}`);
    }

    // 生成可复制的纯文本日志
    format() {
        const lines = [];
        lines.push('══════════ 崩铁杀 · 更新日志 ══════════');
        lines.push(`导出时间: ${new Date().toLocaleString()}`);
        for (const [k, v] of Object.entries(this.context)) {
            if (v !== undefined && v !== null && v !== '') lines.push(`${k}: ${v}`);
        }
        lines.push('────────────────────────────────────────');
        for (const e of this.entries) {
            const tag = e.tag ? `[${e.tag}] ` : '';
            lines.push(`[${e.time}] [${e.level}] ${tag}${e.message}`);
        }
        if (this.entries.length === 0) lines.push('（本次未记录到日志）');
        lines.push('══════════ 日志结束 ══════════');
        return lines.join('\n');
    }

    // 将日志写入指定目录（固定文件名 update_log.txt），返回完整路径；目录不存在或写入失败返回 null
    async writeToFile(dir) {
        if (!dir) return null;
        try {
            // 目录必须已存在（如临时下载目录），避免在已清理的情况下重建空目录
            const exists = await game.promises.checkDir(dir);
            if (exists !== 1) {
                console.log(`[日志] 目录不存在，跳过写日志文件: ${dir}`);
                return null;
            }
            const fileName = 'update_log.txt';
            await game.promises.writeFile(this.format(), dir, fileName);
            console.log(`[日志] 已保存更新日志: ${dir}/${fileName}`);
            return `${dir}/${fileName}`;
        } catch (e) {
            console.warn('[日志] 写入日志文件失败:', e && e.message || e);
            return null;
        }
    }
}

// 全局单例：整个更新会话共用，出错时统一写入日志文件
const logger = new UpdateLogger();
export { logger as updateLogger, UpdateLogger };
