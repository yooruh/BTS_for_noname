// 素裳（源 animal.lua L5530-5641）—— 烛夜额外回合、若水与山倾。
// 技能：烛夜（必杀技·伤害+额外回合）、若水（他人空城/杀指定空城目标后摸牌）、山倾（出牌结束弃杀判定目标弃异类牌或受伤）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '物理·巡猎·云骑骁卫'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('素裳')}用烛夜多打一轮，对手空城、只剩一张牌时都能摸牌占便宜。`;

export const character = {
    bts_sushang: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_st_zhuye', 'bts_st_ruoshui', 'bts_st_shanqing'],
    },
};

export const skill = {
    // ── 必杀技·烛夜（源 st_zhuye = SkillCard + ZeroCardViewAsSkill，L5531-5556）──
    // 出牌阶段，失3怒气，对攻击范围内一名其他角色造成1点伤害，然后执行一个额外回合。
    bts_st_zhuye: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5554）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5539）：目标 ≠ 自己在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_zhuye');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L5542：LoseAngry(player, 3)
            await target.damage(player, 1, 'nocard'); // 源 L5543：room:damage
            // 源 L5544：addPlayerMark("extra_turn") —— 额外回合
            lib.bts.api.extraTurn(player, 'bts_extra_turn');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zhuye') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·若水（源 st_ruoshui = TriggerSkill Compulsory CardsMoveOneTime/TargetSpecified，L5558-5586）──
    // 攻击范围内的其他角色失去最后一张手牌后，或你使用【杀】指定空城角色后，你摸一张牌。
    bts_st_ruoshui: {
        trigger: { global: ['loseAfter', 'useCardToPlayered'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'loseAfter')
                // 源 L5564-5567：其他角色失去最后一张手牌且在你攻击范围内
                return (
                    event.player &&
                    event.player !== player &&
                    event.player.countCards('h') === 0 &&
                    player.inRange(event.player)
                );
            // 源 L5575-5579：你使用【杀】指定空城角色
            return (
                event.player === player &&
                event.card?.name === 'sha' &&
                event.target?.countCards('h') === 0
            );
        },
        async content(event, trigger, player) {
            // 源 L5569/L5579：p:drawCards(1)
            await player.draw(player);
        },
        ai: { noe: true },
    },

    // ── 触发技·山倾（源 st_shanqing = TriggerSkill EventPhaseEnd Play + OneCardViewAsSkill，L5588-5640）──
    // 出牌阶段结束时，可弃置一张【杀】并选择攻击范围内一名其他角色，
    // 判定后其弃置一张类别不同的牌，否则受到1点伤害。
    bts_st_shanqing: {
        trigger: { player: 'phaseUseEnd' },
        filter(event, player) {
            // 源 L5636：出牌阶段结束且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer((target) => target !== player && player.inRange(target))
            );
        },
        async cost(event, trigger, player) {
            // 源 L5637：askForUseCard("@@st_shanqing") —— 弃【杀】选目标
            event.result = await player
                .chooseCardTarget({
                    prompt: '山倾：弃置一张【杀】并选择攻击范围内一名其他角色',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    filterTarget: (card, source, target) =>
                        target !== source && source.inRange(target),
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            const target = event.targets[0],
                judge = await player.judge().forResult(), // 源 L5602-5607：判定
                type = get.type(judge.card);
            // 源 L5608-5613：目标弃置一张类别与判定牌不同的牌，否则受1点伤害
            const result = await target
                .chooseToDiscard(
                    '山倾：弃置一张非' + get.translation(type) + '牌，否则受到1点伤害',
                    'he',
                    (card) => get.type(card) !== type,
                )
                .forResult();
            if (!result.bool) await target.damage(player, 1, 'nocard');
        },
        ai: { result: { target: -1 } },
    },
};

export const translate = {
    bts_sushang: '素裳',
    bts_st_zhuye: '烛夜',
    bts_st_zhuye_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，对攻击范围内一名其他角色造成1点伤害，然后执行一个额外回合。`,
    bts_st_ruoshui: '若水',
    bts_st_ruoshui_info:
        '锁定技，攻击范围内的其他角色失去最后一张手牌后，或你使用【杀】指定空城角色后，你摸一张牌。',
    bts_st_shanqing: '山倾',
    bts_st_shanqing_info:
        '出牌阶段结束时，你可以弃置一张【杀】并选择攻击范围内一名其他角色，判定后其弃置一张类别不同的牌，否则受到1点伤害。',

    '$bts_st_zhuye1': "吃我一招，太虚形蕴！",
    '$bts_st_zhuye2': "凤凰，显形！",
    '$bts_st_ruoshui1': "再不让开，就要挨揍啦",
    '$bts_st_ruoshui2': "嗯哼，马上就让你知道我的厉害",
    '$bts_st_shanqing1': "这你躲不了啦",
    '$bts_st_shanqing2': "小贼，哪里跑！",
    '~bts_sushang': "这下…玩脱了……",
};

export const simpleTranslate = {
    bts_st_zhuye_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}对范围内角色造成1伤害并额外回合`,
    bts_st_ruoshui_info: '锁；范围内他人空城或杀指定空城角色后摸1',
    bts_st_shanqing_info: '出牌阶段结束可弃杀判定，目标弃异类牌或受1伤',
};

export const pinyins = { bts_sushang: 'sushang' };
