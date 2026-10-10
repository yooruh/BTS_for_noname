// 忘归人（源 animal.lua L7266-7348）—— 照世、摇风与流布。
// 技能：照世（必杀技·失怒弃牌附炎）、摇风（他人准备阶段无狐祈时弃杀+狐祈）、流布（他人弃置空城后记牌，受伤时夺牌失体）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '火·虚无·狐人少女'; // 属性·命途
export const intro =
    `${B('忘归人')}用${get.poptip('bts_sk_zhaoshi')}给对手挂火、拆手牌、削${get.poptip('bts_glossary_nuqi_faq')}；${get.poptip('bts_glossary_bless_huqi_faq')}护着队友，别人一旦空手卖牌，${get.poptip('bts_sk_liubu')}还能把那张牌记下来。`;

export const character = {
    bts_ch_tingyun_wangguiren: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_zhaoshi', 'bts_sk_yaofeng', 'bts_sk_liubu'],
    },
};

export const skill = {
    // ── 必杀技·照世（源 st_zhaoshi = SkillCard + ZeroCardViewAsSkill，L7267-7299）──
    // 出牌阶段，失5怒气并选择至少一名其他角色：各失去1点怒气、弃置一张手牌并附加火属性；
    // 若你为星启，未被选择的其他角色各获得一个额外出牌阶段。
    bts_sk_zhaoshi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7297）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7270）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zhaoshi');
            lib.bts.api.loseAngry(player, 5); // 源 L7273：LoseAngry(player, 5)
            const selected = event.targets;
            // 源 L7275-7282：目标各失去1点怒气、弃1手牌、附加火属性
            for (const target of selected) {
                lib.bts.api.loseAngry(target, 1); // 源 L7276：LoseAngry(p, 1, player, false)
                if (target.countCards('h'))
                    await target.chooseToDiscard('照世：弃置一张手牌', 'h', 1, true); // 源 L7278
                await lib.bts.api.addNature(target, 'flame'); // 源 L7280：AddNature(p, "fire")
            }
            // 源 L7283-7287（God 分支 L7633-7637）：星启时未被选择者各获得额外出牌阶段。源以标记在
            // 回合末统一消费，本库无该消费方，直接 extraPhase（同姬子·启行 L59 范式）。
            if (lib.bts.api.god(player))
                for (const target of lib.bts.api.seatOrder(
                    game.filterPlayer(
                        (target) => target !== player && !selected.includes(target),
                    ),
                ))
                    lib.bts.api.extraPhase(target, 'phaseUse');
        },
        ai: {
            // AI 口径：怒气≥5 且场上有敌方；每名目标弃1手牌+失1怒，星启时未被选者各得额外出牌阶段
            //（源 AI max_zhaoshi：GetAngry(5) 且 #enemies>0，StarRail-ai L3645-3661）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_zhaoshi'))
                    return -1;
                const enemies = game.countPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0,
                );
                if (!enemies) return -1; // 无敌不白清5怒
                let val = 6; // 单敌：弃1手牌(≈1.2)+失1怒(≈0.5)
                if (enemies >= 2) val += 1;
                if (lib.bts.api.god(player)) val += 1; // 星启：未选友方各得额外出牌阶段
                return Math.min(8, val);
            },
            result: {
                // 目标受损：弃1手牌+失1怒；空手目标少弃一档
                target: (player, target) =>
                    target.countCards('h') ? -2 : -1,
            },
        },
    },

    // ── 触发技·摇风（源 st_yaofeng = TriggerSkill EventPhaseStart Start，L7301-7328）──
    // 其他角色准备阶段开始时，若没有角色拥有狐祈祝福，可弃置一张【杀】，令其附加3层狐祈祝福。
    bts_sk_yaofeng: {
        trigger: { global: 'phaseZhunbeiBegin' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L7305-7312：其他角色准备阶段开始且全场无狐祈祝福（定夺 E-07：按描述排除自指，
            // 与禩命统一口径——源代码放开自得，但描述写「其他角色」）。
            return (
                event.player &&
                event.player !== player &&
                !game.hasPlayer((target) => lib.bts.api.getBless(target, 'huqi')) &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7316：askForCard(p, "Slash")——只选弃【杀】，弃置在 content。发动 AI 在本内联选择
            //（cost 型触发技引擎不询顶层 check）：受益者须为属性/元素系（naturePlayer，狐祈只放大
            // 属性伤害）且友方（源 AI st_yaofeng→ThrowSlash_AI typ2 只助友方，StarRail-ai L3663-3665）
            // 才相助；否则最佳估值 ≤0 → 引擎整体取消。
            const target = trigger.player;
            const helpful =
                lib.bts.api.naturePlayer(target) &&
                get.attitude(player, target) > 0;
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    `摇风：是否弃置一张【杀】令${get.translation(target)}获得3层狐祈？`,
                    (card) =>
                        helpful && typeof card === 'object' && card
                            ? 6 - get.value(card)
                            : -1,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7319：AddBless(player=准备阶段角色, "@bless_huqi", 3, p)
            await lib.bts.api.addBless(trigger.player, 'huqi', 3, player);
        },
        // 供跨技能估值（发动决策在 cost 内联选择）：代价1【杀】；3层狐祈给属性系友方≈2分
        ai: { result: { player: 1, target: 2 } },
    },

    // ── 锁定技·流布（源 st_liubu = TriggerSkill Compulsory CardsMoveOneTime，L7330-7347）──
    // 其他角色因弃置而失去所有手牌后，你可以令其摸一张牌并展示之；
    // 其于本回合内受到伤害时，若其手牌区内存在此牌，你获得之，其失去1点体力。
    bts_sk_liubu: {
        trigger: { global: 'loseAfter' },
        filter(event, player) {
            // 源 L7336：其他角色因弃置失去最后一张手牌；补 hs 校验（定夺 E-04）——避免空手
            // 角色仅弃装备时误触发。
            return (
                event.type === 'discard' &&
                event.hs?.length > 0 &&
                event.player &&
                event.player !== player &&
                event.player.countCards('h') === 0
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            const target = trigger.player;
            // 源 L7336：askForSkillInvoke —— 是否发动
            event.result = await player
                .chooseBool(
                    `流布：是否令${get.translation(target)}摸一张牌并记录该牌？`,
                )
                // AI 口径：只对存活友方发动（其摸1张；若本回合受伤则你收回记录牌、其失1体）
                //（源 AI st_liubu：仅友方发动，StarRail-ai L4149-4154）
                .set('ai', () =>
                    target.isAlive() && get.attitude(player, target) > 0,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            const target = trigger.player;
            // 源 L7689-7692：getNCards(1) + obtainCard + showCard —— 目标摸一张牌并展示之
            await target.draw(player);
            const card = target.getCards('h').at(-1);
            if (!card) return;
            target.showCards(card); // 源 L7692：room:showCard —— 明牌
            // 记录该牌与发起者（源 L7693：st_liubu<id><cardid>-Clear 标记，无名杀以 storage 记录）
            target.storage.bts_liubu_card = card.cardid;
            target.storage.bts_liubu_owner = player.playerid;
            target.addMark('bts_mk_liubu-clear', 1);
        },
        group: ['bts_sk_liubu_take', 'bts_sk_liubu_clear'],
        subSkill: {
            take: {
                // 定夺 E-04：按描述「其于本回合内受到伤害时」——不限定来源（源经 damage.from 匹配、
                // 实际仅你）；夺牌后失 1 体力按描述补（源代码未实现）。
                audio: 'bts_sk_liubu',
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        event.num > 0 &&
                        event.player?.storage?.bts_liubu_owner === player.playerid &&
                        event.player.storage.bts_liubu_card &&
                        // 取牌数组须用 getCards（countCards 返回数字，误用 .some 会崩）。
                        event.player
                            .getCards('h')
                            .some(
                                (card) =>
                                    card.cardid ===
                                    event.player.storage.bts_liubu_card,
                            )
                    );
                },
                async content(event, trigger, player) {
                    const target = trigger.player,
                        card = target
                            .getCards('h')
                            .find(
                                (card) =>
                                    card.cardid === target.storage.bts_liubu_card,
                            );
                    // 源 L1278-1280：obtainCard —— 你获得该牌；然后目标失去1点体力（按描述补）
                    if (card) await player.gain(card, target, 'giveAuto');
                    await target.loseHp();
                    delete target.storage.bts_liubu_card;
                    delete target.storage.bts_liubu_owner;
                    target.removeMark(
                        'bts_mk_liubu-clear',
                        target.countMark('bts_mk_liubu-clear'),
                    );
                },
            },
            clear: {
                // 源 -Clear 标记于回合末自动清除：记录未在当回合内被夺走则移除。
                // 记录可于他人回合产生（他人回合内弃牌至空），故按标记持有者逐个清，非仅回合结束者。
                trigger: { global: 'phaseAfter' },
                forced: true,
                silent: true,
                filter(event, player) {
                    return game.hasPlayer(
                        (p) => p.countMark('bts_mk_liubu-clear') > 0,
                    );
                },
                async content(event, trigger, player) {
                    for (const target of lib.bts.api.seatOrder(
                        game.players.filter(
                            (p) => p.countMark('bts_mk_liubu-clear') > 0,
                        ),
                    )) {
                        delete target.storage.bts_liubu_card;
                        delete target.storage.bts_liubu_owner;
                        target.removeMark(
                            'bts_mk_liubu-clear',
                            target.countMark('bts_mk_liubu-clear'),
                        );
                    }
                },
            },
        },
    },
};

