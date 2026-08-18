// 波提欧（源 animal.lua L5157-5263）—— 物理属性决斗与口袋契约。
// 技能：日落（必杀技·弃牌附物理+翻面+决斗）、炽烁（弃杀获口袋标记并缔约）、装填（决斗伤害时目标弃牌）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '物理·巡猎·巡海游侠'; // 属性·命途
export const intro =
    `${B('波提欧')}用日落翻面目标再与其决斗，靠${get.poptip('bts_glossary_koudai_faq')}让后续决斗更疼。`;

export const character = {
    bts_ch_botiou: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_riluo', 'bts_sk_chishuo', 'bts_sk_zhuangtian'],
    },
};

export const skill = {
    // ── 必杀技·日落（源 st_riluo = OneCardViewAsSkill + SkillCard，L5158-5183）──
    // 出牌阶段，失5怒气并弃置一张牌，令一名其他角色附加物理属性、翻面，然后视为对其使用【决斗】。
    bts_sk_riluo: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_riluo');
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
                return lib.bts.aiGuard.blocked(player, 'bts_sk_riluo') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 主动技·炽烁（源 st_chishuo = OneCardViewAsSkill + TriggerSkill，L5185-5236）──
    // 出牌阶段，弃置一张【杀】，获得1枚口袋标记并指定一名其他角色为契约目标。
    // 缔约期间你的手牌【杀】视为【决斗】（源 #st_chishuo FilterSkill L5517-5529）；
    // 契约目标进入濒死或失去所有手牌时解除契约（源 st_chishuo TriggerSkill L5492-5515）。
    // 定夺 2026-09-12（D-03）：去 usable 对齐源（源无每回合限一次，只禁"场上已有契约"），
    // filterTarget 的"场上无目标契约标记"检查即源 enabled_at_play（L5206-5208）语义，解契后可再契。
    bts_sk_chishuo: {
        enable: 'phaseUse',
        filterCard: (card) => get.name(card) === 'sha', // 源 filter_pattern = "Slash"
        position: 'h',
        selectCard: 1,
        filterTarget(card, player, target) {
            // 源 enabled_at_play（L5206-5208）：场上无目标契约标记才可发动
            return (
                target !== player &&
                !game.hasPlayer((candidate) =>
                    candidate.countMark(`bts_mk_botiou_target_${player.playerid}`),
                )
            );
        },
        selectTarget: 1,
        logTarget: 'player',
        group: ['bts_sk_chishuo_break'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_chishuo');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L5201-5202：addSubcard 弃【杀】
            // 源 L5191：player:gainMark("@koudai") —— 获得1枚口袋标记
            player.addMark('bts_mk_koudai', 1);
            // 源 L5192：addPlayerMark(targets[1], "duizxhi"..id) —— 记录契约目标
            // 动态键（含来源 playerid）运行时注册：引擎 addMark/removeMark 在 log!==false 时
            // 会 get.info(key)，未注册即告警「孩子，你的技能…」（2026-09-26 实机警告修复，
            // 同上文解契移除路径）。
            const contractMark = `bts_mk_botiou_target_${player.playerid}`;
            lib.skill[contractMark] ??= { markKind: 'record' };
            lib.translate[contractMark] ??= '炽烁契约';
            target.addMark(contractMark, 1);
            // 源 L5193-5194：acquireSkill("#st_chishuo") + filterCards —— 挂载【杀】→【决斗】转化
            await player.addSkill('bts_sk_chishuo_buff');
        },
        subSkill: {
            // 源 st_chishuo TriggerSkill（L5492-5515）：契约目标进入濒死或失去最后手牌 → 解除契约
            break: {
                trigger: { global: ['dying', 'loseAfter'] },
                forced: true,
                filter(event, player) {
                    // player = 契约缔结者（拥有炽烁技能者）；event.player = 濒死/失牌角色
                    const mark = `bts_mk_botiou_target_${player.playerid}`;
                    if (!event.player || event.player.countMark(mark) <= 0)
                        return false;
                    // 源 L5498-5503：EnterDying 或 最后手牌移出手牌区（is_last_handcard）
                    if (event.name === 'dying') return true;
                    return (
                        event.getl?.(event.player)?.hs?.length > 0 &&
                        event.player.countCards('h') === 0
                    );
                },
                async content(event, trigger, player) {
                    const mark = `bts_mk_botiou_target_${player.playerid}`;
                    // 源 L5506-5508：removePlayerMark + detachSkill("#st_chishuo") + filterCards
                    trigger.player.removeMark(mark, trigger.player.countMark(mark));
                    if (player.hasSkill('bts_sk_chishuo_buff'))
                        player.removeSkill('bts_sk_chishuo_buff');
                },
                ai: { noe: true },
            },
            // ── 关联技·契约状态（源 #st_chishuo FilterSkill L5517-5529 + gamerule_pro 目标限制 L1782-1786）──
            // 缔约期间你的手牌【杀】视为【决斗】（无距离限制，走 canUse 规则）；
            // 契约存在期间除契约目标（与你自己）外，其他角色不是你使用牌的合法目标。
            buff: {
                sub: true,
                sourceSkill: 'bts_sk_chishuo',
                charlotte: true,
                enable: 'phaseUse',
                filter(event, player) {
                    // 源 view_filter（L5520-5521）：手牌且为【杀】（契约建立时才挂载本技能）
                    return player.getCards('h').some((card) => get.name(card) === 'sha');
                },
                filterCard: (card) => get.name(card) === 'sha',
                position: 'h',
                selectCard: 1,
                filterTarget(card, player, target) {
                    // 源 FilterSkill 转化后的决斗是锦囊（无距离限制），目标规则仍走 canUse
                    //（canUse 第三参 false 跳过距离检查、保留 targetEnabled，同钺贯·bts_sk_yueguan_buff）
                    return player.canUse(card, target, false);
                },
                viewAs: {
                    name: 'juedou',
                    isCard: true,
                },
                mod: {
                    // 源 gamerule_pro（L1782-1786）：有契约目标时，其以外的其他角色不是你使用牌的合法目标
                    //（playerEnabled 由「用牌者」的技能判定，故挂在契约期间常驻的本技能上）
                    playerEnabled(card, player, target) {
                        const mark = `bts_mk_botiou_target_${player.playerid}`;
                        const contract = game.findPlayer(
                            (p) => p !== player && p.isAlive() && p.countMark(mark) > 0,
                        );
                        if (contract && target !== contract && target !== player)
                            return false;
                    },
                },
                ai: { order: 5, result: { target: -1 } },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_chishuo') ? -1 : 5;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·装填（源 st_zhuangtian = TriggerSkill Compulsory DamageCaused，L5251-5262）──
    // 当你以【决斗】造成伤害时，目标弃置至多三张手牌（不超过你的口袋标记数）。
    bts_sk_zhuangtian: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            // 源 L5257：决斗伤害、目标可弃手牌、且你有口袋标记
            return (
                event.card?.name === 'juedou' &&
                player.countMark('bts_mk_koudai') &&
                event.player.countCards('h')
            );
        },
        async content(event, trigger, player) {
            // 源 L5259：askForDiscard(damage.to, min(3, koudai)) —— 目标弃至多3张手牌（trigger=damageBegin1 事件）
            await trigger.player.chooseToDiscard(
                '装填：弃置手牌',
                'h',
                Math.min(3, player.countMark('bts_mk_koudai')),
                true,
            );
        },
        ai: { noe: true },
    },

};

export const marks = {
    bts_mk_koudai: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_koudai_faq',
    },
};

