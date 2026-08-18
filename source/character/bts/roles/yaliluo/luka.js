// 卢卡（源 animal.lua L3754-3814）—— 制胜必杀技诅咒+制胜、四溅锁定积攒制胜、裂拳决斗追击。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '物理·虚无·铁臂'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('卢卡')}是格斗输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_glossary_bless_zhisheng_faq'))}附加诅咒并积攒${get.poptip('bts_glossary_bless_zhisheng_faq')}，${B('四溅')}用杀/弃杀积攒${get.poptip('bts_glossary_bless_zhisheng_faq')}，${B('裂拳')}决斗伤害后追击。` +
    `<li>${get.poptip('bts_glossary_bless_zhisheng_faq')}让你的【杀】视为【决斗】`;

export const character = {
    bts_luka: {
        sex: 'male',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_st_zhisheng', 'bts_st_sijian', 'bts_st_liequan'],
    },
};

export const skill = {
    // ── 必杀技·制胜（源 st_zhisheng = SkillCard + ZeroCardViewAsSkill，L3755-3775）──
    // 出牌阶段，失3怒气并选择一名其他角色，令其附加1层诅咒，你附加3层制胜祝福。
    bts_st_zhisheng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L3773）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L3758）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_zhisheng');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L3761：LoseAngry(player, 3)
            lib.bts.api.addCurse(target, 1); // 源 L3762：AddCurse(target)
            await lib.bts.api.addBless(player, 'zhisheng', 3); // 源 L3763：AddBless(@bless_zhisheng, 3)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zhisheng')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·四溅（源 st_sijian = TriggerSkill Compulsory CardUsed/CardsMoveOneTime，L3777-3798）──
    // 当你使用【杀】或弃置【杀】后，你附加2层制胜祝福。
    bts_st_sijian: {
        trigger: { player: ['useCard', 'discardAfter'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'useCard') return event.card?.name === 'sha'; // 源 L3784：使用【杀】
            if (triggername === 'discardAfter') {
                // 源 L3791：从手牌弃置【杀】
                return (event.cards || []).some((card) => card.name === 'sha');
            }
            return false;
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(player, 'zhisheng', 2); // 源 L3786/L3793：AddBless(@bless_zhisheng, 2)
        },
        ai: { noe: true },
    },

    // ── 触发技·裂拳（源 st_liequan = TriggerSkill Damage，L3800-3813）──
    // 当你使用【决斗】造成伤害后，你可以弃置一张【杀】，令受到伤害的角色失去1点体力。
    bts_st_liequan: {
        trigger: { source: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L3807：决斗造成伤害（非链索、非转移），且手牌有【杀】可弃
            return (
                event.card?.name === 'juedou' &&
                !event.chain &&
                event.player.isAlive() &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L3807：askForCard(player, "Slash")
            const result = await player
                .chooseBool(
                    '裂拳：是否弃置一张【杀】令' +
                        get.translation(trigger.player) +
                        '失去1点体力？',
                )
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = { bool: true };
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // trigger=触发事件（damageEnd）；trigger.player = 受伤者
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            await trigger.player.loseHp(1); // 源 L3810：room:loseHp(damage.to)
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    bts_luka: '卢卡',
    bts_st_zhisheng: '制胜',
    bts_st_zhisheng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加1层诅咒，你附加3层${get.poptip('bts_glossary_bless_zhisheng_faq')}。`,


    bts_st_sijian: '四溅',
    bts_st_sijian_info: `锁定技，当你使用【杀】或弃置【杀】后，你附加2层${get.poptip('bts_glossary_bless_zhisheng_faq')}。`,


    bts_st_liequan: '裂拳',
    bts_st_liequan_info:
        '当你使用【决斗】造成伤害后，你可以弃置一张【杀】，令受到伤害的角色失去1点体力。',



};

export const simpleTranslate = {
    bts_st_zhisheng_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+1诅咒，你+3${get.poptip('bts_glossary_bless_zhisheng_faq')}`,
    bts_st_sijian_info: `锁；你使用或弃置杀后+2${get.poptip('bts_glossary_bless_zhisheng_faq')}`,
    bts_st_liequan_info: '决斗造成伤害后，弃1杀令目标失去1体力',
};

export const pinyins = { bts_luka: 'luka' };
