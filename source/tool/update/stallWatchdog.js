// ==================== 卡死/停滞检测 ====================
// 周期性检查加载界面的最近活动时间，超过阈值且尚未提示时，向加载界面发送“是否重启”提示信号。
// 纯观察：不取消、不打断下载/重试流程。返回 { stop, prompted }。
export function watchStall(ui, {
    threshold = 30000,
    interval = 3000,
    message = '检测到更新可能已卡死（进度长时间未变化），是否立即重启游戏？',
    buttonLabel = '立即重启',
    onRestart = null
} = {}) {
    if (!ui || typeof ui.getLastActivityAt !== 'function' || typeof ui.showPromptRow !== 'function') {
        return { stop() { } };
    }
    let prompted = false;
    let stopped = false;
    const timer = setInterval(() => {
        if (stopped || prompted) return;
        if (Date.now() - ui.getLastActivityAt() < threshold) return;
        prompted = true;
        try {
            ui.showPromptRow(message, buttonLabel, () => {
                try { onRestart?.(); } catch (e) { console.warn('[卡死检测] 重启执行失败:', e); }
            });
        } catch (e) {
            console.warn('[卡死检测] 提示失败:', e);
        }
    }, interval);
    return {
        stop() { stopped = true; clearInterval(timer); },
        get prompted() { return prompted; }
    };
}