export const translate = {
    bts_ch_botiou: '波提欧',
    bts_sk_riluo: '日落',
    bts_sk_riluo_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并弃置一张牌，令一名其他角色获得${get.poptip('bts_glossary_nature_earth_faq')}、翻面，然后视为对其使用【决斗】。`,
    bts_sk_chishuo: '炽烁',
    bts_sk_chishuo_info: `出牌阶段，你可以弃置一张【杀】并选择一名其他角色，你获得1枚${get.poptip('bts_glossary_koudai_faq')}。其下次进入濒死或失去所有手牌前：你的【杀】视为【决斗】；除其与你自己外，其他角色不是你使用牌的合法目标。`,
    bts_sk_zhuangtian: '装填',
    bts_sk_zhuangtian_info: `锁定技，当你以【决斗】造成伤害时，目标弃置至多三张手牌（不超过你的${get.poptip('bts_glossary_koudai_faq')}数）。`,

    '$bts_sk_riluo1': "和你们，已经没道理可讲",
    '$bts_sk_riluo2': "世上只有两种人——要么手枪上膛…要么自掘坟墓！",
    '$bts_sk_chishuo1': "来吧！公平决斗",
    '$bts_sk_chishuo2': "放马过来，宝贝！",
    '$bts_sk_zhuangtian1': "我可没说数到三！",
    '$bts_sk_zhuangtian2': "最后这发赏给你！",
    '~bts_ch_botiou': "哈哈，好枪法……",
    bts_mk_koudai: '口袋',
    bts_mk_koudai_info: '来源：炽烁赋予；装填：决斗伤弃敌牌',
};

export const simpleTranslate = {
    bts_sk_riluo_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}弃1牌，令目标${get.poptip('bts_glossary_nature_earth_faq')}翻面并与其决斗`,
    bts_sk_chishuo_info: `出牌阶段可弃杀获得${get.poptip('bts_glossary_koudai_faq')}并指定契约目标，缔约期间杀当决斗、只能对契约目标用牌`,
    bts_sk_zhuangtian_info: '锁；决斗伤害时目标弃至多3手牌（不超过口袋数）',
};

export const pinyins = { bts_ch_botiou: 'botiou' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_koudai_faq',
        name: '|口袋|',
        info: `波提欧专属：${get.poptip('bts_sk_chishuo')}弃杀赋予；${get.poptip('bts_sk_zhuangtian')}以【决斗】造成伤害时令其弃至多3张手牌。`,
    },
];
