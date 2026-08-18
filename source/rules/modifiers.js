// bts_gamerule_atk/dis/hand/card：太阳神全局数值修正映射到无名杀 mod 钩子。
// 单标记数值修正（神君/烧伤/中毒/睡眠）已拆到各自标记技能（marks.js RULE_MARKS，2026-09-02 TODO 批4）；
// 本文件仅保留「揭露」跨标记组合修正与 mod 透传。
// 技能定义只引用全局（lib.bts.*），不引用包级变量（对齐叁岛规范）。
import { lib } from '../../../../noname.js';

export const bts_gamerule_atk = {
    global: true,
    charlotte: true,
    silent: true,
    mod: {
        attackRange(player, range) {
            // 神君祝福(+层数) 与 烧伤(-1) 已拆到 bts_bless_shenjun / bts_abnormal_burn；
            // 揭露+中毒组合（且无烧伤，烧伤单独由 bts_abnormal_burn 处理）仍留此（源 gamerule_atk L1754）。
            if (
                !lib.bts.api.getAbnor(player, 'burn') &&
                lib.bts.api.getAbnor(player, 'jielu') &&
                lib.bts.api.getAbnor(player, 'poison')
            )
                range -= 1;
            return lib.bts.rules.dispatchMod('attackRange', player, range);
        },
    },
};

export const bts_gamerule_dis = {
    global: true,
    charlotte: true,
    silent: true,
    mod: {
        globalTo(from, to, distance) {
            // 睡眠：其他角色与你距离-1 已拆到 bts_abnormal_sleep 标记技能（2026-09-02 TODO 批4）。
            return lib.bts.rules.dispatchMod('globalTo', from, to, distance);
        },
    },
};

export const bts_gamerule_hand = {
    global: true,
    charlotte: true,
    silent: true,
    mod: {
        maxHandcard(player, num) {
            // 神君祝福(+层数) 与 中毒(-1) 已拆到 bts_bless_shenjun / bts_abnormal_poison；
            // 揭露+烧伤/麻痹组合（且无中毒，中毒单独由 bts_abnormal_poison 处理）仍留此（源 gamerule_hand L1780）。
            if (
                !lib.bts.api.getAbnor(player, 'poison') &&
                lib.bts.api.getAbnor(player, 'jielu') &&
                (lib.bts.api.getAbnor(player, 'burn') ||
                    lib.bts.api.getAbnor(player, 'numb'))
            )
                num -= 1;
            return lib.bts.rules.dispatchMod('maxHandcard', player, num);
        },
    },
};

export const bts_gamerule_card = {
    global: true,
    charlotte: true,
    silent: true,
    mod: {
        selectTarget(card, player, range) {
            const result = lib.bts.rules.dispatchMod(
                'selectTarget',
                card,
                player,
                range,
            );
            if (Array.isArray(result) && result !== range) {
                range[0] = result[0];
                range[1] = result[1];
            }
        },
        targetInRange(card, player, target) {
            return lib.bts.rules.dispatchMod(
                'targetInRange',
                card,
                player,
                target,
                undefined,
            );
        },
    },
};
