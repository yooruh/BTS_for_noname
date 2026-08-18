// 流萤（源 animal.lua L2642-2728）—— 火萤必杀技结束出牌阶段+满燃+额外回合、中枢伤害减免、天火炎伤或自损回怒。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xinghelieshou';
export const title = '火·毁灭·萨姆'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('流萤')}是爆发核心：${get.poptip('bts_glossary_bisha_faq')}${B('火萤')}牺牲出牌阶段换来${get.poptip('bts_glossary_bless_fullburn_faq')}与额外回合，${B('中枢')}在残血时减伤，${B('天火')}在有满燃时打出炎伤连锁、否则自损回怒。` +
    `<li>${get.poptip('bts_glossary_bless_fullburn_faq')}：对无手牌角色造成炎伤后其失去1体力`;

export const character = {
    bts_liuying: {
        sex: 'female',
        group: 'xinghelieshou',
        hp: 4,
        skills: ['bts_st_huoying', 'bts_st_tianhuo', 'bts_st_zhongshu'],
    },
};

export const skill = {
    // ── 必杀技·火萤（源 st_huoying = ZeroCardViewAsSkill target_fixed + EventPhaseStart，L2643-2676）──
    bts_st_huoying: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L2652-2666）用 "-time" 标记叠怒气成本但未封顶；
            // 源描述承诺"至多为2"，按描述补 cap（灼世死代码同款定夺：描述即意图）
            const n = Math.min(2, player.countMark('bts_st_huoying-time'));
            return (
                !lib.bts.api.getBless(player, 'fullburn') && lib.bts.api.getAngry(player, 3 + n)
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_huoying');
            const n = Math.min(2, player.countMark('bts_st_huoying-time'));
            lib.bts.api.loseAngry(player, 3 + n); // 源 LoseAngry(3+n)
            player.addMark('bts_st_huoying', 1);
            player.addMark('bts_st_huoying-time', 1);
            // 结束出牌阶段（源 Global_PlayPhaseTerminated）
            const phaseUse = _status.event.getParent('phaseUse');
            if (phaseUse) phaseUse.finish();
        },
        group: ['bts_st_huoying_after'],
        subSkill: {
            after: {
                trigger: { player: 'phaseJieshuBegin' }, // 源 NotActive 回合结束
                filter(event, player) {
                    return player.countMark('bts_st_huoying') > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_st_huoying',
                        player.countMark('bts_st_huoying'),
                    );
                    await lib.bts.api.addBless(player, 'fullburn', 2); // 源 AddBless(@bless_fullburn, 2)
                    lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 额外回合（由 resolver phaseAfter 结算）
                    game.log(player, '因【火萤】将执行一个额外回合');
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_huoying')
                    ? -1
                    : 6;
            },
            result: { player: 1 },
        },
    },

    // ── 触发技·天火（源 st_tianhuo = TriggerSkill EventPhaseStart + askForCard，L2677-2715）──
    // 出牌阶段开始时，可弃置一张【杀】：若无完全燃烧祝福，失去2点体力回复3点怒气；
    // 否则回复1点体力并选择一名角色，令其附加炎、弃其一张手牌（目标空手则跳过整段弃牌），
    // 然后弃所有烧伤/炎角色各一张手牌，对其造成1点炎属性伤害。
    // （已修正：原实现为 enable 主动技、出牌阶段任意时刻不限次；源为出牌阶段开始时触发
    //   一次（EventPhaseStart+Player_Play+askForCard），按用户定夺对齐源，改 trigger+cost）
    bts_st_tianhuo: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            // 源 L2687：出牌阶段开始且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L2687：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '天火：是否弃置一张【杀】发动「天火」？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            if (lib.bts.api.getBless(player, 'fullburn')) {
                await player.recover(player, 1); // 源 recover 1
                const r = await player
                    .chooseTarget(
                        '天火：选择一名角色',
                        [1, 1],
                        (card, p, t) => t !== p,
                    )
                    .forResult();
                if (!r.bool) return;
                const target = r.targets[0];
                await lib.bts.api.addNature(target, 'flame'); // 源 AddNature(target, "fire")
                // 源 L2697-2708：整段弃牌（目标 + 烧伤/炎角色）嵌套在「目标有手牌」内，
                // 目标空手则全部不弃（已修正：原实现把烧伤/炎角色弃牌放到判断外，目标空手仍弃）
                if (target.countCards('h') > 0) {
                    await target.chooseToDiscard(
                        '天火：弃置一张手牌',
                        'h',
                        1,
                        true,
                    );
                    for (const p of game.players) {
                        if (
                            p.isAlive() &&
                            (lib.bts.api.getAbnor(p, 'burn') ||
                                lib.bts.api.getNature(null, p) === 'flame') &&
                            p.countCards('h') > 0
                        ) {
                            await p.chooseToDiscard(
                                '天火：弃置一张手牌',
                                'h',
                                1,
                                true,
                            );
                        }
                    }
                }
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_tianhuo'; // 源 "st_tianhuo_fire"
                lib.bts.api.setDamageNature(damage, 'flame');
                await damage;
            } else {
                await player.loseHp(2); // 源 loseHp 2
                lib.bts.api.addAngry(player, 3); // 源 AddAngry 3
            }
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·中枢（源 st_zhongshu = TriggerSkill Compulsory DamageInflicted，L2716-2728）──
    bts_st_zhongshu: {
        trigger: { player: 'damageBegin2' },
        forced: true,
        filter(event, player) {
            return player.hp <= 1 && event.num > 0;
        },
        async content(event, trigger, player) {
            trigger.num -= 1; // 源 damage.damage - 1
        },
        // 手牌上限为体力上限（描述第二效果）
        mod: {
            maxHandcard(player, num) {
                return player.maxHp;
            },
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_liuying: '流萤',
    bts_st_huoying: '火萤',
    bts_st_huoying_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，若你没有${get.poptip('bts_glossary_bless_fullburn_faq')}，你可以失去3+X点${get.poptip('bts_glossary_nuqi_faq')}（X为你发动此技能结算完毕的次数且至多为2），结束此阶段，若如此做，此回合结束时，你附加2层${get.poptip('bts_glossary_bless_fullburn_faq')}，执行一个额外的回合。`,

    bts_st_zhongshu: '中枢',
    bts_st_zhongshu_info: `锁定技，当你受到伤害时，若你的体力值不大于1，伤害值-1；锁定技，你的手牌上限为${get.poptip('bts_glossary_bless_maxhp_faq')}。`,

    bts_st_tianhuo: '天火',
    bts_st_tianhuo_info: `出牌阶段开始时，你可以弃置一张【杀】，然后若你没有${get.poptip('bts_glossary_bless_fullburn_faq')}，失去2点体力，回复3点${get.poptip('bts_glossary_nuqi_faq')}，否则，你回复1点体力并选择一名角色，令其附加${get.poptip('bts_glossary_nature_yan_faq')}，弃置其一张手牌，然后弃置所有处于${get.poptip('bts_glossary_abnormal_burn_faq')}的角色和${get.poptip('bts_glossary_nature_yan_faq')}角色各一张手牌，对其造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}伤害。`,

    '$bts_st_huoying1': "飞萤扑火，向死而生",
    '$bts_st_huoying2': "我为自我而战，直至一切…燃烧殆尽！",
    '$bts_st_tianhuo1': "为战而生，为生而战！",
    '$bts_st_tianhuo2': "我将，点燃星海！",
    '$bts_st_zhongshu1': "这不止是一场战役",
    '$bts_st_zhongshu2': "我会为自己夺得胜利",
    '~bts_liuying': "任务……终止……",
};

export const simpleTranslate = {
    bts_st_huoying_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，若无满燃，失3+X${get.poptip('bts_glossary_nuqi_faq')}结束出牌阶段，回合结束+2满燃并执行额外回合`,
    bts_st_zhongshu_info: `锁；受到伤害时若体力≤1伤害-1；手牌上限=${get.poptip('bts_glossary_bless_maxhp_faq')}`,
    bts_st_tianhuo_info: `出牌阶段开始时，弃1张【杀】；无满燃则失2体力回3${get.poptip('bts_glossary_nuqi_faq')}，有满燃则回1体力令1名角色+炎并炎伤，且弃${get.poptip('bts_glossary_abnormal_burn_faq')}/炎角色各1手牌`,
};

export const pinyins = { bts_liuying: 'liuying' };
