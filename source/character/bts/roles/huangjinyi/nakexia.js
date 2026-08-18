// 那刻夏（源 animal.lua L7861-7959）—— 升华异常与随机元素伤害。
// 技能：世塑（必杀技·升华异常）、揭露（他人移除异常后附加升华）、驱虚（结束阶段弃杀随机元素伤害）。
import { lib, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '风·智识·纷争的魔术师'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('那刻夏')}给人挂${get.poptip('bts_glossary_abnormal_shenghua_faq')}异常，再用驱虚的随机元素伤砸开局面。`;

export const character = {
    bts_nakexia: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_shisu', 'bts_st_jielu', 'bts_st_quxu'],
    },
};

export const skill = {
    // ── 必杀技·世塑（源 st_shisu = SkillCard + ZeroCardViewAsSkill，L7862-7883）──
    // 出牌阶段，失5怒气，令任意名其他角色各附加1层升华异常。
    bts_st_shisu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7881）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7865）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_shisu');
            lib.bts.api.loseAngry(player, 5); // 源 L7868：LoseAngry(player, 5)
            // 源 L7869-7871：AddAbnormal(p, "@abnormal_shenghua", 1, player)
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'shenghua', 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_shisu')
                    ? -1
                    : 5.3;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·揭露（源 st_jielu = TriggerSkill Compulsory MarkChanged，L7885-7901）──
    // 当其他角色移除异常后，若其拥有至少2种异常且不处于升华，其附加1层升华异常。
    bts_st_jielu: {
        // 源 st_jielu（animal.lua L7885-7902）：MarkChanged 且 mark.gain<0（room.cpp
        // setPlayerMark：gain=新值-旧值，<0 = 移除）——「其他角色移除异常后」触发；
        // 源翻译写「附加异常后」与代码不符，以代码为准。触发标记含升华自身（源未排除，
        // 升华被移除且仍有≥2种异常时会立即重新附加）。
        trigger: { global: 'removeMark' },
        forced: true,
        filter(event, player) {
            // 源 L7891：@abnormal_ 标记被移除（gain<0）、移除者仍有≥2种异常、且不处于升华
            return (
                event.player &&
                event.player !== player &&
                typeof event.markName === 'string' &&
                event.markName.startsWith('bts_abnormal_') &&
                lib.bts.api.abnormalCount(event.player) >= 2 &&
                !lib.bts.api.getAbnor(event.player, 'shenghua')
            );
        },
        async content(event, trigger, player) {
            // 源 L7894：AddAbnormal(player, "@abnormal_shenghua", 1, p)（trigger=removeMark 事件）
            lib.bts.api.addAbnormal(trigger.player, 'shenghua', 1, player);
        },
        ai: { noe: true },
    },

    // ── 触发技·驱虚（源 st_quxu = TriggerSkill EventPhaseStart Finish + OneCardViewAsSkill，L7903-7958）──
    // 结束阶段开始时，可弃置一张【杀】并选择至少一名其他角色：这些角色各有25%（组合形态40%）
    // 受到1点随机元素通常伤害；失败则下次以双倍概率判定。若有角色处于升华或以此法受到伤害，
    // 所有目标角色重复此流程（最多两轮）。
    bts_st_quxu: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L7954：结束阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player
                .getCards('h')
                .some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L7955：askForUseCard("@@st_quxu") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '驱虚：是否弃置一张【杀】并选择至少一名其他角色？',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    selectTarget: [1, Infinity],
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            lib.bts.aiGuard.record(player, 'bts_st_quxu');
            let repeat = false;
            // 源 L7910：for i=1..2（最多两轮）
            for (let round = 0; round < 2; round++) {
                for (const target of event.targets.filter((target) =>
                    target.isAlive(),
                )) {
                    // 源 L7912-7913：n=25，组合形态（GetXiLian）+15
                    let chance = player.hasSkill('bts_st_aishi') ? 40 : 25;
                    // 源 L7914-7916：此前失败过的目标（st_quxu 标记）概率翻倍
                    if (target.countMark('bts_st_quxu') > 0) {
                        target.removeMark(
                            'bts_st_quxu',
                            target.countMark('bts_st_quxu'),
                        );
                        chance *= 2;
                    }
                    // 源 L7918-7920：目标处于升华 → 需重复流程
                    if (lib.bts.api.getAbnor(target, 'shenghua')) repeat = true;
                    // 源 L7921-7930：按概率造成随机元素通常伤害，失败则打标记
                    if (Math.random() * 100 <= chance) {
                        // 源 L7922-7924：组合形态时先给无升华目标附加升华
                        if (
                            !lib.bts.api.getAbnor(target, 'shenghua') &&
                            player.hasSkill('bts_st_aishi')
                        ) {
                            lib.bts.api.addAbnormal(target, 'shenghua', 1, player);
                        }
                        repeat = true;
                        // 源 L7926-7927：随机六元素之一，reason 含 "_common_<nature>"
                        const nature = ['wind', 'flame', 'frost', 'earth', 'light', 'dark'][
                            Math.floor(Math.random() * 6)
                        ];
                        const damage = target.damage(player, 1, 'nocard');
                        damage.reason = `bts_st_quxu_common_${nature}`;
                        lib.bts.api.setDamageNature(damage, nature);
                        await damage;
                    } else {
                        // 源 L7929：失败 → addPlayerMark(self:objectName()) 记录
                        target.addMark('bts_st_quxu', 1, false);
                    }
                }
                // 源 L7932：本轮无升华/无命中则不重复
                if (!repeat) break;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_quxu') ? -1 : 4;
            },
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_nakexia: '那刻夏',
    bts_st_shisu: '世塑',
    bts_st_shisu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层${get.poptip('bts_glossary_abnormal_shenghua_faq')}。`,
    bts_st_jielu: '揭露',
    bts_st_jielu_info: `锁定技，当其他角色移除异常后，若其拥有至少2种异常且不处于${get.poptip('bts_glossary_abnormal_shenghua_faq')}，其附加1层${get.poptip('bts_glossary_abnormal_shenghua_faq')}。（源翻译写「附加异常后」与代码不符，以代码为准）`,
    bts_st_quxu: '驱虚',
    bts_st_quxu_info: `结束阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，这些角色各有25%受到1点随机元素通常伤害；失败则下次以双倍概率判定。若有角色处于${get.poptip('bts_glossary_abnormal_shenghua_faq')}或以此法受到伤害，所有目标角色重复此流程（每阶段限一次）。`,
    bts_abnormal_shenghua: '升华',

    '$bts_st_shisu1': "看呐，表演开始了……",
    '$bts_st_shisu2': "依此神技，萃精于糙，重塑万物！",
    '$bts_st_jielu1': "等价交换？不，无中生有！",
    '$bts_st_jielu2': "魔术技巧！",
    '$bts_st_quxu1': "彻底疯狂吧！",
    '$bts_st_quxu2': "直击灵魂！",
    '~bts_nakexia': "这点代价而已……",
};

export const simpleTranslate = {
    bts_st_shisu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1${get.poptip('bts_glossary_abnormal_shenghua_faq')}`,
    bts_st_jielu_info: `锁；他人移除异常后若仍有≥2种异常且未升华，令其+1${get.poptip('bts_glossary_abnormal_shenghua_faq')}`,
    bts_st_quxu_info:
        '结束阶段可弃杀选其他角色，25%随机元素通常伤害，失败下次概率翻倍',
};

export const pinyins = { bts_nakexia: 'nakexia' };
