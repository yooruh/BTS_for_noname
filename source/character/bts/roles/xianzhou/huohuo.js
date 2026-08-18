// 藿藿（源 animal.lua L6811-6855）—— 役鬼、灵符与凭附。
// 技能：役鬼（必杀技·按目标数回复怒气）、灵符（准备阶段弃杀加禳命祝福）、凭附（其他角色至你距离+2）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '风·丰饶·十王司见习判官'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('藿藿')}攒${get.poptip('bts_glossary_nuqi_faq')}，用${get.poptip('bts_glossary_bless_rangming_faq')}奶队友，还能把别人和自己拉开距离。`;

export const character = {
    bts_huohuo: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_yigui', 'bts_st_lingfu', 'bts_st_pingfu'],
    },
};

export const skill = {
    // ── 必杀技·役鬼（源 st_yigui = SkillCard + ZeroCardViewAsSkill，L6812-6833）──
    // 出牌阶段，失5怒气并选择至少一名其他角色，你回复等同目标数的怒气。
    // 注：源实现为自身按目标数获得怒气，源翻译文案误写「目标各回复怒气」，以源码为准。
    bts_st_yigui: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6831）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6815）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yigui');
            lib.bts.api.loseAngry(player, 5); // 源 L6818：LoseAngry(player, 5)
            // 源 L6819-6821：AddAngry(player, 1, p) —— 自身按目标数回复怒气
            for (const target of event.targets) lib.bts.api.addAngry(player, 1, target);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yigui') ? -1 : 7;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·灵符（源 st_lingfu = TriggerSkill EventPhaseStart Start，L6835-6844）──
    // 准备阶段开始时，可弃置一张【杀】，附加2层禳命祝福。
    bts_st_lingfu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L6839：准备阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6839：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '灵符：是否弃置一张【杀】获得2层禳命祝福？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6841：AddBless(player, "@bless_rangming", 2)
            await lib.bts.api.addBless(player, 'rangming', 2, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·凭附（源 st_pingfu = DistanceSkill，L6846-6854）──
    // 其他角色与你的距离+2。
    bts_st_pingfu: {
        mod: {
            globalTo(from, to, distance) {
                // 源 L6849-6850：目标是持有者 → 距离+2
                if (to.hasSkill('bts_st_pingfu')) return distance + 2;
            },
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_huohuo: '藿藿',
    bts_st_yigui: '役鬼',
    bts_st_yigui_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你回复等同于目标数的${get.poptip('bts_glossary_nuqi_faq')}。（源实现为自身获得怒气，与源翻译文案不一致，按源码为准）`,
    bts_st_lingfu: '灵符',
    bts_st_lingfu_info: `准备阶段开始时，你可以弃置一张【杀】，附加2层${get.poptip('bts_glossary_bless_rangming_faq')}。`,
    bts_st_pingfu: '凭附',
    bts_st_pingfu_info: '锁定技，其他角色与你的距离+2。',

    '$bts_st_yigui1': "你、你们不要过来啊…",
    '$bts_st_yigui2': "你们这些小崽子，都给我让开…凶神恶鬼，有老子足矣！",
    '$bts_st_lingfu1': "驱邪…缚魅…",
    '$bts_st_lingfu2': "灵符…保命…",
    '~bts_huohuo': "投…投降……",
};

export const simpleTranslate = {
    bts_st_yigui_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}选至少1名其他角色，自身回复等量${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_st_lingfu_info: `准备阶段可弃杀+2${get.poptip('bts_glossary_bless_rangming_faq')}`,
    bts_st_pingfu_info: '锁；其他角色至你的距离+2',
};

export const pinyins = { bts_huohuo: 'huohuo' };
