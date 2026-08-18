// 乱破（源 animal.lua L5264-5352）—— 结印额外回合。
// 技能：天流（必杀技·结束出牌阶段+结印祝福+额外回合）、堪忍（他人失去最后手牌后摸牌）、贯彻（受伤弃杀弃关联手牌）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '虚数·智识·忍者'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('乱破')}用天流换${get.poptip('bts_glossary_bless_jieyin_faq')}和额外回合，追击受伤的关联角色。`;

export const character = {
    bts_luanpo: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_tianliu', 'bts_st_kanren', 'bts_st_guanche'],
    },
};

export const skill = {
    // ── 必杀技·天流（源 st_tianliu = SkillCard + ZeroCardViewAsSkill + TriggerSkill，L5265-5295）──
    // 出牌阶段，失5怒气并结束出牌阶段；回合结束（NotActive）时附加3层结印祝福并执行额外回合。
    // 源版把结印/额外回合放在 st_tianliu 的 TriggerSkill 的 NotActive 阶段结算；
    // 无名杀直接在 content 内联完成（行为等价）。
    bts_st_tianliu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5281）：怒气≥5 且未拥有结印祝福
            return (
                lib.bts.api.getAngry(player, 5) &&
                !lib.bts.api.getBless(player, 'jieyin')
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianliu');
            lib.bts.api.loseAngry(player, 5); // 源 L5269：LoseAngry(player, 5)
            player.skip('phaseUse'); // 源 L5271：Global_PlayPhaseTerminated 结束出牌阶段
            // 源 L5286-5294：结印祝福+额外回合在乱破【自己回合结束（NotActive）】才结算——
            // 若出牌阶段中途就挂结印，当前回合结束阶段会先自然衰减1层（resolver phaseJieshuBegin），
            // 额外回合只剩2层；故记 pending 标记，由其回合结束后（phaseAfter）再授予（满3层）。
            player.addMark('bts_st_tianliu_pending', 1);
        },
        group: ['bts_st_tianliu_jieyin'],
        subSkill: {
            // 回合结束收尾（源 st_tianliu TriggerSkill NotActive，L5286-5294）
            jieyin: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player) {
                    return player.countMark('bts_st_tianliu_pending') > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_st_tianliu_pending',
                        player.countMark('bts_st_tianliu_pending'),
                    );
                    if (event.triggername === 'death') return; // 死亡不再授结印/额外回合
                    // 源 L5291-5292：AddBless(@bless_jieyin, 3) + gainAnExtraTurn
                    await lib.bts.api.addBless(player, 'jieyin', 3);
                    lib.bts.api.extraTurn(player, 'bts_extra_turn');
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianliu')
                    ? -1
                    : 6;
            },
            result: { player: 1 },
        },
    },

    // ── 锁定技·堪忍（源 st_kanren = TriggerSkill Compulsory CardsMoveOneTime，L5311-5323）──
    // 其他角色失去最后一张手牌后，你摸一张牌。
    bts_st_kanren: {
        trigger: { global: 'loseAfter' },
        forced: true,
        filter(event, player) {
            // 源 L5317：其他角色从手牌失去最后一张手牌（is_last_handcard）
            return event.player !== player && event.player?.countCards('h') === 0;
        },
        async content(event, trigger, player) {
            // 源 L5319：player:drawCards(1)
            await player.draw(player);
        },
        ai: { noe: true },
    },

    // ── 触发技·贯彻（源 st_guanche = TriggerSkill Damaged，L5325-5350）──
    // 你受到伤害后，可弃置一张【杀】，弃置所有伤害关联角色各一张手牌。
    bts_st_guanche: {
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            // 源 L5330-5334：存在伤害关联角色，且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer((candidate) =>
                    candidate.countMark(`bts_damage_link_${player.playerid}`),
                )
            );
        },
        async cost(event, trigger, player) {
            // 源 L5335：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '贯彻：选择弃置一张【杀】弃置伤害关联角色一张手牌？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L5335：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L5342-5347：对全部 DamageLink 标记角色各弃一张手牌（目标非选择，强制逐一执行）。
            for (const candidate of game.filterPlayer(
                (candidate) =>
                    candidate.countMark(`bts_damage_link_${player.playerid}`) &&
                    candidate.countCards('h'),
            ))
                await player.discardPlayerCard(candidate, 'h', true);
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_luanpo: '乱破',
    bts_st_tianliu: '天流',
    bts_st_tianliu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并结束出牌阶段，附加3层${get.poptip('bts_glossary_bless_jieyin_faq')}，执行一个额外回合。`,
    bts_st_kanren: '堪忍',
    bts_st_kanren_info: '锁定技，其他角色失去最后一张手牌后，你摸一张牌。',
    bts_st_guanche: '贯彻',
    bts_st_guanche_info:
        '受到伤害后，你可以弃置一张【杀】，弃置所有伤害关联角色各一张手牌。',

    '$bts_st_tianliu1': "银河忍法，千变万化",
    '$bts_st_tianliu2': "此乃——「忍法•奥义•缭乱灭破杀阵」！",
    '$bts_st_kanren1': "斩！断！破！",
    '$bts_st_kanren2': "忍步爆走！",
    '$bts_st_guanche1': "缭乱•忍法•锦墨绘！",
    '$bts_st_guanche2': "缭乱•忍法•万彩绽！",
    '~bts_luanpo': "就此，告辞……",
};

export const simpleTranslate = {
    bts_st_tianliu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}结束出牌阶段，+3${get.poptip('bts_glossary_bless_jieyin_faq')}并额外回合`,
    bts_st_kanren_info: '锁；他人空城后摸1',
    bts_st_guanche_info: '受伤后可弃杀弃伤害关联角色手牌',
};

export const pinyins = { bts_luanpo: 'luanpo' };
