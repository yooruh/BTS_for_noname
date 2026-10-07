// 云璃（源 animal.lua L6856-6915）—— 看破反击与飞侠治疗。
// 技能：天宗（必杀技·看破祝福）、闪铄（受伤回怒+杀来源/全体）、飞侠（受伤弃杀回复）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '物理·毁灭·烛渊将军'; // 属性·命途
export const intro =
    `${B('云璃')}受伤后以${get.poptip('bts_sk_shanshuo')}反击，并可弃【杀】回复。`;

export const character = {
    bts_ch_yunli: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_tianzong', 'bts_sk_shanshuo', 'bts_sk_feixia'],
    },
};

export const skill = {
    // ── 必杀技·天宗（源 st_tianzong = SkillCard + ZeroCardViewAsSkill，L6857-6874）──
    // 出牌阶段，失2怒气，附加1层看破祝福。
    bts_sk_tianzong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6872）：怒气≥2
            return lib.bts.api.getAngry(player, 2);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_tianzong');
            lib.bts.api.loseAngry(player, 2); // 源 L6861：LoseAngry(player, 2)
            // 源 L6862：AddBless(player, "@bless_kanpo", 1)
            // 平衡改动（定夺）：出牌阶段叠1层会被当回合结束阶段自然衰减抹掉 → 改2层（源为1）。
            await lib.bts.api.addBless(player, 'kanpo', 2, player);
        },
        ai: {
            // AI 口径：怒气≥4，或（怒气≥2 且已有看破——补层续追击）；低怒无看破时蓄怒等待
            //（源 AI max_tianzong：GetAngry(4) or (GetAngry(2) and kanpo)，StarRail-ai L2648-2664）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_tianzong'))
                    return -1;
                if (lib.bts.api.getAngry(player, 4)) return 6;
                if (
                    lib.bts.api.getAngry(player, 2) &&
                    lib.bts.api.getBless(player, 'kanpo')
                )
                    return 5;
                return -1;
            },
            result: {
                // 自身+2层看破（每层=1次无牌【杀】结算后追1决斗）；已有看破时叠加价值略降
                player: (player) =>
                    lib.bts.api.getBless(player, 'kanpo') ? 1.5 : 2.5,
            },
        },
    },

    // ── 锁定技·闪铄（源 st_shanshuo = TriggerSkill Compulsory DamageInflicted，L7238-7265）──
    // 当你受到伤害后，回复1点怒气，视为对伤害来源使用【杀】；若无来源，改为对所有其他角色使用【杀】。
    // 定夺（E-05）：由 damageBegin1 改挂 damageEnd——damageBegin 时机插入【杀】的结算
    // 更容易导致结算混乱（源 DamageInflicted 为受方最终钩子，无名杀以伤害结算完成后近似）。
    bts_sk_shanshuo: {
        trigger: { player: 'damageEnd' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L7245：AddAngry(player)
            lib.bts.api.addAngry(player);
            // 源 L7246-7263：有来源则对其使用【杀】，无来源则对所有其他角色使用【杀】
            const targets = trigger.source?.isAlive()
                ? [trigger.source]
                : game.filterPlayer((target) => target !== player);
            if (targets.length) {
                await player.useCard({ name: 'sha', isCard: true }, targets);
            }
        },
    },

    // ── 触发技·飞侠（源 st_feixia = TriggerSkill Damaged，L6905-6914）──
    // 受到伤害后，可弃置一张【杀】，回复1点体力。
    bts_sk_feixia: {
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            // 源 L6909：受伤后手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                player.isDamaged() &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6909：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）。
            // 发动 AI 在本内联选择（cost 型触发技引擎不询顶层 check）：回1体≈1.5、血线低更急；
            // 弃最低值【杀】（源 st_feixia 无专属 AI）。
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '飞侠：是否弃置一张【杀】回复1点体力？',
                    (card) => {
                        if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                        let v = 5; // 回1体(≈1.5)+不与出杀竞争手牌
                        if (player.hp <= 1) v += 3; // 濒死线上：保命优先
                        else if (player.hp === 2) v += 1;
                        return v - get.value(card);
                    },
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
    bts_ch_yunli: '云璃',
    bts_sk_tianzong: '天宗',
    bts_sk_tianzong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去2点${get.poptip('bts_glossary_nuqi_faq')}，附加2层${get.poptip('bts_glossary_bless_kanpo_faq')}。`,
    bts_sk_shanshuo: '闪铄',
    bts_sk_shanshuo_info: `锁定技，当你受到伤害后，回复1点${get.poptip('bts_glossary_nuqi_faq')}，视为对伤害来源使用【杀】；若无来源，改为对所有其他角色使用【杀】。`,
    bts_sk_feixia: '飞侠',
    bts_sk_feixia_info: '受到伤害后，你可以弃置一张【杀】，回复1点体力。',

    '$bts_sk_tianzong1': "我要将你们，尽数熔断！",
    '$bts_sk_tianzong2': "截云，断岳！",
    '$bts_sk_tianzong3': "剑出，山倾！",
    '$bts_sk_tianzong4': "上决浮云，喝——",
    '$bts_sk_tianzong5': "下绝地纪，灭——",
    '$bts_sk_shanshuo1': "来得正好！",
    '$bts_sk_shanshuo2': "就是你了！",
    '$bts_sk_feixia1': "碎——岩——破！",
    '$bts_sk_feixia2': "崩——剑——斩！",
    '~bts_ch_yunli': "爷爷……",
    bts_bless_kanpo: '看破祝福',
    bts_bless_kanpo_info: `来源：${get.poptip('bts_sk_tianzong')}赋予；无牌杀结算后接决斗；回合结束自然减少1层`,
};

export const simpleTranslate = {
    bts_sk_tianzong_info: `${get.poptip('bts_glossary_bisha_faq')}；失2${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_bless_kanpo_faq')}`,
    bts_sk_shanshuo_info: `锁；受伤后+1${get.poptip('bts_glossary_nuqi_faq')}并杀来源（无来源则杀全体）`,
    bts_sk_feixia_info: '受伤后可弃杀回复1',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_kanpo: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_kanpo_faq',
        // 看破追击（源 CardFinished L1082-1084）：使用的无牌【杀】结算完毕后，视为对其目标使用【决斗】。
        trigger: { player: 'useCardAfter' },
        forced: true,
        silent: true,
        filter(event, player) {
            const card = event.card;
            return (
                event.player === player &&
                card?.name === 'sha' &&
                // 源 CardFinished L1082-1084（subcardsLength()==0）→ 统一 get.is.virtualCard
                //（待实机复核）。
                get.is.virtualCard(card) &&
                lib.bts.api.getBless(player, 'kanpo')
            );
        },
        async content(event, trigger, player) {
            const targets = (trigger.targets || []).filter((t) => t.isAlive());
            if (targets.length) {
                game.log(player, '触发了看破祝福，视为对目标使用【决斗】');
                await player.useCard(
                    { name: 'juedou', isCard: true },
                    targets,
                );
            }
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_kanpo_faq',
        name: '看破祝福',
        info: `当你使用的无牌【杀】指定目标并结算完毕后，视为对其目标使用【决斗】。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
