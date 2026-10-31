// 卢卡（源 animal.lua L3754-3814）—— 制胜必杀技诅咒+制胜、四溅锁定积攒制胜、裂拳决斗追击。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '物理·虚无·铁臂'; // 属性·命途
export const intro =
    `${B('卢卡')}是格斗输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_glossary_bless_zhisheng_faq'))}附加诅咒并积攒${get.poptip('bts_glossary_bless_zhisheng_faq')}，${B(get.poptip('bts_sk_sijian'))}用杀/弃杀积攒${get.poptip('bts_glossary_bless_zhisheng_faq')}，${B(get.poptip('bts_sk_liequan'))}决斗伤害后追击。` +
    `<li>${get.poptip('bts_glossary_bless_zhisheng_faq')}让你的【杀】视为【决斗】`;

export const character = {
    bts_ch_luka: {
        sex: 'male',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_zhisheng', 'bts_sk_sijian', 'bts_sk_liequan'],
    },
};

export const skill = {
    // ── 必杀技·制胜（源 st_zhisheng = SkillCard + ZeroCardViewAsSkill，L3755-3775）──
    // 出牌阶段，失3怒气并选择一名其他角色，令其附加1层诅咒，你附加3层制胜祝福。
    bts_sk_zhisheng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_zhisheng');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L3761：LoseAngry(player, 3)
            lib.bts.api.addCurse(target, 1); // 源 L3762：AddCurse(target)
            await lib.bts.api.addBless(player, 'zhisheng', 3); // 源 L3763：AddBless(@bless_zhisheng, 3)
        },
        ai: {
            // AI 口径：怒气≥3 且有敌方（诅咒须挂敌方）时发动；收益=3层制胜（下次【杀】视为【决斗】并锁目标手牌）
            // +1层诅咒（目标下次受伤+1）；手上留有【杀】可当回合兑现则加分，已就绪（≥3层）本次为续层略降
            //（源 animal.lua L3755-3775；制胜结算见本文件 buffSkills，诅咒见 rules/globalBuffs.js bts_curse）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_zhisheng')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1;
                let best = 0; // 敌方目标估值（诅咒挂友方为负收益，不选）
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    let v = 1.2; // 诅咒+1：下次受伤伤害+1（bts_curse damageBegin4，层数全部消耗）
                    if (target.hp <= 2) v += 0.4; // 残血：加伤更易兑现为濒死
                    best = Math.max(best, v);
                }
                if (!best) return -1;
                let value = 2.5 + best; // 3层制胜≈1次【杀】→【决斗】+锁目标手牌（近必中1伤+手牌干扰）
                if (player.getCards('h').some((card) => get.name(card) === 'sha'))
                    value += 1; // 手牌有【杀】：本回合即可兑现祝福
                if (lib.bts.api.getBless(player, 'zhisheng', -1) >= 3)
                    value -= 0.5; // 已就绪：本次为续层（结束阶段自然衰减）
                return value >= 4.5 ? 7 : value >= 3.5 ? 5 : 3;
            },
            result: {
                // 施动方：3层制胜（1次【杀】转【决斗】并锁目标手牌）；有【杀】可立即兑现
                player: (player) =>
                    player.getCards('h').some((card) => get.name(card) === 'sha')
                        ? 3
                        : 2.5,
                // 受动方：1层诅咒（下次受伤+1）；残血目标加伤威胁更大
                target: (player, target) => (target.hp <= 2 ? -1.6 : -1.2),
            },
        },
    },

    // ── 锁定技·四溅（源 st_sijian = TriggerSkill Compulsory CardUsed/CardsMoveOneTime，L3777-3798）──
    // 当你使用【杀】或弃置【杀】后，你附加2层制胜祝福。
    bts_sk_sijian: {
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
    },

    // ── 触发技·裂拳（源 st_liequan = TriggerSkill Damage，L3800-3813）──
    // 当你使用【决斗】造成伤害后，你可以弃置一张【杀】，令受到伤害的角色失去1点体力。
    bts_sk_liequan: {
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
                // AI 口径：仅对敌方弃【杀】——失去1体力无视防具/护盾（源 L3800-3813）
                .set('ai', () => {
                    const target = trigger.player;
                    if (!target || !target.isAlive()) return false;
                    return get.attitude(player, target) < 0;
                })
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
                // AI 口径：候选已过滤为【杀】，弃价值最低者
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    return -get.value(card);
                })
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
        ai: {
            // 供跨技能估值查询（发动决策在 cost 内联 ai）：目标失去1体力无视防具/护盾≈-1.5，残血可逼濒死
            result: {
                target: (player, target) => (target.hp <= 1 ? -2 : -1.5),
            },
        },
    },
};