export const marks = {
    'bts_mk_liubu-clear': { markKind: 'record' },
};

export const translate = {
    'bts_mk_liubu-clear': '流布标记',
    bts_ch_tingyun_wangguiren: '忘归人',
    bts_sk_zhaoshi: '照世',
    bts_sk_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，各失去1点${get.poptip('bts_glossary_nuqi_faq')}、弃置一张手牌并附加${get.poptip('bts_glossary_nature_flame_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，未被选择的其他角色各获得一个额外出牌阶段。`,
    bts_sk_yaofeng: '摇风',
    bts_sk_yaofeng_info: `其他角色准备阶段开始时，若没有角色拥有${get.poptip('bts_glossary_bless_huqi_faq')}，你可以弃置一张【杀】，令其附加3层${get.poptip('bts_glossary_bless_huqi_faq')}。`,
    bts_sk_liubu: '流布',
    bts_sk_liubu_info:
        '当一名角色因弃置而失去所有手牌后，你可以令其摸一张牌并展示之。当其于此回合内受到伤害时，若其手牌区内存在此牌，你获得之，其失去1点体力。',
    bts_bless_huqi: '狐祈祝福',
    bts_bless_huqi_info: `来源：${get.poptip('bts_sk_yaofeng')}赋予；属性伤后目标弃一张；回合结束自然减少1层`,

    '$bts_sk_zhaoshi1': "前尘旧梦，俱已往矣",
    '$bts_sk_zhaoshi2': "生命纵如微尘，亦能翩然起舞",
    '$bts_sk_yaofeng1': "有福不妨同享",
    '$bts_sk_yaofeng2': "同心一意可好？",
    '$bts_sk_liubu1': "流云易散",
    '$bts_sk_liubu2': "长梦已醒",

    '~bts_ch_tingyun_wangguiren': "命定如此么……",
};

export const simpleTranslate = {
    bts_sk_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}，让至少1名其他人掉${get.poptip('bts_glossary_nuqi_faq')}、弃手牌、着火；${get.poptip('bts_glossary_xingqi_faq')}再给剩下的人多一轮出牌`,
    bts_sk_yaofeng_info: `别人准备阶段若没${get.poptip('bts_glossary_bless_huqi_faq')}，你可弃杀给他+3`,
    bts_sk_liubu_info:
        '别人弃到空手可让他摸1张并展示；他这回合内受伤时，若此牌还在手牌区，你拿走并使其失去1体',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_huqi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_huqi_faq',
        // 描述「造成属性伤害前」弃牌 → 挂 damageBefore（最早钩子；不设 firstDo，
        // 须在赐福/暗之等属性转换（firstDo）之后再读 getNature，见《技能开发规范》A13）。
        trigger: { source: 'damageBefore' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                // 按描述「对其他角色」门控（源描述 L13581）——存在自伤带来源路径（xiadie.js:179），
                // 不门控会弃自己手牌。
                event.player !== player &&
                event.num > 0 &&
                // 源 L1162-1165：狐祈无 _common 排除，_common 属性伤害照样触发弃牌（定夺回退源版）。
                lib.bts.api.getNature(event) &&
                event.player.countCards('h') > 0
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了狐祈祝福');
            // 源 L1157-1158：由狐祈持有者（伤害来源）选受伤角色一张手牌弃置（V2.2 改为来源选择）。
            await player.discardPlayerCard(trigger.player, 'h', true);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_huqi_faq',
        name: '狐祈祝福',
        info: `当你对其他角色造成属性伤害前，你弃置其一张手牌（由你选择）。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
