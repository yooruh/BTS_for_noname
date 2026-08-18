// 云璃（源 animal.lua L6856-6915）—— 看破反击与飞侠治疗。
// 技能：天宗（必杀技·看破祝福）、闪铄（受伤回怒+杀来源/全体）、飞侠（受伤弃杀回复）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '物理·毁灭·烛渊将军'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('云璃')}受伤后以闪铄反击，并可弃【杀】回复。`;

export const character = {
    bts_yunli: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_tianzong', 'bts_st_shanshuo', 'bts_st_feixia'],
    },
};

export const skill = {
    // ── 必杀技·天宗（源 st_tianzong = SkillCard + ZeroCardViewAsSkill，L6857-6874）──
    // 出牌阶段，失2怒气，附加1层看破祝福。
    bts_st_tianzong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6872）：怒气≥2
            return lib.bts.api.getAngry(player, 2);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianzong');
            lib.bts.api.loseAngry(player, 2); // 源 L6861：LoseAngry(player, 2)
            // 源 L6862：AddBless(player, "@bless_kanpo", 1)
            await lib.bts.api.addBless(player, 'kanpo', 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianzong') ? -1 : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 锁定技·闪铄（源 st_shanshuo = TriggerSkill Compulsory DamageInflicted，L6876-6903）──
    // 当你受到伤害后，回复1点怒气，视为对伤害来源使用【杀】；若无来源，改为对所有其他角色使用【杀】。
    bts_st_shanshuo: {
        trigger: { player: 'damageEnd' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L6883：AddAngry(player)
            lib.bts.api.addAngry(player);
            // 源 L6884-6900：有来源则对其使用【杀】，无来源则对所有其他角色使用【杀】
            const targets = trigger.source?.isAlive()
                ? [trigger.source]
                : game.filterPlayer((target) => target !== player);
            if (targets.length) {
                await player.useCard({ name: 'sha', isCard: true }, targets);
            }
        },
        ai: { noe: true },
    },

    // ── 触发技·飞侠（源 st_feixia = TriggerSkill Damaged，L6905-6914）──
    // 受到伤害后，可弃置一张【杀】，回复1点体力。
    bts_st_feixia: {
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            // 源 L6909：受伤后手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                player.isDamaged() &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6909：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '飞侠：是否弃置一张【杀】回复1点体力？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6911：room:recover(player, RecoverStruct(player))
            await player.recover(player);
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_yunli: '云璃',
    bts_st_tianzong: '天宗',
    bts_st_tianzong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去2点${get.poptip('bts_glossary_nuqi_faq')}，附加1层${get.poptip('bts_glossary_bless_kanpo_faq')}。`,
    bts_st_shanshuo: '闪铄',
    bts_st_shanshuo_info: `锁定技，当你受到伤害后，回复1点${get.poptip('bts_glossary_nuqi_faq')}，视为对伤害来源使用【杀】；若无来源，改为对所有其他角色使用【杀】。`,
    bts_st_feixia: '飞侠',
    bts_st_feixia_info: '受到伤害后，你可以弃置一张【杀】，回复1点体力。',

    '$bts_st_tianzong1': "我要将你们，尽数熔断！",
    '$bts_st_tianzong2': "截云，断岳！",
    '$bts_st_tianzong3': "剑出，山倾！",
    '$bts_st_tianzong4': "上决浮云，喝——",
    '$bts_st_tianzong5': "下绝地纪，灭——",
    '$bts_st_shanshuo1': "来得正好！",
    '$bts_st_shanshuo2': "就是你了！",
    '$bts_st_feixia1': "碎——岩——破！",
    '$bts_st_feixia2': "崩——剑——斩！",
    '~bts_yunli': "爷爷……",
};

export const simpleTranslate = {
    bts_st_tianzong_info: `${get.poptip('bts_glossary_bisha_faq')}；失2${get.poptip('bts_glossary_nuqi_faq')}+1${get.poptip('bts_glossary_bless_kanpo_faq')}`,
    bts_st_shanshuo_info: `锁；受伤后+1${get.poptip('bts_glossary_nuqi_faq')}并杀来源（无来源则杀全体）`,
    bts_st_feixia_info: '受伤后可弃杀回复1',
};

export const pinyins = { bts_yunli: 'yunli' };