export const translate = {
    bts_ch_luka: '卢卡',
    bts_sk_zhisheng: '制胜',
    bts_sk_zhisheng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加1层诅咒，你附加3层${get.poptip('bts_glossary_bless_zhisheng_faq')}。`,


    bts_sk_sijian: '四溅',
    bts_sk_sijian_info: `锁定技，当你使用【杀】或弃置【杀】后，你附加2层${get.poptip('bts_glossary_bless_zhisheng_faq')}。`,


    bts_sk_liequan: '裂拳',
    bts_sk_liequan_info:
        '当你使用【决斗】造成伤害后，你可以弃置一张【杀】，令受到伤害的角色失去1点体力。',



    bts_bless_zhisheng: '制胜祝福',
    bts_bless_zhisheng_info: `来源：${get.poptip('bts_glossary_bless_zhisheng_faq')}、${get.poptip('bts_sk_sijian')}赋予；杀当决斗、锁目标手牌，发动移除3层；回合结束自然减少1层`,

    '$bts_sk_zhisheng1': "欢呼声在哪儿？",
    '$bts_sk_zhisheng2': "值得我认真起来的对手…哼，见识下，火花四溅吧！",
    '$bts_sk_sijian1': "这一拳——送你回家！",
    '$bts_sk_sijian2': "先发制人！",
    '$bts_sk_liequan1': "很嚣张嘛！",
    '$bts_sk_liequan2': "别走神了！",

    '~bts_ch_luka': "不能这么狼狈……",
};

export const simpleTranslate = {
    bts_sk_zhisheng_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+1诅咒，你+3${get.poptip('bts_glossary_bless_zhisheng_faq')}`,
    bts_sk_sijian_info: `锁；你使用或弃置杀后+2${get.poptip('bts_glossary_bless_zhisheng_faq')}`,
    bts_sk_liequan_info: '决斗造成伤害后，弃1杀令目标失去1体力',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_zhisheng: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_zhisheng_faq',
        // 制胜锁手（源 animal.lua L1041-1061）：使用【杀】/【决斗】时视为【决斗】并锁定
        // 目标手牌（置于其武将牌），结算完毕/取消后归还（自 resolver 迁入）。
        trigger: { player: ['useCard', 'useCardAfter', 'useCardCancelled'] },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (triggername === 'useCardAfter' || triggername === 'useCardCancelled')
                return event._bts_zhisheng_stash != null;
            const card = event.card;
            return (
                event.player === player &&
                !!card &&
                ['sha', 'juedou'].includes(card.name) &&
                lib.bts.api.getBless(player, 'zhisheng', 3)
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'useCardAfter' || event.triggername === 'useCardCancelled') {
                // 归还仍在其武将牌上、且仍归其所有的牌（死亡/易主则自然流失）。
                const stash = trigger._bts_zhisheng_stash;
                if (!stash) return;
                delete trigger._bts_zhisheng_stash;
                for (const { target, cards } of stash) {
                    if (!target.isAlive()) continue;
                    const back = cards.filter(
                        (card) =>
                            get.position(card) === 'x' && get.owner(card) === target,
                    );
                    if (back.length) {
                        game.log(target, '取回了被制胜祝福置于武将牌上的手牌');
                        await target.gain(back, 'gain2');
                    }
                }
                return;
            }
            const card = trigger.card;
            const duel = get.autoViewAs(
                {
                    name: 'juedou',
                    suit: card.suit,
                    number: card.number,
                },
                trigger.cards,
            );
            duel.storage = { ...(card.storage || {}) };
            trigger.card = duel;
            game.log(player, '触发了制胜祝福，此【杀】视为【决斗】');
            await lib.bts.api.removeBless(player, 'zhisheng', 3);
            const stash = [];
            for (const target of trigger.targets) {
                const handcards = target.getCards('h');
                if (!handcards.length) continue;
                stash.push({ target, cards: handcards });
                await target.addToExpansion(handcards, 'give');
            }
            if (stash.length) {
                trigger._bts_zhisheng_stash = stash;
                game.log(
                    player,
                    '制胜祝福：',
                    stash.map((item) => item.target),
                    '的手牌被置于武将牌上',
                );
            }
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_zhisheng_faq',
        name: '制胜祝福',
        info: `当你使用【杀】时，若拥有至少3层此${get.poptip('bts_glossary_bless_faq')}，此牌视为【决斗】；当你使用【决斗】指定目标后，移除3层此${get.poptip('bts_glossary_bless_faq')}，将其手牌置于其武将牌上直到此牌结算完毕。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
