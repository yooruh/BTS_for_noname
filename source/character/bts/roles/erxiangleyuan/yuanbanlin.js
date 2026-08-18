// 远坂凛（源 animal.lua L10033-10125）—— 宝石与概率实验。
// 技能：明薪（必杀技·暗属性+诅咒，星启额外宝石与回合）、实验（弃手牌消耗宝石概率暗伤）、魔术（他人弃杀得宝石+致命祝福）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '量子·智识·天才少女'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('远坂凛')}拿${get.poptip('bts_glossary_magic_diamond_faq')}赌一把：手牌或宝石够多，就清光手牌去赌${get.poptip('bts_glossary_nature_dark_faq')}伤害；别人弃【杀】，她顺手再收一波${get.poptip('bts_glossary_magic_diamond_faq')}。`;

export const character = {
    bts_yuanbanlin: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_mingxin', 'bts_st_shiyan', 'bts_st_moshu'],
    },
};

export const skill = {
    // ── 必杀技·明薪（源 st_mingxin = SkillCard + ZeroCardViewAsSkill，L10034-10061）──
    // 出牌阶段，失5怒气，令任意名其他角色附加暗属性与1层诅咒；若你为星启，获得24枚宝石并执行额外回合。
    bts_st_mingxin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L10059）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10037）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_mingxin');
            lib.bts.api.loseAngry(player, 5); // 源 L10040：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L10042-10043：AddNature(p, "dark") + AddACurse(p, player)
                await lib.bts.api.addNature(target, 'dark');
                lib.bts.api.addCurse(target, 1);
            }
            await player.draw(player);
            if (lib.bts.api.god(player)) {
                // 源 L10046-10048：星启时获得24枚宝石 + extra_draw + extra_play
                //（无名杀以「摸一张 + 额外回合」近似 extra_draw/extra_play）
                player.addMark('magic_diamond', 24);
                lib.bts.api.extraTurn(player, 'bts_extra_turn');
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_mingxin')
                    ? -1
                    : 9;
            },
            result: { target: -1 },
        },
    },

    // ── 主动技·实验（源 st_shiyan = SkillCard + ZeroCardViewAsSkill，L10063-10097）──
    // 手牌≥7或宝石≥15时，弃置所有手牌，每消耗3枚宝石以7%起始概率对目标造成暗属性通常伤害，
    // 失败则概率翻倍；最后摸两张牌并结束出牌阶段。
    bts_st_shiyan: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L10095）：手牌数>7 或 宝石>15
            return player.countCards('h') >= 7 || player.countMark('magic_diamond') >= 15;
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10066）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_shiyan');
            // 源 L10069：gainMark("@magic_diamond", 2*subcardsLength)
            // 注：源版弃置的每张手牌先转化为2枚宝石；无名杀版直接消耗已有宝石（简化）。
            const cards = player.getCards('h');
            if (cards.length) await player.discard(cards);
            let chance = 7; // 源 L10070：起始概率7%
            // 源 L10072：while 宝石>2 → 每轮消耗3枚，对目标按概率造成伤害
            while (player.countMark('magic_diamond') >= 3) {
                player.removeMark('magic_diamond', 3);
                let success = false;
                for (const target of event.targets.filter((target) => target.isAlive()))
                    if (Math.random() * 100 <= chance) {
                        // 源 L10076：reason 含 "_common_dark"（通常伤害 + 暗属性）
                        const damage = target.damage(player, 1, 'nocard');
                        damage.reason = 'bts_st_shiyan_common_dark';
                        lib.bts.api.setDamageNature(damage, 'dark');
                        await damage;
                        success = true;
                    }
                chance = success ? 7 : chance * 2; // 源 L10081：失败概率翻倍，命中重置
            }
            await player.draw(player, 2); // 源 L10083：摸两张牌
            player.skip('phaseUse'); // 源 L10084：Global_PlayPhaseTerminated 结束出牌阶段
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_shiyan')
                    ? -1
                    : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·魔术（源 st_moshu = TriggerSkill CardsMoveOneTime，L10099-10124）──
    // 一名其他角色弃置【杀】后，你可以获得其数量两倍的宝石；若其没有致命祝福，令其附加2层。
    bts_st_moshu: {
        trigger: { global: 'loseAfter' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L10106-10109：其他角色因弃置而从手牌失去【杀】
            return (
                event.type === 'discard' &&
                event.player &&
                event.player !== player &&
                event.getl?.(event.player)?.hs?.some((card) => get.name(card) === 'sha')
            );
        },
        async content(event, trigger, player) {
            // trigger = loseAfter 事件（弃【杀】者在其 .player、弃置详情用 trigger.getl）
            const target = trigger.player;
            const count = trigger
                .getl(target)
                .hs.filter((card) => get.name(card) === 'sha').length;
            // 源 L10114：askForSkillInvoke —— 询问是否发动
            const result = await player
                .chooseBool(
                    `魔术：是否获得${count * 2}枚宝石并令${get.translation(target)}获得致命祝福？`,
                )
                .set('ai', () => get.attitude(player, target) > 0)
                .forResult();
            if (!result.bool) return;
            // 源 L10116：p:gainMark("@magic_diamond", 2*n)
            player.addMark('magic_diamond', count * 2);
            // 源 L10117-10119：目标无致命祝福时附加2层
            if (!lib.bts.api.getBless(target, 'fatal'))
                await lib.bts.api.addBless(target, 'fatal', 2, player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_yuanbanlin: '远坂凛',
    bts_st_mingxin: '明薪',
    bts_st_mingxin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，各附加${get.poptip('bts_glossary_nature_dark_faq')}和1层诅咒；若你为${get.poptip('bts_glossary_xingqi_faq')}，获得24枚${get.poptip('bts_glossary_magic_diamond_faq')}并执行额外回合。`,
    bts_st_shiyan: '实验',
    bts_st_shiyan_info: `出牌阶段，若你拥有至少7张手牌或15枚${get.poptip('bts_glossary_magic_diamond_faq')}，可以弃置所有手牌并选择至少一名其他角色，消耗${get.poptip('bts_glossary_magic_diamond_faq')}以7%起始概率造成${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害；失败时下次概率翻倍，最后摸两张牌并结束出牌阶段。`,
    bts_st_moshu: '魔术',
    bts_st_moshu_info: `一名其他角色弃置【杀】后，你可以获得其数量两倍的${get.poptip('bts_glossary_magic_diamond_faq')}，若其没有${get.poptip('bts_glossary_bless_fatal_faq')}，令其附加2层${get.poptip('bts_glossary_bless_fatal_faq')}。`,
    magic_diamond: '宝石',

    '$bts_st_mingxin1': "伊什塔尔！（拿去吧~）",
    '$bts_st_mingxin2': "为我所用吧—— An Gal Ta Ki Gal Šè！",
    '$bts_st_shiyan1': "无限之旅路——于此集结！",
    '$bts_st_shiyan2': "镜对镜的光芒——穿透无限！",
    '$bts_st_moshu1': "宝石剑！",
    '$bts_st_moshu2': "闪耀吧！",
    '~bts_yuanbanlin': "宝石…耗尽了么……",
};

export const simpleTranslate = {
    bts_st_mingxin_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}群体${get.poptip('bts_glossary_nature_dark_faq')}+诅咒，${get.poptip('bts_glossary_xingqi_faq')}送${get.poptip('bts_glossary_magic_diamond_faq')}额外回合`,
    bts_st_shiyan_info: `手牌/${get.poptip('bts_glossary_magic_diamond_faq')}够数就清手牌，烧${get.poptip('bts_glossary_magic_diamond_faq')}赌${get.poptip('bts_glossary_nature_dark_faq')}暗伤`,
    bts_st_moshu_info: `别人弃【杀】你能拿双倍${get.poptip('bts_glossary_magic_diamond_faq')}，顺手送他${get.poptip('bts_glossary_bless_fatal_faq')}`,
};

export const pinyins = { bts_yuanbanlin: 'yuanbanlin' };
