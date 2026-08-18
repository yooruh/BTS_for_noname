// 杰帕德（源 animal.lua L3908-3961）—— 永屹必杀技护盾、震慑弃杀反击冻结、刚正濒死回血。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '冰·存护·以朗道之名'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('杰帕德')}是防守反击：${get.poptip('bts_glossary_bisha_faq')}${B('永屹')}给自己和队友加${get.poptip('bts_glossary_hudun_faq')}，${B('震慑')}被【杀】指定时弃杀反击${get.poptip('bts_glossary_abnormal_freeze_faq')}，${B('刚正')}濒死时回血。` +
    `<li>${get.poptip('bts_glossary_abnormal_freeze_faq')}会让目标不能使用装备牌`;

export const character = {
    bts_jiepade: {
        sex: 'male',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_st_yongyi', 'bts_st_zhenshe', 'bts_st_gangzheng'],
    },
};

export const skill = {
    // ── 必杀技·永屹（源 st_yongyi = SkillCard + ZeroCardViewAsSkill，L3909-3931）──
    // 出牌阶段，失4怒气并选择至少一名其他角色，你与这些角色各附加1层护盾。
    bts_st_yongyi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L3929）：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L3912）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yongyi');
            lib.bts.api.loseAngry(player, 4); // 源 L3915：LoseAngry(player, 4)
            // 源 L3916：AddAShield(player)
            lib.bts.api.addShield(player, 1);
            // 源 L3917-3919：对每个目标 AddAShield(p, player)
            for (const target of event.targets || [])
                lib.bts.api.addShield(target, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yongyi')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: 1 },
        },
    },

    // ── 触发技·震慑（源 st_zhenshe = TriggerSkill TargetConfirmed，L3933-3946）──
    // 当其他角色使用【杀】指定你为目标后，你可以弃置一张【杀】，令其附加1层冻结。
    bts_st_zhenshe: {
        trigger: { target: 'useCardToPlayer' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L3940：你被其他角色的【杀】指定为目标，且手牌有【杀】可弃
            return (
                event.target === player &&
                event.card?.name === 'sha' &&
                event.player !== player &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L3940：askForCard(player, "Slash")
            const result = await player
                .chooseBool(
                    '震慑：是否弃置一张【杀】令' +
                        get.translation(trigger.player) +
                        '附加1层冻结？',
                )
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = { bool: true };
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // trigger=触发事件（useCardToPlayer）；trigger.player = 杀的使用者（冻结来源）
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            lib.bts.api.addAbnormal(trigger.player, 'freeze', 1, player); // 源 L3943：AddAbnormal(use.from, "@abnormal_freeze")
        },
        ai: { result: { player: 1, target: -1 } },
    },

    // ── 觉醒技·刚正（源 st_gangzheng = TriggerSkill Skill_Wake EnterDying，L3948-3960）──
    // 当你进入濒死状态时，回复体力至 maxHp/2（至少1），此技能仅发动一次。
    bts_st_gangzheng: {
        trigger: { player: 'dying' },
        filter(event, player) {
            // 源 L3954：濒死且未觉醒
            return player.countMark('bts_st_gangzheng') === 0;
        },
        async content(event, trigger, player) {
            player.addMark('bts_st_gangzheng', 1); // 源 L3956：setPlayerMark 觉醒标记
            // 源 L3957：recover(min(1, maxHp/2) - hp)
            const target = Math.min(1, Math.floor(player.maxHp / 2));
            if (player.hp < target) await player.recover(player, target - player.hp);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_jiepade: '杰帕德',
    bts_st_yongyi: '永屹',
    bts_st_yongyi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各附加1层${get.poptip('bts_glossary_hudun_faq')}。`,

    bts_st_zhenshe: '震慑',
    bts_st_zhenshe_info: `当其他角色使用【杀】指定你为目标后，你可以弃置一张【杀】，令其附加1层${get.poptip('bts_glossary_abnormal_freeze_faq')}。`,

    bts_st_gangzheng: '刚正',
    bts_st_gangzheng_info: `觉醒技，当你进入濒死状态时，你回复体力至1点（${get.poptip('bts_glossary_bless_maxhp_faq')}的一半），此技能仅发动一次。`,

    '$bts_st_yongyi1': "我以朗道之名",
    '$bts_st_yongyi2': "历经冰雪，铸成此志，永不终结！",
    '$bts_st_zhenshe1': "有我在",
    '$bts_st_zhenshe2': "胜负已分",
    '$bts_st_gangzheng1': "奉陪到底",
    '$bts_st_gangzheng2': "还没到我退场的时候",
    '~bts_jiepade': "我…还不能……",
};

export const simpleTranslate = {
    bts_st_yongyi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各+1${get.poptip('bts_glossary_hudun_faq')}`,
    bts_st_zhenshe_info: `被他人用杀指定后，弃1杀令其+1${get.poptip('bts_glossary_abnormal_freeze_faq')}`,
    bts_st_gangzheng_info: '觉醒；濒死时回复至1点（限一次）',
};

export const pinyins = { bts_jiepade: 'jiepade' };
