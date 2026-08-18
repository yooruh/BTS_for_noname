// 驭空（源 animal.lua L5784-5859）—— 贯云、天阙与七札。
// 技能：贯云（必杀技·伤害+星启时分发致命/暴击祝福）、天阙（准备阶段弃杀+星启祝福）、七札（回合结束+赐福祝福）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '虚数·同谐·天舶司司舵'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('驭空')}进${get.poptip('bts_glossary_xingqi_faq')}后，给队友发${get.poptip('bts_glossary_bless_fatal_faq')}和${get.poptip('bts_glossary_bless_critical_faq')}祝福。`;

export const character = {
    bts_yukong: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_st_guanyun', 'bts_st_tianque', 'bts_st_qizha'],
    },
};

export const skill = {
    // ── 必杀技·贯云（源 st_guanyun = SkillCard + ZeroCardViewAsSkill + buff 子技，L5785-5835）──
    // 出牌阶段，失3怒气，对一名其他角色造成1点伤害；若你为星启，你与任意名其他角色各附加1层致命和暴击祝福。
    bts_st_guanyun: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 星启分支的致命/暴击祝福分配是次级 0..many（依赖本分支是否星启），无法上提；0下限为合法「不分发」
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5832）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5815）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_guanyun');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L5818：LoseAngry(player, 3)
            await target.damage(player, 1, 'nocard'); // 源 L5819：room:damage
            // 源 L5820-5821：星启时 askForUseCard("@@st_guanyun_buff!") 选任意名角色
            if (!lib.bts.api.god(player)) return;
            const result = await player
                .chooseTarget(
                    '贯云：你自身+1致命+1暴击祝福，并选择任意名其他角色各获得致命与暴击祝福',
                    [0, Infinity],
                    (card, source, target) => target !== source,
                )
                .forResult();
            // 源 L5794-5799：自己与所选角色各+1暴击、+1致命祝福
            await lib.bts.api.addBless(player, 'critical', 1, player);
            await lib.bts.api.addBless(player, 'fatal', 1, player);
            for (const target of result.targets || []) {
                await lib.bts.api.addBless(target, 'critical', 1, player);
                await lib.bts.api.addBless(target, 'fatal', 1, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_guanyun') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·天阙（源 st_tianque = TriggerSkill EventPhaseStart Start，L5837-5846）──
    // 准备阶段开始时，可弃置一张【杀】，获得1层星启祝福。
    bts_st_tianque: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L5841：准备阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L5841：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '天阙：是否弃置一张【杀】获得星启祝福？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L5843：AddBless(player, "@bless_god")
            await lib.bts.api.addBless(player, 'god', 1, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·七札（源 st_qizha = TriggerSkill Compulsory EventPhaseStart NotActive，L5848-5858）──
    // 回合结束时，你附加1层赐福祝福。
    bts_st_qizha: {
        trigger: { player: 'phaseAfter' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L5855：AddBless(player, "@bless_cifu")
            await lib.bts.api.addBless(player, 'cifu', 1, player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_yukong: '驭空',
    bts_st_guanyun: '贯云',
    bts_st_guanyun_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点伤害；若你为${get.poptip('bts_glossary_xingqi_faq')}，你与任意名其他角色各附加1层${get.poptip('bts_glossary_bless_fatal_faq')}和${get.poptip('bts_glossary_bless_critical_faq')}。`,
    bts_st_tianque: '天阙',
    bts_st_tianque_info: `准备阶段开始时，你可以弃置一张【杀】，获得1层${get.poptip('bts_glossary_bless_god_faq')}。`,
    bts_st_qizha: '七札',
    bts_st_qizha_info: `锁定技，回合结束时，你附加1层${get.poptip('bts_glossary_bless_cifu_faq')}。`,

    '$bts_st_guanyun1': "风起，云鸢就位",
    '$bts_st_guanyun2': "只此，一箭！",
    '$bts_st_tianque1': "势如疾风！",
    '$bts_st_tianque2': "气冲云霄！",
    '$bts_st_qizha1': "疾走先得",
    '$bts_st_qizha2': "看好了",
    '~bts_yukong': "我无颜面对……",
};

export const simpleTranslate = {
    bts_st_guanyun_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}对1名其他角色造成1伤害，${get.poptip('bts_glossary_xingqi_faq')}时分发${get.poptip('bts_glossary_bless_fatal_faq')}/${get.poptip('bts_glossary_bless_critical_faq')}`,
    bts_st_tianque_info: `准备阶段可弃杀获得${get.poptip('bts_glossary_xingqi_faq')}`,
    bts_st_qizha_info: `锁；回合结束+1${get.poptip('bts_glossary_bless_cifu_faq')}`,
};

export const pinyins = { bts_yukong: 'yukong' };
