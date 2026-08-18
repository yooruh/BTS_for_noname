// Saber（源 animal.lua L9249-9379）—— 圣剑、风王与炉心。
// 技能：圣剑（必杀技·风伤+圣剑状态+决斗转化）、风王（弃杀风伤累积炉心）、炉心（发动必杀技后+1炉心）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '风·毁灭·亚瑟王'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('Saber')}用圣剑把【杀】当【决斗】用，靠风王攒炉心。`;

export const character = {
    bts_saber: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_shengjian', 'bts_st_fengwang', 'bts_st_luxin'],
    },
};

export const skill = {
    // ── 必杀技·圣剑（源 st_shengjian = SkillCard + ZeroCardViewAsSkill，L9264-9327）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点风属性通常伤害，获得圣剑状态
    // （手牌【杀】当【决斗】，使用【决斗】后解除，源 #shengjian_buff）。
    bts_st_shengjian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9298）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9267）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_shengjian');
            lib.bts.api.loseAngry(player, 5); // 源 L9270：LoseAngry(player, 5)
            // 源 L9271-9273：星启时附加贯通祝福
            if (lib.bts.api.god(player)) await lib.bts.api.addBless(player, 'through');
            for (const target of event.targets) {
                // 源 L9275：reason 含 "_wind_common"（风属性 + 通常伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_shengjian_common_wind';
                lib.bts.api.setDamageNature(damage, 'wind');
                await damage;
            }
            // 源 L9277-9279：addPlayerMark(st_shengjian) + acquireSkill("#shengjian_buff")
            //（圣剑状态：手牌【杀】当【决斗】，使用【决斗】后解除）
            player.addMark('bts_shengjian', 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_shengjian')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 主动技·风王（源 st_fengwang = OneCardViewAsSkill + SkillCard，L9329-9360）──
    // 出牌阶段限一次，弃置一张【杀】，对攻击范围内一名其他角色造成1点风属性伤害；累积炉心。
    bts_st_fengwang: {
        enable: 'phaseUse',
        usable: 1, // 源 enabled_at_play（L9358）：not hasUsed("#st_fengwang")
        filterCard: (card) => get.name(card) === 'sha', // 源 filter_pattern = "Slash"
        position: 'h',
        selectCard: 1,
        filterTarget(card, player, target) {
            // 源 Card filter（L9337）：目标 ≠ 自己且在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_fengwang');
            const target = event.targets[0];
            await player.discard(event.cards); // 源 L9352-9353：addSubcard 弃【杀】
            // 源 L9340：reason 含 "_wind" 的风属性伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_fengwang_wind';
            lib.bts.api.setDamageNature(damage, 'wind');
            await damage;
            // 源 L9341-9346：炉心<3 +1；=3 则弃3回怒
            if (player.countMark('bts_st_luxin') < 3) player.addMark('bts_st_luxin', 1);
            else {
                player.removeMark('bts_st_luxin', 3);
                lib.bts.api.addAngry(player); // 源 L9345：AddAngry(player)
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_fengwang') ? -1 : 5;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·炉心（源 st_luxin = TriggerSkill Compulsory CardUsed，L9362-9377）──
    // 你发动必杀技（st_ 技能）后，获得1枚炉心标记。
    bts_st_luxin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        trigger: { player: 'useSkillAfter' },
        forced: true,
        filter(event) {
            // 源 L9368：使用 SkillCard 且技能名含 "max_"（必杀技）；
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）
            return lib.skill[event.skill]?.bts_bisha === true;
        },
        content(event, trigger, player) {
            // 源 L9371：p:gainMark("@st_luxin", 1)
            player.addMark('bts_st_luxin', 1);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_saber: 'Saber',
    bts_st_shengjian: '圣剑',
    bts_st_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对至少一名其他角色各造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}通常伤害，并获得圣剑状态。`,
    bts_st_fengwang: '风王',
    bts_st_fengwang_info: `出牌阶段，你可以弃置一张【杀】，对攻击范围内一名其他角色造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}伤害，累积炉心。`,
    bts_st_luxin: '炉心',
    bts_st_luxin_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}后，获得1枚炉心标记。`,

    '$bts_st_shengjian1': "以星辰之光点亮大地",
    '$bts_st_shengjian2': "Excalibur！",
    '$bts_st_fengwang1': "敌寇，看剑！",
    '$bts_st_fengwang2': "圣剑，解放！",
    '$bts_st_luxin1': "燃烧吧，骑士之志！",
    '$bts_st_luxin2': "飞舞吧，风暴！",
    '~bts_saber': "抱歉…御主，我有负所托……",
};

export const simpleTranslate = {
    bts_st_shengjian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色各造成${get.poptip('bts_glossary_nature_feng_dmg_faq')}通常伤害`,
    bts_st_fengwang_info: '出牌阶段弃杀对范围内角色造成风伤并攒炉心',
    bts_st_luxin_info: `锁；发动${get.poptip('bts_glossary_bisha_faq')}后+1炉心`,
};

export const pinyins = { bts_saber: 'saber' };
