// 忘归人（源 animal.lua L7266-7348）—— 照世、摇风与流布。
// 技能：照世（必杀技·失怒弃牌附炎）、摇风（他人准备阶段无狐祈时弃杀+狐祈）、流布（他人弃置空城后记牌，受伤时夺牌失体）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '火·虚无·狐人少女'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('忘归人')}用照世给对手挂火、拆手牌、削怒气；${get.poptip('bts_glossary_bless_huqi_faq')}护着队友，别人一旦空手卖牌，流布还能把那张牌记下来。`;

export const character = {
    bts_tingyun_wangguiren: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_zhaoshi', 'bts_st_yaofeng', 'bts_st_liubu'],
    },
};

export const skill = {
    // ── 必杀技·照世（源 st_zhaoshi = SkillCard + ZeroCardViewAsSkill，L7267-7299）──
    // 出牌阶段，失5怒气并选择至少一名其他角色：各失去1点怒气、弃置一张手牌并附加火属性；
    // 若你为星启，未被选择的其他角色各获得一个额外出牌阶段。
    bts_st_zhaoshi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
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
            lib.bts.aiGuard.record(player, 'bts_st_zhaoshi');
            lib.bts.api.loseAngry(player, 5); // 源 L7273：LoseAngry(player, 5)
            const selected = event.targets;
            // 源 L7275-7282：目标各失去1点怒气、弃1手牌、附加火属性
            for (const target of selected) {
                lib.bts.api.loseAngry(target, 1); // 源 L7276：LoseAngry(p, 1, player, false)
                if (target.countCards('h'))
                    await target.chooseToDiscard('照世：弃置一张手牌', 'h', 1, true); // 源 L7278
                await lib.bts.api.addNature(target, 'flame'); // 源 L7280：AddNature(p, "fire")
            }
            // 源 L7283-7287：星启时未被选择的其他角色各获得额外出牌阶段
            if (lib.bts.api.god(player))
                for (const target of game.filterPlayer(
                    (target) => target !== player && !selected.includes(target),
                ))
                    target.addMark('bts_st_extra_play', 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zhaoshi') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·摇风（源 st_yaofeng = TriggerSkill EventPhaseStart Start，L7301-7328）──
    // 其他角色准备阶段开始时，若没有角色拥有狐祈祝福，可弃置一张【杀】，令其附加3层狐祈祝福。
    bts_st_yaofeng: {
        trigger: { global: 'phaseZhunbeiBegin' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L7305-7312：其他角色准备阶段开始且全场无狐祈祝福
            return (
                event.player &&
                event.player !== player &&
                !game.hasPlayer((target) => lib.bts.api.getBless(target, 'huqi')) &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7316：askForCard(p, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    `摇风：是否弃置一张【杀】令${get.translation(trigger.player)}获得3层狐祈？`,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7319：AddBless(player=准备阶段角色, "@bless_huqi", 3, p)
            await lib.bts.api.addBless(trigger.player, 'huqi', 3, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·流布（源 st_liubu = TriggerSkill Compulsory CardsMoveOneTime，L7330-7347）──
    // 其他角色因弃置而失去所有手牌后，你可以令其摸一张牌并记录之；
    // 其于本回合内下次受到伤害时，你获得该牌，其失去1点体力。
    bts_st_liubu: {
        trigger: { global: 'loseAfter' },
        filter(event, player) {
            // 源 L7336：其他角色因弃置从手牌失去最后一张手牌
            return (
                event.type === 'discard' &&
                event.player &&
                event.player !== player &&
                event.player.countCards('h') === 0
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player;
            // 源 L7336：askForSkillInvoke —— 是否发动
            const result = await player
                .chooseBool(
                    `流布：是否令${get.translation(target)}摸一张牌并记录该牌？`,
                )
                .forResult();
            if (!result.bool) return;
            // 源 L7339-7340：getNCards(1) + obtainCard —— 目标摸一张牌
            await target.draw(player);
            const card = target.getCards('h').at(-1);
            if (!card) return;
            // 记录该牌与发起者（源 L7343：-Clear 标记，无名杀以 storage 记录）
            target.storage.bts_liubu_card = card.cardid;
            target.storage.bts_liubu_owner = player.playerid;
            target.addMark('bts_liubu-clear', 1);
        },
        group: ['bts_st_liubu_take'],
        subSkill: {
            take: {
                // 本回合内目标下次受伤时夺牌并令其失去1点体力
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player?.storage?.bts_liubu_owner === player.playerid &&
                        event.player.storage.bts_liubu_card &&
                        event.player
                            .countCards('h')
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
                    // 你获得该牌，目标失去1点体力（源实现无此分支，见迁移记录「适配」）
                    if (card) await player.gain(card, target, 'giveAuto');
                    await target.loseHp();
                    delete target.storage.bts_liubu_card;
                    delete target.storage.bts_liubu_owner;
                    target.removeMark(
                        'bts_liubu-clear',
                        target.countMark('bts_liubu-clear'),
                    );
                },
                ai: { noe: true },
            },
        },
    },
};

export const translate = {
    bts_tingyun_wangguiren: '忘归人',
    bts_st_zhaoshi: '照世',
    bts_st_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，各失去1点${get.poptip('bts_glossary_nuqi_faq')}、弃置一张手牌并附加${get.poptip('bts_glossary_nature_yan_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，未被选择的其他角色各获得一个额外出牌阶段。`,
    bts_st_yaofeng: '摇风',
    bts_st_yaofeng_info: `其他角色准备阶段开始时，若没有角色拥有${get.poptip('bts_glossary_bless_huqi_faq')}，你可以弃置一张【杀】，令其附加3层${get.poptip('bts_glossary_bless_huqi_faq')}。`,
    bts_st_liubu: '流布',
    bts_st_liubu_info:
        '其他角色因弃置而失去所有手牌后，你可以令其摸一张牌并记录之；其于本回合内下次受到伤害时，你获得该牌，其失去1点体力。',
};

export const simpleTranslate = {
    bts_st_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}，让至少1名其他人掉怒气、弃手牌、着火；${get.poptip('bts_glossary_xingqi_faq')}再给剩下的人多一轮出牌`,
    bts_st_yaofeng_info: `别人准备阶段若没${get.poptip('bts_glossary_bless_huqi_faq')}，你可弃杀给他+3`,
    bts_st_liubu_info:
        '别人弃到空手可让他摸1并把牌记下；他这回合再受伤，就拿走这张牌让他掉1体力',
};

export const pinyins = { bts_tingyun_wangguiren: 'tingyunwangguiren' };
