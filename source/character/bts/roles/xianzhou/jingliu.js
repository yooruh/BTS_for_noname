// 镜流（源 animal.lua L6716-6810）—— 朔望、转魄与映月。
// 技能：天河（必杀技·朔望+霜伤）、无罅（扣血弃杀+朔望）、转魄（回合结束朔望≥2进入映月+额外回合）、映月（映月状态霜伤爆发+睡眠）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '冰·毁灭·无罅飞光'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('镜流')}攒${get.poptip('bts_glossary_shuowang_faq')}进${get.poptip('bts_glossary_bless_yingyue_faq')}，霜伤靠队友卖血越叠越狠，代价是收尾时挂${get.poptip('bts_glossary_abnormal_sleep_faq')}。`;

export const character = {
    bts_jingliu: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_tianhe', 'bts_st_wuxia', 'bts_st_zhuanpo'],
    },
};

export const skill = {
    // ── 必杀技·天河（源 st_tianhe = SkillCard + ZeroCardViewAsSkill，L6717-6746）──
    // 出牌阶段，失5怒气并选择攻击范围内一名其他角色，获得1枚朔望并对其造成1点霜属性伤害；
    // 若你为星启，额外获得1枚映月并附加1层致命祝福。
    bts_st_tianhe: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6744）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6725）：目标 ≠ 自己在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianhe');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L6728：LoseAngry(player, 5)
            // 源 L6729：gainMark("@shuowang")
            player.addMark('bts_shuowang', 1);
            // 源 L6730：reason 含 "_frost" 的霜属性伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_tianhe_frost';
            lib.bts.api.setDamageNature(damage, 'frost');
            await damage;
            // 源 L6731-6734：星启时 +1映月 + 1层致命祝福
            if (lib.bts.api.god(player)) {
                player.addMark('bts_yingyue', 1);
                await lib.bts.api.addBless(player, 'fatal', 1, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianhe') ? -1 : 7;
            },
            result: { target: -2 },
        },
    },

    // ── 触发技·无罅（源 st_wuxia = TriggerSkill HpChanged，L6748-6759）──
    // 你扣减体力后，可弃置一张【杀】，获得1枚朔望。
    bts_st_wuxia: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 源 L6754：扣减量>0，且非映月状态（源为动态摘除技能，无名杀用标记排除）
            return (
                event.num > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                !player.countMark('bts_yingyue_active')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6754：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '无罅：是否弃置一张【杀】获得1枚朔望？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6756：gainMark("@shuowang")
            player.addMark('bts_shuowang', 1);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·转魄（源 st_zhuanpo = TriggerSkill Compulsory EventPhaseStart NotActive，L6761-6777）──
    // 任意角色回合结束时（源 EventPhaseStart 下监听转入 NotActive 的全局回合结束），
    // 若你拥有至少2枚朔望，进入映月状态并执行一个额外回合。
    bts_st_zhuanpo: {
        trigger: { global: 'phaseEnd' }, // 源为任意角色回合结束即判，非仅自身回合
        forced: true,
        filter(event, player) {
            // 源 L6767：回合结束且朔望≥2
            return (
                player.countMark('bts_shuowang') >= 2 && !player.countMark('bts_yingyue_active')
            );
        },
        async content(event, trigger, player) {
            // 源 L6769：handleAcquireDetachSkills "-st_wuxia|-st_zhuanpo|st_yingyue"——
            // 真实技能换载：移除无罅/转魄、取得映月，再执行一个额外回合。
            player.addMark('bts_yingyue_active', 1);
            await player.removeSkill('bts_st_wuxia');
            await player.removeSkill('bts_st_zhuanpo');
            await player.addSkill('bts_st_yingyue');
            lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 源 L6770：gainAnExtraTurn（整回合）
        },
        ai: { noe: true },
    },

    // ── 锁定技·映月（源 st_yingyue = TriggerSkill Compulsory EventPhaseStart/End，L6779-6808）──
    // 映月状态的出牌阶段开始时，移除1枚朔望并选择一名其他角色造成霜属性伤害；
    // 其他角色可失去体力令伤害增加；结算后附加睡眠；朔望耗尽时退出映月状态。
    bts_st_yingyue: {
        charlotte: true,
        trigger: { player: ['phaseUseBegin', 'phaseUseEnd'] },
        forced: true,
        filter(event, player) {
            // 源 L6784：出牌阶段（且为映月状态）
            return player.countMark('bts_yingyue_active');
        },
        async content(event, trigger, player) {
            if (event.triggername === 'phaseUseEnd') {
                // 源 L6802-6805：出牌阶段结束且朔望为0 → 退出映月（重获无罅/转魄，移除映月）
                if (!player.countMark('bts_shuowang')) {
                    player.removeMark(
                        'bts_yingyue_active',
                        player.countMark('bts_yingyue_active'),
                    );
                    await player.removeSkill('bts_st_yingyue');
                    // 源 L6804：重获无罅/转魄（退出映月形态）
                    await player.addSkill('bts_st_wuxia');
                    await player.addSkill('bts_st_zhuanpo');
                }
                return;
            }
            // 源 L6785-6788：出牌阶段开始且有朔望 → 移除1枚
            if (!player.countMark('bts_shuowang')) return;
            player.removeMark('bts_shuowang', 1);
            // 源 L6789-6790：选择一名其他角色
            const result = await player
                .chooseTarget(
                    '映月：选择一名其他角色造成霜属性伤害',
                    [1, 1],
                    (card, source, target) => target !== source,
                )
                .forResult();
            if (!result.bool) return;
            const target = result.targets[0];
            // 源 L6793-6798：其他角色可各失去1点体力令伤害+1
            let bonus = player.countMark('bts_yingyue');
            for (const other of game.filterPlayer(
                (candidate) =>
                    candidate !== player &&
                    candidate !== target &&
                    candidate.hp > 1 &&
                    candidate.countMark(`bts_damage_link_${player.playerid}`) === 0,
            )) {
                const choice = await other
                    .chooseBool('映月：是否失去1点体力以令伤害+1？')
                    .forResult();
                if (choice.bool) {
                    await other.loseHp();
                    bonus++;
                }
            }
            // 源 L6799：伤害 = 1 + 参与角色数 + 映月层数
            const damage = target.damage(player, 1 + bonus, 'nocard');
            damage.reason = 'bts_st_yingyue_frost';
            lib.bts.api.setDamageNature(damage, 'frost');
            await damage;
            // 源 L6800：setPlayerMark("@yingyue", 0)；L6801：AddAbnormal(player, "@abnormal_sleep")
            player.removeMark('bts_yingyue', player.countMark('bts_yingyue'));
            lib.bts.api.addAbnormal(player, 'sleep', 1, player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_jingliu: '镜流',
    bts_st_tianhe: '天河',
    bts_st_tianhe_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择攻击范围内一名其他角色，获得1枚${get.poptip('bts_glossary_shuowang_faq')}并对其造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害；若你为${get.poptip('bts_glossary_xingqi_faq')}，额外获得1枚${get.poptip('bts_glossary_bless_yingyue_faq')}并附加1层${get.poptip('bts_glossary_bless_fatal_faq')}。`,
    bts_st_wuxia: '无罅',
    bts_st_wuxia_info: `扣减体力后，你可以弃置一张【杀】，获得1枚${get.poptip('bts_glossary_shuowang_faq')}。`,
    bts_st_zhuanpo: '转魄',
    bts_st_zhuanpo_info: `锁定技，回合结束时，若你拥有至少2枚${get.poptip('bts_glossary_shuowang_faq')}，进入${get.poptip('bts_glossary_bless_yingyue_faq')}并执行一个额外回合。`,
    bts_st_yingyue: '映月',
    bts_st_yingyue_info: `锁定技，${get.poptip('bts_glossary_bless_yingyue_faq')}状态的出牌阶段开始时，你移除1枚${get.poptip('bts_glossary_shuowang_faq')}并选择一名其他角色，对其造成${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害；其他角色可失去体力令伤害增加，结算后你附加${get.poptip('bts_glossary_abnormal_sleep_faq')}；${get.poptip('bts_glossary_shuowang_faq')}耗尽时退出${get.poptip('bts_glossary_bless_yingyue_faq')}。`,

    '$bts_st_tianhe1': "就让这一轮月华…",
    '$bts_st_tianhe2': "照彻万川！",
    '$bts_st_wuxia1': "飞光流泻！",
    '$bts_st_wuxia2': "剑出无回！",
    '$bts_st_zhuanpo1': "我以月色为剑",
    '$bts_st_zhuanpo2': "乘月返真",
    '$bts_st_yingyue1': "你无处可逃！",
    '$bts_st_yingyue2': "准备受死…",
    '~bts_jingliu': "终于，解脱了…",
};

export const simpleTranslate = {
    bts_st_tianhe_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+1${get.poptip('bts_glossary_shuowang_faq')}，对范围内目标霜伤；${get.poptip('bts_glossary_xingqi_faq')}额外+1${get.poptip('bts_glossary_bless_yingyue_faq')}和${get.poptip('bts_glossary_bless_fatal_faq')}`,
    bts_st_wuxia_info: `扣减体力后可弃杀+1${get.poptip('bts_glossary_shuowang_faq')}`,
    bts_st_zhuanpo_info: `锁；回合结束${get.poptip('bts_glossary_shuowang_faq')}≥2时进入${get.poptip('bts_glossary_bless_yingyue_faq')}并额外回合`,
    bts_st_yingyue_info: `锁；${get.poptip('bts_glossary_bless_yingyue_faq')}出牌开始消耗${get.poptip('bts_glossary_shuowang_faq')}造成${get.poptip('bts_glossary_bless_zengfu_faq')}霜伤并使自身${get.poptip('bts_glossary_abnormal_sleep_faq')}`,
};

export const pinyins = { bts_jingliu: 'jingliu' };
