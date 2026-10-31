// 知更鸟（源 animal.lua L4983-5052）—— 额外回合支援。
// 技能：迭奏（必杀技·翻面+额外回合）、咏叹（成为他人牌目标后可弃杀摸2）、合颂（翻面时额外回合来源伤害致命化+回怒）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '物理·同谐·谐乐之音'; // 属性·命途
export const intro =
    `${B('知更鸟')}翻面结束行动，以额外回合支援队友。`;

export const character = {
    bts_ch_zhigengniao: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_diezou', 'bts_sk_yongtan', 'bts_sk_hesong'],
    },
};

export const skill = {
    // ── 必杀技·迭奏（源 st_diezou = SkillCard + ZeroCardViewAsSkill，L4984-5008）──
    // 出牌阶段，失5怒气并翻面、结束出牌阶段，令任意名其他角色各执行一个额外回合。
    bts_sk_diezou: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5006）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L4987）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        // 多目标一次性结算：content 只执行一次、event.targets 为完整目标数组。
        // 不声明 multitarget 则按目标重跑 content（怒气重复扣、重复翻面；白厄燔世同型事故，参照 baie.js 范式）。
        multitarget: true,
        // 清理子技能：知更鸟下回合开始时移除被赠回合角色的迭奏增益（源 L1502-1507）。
        group: ['bts_sk_diezou_clear', 'bts_sk_diezou_bgm'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_diezou');
            lib.bts.api.loseAngry(player, 5); // 源 L4990：LoseAngry(player, 5)
            player.turnOver(); // 源 L4991：player:turnOver()
            lib.bts.api.endPlayPhase(player); // 源 L4992：Global_PlayPhaseTerminated
            // 源 L4993-4996：目标各执行额外回合
            for (const target of event.targets) {
                lib.bts.api.extraTurn(target, 'bts_extra_turn');
                // 源 L4994：setPlayerMark(player, "max_diezou"..目标.."-start", 1) ——
                // 目标于你下回合开始前手牌上限+1（gamerule_hand L1778）；
                // 你为星启时目标额定摸牌数+1（gamerule_draw L1461）。无名杀以挂临时 buff
                // bts_sk_diezou_buff 近似（已修正：原实现漏整块效果，仅额外回合）。
                target.storage.bts_diezou_owner = player.playerid;
                await target.addSkill('bts_sk_diezou_buff');
            }
        },
        subSkill: {
            clear: {
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return game.hasPlayer(
                        (p) =>
                            p.hasSkill('bts_sk_diezou_buff') &&
                            p.storage.bts_diezou_owner === player.playerid,
                    );
                },
                async content(event, trigger, player) {
                    // 源 L1502-1507：标记于知更鸟下回合 RoundStart 清除（"你下回合开始前"）。
                    // 无名杀以 phaseZhunbeiBegin 近似 RoundStart。
                    for (const p of lib.bts.api.seatOrder(
                        game.filterPlayer(
                            (p) =>
                                p.hasSkill('bts_sk_diezou_buff') &&
                                p.storage.bts_diezou_owner === player.playerid,
                        ),
                    )) {
                        delete p.storage.bts_diezou_owner;
                        p.removeSkill('bts_sk_diezou_buff');
                    }
                },
            },
            // ── 子技·迭奏 BGM（释放必杀技时切换知更鸟专属曲；下个准备阶段/死亡自动还原）──
            // 用技能级 BGM 机制（lib.bts.bgm）双参数形式注册自动还原（expire 与技能 trigger
            // 同构；实现参照 addTempSkill/tempBanSkill）。知更鸟会被迭奏翻面——翻面跳过、
            // 被引擎取消的回合不发 phaseZhunbeiBegin，监听自然顺延到下一次真实准备阶段；
            // dieAfter 覆盖「未到回合即阵亡」的情况。开关为各端本地语义（关闭端不应用、不记栈）。
            bgm: {
                trigger: { player: 'useSkillAfter' },
                forced: true,
                filter(event, player) {
                    return lib.skill[event.skill]?.bts_bisha === true;
                },
                async content(event, trigger, player) {
                    // 从 33.7s（副歌）起播——起点是本次切换的参数，随目标携带
                    lib.bts.bgm.switch(
                        { file: 'bts_ch_zhigengniao', startAt: 33.7 },
                        {
                            owner: player,
                            player: ['phaseZhunbeiBegin', 'dieAfter'],
                        },
                    );
                },
            },
            // ── 临时技·迭奏增益（挂在被赠回合角色身上，源 max_diezou<目标>-start 标记 L4994；
            //   gamerule_hand L1778：手牌上限+1；gamerule_draw L1461：发起者星启时额定摸牌数+1；
            //   由本父技能 subSkill.clear 于知更鸟下回合开始移除）──
            buff: {
                sub: true,
                sourceSkill: 'bts_sk_diezou',
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
                async content(event, trigger, player) {
                    event.num += 1;
                },
            },
        },
        ai: {
            // AI 口径：怒气≥5 且有受益友方时接（源 AI StarRail-ai max_diezou：估值 9、friends_noself
            // 全给）；每名友方得额外回合（+手牌上限1；星启另+额定摸牌1），自身翻面+结束出牌阶段为固定代价。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_diezou')) return -1;
                const friends = game.countPlayer(
                    (t) =>
                        t !== player &&
                        t.isAlive() &&
                        get.attitude(player, t) > 0,
                );
                if (!friends) return -1; // 无可给友方（result.target 对敌方 ≤0，选不出目标）
                return Math.min(9, 6 + friends); // 1名=7 / 2名=8 / ≥3名=9（对齐源估值上限）
            },
            result: {
                // 友方收益：额外回合（+手牌上限1；星启另+额定摸牌1）；敌方态度为负自然排除
                target: (player, target) => {
                    if (target === player) return 0;
                    let v = 2;
                    if (lib.bts.api.god(player)) v += 0.5;
                    if (!target.countCards('h')) v -= 0.5; // 空手牌额外回合收益略降
                    return v;
                },
            },
        },
    },

    // ── 触发技·咏叹（源 st_yongtan = TriggerSkill TargetConfirmed，L5010-5030）──
    // 当你成为其他角色使用牌的目标后，可以弃置一张【杀】并摸两张牌。
    bts_sk_yongtan: {
        trigger: { target: 'useCardToTargeted' },
        filter(event, player) {
            // 源 L5015：其他角色使用非技能牌指定你为目标。非技能牌判据：无名杀实体/直用对象卡
            // isCard:true、经典转化为 falsy——`!isCard` 恰为反向；改引擎标准武将同款
            //（extra/skill.js:3057 等）「非转化且非虚拟」。
            return (
                event.player !== player &&
                !!event.card &&
                !get.is.convertedCard(event.card) &&
                !get.is.virtualCard(event.card) &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L5015：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算。
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定（最高分 ≤0 → 取消）。
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '咏叹：选择弃置一张【杀】并摸两张牌',
                )
                .set('ai', (card) => 6 - get.value(card)) // 弃价值最低的【杀】换摸2（可分配）
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
    },

    // ── 锁定技·合颂（源 st_hesong = TriggerSkill Compulsory DamageCaused，L5032-5051）──
    // 翻面时，拥有额外回合来源的角色造成的伤害改为致命伤害，你回复1点怒气。
    bts_sk_hesong: {
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
        async content(event, trigger, player) {
            // 源 L5041-5042：AddNew(damage, "_fatal") + AddAngry(p)（改触发事件 damageBegin1）
            lib.bts.api.markDamage(trigger, '_fatal');
            lib.bts.api.addAngry(player);
        },
    },
};

