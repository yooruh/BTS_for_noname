// 波提欧（源 animal.lua L5157-5263）—— 物理属性决斗与口袋契约。
// 技能：日落（必杀技·弃牌附物理+翻面+决斗）、炽烁（弃杀获口袋标记并缔约）、装填（决斗伤害时目标弃牌）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '物理·巡猎·巡海游侠'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('波提欧')}用日落翻面目标再与其决斗，靠${get.poptip('bts_glossary_koudai_faq')}让后续决斗更疼。`;

export const character = {
    bts_botiou: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_riluo', 'bts_st_chishuo', 'bts_st_zhuangtian'],
    },
};

export const skill = {
    // ── 必杀技·日落（源 st_riluo = OneCardViewAsSkill + SkillCard，L5158-5183）──
    // 出牌阶段，失5怒气并弃置一张牌，令一名其他角色附加物理属性、翻面，然后视为对其使用【决斗】。
    bts_st_riluo: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5181）：怒气≥5 且可弃手牌
            return lib.bts.api.getAngry(player, 5) && player.countCards('h');
        },
        filterCard: () => true, // 源 filter_pattern = "."（任意一张牌）
        position: 'h',
        selectCard: 1,
        filterTarget(card, player, target) {
            // 源 Card filter（L5163）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        logTarget: 'player',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_riluo');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L5166：LoseAngry(player, 5)
            await player.discard(event.cards); // 源 L5177-5178：addSubcard 弃一张牌
            await lib.bts.api.addNature(target, 'earth'); // 源 L5167：AddNature(targets[1], "earth")
            target.turnOver(); // 源 L5168：targets[1]:turnOver()
            // 源 L5169：ViewAsCardOnly "duel" —— 视为使用【决斗】
            await player.useCard({ name: 'juedou', isCard: true }, target);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_riluo') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 主动技·炽烁（源 st_chishuo = OneCardViewAsSkill + TriggerSkill，L5185-5236）──
    // 出牌阶段，弃置一张【杀】，获得1枚口袋标记并指定一名其他角色为契约目标（每契约一限一次）。
    // 源版缔约后波提欧手牌【杀】视为【决斗】（#st_chishuo FilterSkill），无名杀未复刻该转化（简化）。
    bts_st_chishuo: {
        enable: 'phaseUse',
        usable: 1,
        filterCard: (card) => get.name(card) === 'sha', // 源 filter_pattern = "Slash"
        position: 'h',
        selectCard: 1,
        filterTarget(card, player, target) {
            // 源 enabled_at_play（L5206-5208）：场上无目标契约标记才可发动
            return (
                target !== player &&
                !game.hasPlayer((candidate) =>
                    candidate.countMark(`botiou_target_${player.playerid}`),
                )
            );
        },
        selectTarget: 1,
        logTarget: 'player',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_chishuo');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L5201-5202：addSubcard 弃【杀】
            // 源 L5191：player:gainMark("@koudai") —— 获得1枚口袋标记
            player.addMark('bts_koudai', 1);
            // 源 L5192：addPlayerMark(targets[1], "duizxhi"..id) —— 记录契约目标
            target.addMark(`botiou_target_${player.playerid}`, 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_chishuo') ? -1 : 5;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·装填（源 st_zhuangtian = TriggerSkill Compulsory DamageCaused，L5251-5262）──
    // 当你以【决斗】造成伤害时，目标弃置至多三张手牌（不超过你的口袋标记数）。
    bts_st_zhuangtian: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            // 源 L5257：决斗伤害、目标可弃手牌、且你有口袋标记
            return (
                event.card?.name === 'juedou' &&
                player.countMark('bts_koudai') &&
                event.player.countCards('h')
            );
        },
        async content(event, trigger, player) {
            // 源 L5259：askForDiscard(damage.to, min(3, koudai)) —— 目标弃至多3张手牌（trigger=damageBegin1 事件）
            await trigger.player.chooseToDiscard(
                '装填：弃置手牌',
                'h',
                Math.min(3, player.countMark('bts_koudai')),
                true,
            );
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_botiou: '波提欧',
    bts_st_riluo: '日落',
    bts_st_riluo_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并弃置一张牌，令一名其他角色获得${get.poptip('bts_glossary_nature_earth_faq')}、翻面，然后视为对其使用【决斗】。`,
    bts_st_chishuo: '炽烁',
    bts_st_chishuo_info: `出牌阶段，你可以弃置一张【杀】并选择一名其他角色，获得1枚${get.poptip('bts_glossary_koudai_faq')}标记并与其建立${get.poptip('bts_glossary_koudai_faq')}${get.poptip('bts_glossary_bless_yingzi_faq')}。`,
    bts_st_zhuangtian: '装填',
    bts_st_zhuangtian_info: `锁定技，当你以【决斗】造成伤害时，目标弃置至多三张手牌（不超过你的${get.poptip('bts_glossary_koudai_faq')}数）。`,

    '$bts_st_riluo1': "和你们，已经没道理可讲",
    '$bts_st_riluo2': "世上只有两种人——要么手枪上膛…要么自掘坟墓！",
    '$bts_st_chishuo1': "来吧！公平决斗",
    '$bts_st_chishuo2': "放马过来，宝贝！",
    '$bts_st_zhuangtian1': "我可没说数到三！",
    '$bts_st_zhuangtian2': "最后这发赏给你！",
    '~bts_botiou': "哈哈，好枪法……",
};

export const simpleTranslate = {
    bts_st_riluo_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}弃1牌，令目标${get.poptip('bts_glossary_nature_earth_faq')}翻面并与其决斗`,
    bts_st_chishuo_info: `出牌阶段可弃杀获得${get.poptip('bts_glossary_koudai_faq')}并指定${get.poptip('bts_glossary_bless_yingzi_faq')}目标`,
    bts_st_zhuangtian_info: '锁；决斗伤害时目标弃至多3手牌（不超过口袋数）',
};

export const pinyins = { bts_botiou: 'botiou' };
