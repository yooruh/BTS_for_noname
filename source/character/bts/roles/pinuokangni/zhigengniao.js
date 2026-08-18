// 知更鸟（源 animal.lua L4983-5052）—— 额外回合支援。
// 技能：迭奏（必杀技·翻面+额外回合）、咏叹（成为他人牌目标后可弃杀摸2）、合颂（翻面时额外回合来源伤害致命化+回怒）。
import { lib, game, ui, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '物理·同谐·谐乐之音'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('知更鸟')}翻面结束行动，以额外回合支援队友。`;

export const character = {
    bts_zhigengniao: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_diezou', 'bts_st_yongtan', 'bts_st_hesong'],
    },
};

export const skill = {
    // ── 必杀技·迭奏（源 st_diezou = SkillCard + ZeroCardViewAsSkill，L4984-5008）──
    // 出牌阶段，失5怒气并翻面、结束出牌阶段，令任意名其他角色各执行一个额外回合。
    bts_st_diezou: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5006）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L4987）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        // 清理子技能：知更鸟下回合开始时移除被赠回合角色的迭奏增益（源 L1502-1507）。
        group: ['bts_st_diezou_clear'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_diezou');
            lib.bts.api.loseAngry(player, 5); // 源 L4990：LoseAngry(player, 5)
            player.turnOver(); // 源 L4991：player:turnOver()
            player.skip('phaseUse'); // 源 L4992：Global_PlayPhaseTerminated
            // 源 L4993-4996：目标各执行额外回合
            for (const target of event.targets) {
                lib.bts.api.extraTurn(target, 'bts_extra_turn');
                // 源 L4994：setPlayerMark(player, "max_diezou"..目标.."-start", 1) ——
                // 目标于你下回合开始前手牌上限+1（gamerule_hand L1778）；
                // 你为星启时目标额定摸牌数+1（gamerule_draw L1461）。无名杀以挂临时 buff
                // bts_st_diezou_buff 近似（已修正：原实现漏整块效果，仅额外回合）。
                target.storage.bts_diezou_owner = player.playerid;
                await target.addSkill('bts_st_diezou_buff');
            }
        },
        subSkill: {
            clear: {
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return game.hasPlayer(
                        (p) =>
                            p.hasSkill('bts_st_diezou_buff') &&
                            p.storage.bts_diezou_owner === player.playerid,
                    );
                },
                content(event, trigger, player) {
                    // 源 L1502-1507：标记于知更鸟下回合 RoundStart 清除（"你下回合开始前"）。
                    // 无名杀以 phaseZhunbeiBegin 近似 RoundStart。
                    for (const p of game.filterPlayer(
                        (p) =>
                            p.hasSkill('bts_st_diezou_buff') &&
                            p.storage.bts_diezou_owner === player.playerid,
                    )) {
                        delete p.storage.bts_diezou_owner;
                        p.removeSkill('bts_st_diezou_buff');
                    }
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_diezou') ? -1 : 7;
            },
            result: { target: 1 },
        },
    },

    // ── 临时技·迭奏增益（挂在被赠回合角色身上，源 max_diezou<目标>-start 标记 L4994；
    //   gamerule_hand L1778：手牌上限+1；gamerule_draw L1461：发起者星启时额定摸牌数+1；
    //   由 bts_st_diezou_clear 于知更鸟下回合开始移除）──
    bts_st_diezou_buff: {
        charlotte: true,
        mark: true,
        marktext: '奏',
        intro: {
            name: '迭奏',
            content: '手牌上限+1；若发起者（知更鸟）为星启，摸牌阶段额定摸牌数+1。',
        },
        mod: {
            maxHandcard(player, num) {
                return num + 1; // 源 gamerule_hand L1778：手牌上限+1
            },
        },
        trigger: { player: 'phaseDrawBegin2' },
        forced: true,
        filter(event, player) {
            // 源 gamerule_draw L1461：仅发起者（知更鸟）为星启时目标额定摸牌数+1
            const owner = game.findPlayer(
                (p) => p.playerid === player.storage.bts_diezou_owner,
            );
            return Boolean(owner && lib.bts.api.god(owner));
        },
        content(event, trigger, player) {
            event.num += 1;
        },
        ai: { noe: true },
    },

    // ── 触发技·咏叹（源 st_yongtan = TriggerSkill TargetConfirmed，L5010-5030）──
    // 当你成为其他角色使用牌的目标后，可以弃置一张【杀】并摸两张牌。
    bts_st_yongtan: {
        trigger: { target: 'useCardToTargeted' },
        filter(event, player) {
            // 源 L5015：其他角色使用非技能牌指定你为目标
            return (
                event.player !== player &&
                !event.card?.isCard &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L5015：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '咏叹：选择弃置一张【杀】并摸两张牌',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L5015：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L5017-5026：摸两张牌，且可遗计式分配给任意角色（askForYiji，-1 = 任意数量、
            // 目标 = 全部存活角色，含自己）。
            // 已修正：原注释"有意简化"为直接摸2张（丢弃交牌能力）；按用户定夺恢复交牌，
            // 参照无名杀本体遗计（character/standard/skill.js yiji）的
            // chooseCardButton（选要分配的牌）+ chooseTarget（选获得角色）分发范式。
            const cards = get.cards(2);
            await game.cardsGotoOrdering(cards);
            if (!cards.length) return;
            event.given_map = {};
            do {
                const { bool, links } =
                    cards.length === 1
                        ? { links: cards.slice(0), bool: true }
                        : await player
                              .chooseCardButton(
                                  '咏叹：请选择要分配的牌',
                                  true,
                                  cards,
                                  [1, cards.length],
                              )
                              .set('ai', () => {
                                  if (ui.selected.buttons.length === 0) return 1;
                                  return 0;
                              })
                              .forResult();
                if (!bool) return;
                cards.removeArray(links);
                const { targets } = await player
                    .chooseTarget('选择一名角色获得' + get.translation(links), true)
                    .set('ai', (target) => {
                        const att = get.attitude(player, target);
                        if (get.value(links[0], player, 'raw') < 0) return -att;
                        if (att > 0) return att / (1 + target.countCards('h'));
                        return att / 100;
                    })
                    .forResult();
                if (targets.length) {
                    const id = targets[0].playerid;
                    if (!event.given_map[id]) event.given_map[id] = [];
                    event.given_map[id].addArray(links);
                }
            } while (cards.length > 0);
            const list = [];
            for (const id in event.given_map) {
                list.push([game.playerMap[id], event.given_map[id]]);
            }
            await game
                .loseAsync({
                    gain_list: list,
                    giver: player,
                    animate: 'draw',
                })
                .setContent('gaincardMultiple');
        },
        ai: { noe: true },
    },

    // ── 锁定技·合颂（源 st_hesong = TriggerSkill Compulsory DamageCaused，L5032-5051）──
    // 翻面时，拥有额外回合来源的角色造成的伤害改为致命伤害，你回复1点怒气。
    bts_st_hesong: {
        trigger: { global: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            // 源 L5039：伤害来源正处额外回合（内核 @extra_turn 标记在额外回合全程为 1，
            // gamerule.cpp TurnStart 置 1、回合结束清 0）、来源 ≠ 目标、且你（知更鸟）翻面。
            // 已修正：原实现读 grantExtraTurn 的 bts_extra_turn_granted（授予即 +1、额外回合
            // 准备阶段即清 0），生效窗口与源相反——额外回合进行中反而为 0，翻面+队友额外回合
            // 打伤害的招牌连招根本触发不了；改走 utils.js inExtraTurn()（伤害来源是否正处其
            // 自身的额外回合内）。
            return (
                event.source &&
                lib.bts.api.inExtraTurn(event.source) &&
                player.isTurnedOver() &&
                event.source !== event.player
            );
        },
        content(event, trigger, player) {
            // 源 L5041-5042：AddNew(damage, "_fatal") + AddAngry(p)（改触发事件 damageBegin1）
            lib.bts.api.markDamage(trigger, '_fatal');
            lib.bts.api.addAngry(player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_zhigengniao: '知更鸟',
    bts_st_diezou: '迭奏',
    bts_st_diezou_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并翻面、结束出牌阶段，令至少一名其他角色各执行一个额外回合，这些角色于你下回合开始前手牌上限+1（若你为${get.poptip('bts_glossary_xingqi_faq')}，其额定摸牌数+1）。`,
    bts_st_yongtan: '咏叹',
    bts_st_yongtan_info:
        '当你成为其他角色使用牌的目标后，你可以弃置一张【杀】，摸两张牌，并将这些牌交给任意角色。',
    bts_st_hesong: '合颂',
    bts_st_hesong_info: `锁定技，翻面时，额外回合角色造成的伤害改为${get.poptip('bts_glossary_bless_fatal_faq')}伤害，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    '$bts_st_diezou1': "今夜，灵魂彼此相拥",
    '$bts_st_diezou2': "今夜，群星因我回响",
    '$bts_st_yongtan1': "谐乐，即将齐奏",
    '$bts_st_yongtan2': "万籁，再次共鸣",
    '$bts_st_hesong1': "演出开始~",
    '$bts_st_hesong2': "请安静下来",
    '~bts_zhigengniao': "演出…还没…",
};

export const simpleTranslate = {
    bts_st_diezou_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}翻面并结束出牌阶段，令至少1名其他角色额外回合，其手牌上限+1（${get.poptip('bts_glossary_xingqi_faq')}额外摸牌+1）`,
    bts_st_yongtan_info: '成为他人牌目标后可弃杀摸2并可分配',
    bts_st_hesong_info: `锁；翻面时额外回合来源伤害为${get.poptip('bts_glossary_bless_fatal_faq')}，自己回1${get.poptip('bts_glossary_nuqi_faq')}`,
};

export const pinyins = { bts_zhigengniao: 'zhigengniao' };