export const translate = {
    bts_ch_zhigengniao: '知更鸟',
    bts_sk_diezou: '迭奏',
    bts_sk_diezou_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并翻面、结束出牌阶段，令至少一名其他角色各执行一个额外回合，这些角色于你下回合开始前手牌上限+1（若你为${get.poptip('bts_glossary_xingqi_faq')}，其额定摸牌数+1）。`,
    bts_sk_yongtan: '咏叹',
    bts_sk_yongtan_info:
        '当你成为其他角色使用牌的目标后，你可以弃置一张【杀】，摸两张牌，并将这些牌交给任意角色。',
    bts_sk_hesong: '合颂',
    bts_sk_hesong_info: `锁定技，翻面时，额外回合角色造成的伤害改为${get.poptip('bts_glossary_bless_fatal_faq')}伤害，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    '$bts_sk_diezou1': "今夜，灵魂彼此相拥",
    '$bts_sk_diezou2': "今夜，群星因我回响",
    '$bts_sk_yongtan1': "谐乐，即将齐奏",
    '$bts_sk_yongtan2': "万籁，再次共鸣",
    '$bts_sk_hesong1': "演出开始~",
    '$bts_sk_hesong2': "请安静下来",
    '~bts_ch_zhigengniao': "演出…还没…",
};

export const simpleTranslate = {
    bts_sk_diezou_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}翻面并结束出牌阶段，令至少1名其他角色额外回合，其手牌上限+1（${get.poptip('bts_glossary_xingqi_faq')}额外摸牌+1）`,
    bts_sk_yongtan_info: '成为他人牌目标后可弃杀摸2并可分配',
    bts_sk_hesong_info: `锁；翻面时额外回合来源伤害为${get.poptip('bts_glossary_bless_fatal_faq')}，自己回1${get.poptip('bts_glossary_nuqi_faq')}`,
};

// 默认读音有误（更→gēng）：按叁岛式写「中文名 → 带声调拼音数组」覆盖。
export const pinyins = {
    '知更鸟': ['zhī', 'gēng', 'niǎo'],
};
