// 星期日（源 animal.lua L5353-5444）—— 赞颂和恩赐。
// 技能：赞颂（必杀技·致命/暴击祝福）、恩赐（弃杀跳摸牌+出牌阶段令目标额外回合）、倾诉（判定阶段看牌堆顶7张并重排）。
import { lib, game, ui, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '虚数·同谐·匹诺康尼的秩序代行者'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('星期日')}向队友提供${get.poptip('bts_glossary_bless_fatal_faq')}与额外回合。`;

export const character = {
    bts_xingqiri: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_zansong', 'bts_st_enci', 'bts_st_qingsu'],
    },
};

export const skill = {
    // ── 必杀技·赞颂（源 st_zansong = SkillCard + ZeroCardViewAsSkill，L5354-5382）──
    // 出牌阶段，失5怒气，令一名其他角色附加3层致命祝福；若你为星启，其额外附加3层暴击祝福。
    bts_st_zansong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5380）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5358）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        logTarget: 'player',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_zansong');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L5361：LoseAngry(player, 5)
            // 源 L5362：AddBless(targets[1], "@bless_fatal", 3, player)
            await lib.bts.api.addBless(target, 'fatal', 3, player);
            // 源 L5363-5369：星启时额外+3暴击祝福，并将「暴击数>致命数」的差值一半
            // 折转为等量致命祝福（平衡转换，源描述 L13237 同步承诺）。
            if (lib.bts.api.god(player)) {
                await lib.bts.api.addBless(target, 'critical', 3, player);
                const x = Math.floor(
                    (lib.bts.api.getBless(target, 'critical', -1) -
                        lib.bts.api.getBless(target, 'fatal', -1)) /
                        2,
                );
                if (x > 0) {
                    await lib.bts.api.removeBless(target, 'critical', x, player);
                    await lib.bts.api.addBless(target, 'fatal', x, player);
                }
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zansong')
                    ? -1
                    : 6;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·恩赐（源 st_enci = TriggerSkill EventPhaseChanging + ViewAsSkill，L5384-5423）──
    // 摸牌阶段开始时，可跳过摸牌与出牌阶段并选择一名其他角色（若其没有致命祝福，你弃置一张
    // 【杀】），此回合结束时其附加1层暴击祝福，其执行一个额外的回合，若其拥有其武将牌上没有的
    // 技能，其再执行一个额外的出牌阶段。
    bts_st_enci: {
        // 源：EventPhaseChanging（即将进入摸牌阶段前，to==Draw）询问，发动后
        // skip(Draw)+skip(Play)；无名杀对应 phaseChange（阶段切换前触发，content.js
        // phase 主循环），此时标记 skip 才会在阶段事件启动时被 checkSkipped 消费。
        // 摸牌阶段被跳过（phaseList 为 skipPhaseDraw 或 skipList 已含 phaseDraw）时不可发动。
        trigger: { player: 'phaseChange' },
        filter(event, player) {
            // 源 L5418：即将进入摸牌阶段且摸牌/出牌均未被跳过
            return (
                event.phaseList?.[event.num]?.startsWith('phaseDraw') &&
                !player.skipList.includes('phaseDraw') &&
                !player.skipList.includes('phaseUse') &&
                game.hasPlayer((target) => target !== player)
            );
        },
        async cost(event, trigger, player) {
            // 源 L5418：askForUseCard("@@st_enci")；源 Card filter（L5399）：
            // 目标已有致命祝福可免弃【杀】→ 先选目标，目标无致命祝福才补弃【杀】。
            const targetResult = await player
                .chooseTarget(
                    '恩赐：选择一名其他角色（跳过摸牌和出牌阶段，令其额外回合）',
                    [1, 1],
                    (card, source, target) => target !== source,
                )
                .forResult();
            if (!targetResult.bool) {
                event.result = { bool: false };
                return;
            }
            const target = targetResult.targets[0];
            let cards = [];
            if (!lib.bts.api.getBless(target, 'fatal')) {
                const cardResult = await player
                    .chooseCard(
                        'h',
                        (card) =>
                            get.name(card) === 'sha' &&
                            lib.filter.cardDiscardable(card, player),
                        '目标没有致命祝福，须弃置一张【杀】',
                    )
                    .forResult();
                if (!cardResult.bool) {
                    event.result = { bool: false };
                    return;
                }
                cards = cardResult.cards;
            }
            event.result = { bool: true, targets: [target], cards };
        },
        async content(event, trigger, player) {
            // cost 所选【杀】在技能事件 event.cards，结算弃置（目标无致命祝福时才有）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L5419-5420：skip(Draw) + skip(Play)
            player.skip('phaseDraw');
            player.skip('phaseUse');
            const target = event.targets[0];
            // 源 L1632-1640：目标拥有武将牌上没有的技能 → 再执行一个额外出牌阶段。
            // 先判 off-card，避免随后挂上的临时技 bts_st_enci_bless 被自误判为武将牌外技能；
            // get.character(id).skills 兼容数组/对象两种 lib.character 形态。
            const chars = [target.name1];
            if (target.name2 && target.name2 !== target.name1)
                chars.push(target.name2);
            const base = new Set();
            for (const c of chars)
                for (const s of get.character(c)?.skills || []) base.add(s);
            const offCard = target
                .getSkills(null, false, false)
                .filter((s) => !lib.skill[s]?.hiddenSkill)
                .some((s) => !base.has(s));
            // 源 L1621（gamerule 消费 extra_turn 标记）：此回合结束时令目标+1暴击祝福。
            // 无名杀额外回合在星期日回合结束后立即开始，故挂临时技于目标额外回合的
            // 准备阶段开始时授予（源 NotActive 在目标额外出牌前授予，对额外回合内表现等价）。
            target.storage.bts_st_enci_bless_source = player.playerid;
            await target.addSkill('bts_st_enci_bless');
            // 源 L5390：addPlayerMark(target, "extra_turn") —— 目标额外回合
            lib.bts.api.extraTurn(target, 'bts_extra_turn');
            // 源 L1638-1640：额外回合之后再执行一个额外出牌阶段（若拥有武将牌外技能）
            if (offCard) lib.bts.api.extraPhase(target, 'phaseUse', null, 'bts_st_enci');
        },
        ai: { result: { player: 1 } },
    },

    // ── 临时技·恩赐祝福（挂在目标身上，源 gamerule L1621：消费 extra_turn 标记时
    //   令目标+1暴击祝福；无名杀以目标额外回合准备阶段开始时授予、随后自卸）──
    bts_st_enci_bless: {
        charlotte: true,
        hiddenSkill: true,
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        filter(event, player) {
            // 仅目标被授予的额外回合生效（extraTurn → insertPhase，phase 事件带 .skill 即额外回合；
            // 恩赐挂目标身上，其准备阶段开始时 player 即该额外回合归属者）
            return lib.bts.api.inExtraTurn(player);
        },
        async content(event, trigger, player) {
            const source = game.findPlayer(
                (p) => p.playerid === player.storage.bts_st_enci_bless_source,
            );
            delete player.storage.bts_st_enci_bless_source;
            if (source) await lib.bts.api.addBless(player, 'critical', 1, source);
            await player.removeSkill('bts_st_enci_bless');
        },
    },

    // ── 锁定技·倾诉（源 st_qingsu = TriggerSkill Compulsory EventPhaseStart Judge，L5425-5443）──
    // 判定阶段开始时，你观看牌堆顶七张牌（仅你能看，保持原序放回牌堆顶）。
    // 注：源描述 L13246 写「准备阶段开始时」，源代码（L5428）实为判定阶段——按代码，无名杀用判定阶段。
    bts_st_qingsu: {
        trigger: { player: 'phaseJudgeBegin' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L5430-5440：getNCards(7) + fillAG 展示给拥有者 + returnToTopDrawPile 保序放回
            const cards = get.cards(7);
            // 展示：addKnower 仅让拥有者知道牌面（观星式窥牌，源 fillAG 只展示给 owner）
            for (const card of cards) card.addKnower(player);
            // 保序放回：get.cards(7) 顶→底，从底往顶逐个插顶 = 保持原序
            // （原实现正序插顶成倒序，会实际改变后续摸牌，已修）
            for (let i = cards.length - 1; i >= 0; i--)
                ui.cardPile.insertBefore(cards[i], ui.cardPile.firstChild);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_xingqiri: '星期日',
    bts_st_zansong: '赞颂',
    bts_st_zansong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令一名其他角色附加3层${get.poptip('bts_glossary_bless_fatal_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，其额外附加3层${get.poptip('bts_glossary_bless_critical_faq')}，若其${get.poptip('bts_glossary_bless_critical_faq')}数大于${get.poptip('bts_glossary_bless_fatal_faq')}数，移除差值一半的${get.poptip('bts_glossary_bless_critical_faq')}并附加等量的${get.poptip('bts_glossary_bless_fatal_faq')}。`,
    bts_st_enci: '恩赐',
    bts_st_enci_info: `摸牌阶段开始时，你可以跳过摸牌阶段和出牌阶段并选择一名其他角色（若其没有${get.poptip('bts_glossary_bless_fatal_faq')}，你弃置一张【杀】），此回合结束时，令其附加1层${get.poptip('bts_glossary_bless_critical_faq')}，其执行一个额外的回合，若其拥有其武将牌上没有的技能，其再执行一个额外的出牌阶段。`,
    bts_st_qingsu: '倾诉',
    bts_st_qingsu_info:
        '锁定技，判定阶段开始时，你观看牌堆顶七张牌并保持原序置于牌堆顶。',

    '$bts_st_zansong1': "以此身躯……",
    '$bts_st_zansong2': "与你同道，护你左右，领你远行",
    '$bts_st_enci1': "苦惘，敬请离身",
    '$bts_st_enci2': "宁静，宛然在目",
    '$bts_st_qingsu1': "安息之日",
    '$bts_st_qingsu2': "改悔吧",
    '~bts_xingqiri': "失约了……",
};

export const simpleTranslate = {
    bts_st_zansong_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+3${get.poptip('bts_glossary_bless_fatal_faq')}（${get.poptip('bts_glossary_xingqi_faq')}额外+3${get.poptip('bts_glossary_bless_critical_faq')}，暴击>致命时差值一半折转致命）`,
    bts_st_enci_info: `摸牌阶段可跳摸牌/出牌选1名其他角色（其无${get.poptip('bts_glossary_bless_fatal_faq')}才弃1【杀】），回合末其+1${get.poptip('bts_glossary_bless_critical_faq')}并额外回合，有武将牌外技能再+1出牌阶段`,
    bts_st_qingsu_info: '锁；判定阶段看牌堆顶7张并保序放回',
};

export const pinyins = { bts_xingqiri: 'xingqiri' };
