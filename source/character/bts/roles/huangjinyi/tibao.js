// 缇宝（源 animal.lua L7461-7557）—— 诅咒、贯通礼物与忙碌追击。
// 技能：猜猜（必杀技·诅咒+星启用杀）、礼物（准备阶段弃杀分发贯通/暴击祝福）、忙碌（他人必杀后追击）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '量子·同谐·黄金裔的半神'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('缇宝')}给人挂诅咒、发${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}，必杀触发后再补刀。`;

export const character = {
    bts_tibao: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_caicai', 'bts_st_liwu', 'bts_st_manglu'],
    },
};

export const skill = {
    // ── 必杀技·猜猜（源 st_caicai = SkillCard + ZeroCardViewAsSkill，L7462-7486）──
    // 出牌阶段，失5怒气，令任意名其他角色各附加1层诅咒；若你为星启，视为对这些角色使用【杀】。
    bts_st_caicai: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7484）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7465）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_caicai');
            lib.bts.api.loseAngry(player, 5); // 源 L7468：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L7470：AddACurse(p, player) —— 附加1层诅咒
                lib.bts.api.addCurse(target, 1);
                // 源 L7472-7474：星启时 ViewAsCardSkill 视为对目标使用【杀】
                if (lib.bts.api.god(player))
                    await player.useCard({ name: 'sha', isCard: true }, target);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_caicai')
                    ? -1
                    : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·礼物（源 st_liwu = TriggerSkill EventPhaseStart Start + OneCardViewAsSkill，L7488-7528）──
    // 准备阶段开始时，可弃置一张【杀】，令你与一名其他角色各附加3层贯通祝福；若你为星启，额外各附加1层暴击祝福。
    bts_st_liwu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L7524：准备阶段开始且手牌非空（有【杀】可弃）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L7525：askForUseCard("@@st_liwu") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '礼物：弃置一张【杀】令你与一名其他角色各获得3层贯通祝福',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    selectTarget: 1,
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            // 源 L7494-7496：自己+3贯通（星启额外+1暴击）
            await lib.bts.api.addBless(player, 'through', 3, player);
            await lib.bts.api.addBless(event.targets[0], 'through', 3, player);
            if (lib.bts.api.god(player)) {
                // 源 L7500-7502：星启时目标也各+1暴击
                await lib.bts.api.addBless(player, 'critical', 1, player);
                await lib.bts.api.addBless(event.targets[0], 'critical', 1, player);
            }
            // 源 L7496/L7502：拥有爱诗时缇宝额外+1暴击祝福（『门径』诗；源代码加给缇宝自己，
            // 描述写"目标额外附加"为虚标，以代码为准）
            if (player.hasSkill('bts_st_aishi'))
                await lib.bts.api.addBless(player, 'critical', 1, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·忙碌（源 st_manglu = TriggerSkill CardFinished，L7530-7556）──
    // 其他角色发动必杀技后，若其拥有贯通祝福，你可以视为对一名其他角色使用【杀】。
    bts_st_manglu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        trigger: { global: 'useSkillAfter' },
        filter(event, player) {
            // 源 L7536：其他角色使用 SkillCard 且技能名含 "max_"（必杀技），且其有贯通祝福。
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）
            return (
                event.player !== player &&
                lib.skill[event.skill]?.bts_bisha === true &&
                lib.bts.api.getBless(event.player, 'through')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7545-7547：askForPlayerChosen 选择一名可【杀】目标（可取消）
            event.result = await player
                .chooseTarget(
                    '忙碌：是否视为对一名其他角色使用【杀】？',
                    [1, 1],
                    (card, source, target) => target !== source,
                    (target) => -get.attitude(player, target),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L7547：ViewAsCardOnly —— 视为对目标使用【杀】
            await player.useCard({ name: 'sha', isCard: true }, event.targets);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_tibao: '缇宝',
    bts_st_caicai: '猜猜',
    bts_st_caicai_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令至少一名其他角色各附加1层诅咒；若你为${get.poptip('bts_glossary_xingqi_faq')}，视为对这些角色使用【杀】。`,
    bts_st_liwu: '礼物',
    bts_st_liwu_info: `准备阶段开始时，你可以弃置一张【杀】，令你与一名其他角色各附加3层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，额外各附加1层${get.poptip('bts_glossary_bless_critical_faq')}；若你拥有${get.poptip('bts_st_aishi')}，你额外获得1层${get.poptip('bts_glossary_bless_critical_faq')}。`,
    bts_st_manglu: '忙碌',
    bts_st_manglu_info: `锁定技，其他角色发动${get.poptip('bts_glossary_bisha_faq')}后，若其拥有${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}，你可以视为对一名其他角色使用【杀】。`,

    '$bts_st_caicai1': "要来了么？嘿嘿",
    '$bts_st_caicai2': "预备，起——乘着西风，出发咯~",
    '$bts_st_liwu1': "特大喜讯~",
    '$bts_st_liwu2': "送温暖~",
    '$bts_st_manglu1': "给我冲呀——！BANG！",
    '$bts_st_manglu2': "走——起飞咯！BANG！",
    '~bts_tibao': "明天…见……",
};

export const simpleTranslate = {
    bts_st_caicai_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1诅咒，${get.poptip('bts_glossary_xingqi_faq')}时对其用杀`,
    bts_st_liwu_info: `准备阶段可弃杀令自己和1名其他角色各+3${get.poptip('bts_glossary_guantong_faq')}，${get.poptip('bts_glossary_xingqi_faq')}额外+1${get.poptip('bts_glossary_bless_critical_faq')}`,
    bts_st_manglu_info: `锁；他人发动${get.poptip('bts_glossary_bisha_faq')}且有${get.poptip('bts_glossary_guantong_faq')}后可对1名其他角色用杀`,
};

export const pinyins = { bts_tibao: 'tibao' };
