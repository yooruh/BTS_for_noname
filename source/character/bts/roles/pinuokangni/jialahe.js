// 加拉赫（源 animal.lua L4235-4315）—— 酩酊、治疗强化与弃杀治疗。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '火·丰饶·缄默的服务员'; // 属性·命途
export const intro = `${B('加拉赫')}用${get.poptip('bts_glossary_abnormal_mingding_faq')}让伤害来源回血，自己的回合出牌阶段外回血+1。`;
export const character = {
    bts_ch_jialahe: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 3,
        skills: ['bts_sk_xiangbin', 'bts_sk_aohan', 'bts_sk_tetiao'],
    },
};
export const skill = {
    bts_sk_xiangbin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        trigger: { player: 'useCard' },
        filter(event, player, triggername) {
            if (triggername === 'useCard') {
                // 源 L1050-1059 TargetSpecified：持有「下一张【杀】视为【决斗】」标记时
                return (
                    player.countMark('bts_mk_xiangbin-sha') > 0 &&
                    event.card?.name === 'sha'
                );
            }
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            if (event.triggername === 'useCard') {
                // 源 L1050-1059：此【杀】视为【决斗】且所有目标各附加1层混乱
                const card = trigger.card;
                const duel = get.autoViewAs(
                    { name: 'juedou', suit: card.suit, number: card.number },
                    trigger.cards,
                );
                duel.storage = { ...(card.storage || {}) };
                trigger.card = duel;
                game.log(player, '触发了香槟，此【杀】视为【决斗】');
                for (const target of trigger.targets || [])
                    lib.bts.api.addAbnormal(target, 'confuse', 1, player);
                // 一次性「下一张」标记：用后清除（源 L4455 只设不清属其自身缺陷，按描述实现）
                player.removeMark(
                    'bts_mk_xiangbin-sha',
                    player.countMark('bts_mk_xiangbin-sha'),
                );
                return;
            }
            lib.bts.aiGuard.record(player, 'bts_sk_xiangbin');
            lib.bts.api.loseAngry(player, 3);
            // 源 L4450-4451：星启时酩酊改为附加2层
            const n = lib.bts.api.god(player) ? 2 : 1;
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'mingding', n, player);
            // 源 L4455 setPlayerMark(@max_xiangbin, 1)：下一张【杀】视为【决斗】（绝对置1，重复使用不叠加）
            player.setMark('bts_mk_xiangbin-sha', 1);
        },
        // AI 口径：香槟标记为主动铺就的资源（失3怒+选定目标换来的下一张【杀】增益）——决斗不可闪避、
        // 且全体目标各+1混乱，默认兑现；仅多目标【杀】时放弃转换（本体 juedou 按 event.target 单体
        // 结算，多目标会丢失其余目标），保留标记给下一张单目标【杀】（源 L1050-1059 / L4450-4455）
        check(trigger, player, triggername, indexedData) {
            if (triggername !== 'useCard') return true;
            return (
                (trigger.targets || []).filter((t) => t.isAlive()).length === 1
            );
        },
        ai: {
            // AI 口径：失3怒为敌方挂酩酊（其受伤时来源回血≈1，我方进攻目标即回血）并铺「下一张杀转决斗」；
            // 有敌方目标才发动，手中尚有【杀】（兑现路径在即）更积极（源 L4235-4315）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_xiangbin'))
                    return -1;
                const enemies = game.countPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0,
                );
                if (!enemies) return -1;
                return player.countCards('h', 'sha') > 0 ? 7 : 5;
            },
            result: {
                // 目标受损=酩酊（其后每次受伤我方回1）；手里有【杀】时回血可兑现，更值
                target: (player, target) =>
                    -1 - (player.countCards('h', 'sha') > 0 ? 0.5 : 0),
            },
        },
    },
    bts_sk_aohan: {
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
        async content(event, trigger, player) {
            trigger.num++;
        },
    },
    bts_sk_tetiao: {
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
                    // AI 口径：自己回合准备阶段令他人回复——经「鏖酣」回复量+1（实际回复2）；
                    // 只给正态度友方，残血（hp=1）优先保命（源 L4235-4315 加拉赫段）
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) =>
                        get.attitude(player, target) + (target.hp === 1 ? 1 : 0),
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
export const marks = {
    'bts_mk_xiangbin-sha': { markKind: 'record' },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_jialahe_skin1': '皮肤1',
    'bts_mk_xiangbin-sha': '香槟加持',
    bts_ch_jialahe: '加拉赫',
    bts_sk_xiangbin: '香槟',
    bts_sk_xiangbin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为2层）${get.poptip('bts_glossary_abnormal_mingding_faq')}；若如此做，当你使用下一张【杀】指定目标后，视为【决斗】且所有目标各附加1层${get.poptip('bts_glossary_abnormal_confuse_faq')}。`,
    bts_sk_aohan: '鏖酣',
    bts_sk_aohan_info: '锁定技，你的回合内，于出牌阶段外回复体力时，回复量+1。',
    bts_sk_tetiao: '特调',
    bts_sk_tetiao_info:
        '准备阶段开始时，你可以弃置一张【杀】，令一名受伤的其他角色回复1点体力。',

    '$bts_sk_xiangbin1': "生命醇美如佳酿",
    '$bts_sk_xiangbin2': "朋友们，尽情享用吧！",
    '$bts_sk_aohan1': "瞧着点",
    '$bts_sk_aohan2': "还没结呢",
    '$bts_sk_tetiao1': "调剂一下",
    '$bts_sk_tetiao2': "来一口吧",
    '~bts_ch_jialahe': "如果能重来……",
    bts_abnormal_mingding: '酩酊',
};
export const simpleTranslate = {
    bts_sk_xiangbin_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+1${get.poptip('bts_glossary_abnormal_mingding_faq')}（${get.poptip('bts_glossary_xingqi_faq')}+2），下次杀视为决斗并令所有目标+1${get.poptip('bts_glossary_abnormal_confuse_faq')}`,
    bts_sk_aohan_info: '锁；你的回合内非出牌阶段回复量+1',
    bts_sk_tetiao_info: '准备阶段可弃1杀令1名其他受伤角色回复1点体力',
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_mingding: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_mingding_faq',
        trigger: { player: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.num > 0 &&
                event.source?.isAlive()
            );
        },
        async content(event, trigger, player) {
            await trigger.source.recover(player);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_mingding_faq',
        name: '|酩酊|',
        info: `异常状态：由技能效果赋予；持有者受到伤害后，伤害来源回复1点体力。`,
    },
];
