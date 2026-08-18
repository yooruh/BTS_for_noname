// 貊泽（源 animal.lua L6087-6211）—— 锋影、折翅与暗袭。
// 技能：锋影（必杀技·弃/获牌+杀）、折翅（黑杀+3红杀-1次数）、掠袭（指定猎物+暗之祝福，猎物受杀伤后追击）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '雷·巡猎·巡海游侠'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('貊泽')}指定猎物，猎物被人用【杀】打中后，${get.poptip('bts_glossary_moze_dark_assault_faq')}追上去补刀。`;

export const character = {
    bts_moze: {
        sex: 'male',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_st_fengying', 'bts_st_zhechi', 'bts_st_lvexi'],
    },
};

export const skill = {
    // ── 必杀技·锋影（源 st_fengying = SkillCard + ZeroCardViewAsSkill，L6088-6117）──
    // 出牌阶段，失3怒气，弃置一名其他角色一张牌（星启时获得之），然后视为对其使用【杀】。
    bts_st_fengying: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6115）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6091）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_fengying');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L6094：LoseAngry(player, 3)
            // 源 L6095-6104：目标有牌时，星启获得之，否则弃置之
            if (target.countCards('he')) {
                if (lib.bts.api.god(player))
                    await player.gainPlayerCard(target, 'he', true);
                else await player.discardPlayerCard(target, 'he', true);
            }
            // 源 L6105：ViewAsCardOnly —— 视为对目标使用【杀】
            await player.useCard({ name: 'sha', isCard: true }, target);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_fengying') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·折翅（源 st_zhechi = TargetModSkill pattern Slash，L6119-6132）──
    // 你使用黑色【杀】的次数上限+3，使用红色【杀】的次数上限-1。
    bts_st_zhechi: {
        mod: {
            cardUsable(card, player, num) {
                // 源 L6124-6128：residue_func 黑+3 红-1
                if (card.name !== 'sha') return;
                const color = get.color(card, player);
                if (color === 'black') return num + 3;
                if (color === 'red') return Math.max(0, num - 1);
            },
        },
        ai: { noe: true },
    },

    // ── 触发技·掠袭（源 st_lvexi = TriggerSkill EventPhaseStart/Damage/Damaged/Death，L6155-6210）──
    // 出牌阶段，指定一名其他角色为猎物并获得10层暗之祝福；
    // 猎物受到其他角色【杀】伤害后，你移除3层暗之祝福并视为对其使用【杀】；
    // 暗之祝福耗尽、你或猎物死亡时，此状态结束。
    bts_st_lvexi: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 无名杀以主动技激活（源版为受伤+钺贯交杀联动触发，见迁移记录「适配」）
            return (
                !player.countMark('moze_dark_assault') &&
                game.hasPlayer((target) => target !== player)
            );
        },
        filterTarget(card, player, target) {
            // 选择猎物（源 L6144-6152：Liewu 标记的伤害关联/其他角色）
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_lvexi');
            const target = event.targets[0];
            // 记录猎物与掠袭状态
            player.storage.bts_moze_prey = target.playerid;
            player.addMark('moze_dark_assault', 1);
            // 源 L6172：AddBless(player, "@bless_dark", 10) —— 10层暗之祝福
            await lib.bts.api.addBless(player, 'dark', 10, player);
            target.addMark(`bts_liewu_${player.playerid}`, 1); // 源 L6174：addPlayerMark(p, "@liewu")
        },
        group: ['bts_st_lvexi_assault', 'bts_st_lvexi_clear'],
        subSkill: {
            assault: {
                // 源 L6179-6194：猎物受到其他角色【杀】伤害后，移除3层暗之祝福并追击【杀】
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        player.countMark('moze_dark_assault') &&
                        event.player?.playerid === player.storage.bts_moze_prey &&
                        event.card?.name === 'sha' &&
                        event.source !== player &&
                        lib.bts.api.getBless(player, 'dark', 3)
                    );
                },
                async content(event, trigger, player) {
                    await lib.bts.api.removeBless(player, 'dark', 3); // 源 L6184
                    const prey = trigger.player;
                    // 源 L6186：ViewAsCardOnly —— 视为对猎物使用【杀】
                    if (prey.isAlive())
                        await player.useCard(
                            { name: 'sha', isCard: true },
                            prey,
                            'bts_st_lvexi',
                        );
                    // 源 L6187-6192：暗之祝福耗尽 → 结束掠袭
                    if (!lib.bts.api.getBless(player, 'dark')) {
                        player.removeMark(
                            'moze_dark_assault',
                            player.countMark('moze_dark_assault'),
                        );
                        delete player.storage.bts_moze_prey;
                    }
                },
                ai: { noe: true },
            },
            clear: {
                // 源 L6196-6204：你或猎物死亡 → 结束掠袭
                trigger: { player: 'dieAfter', global: 'dieAfter' },
                forced: true,
                filter(event, player) {
                    return (
                        player.countMark('moze_dark_assault') > 0 &&
                        (event.player === player ||
                            event.player?.playerid === player.storage.bts_moze_prey)
                    );
                },
                content(event, trigger, player) {
                    player.removeMark(
                        'moze_dark_assault',
                        player.countMark('moze_dark_assault'),
                    );
                    delete player.storage.bts_moze_prey;
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_lvexi') ? -1 : 4;
            },
            result: { target: -1 },
        },
    },
};

export const translate = {
    bts_moze: '貊泽',
    bts_st_fengying: '锋影',
    bts_st_fengying_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，弃置一名其他角色一张牌（${get.poptip('bts_glossary_xingqi_faq')}时获得之），然后视为对其使用【杀】。`,
    bts_st_zhechi: '折翅',
    bts_st_zhechi_info:
        '锁定技，你使用黑色【杀】的次数上限+3，使用红色【杀】的次数上限-1。',
    bts_st_lvexi: '掠袭',
    bts_st_lvexi_info: `出牌阶段，你可以指定一名其他角色为猎物并获得10层${get.poptip('bts_glossary_bless_dark_faq')}；猎物受到其他角色【杀】伤害后，你移除3层${get.poptip('bts_glossary_bless_dark_faq')}并视为对其使用【杀】（${get.poptip('bts_glossary_bless_dark_faq')}使其为${get.poptip('bts_glossary_nature_dark_faq')}）；${get.poptip('bts_glossary_bless_dark_faq')}耗尽、你或猎物死亡时，此状态结束。`,

    '$bts_st_fengying1': "该收割了",
    '$bts_st_fengying2': "风声所到之处…你无所遁形！",
    '$bts_st_zhechi1': "我，即是锋刃……",
    '$bts_st_zhechi2': "我，即是阴影……",
    '$bts_st_lvexi1': "时机，转瞬即逝",
    '$bts_st_lvexi2': "夜色，如影随形",
    '$bts_st_lvexi3': "幽冥，奔袭！",
    '$bts_st_lvexi4': "乌羽潜行",
    '~bts_moze': "功亏…一篑……",
};

export const simpleTranslate = {
    bts_st_fengying_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}弃（${get.poptip('bts_glossary_xingqi_faq')}获得）目标1牌并对其使用杀`,
    bts_st_zhechi_info: '锁；黑杀次数+3，红杀次数-1',
    bts_st_lvexi_info: `出牌阶段指定猎物并获10${get.poptip('bts_glossary_bless_dark_faq')}；其受他人杀伤后耗3层追击暗杀`,
};

export const pinyins = { bts_moze: 'moze' };
