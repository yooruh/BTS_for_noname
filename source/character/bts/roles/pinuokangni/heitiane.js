// 黑天鹅（源 animal.lua L4588-4651）—— 揭露与中毒扩散。
import { lib, game, get, _status, B } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '风·虚无·流光忆庭的忆者'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('黑天鹅')}给目标挂${get.poptip('bts_glossary_abnormal_jielu_faq')}，靠异常伤害不断叠${get.poptip('bts_glossary_zhongdu_faq')}。`;
export const character = {
    bts_heitiane: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_biwan', 'bts_st_jizhu', 'bts_st_shizhui'],
    },
};
export const skill = {
    // ── 必杀技·臂湾（源 st_biwan = SkillCard + ZeroCardViewAsSkill，L4589-4610）──
    // 出牌阶段，失5怒气并令至少一名其他角色各附加2层揭露异常。
    bts_st_biwan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L4608）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            // 源 Card filter（L4592）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_biwan');
            lib.bts.api.loseAngry(player, 5); // 源 L4595：LoseAngry(player, 5)
            // 源 L4596-4598：AddAbnormal(p, "@abnormal_jielu", 2, player)
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'jielu', 2, player);
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_biwan') ? -1 : 7,
            result: { target: -1 },
        },
    },

    // ── 触发技·机杼（源 st_jizhu = TriggerSkill Damaged，L4612-4629）──
    // 其他角色于其回合内受到异常伤害后，你可以令其附加1层中毒。
    bts_st_jizhu: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L4620：受伤者 ≠ 你、reason 含 "abnormal_"（异常伤害）、且处于其回合内
            return (
                event.player !== player &&
                event.reason?.includes('bts_abnormal_') &&
                _status.currentPhase === event.player
            );
        },
        async content(event, trigger, player) {
            // 源 L4620：askForSkillInvoke（trigger=damageEnd 事件）
            const answer = await player
                .chooseBool(
                    `机杼：是否令${get.translation(trigger.player)}附加1层中毒？`,
                )
                .forResult();
            if (answer.bool) {
                // 源 L4622：AddAbnormal(player=受伤者, "@abnormal_poison", 1, p)
                lib.bts.api.addAbnormal(trigger.player, 'poison', 1, player);
            }
        },
        ai: { noe: true },
    },

    // ── 触发技·失坠（源 st_shizhui = TriggerSkill EventPhaseStart Finish，L4631-4650）──
    // 结束阶段开始时，可弃置一张【杀】，令所有中毒角色各附加1层中毒。
    bts_st_shizhui: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L4636-4641：结束阶段、存在中毒角色、且手牌有【杀】可弃
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer((target) => lib.bts.api.getAbnor(target, 'poison'))
            );
        },
        async cost(event, trigger, player) {
            // 源 L4641：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '失坠：选择弃置一张【杀】令所有中毒角色各附加1层中毒？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L4641：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L4643-4647：所有中毒角色各附加1层中毒
            for (const target of game.filterPlayer((target) =>
                lib.bts.api.getAbnor(target, 'poison'),
            ))
                lib.bts.api.addAbnormal(target, 'poison', 1, player);
        },
        ai: { result: { player: 1 } },
    },
};
export const translate = {
    bts_heitiane: '黑天鹅',
    bts_st_biwan: '臂湾',
    bts_st_biwan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并令至少一名其他角色各附加2层${get.poptip('bts_glossary_abnormal_jielu_faq')}。`,
    bts_st_jizhu: '机杼',
    bts_st_jizhu_info: `当其他角色于其回合内受到异常伤害后，你可以令其附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,
    bts_st_shizhui: '失坠',
    bts_st_shizhui_info: `结束阶段开始时，你可以弃置一张【杀】，令所有${get.poptip('bts_glossary_zhongdu_faq')}角色各附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,

    '$bts_st_biwan1': "记忆是常变的泡沫",
    '$bts_st_biwan2': "静默的水面下…便是无尽深渊",
    '$bts_st_jizhu1': "喏，拿好了",
    '$bts_st_jizhu2': "来许愿吧",
    '$bts_st_shizhui1': "不祥之征，重现",
    '$bts_st_shizhui2': "厄运之誓，降临",
    '~bts_heitiane': "流年…不利……",
};
export const simpleTranslate = {
    bts_st_biwan_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+2${get.poptip('bts_glossary_abnormal_jielu_faq')}`,
    bts_st_jizhu_info: `他人回合内受异常伤害后可令其+1${get.poptip('bts_glossary_zhongdu_faq')}`,
    bts_st_shizhui_info: `结束阶段可弃杀令全部${get.poptip('bts_glossary_zhongdu_faq')}角色各+1${get.poptip('bts_glossary_zhongdu_faq')}`,
};
export const pinyins = { bts_heitiane: 'heitiane' };
