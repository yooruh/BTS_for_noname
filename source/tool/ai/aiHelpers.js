import { lib, game, get } from '../../../../../noname.js';

/**
 * AI 纯函数工具箱（《AI设计规范》§13，2026-10-06 Phase 4.3 定型，接口冻结）。
 * 挂载点：lib.bts.aiHelpers —— precontent.js 直接植入 lib_bts，content 前即可用。
 *
 * ── 硬性约束（纯函数协议）──
 *   ① 全部函数禁 await / 引擎事件派发 / 状态写入 / 随机数；
 *   ② 同参同果：引擎会按参数缓存 AI 回调结果，多读一个可变状态就可能与缓存不一致；
 *   ③ 只读局面（isAlive / get.attitude / marks / storage 只读），不改任何玩家数据。
 *
 * ── 量纲（AI设计规范 §2）──
 *   1 点伤害/体力 ≈ 1.5 评估单位；击杀（含护盾抵扣）额外 +2.5；怒气 1 点 ≈ 1.0。
 */
export const aiHelpers = {
    /* ── 局面读取（存活 + 态度分类，口径与各技能 AI 手写循环一致） ── */
    enemiesOf(player) {
        return game.players.filter((t) => t.isAlive() && t !== player && get.attitude(player, t) < 0);
    },
    friendsOf(player) {
        return game.players.filter((t) => t.isAlive() && t !== player && get.attitude(player, t) > 0);
    },
    hasEnemy(player) {
        return game.players.some((t) => t.isAlive() && t !== player && get.attitude(player, t) < 0);
    },

    /* ── 量纲换算（§2 量表统一入口：改量表只改这里） ── */
    damageValue(n) {
        return n * 1.5;
    },
    // 含护盾抵扣的致死判定（护盾先吸收伤害，再比体力；对齐残梦门/乱蝶类手写口径）
    wouldKill(target, dmg) {
        const shield = Number(lib.bts.api.getShield(target)) || 0;
        return target.hp + Math.min(dmg, shield) <= dmg;
    },
    killBonus(target, dmg, bonus = 2.5) {
        return this.wouldKill(target, dmg) ? bonus : 0;
    },
    expected(p, value) {
        return p * value;
    },

    /* ── 威胁排序 ── */
    // 遍历敌方（enemiesOf 口径），取 score(t) 最大值；无正分返回 0（对齐手写 let best=0 循环）
    bestEnemyScore(player, score) {
        let best = 0;
        for (const t of this.enemiesOf(player)) {
            const v = score(t);
            if (v > best) best = v;
        }
        return best;
    },
};
