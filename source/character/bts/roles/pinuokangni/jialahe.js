// 加拉赫（源 animal.lua L4235-4315）—— 酩酊、治疗强化与弃杀治疗。
import { lib, game, get, _status, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '火·丰饶·缄默的服务员'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('加拉赫')}用${get.poptip('bts_glossary_abnormal_mingding_faq')}让伤害来源回血，自己的回合出牌阶段外回血+1。`;
export const character = {
    bts_jialahe: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 3,
        skills: ['bts_st_xiangbin', 'bts_st_aohan', 'bts_st_tetiao'],
    },
};
export const skill = {
    bts_st_xiangbin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xiangbin');
            lib.bts.api.loseAngry(player, 3);
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'mingding', 1, player);
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_xiangbin') ? -1 : 7,
            result: { target: -1 },
        },
    },
    bts_st_aohan: {
        // 「你令其他角色回复体力」→ 你为来源，用 source:（filter 中 event.source===player 已自动门控）
        trigger: { source: 'recoverBegin' },
        forced: true,
        filter(event, player) {
            return (
                _status.currentPhase === player &&
                _status.currentPhase?.phase !== 'phaseUse' &&
                event.player?.hp > 0
            );
        },
        content(event, trigger, player) {
            trigger.num++;
        },
        ai: { noe: true },
    },
    bts_st_tetiao: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer(
                    (target) => target !== player && target.isDamaged(),
                )
            );
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCardTarget({
                    prompt: '特调：弃置一张【杀】并令一名受伤角色回复1点体力',
                    position: 'h',
                    filterCard: (card) => get.name(card) === 'sha',
                    selectCard: 1,
                    filterTarget: (card, source, target) =>
                        target !== source && target.isDamaged(),
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选【杀】在技能事件 event.cards，结算弃置
            await player.discard(event.cards);
            await event.targets[0].recover(player);
        },
        ai: { result: { player: 1 } },
    },
};
export const translate = {
    bts_jialahe: '加拉赫',
    bts_st_xiangbin: '香槟',
    bts_st_xiangbin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并令至少一名其他角色各附加1层${get.poptip('bts_glossary_abnormal_mingding_faq')}。`,
    bts_st_aohan: '鏖酣',
    bts_st_aohan_info: '锁定技，你的回合内，于出牌阶段外回复体力时，回复量+1。',
    bts_st_tetiao: '特调',
    bts_st_tetiao_info:
        '准备阶段开始时，你可以弃置一张【杀】，令一名受伤的其他角色回复1点体力。',

    '$bts_st_xiangbin1': "生命醇美如佳酿",
    '$bts_st_xiangbin2': "朋友们，尽情享用吧！",
    '$bts_st_aohan1': "瞧着点",
    '$bts_st_aohan2': "还没结呢",
    '$bts_st_tetiao1': "调剂一下",
    '$bts_st_tetiao2': "来一口吧",
    '~bts_jialahe': "如果能重来……",
};
export const simpleTranslate = {
    bts_st_xiangbin_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+1${get.poptip('bts_glossary_abnormal_mingding_faq')}`,
    bts_st_aohan_info: '锁；你的回合内非出牌阶段回复量+1',
    bts_st_tetiao_info: '准备阶段可弃1杀令1名其他受伤角色回复1点体力',
};
export const pinyins = { bts_jialahe: 'jialahe' };
