// 藿藿（源 animal.lua L6811-6855）—— 役鬼、灵符与凭附。
// 技能：役鬼（必杀技·按目标数回复怒气）、灵符（准备阶段弃杀加禳命祝福）、凭附（其他角色至你距离+2）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '风·丰饶·十王司见习判官'; // 属性·命途
export const intro =
    `${B('藿藿')}攒${get.poptip('bts_glossary_nuqi_faq')}，用${get.poptip('bts_glossary_bless_rangming_faq')}奶队友，还能把别人和自己拉开距离。`;

export const character = {
    bts_ch_huohuo: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_yigui', 'bts_sk_lingfu', 'bts_sk_pingfu'],
    },
};

export const skill = {
    // ── 必杀技·役鬼（源 max_yigui = SkillCard + ZeroCardViewAsSkill，L7174-7196）──
    // 出牌阶段，失5怒气并选择至少一名其他角色，这些角色各回复1点怒气。
    bts_sk_yigui: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7192-7194）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7176-7178）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yigui');
            lib.bts.api.loseAngry(player, 5); // 源 L7180：LoseAngry(player, 5)
            // 源 L7181-7183：AddAngry(p, 1, player) —— 目标各回复1点怒气
            for (const target of event.targets) lib.bts.api.addAngry(target, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_yigui') ? -1 : 7;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·灵符（源 st_lingfu = TriggerSkill EventPhaseStart Start，L6835-6844）──
    // 准备阶段开始时，可弃置一张【杀】，附加2层禳命祝福。
    bts_sk_lingfu: {
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
    bts_sk_pingfu: {
        mod: {
            globalTo(from, to, distance) {
                // 源 L6849-6850：目标是持有者 → 距离+2
                if (to.hasSkill('bts_sk_pingfu')) return distance + 2;
            },
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_ch_huohuo: '藿藿',
    bts_sk_yigui: '役鬼',
    bts_sk_yigui_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,
    bts_sk_lingfu: '灵符',
    bts_sk_lingfu_info: `准备阶段开始时，你可以弃置一张【杀】，附加2层${get.poptip('bts_glossary_bless_rangming_faq')}。`,
    bts_sk_pingfu: '凭附',
    bts_sk_pingfu_info: '锁定技，其他角色与你的距离+2。',

    '$bts_sk_yigui1': "你、你们不要过来啊…",
    '$bts_sk_yigui2': "你们这些小崽子，都给我让开…凶神恶鬼，有老子足矣！",
    '$bts_sk_lingfu1': "驱邪…缚魅…",
    '$bts_sk_lingfu2': "灵符…保命…",
    '~bts_ch_huohuo': "投…投降……",
    bts_bless_rangming: '禳命祝福',
    bts_bless_rangming_info: '来源：灵符赋予；必杀/准备阶段回复并清异常；回合结束自然减少1层',
};

export const simpleTranslate = {
    bts_sk_yigui_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}选至少1名其他角色，这些角色各回复1点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_lingfu_info: `准备阶段可弃杀+2${get.poptip('bts_glossary_bless_rangming_faq')}`,
    bts_sk_pingfu_info: '锁；其他角色至你的距离+2',
};

export const pinyins = { bts_ch_huohuo: 'huohuo' };

export const buffSkills = {
    bts_bless_rangming: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_rangming_faq',
        trigger: { global: ['phaseZhunbeiBegin', 'useSkillAfter'] },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            // 定夺 2026-09-12（E-07）：均不允许自指——源代码允许自指（自己准备阶段/必杀后
            // 也可触发）但源描述为「其他」，与摇风统一口径，按描述排除（event.player === player）。
            if (
                event.player === player ||
                !event.player.isDamaged() ||
                !lib.bts.api.getBless(player, 'rangming')
            )
                return false;
            if (
                triggername === 'useSkillAfter' &&
                lib.skill[event.skill]?.bts_bisha !== true
            )
                return false;
            // 触发对象须因本持有者回复过体力（RecoverLink 标记，见 resolver recoverEnd）。
            return (
                event.player.countMark(
                    `bts_recover_link_${player.playerid}`,
                ) > 0
            );
        },
        async content(event, trigger, player) {
            await trigger.player.recover(player);
            await lib.bts.api.removeAbnormalChoice(trigger.player);
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_rangming_faq',
        name: '禳命祝福',
        info: '因你回复过体力的角色于其准备阶段或发动必杀技后，回复1点体力并移除1层异常。你的结束阶段开始时，此祝福减少1层。',
    },
];
