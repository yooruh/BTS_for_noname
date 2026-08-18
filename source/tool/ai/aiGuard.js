import { lib, game, ui, get, ai, _status } from '../../../../../noname.js';

/**
 * AI 防重试守卫（搬运自叁岛，前缀 lit_ → bts_）：阻止 AI 在同一出牌阶段内、
 * 两次判断之间没有任何操作时，反复发动同一主动技（这是技能让游戏卡死的根源）。
 *
 * ── 使用方式（对每个"content 内层选择可能失败而空转"的主动技接线）──
 *   ① ai.order 首行：
 *        if (lib.bts.aiGuard.blocked(player, '<技能扩展名>')) return -1;
 *      若原 ai.order 是数字常量（如 order:7），改写为：
 *        (item, player) => lib.bts.aiGuard.blocked(player, '<技能扩展名>') ? -1 : 7;
 *   ② content 首行：
 *        lib.bts.aiGuard.record(player, '<技能扩展名>');
 *      （<技能扩展名> 必须与 ai.order 收到的 item 一致。）
 *   ③ 守卫表会在每个玩家的 phaseUseBegin 由全局技能 bts_aiGuardReset 自动清空，无需手动处理。
 *   ⚠ 只影响 AI（只在 ai.order 中被读取）；人类玩家走 UI 选择，不受守卫约束。
 *
 * ── 原理 ──
 *   sum() 配合 player.getAllHistory 与 game.getAllGlobalHistory 一起使用，
 *          把"玩家历史 + 全局历史"各事件数量全部累加，作为全局"操作"计数：
 *          玩家历史（逐玩家）：useSkill / useCard / respond / lose / gain / sourceDamage / damage / skipped
 *          全局历史（全体共有）：useCard / cardMove / changeHp
 *          → 值只增不减、天然单调，且与 player.getStat() 完全解耦。
 *   record() 在 content 首行执行时记录"本次尝试刚发生"后的累计值；
 *   blocked() 比较 record 与当前 sum：若尝试后无任何操作，重评估时 sum 未变 → 命中 → 返回 -1。
 */
export const aiGuard = {
    // 全局"操作"累计次数：玩家历史 + 全局历史 合并累加（只增不减）
    sum(player) {
        let n = 0;
        const all = (game.players || []).concat(game.dead || []);
        for (const p of all) {
            n +=
                p.getAllHistory('useSkill').length +
                p.getAllHistory('useCard').length +
                p.getAllHistory('respond').length +
                p.getAllHistory('lose').length +
                p.getAllHistory('gain').length +
                p.getAllHistory('sourceDamage').length +
                p.getAllHistory('damage').length +
                p.getAllHistory('skipped').length;
        }
        if (game.getAllGlobalHistory) {
            n +=
                game.getAllGlobalHistory('useCard').length +
                game.getAllGlobalHistory('cardMove').length +
                game.getAllGlobalHistory('changeHp').length;
        }
        return n;
    },
    record(player, skill) {
        player.storage.bts_aiGuard ??= {};
        player.storage.bts_aiGuard[skill] = this.sum(player);
    },
    blocked(player, skill) {
        return player.storage.bts_aiGuard?.[skill] === this.sum(player);
    },
};

export const aiGuardReset = {
    trigger: { player: 'phaseUseBegin' },
    charlotte: true,
    nopop: true,
    popup: false,
    silent: true,
    content() {
        player.storage.bts_aiGuard = {};
    },
};
