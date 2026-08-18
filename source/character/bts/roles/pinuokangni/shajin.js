// 砂金（源 animal.lua L4877-4982）—— 赌注与护盾。
// 技能：勋爵（必杀技·恐惧+判定得赌注+星启全场加盾）、宾果（护盾角色受伤积赌注/异常加盾/7赌注群杀）、基石（准备阶段弃杀加盾）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'pinuokangni';
export const title = '虚数·存护·「石心十人」之一'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('砂金')}靠护盾角色受伤攒${get.poptip('bts_glossary_duzhu_faq')}，攒满7枚用赌注砸群体杀。`;

export const character = {
    bts_shajin: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_xunjue', 'bts_st_binguo', 'bts_st_jishil'],
    },
};

export const skill = {
    // ── 必杀技·勋爵（源 st_xunjue = SkillCard + ZeroCardViewAsSkill，L4878-4913）──
    // 出牌阶段，失5怒气，令攻击范围内一名有牌角色附加1层恐惧，判定并获等同点数一半（向上取整）的赌注；
    // 若你为星启，所有拥有护盾的角色各获得1点护盾。
    bts_st_xunjue: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L4911）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L4884）：目标 ≠ 自己、不空区域、在攻击范围内
            return target !== player && player.inRange(target) && target.countCards('hej');
        },
        selectTarget: 1,
        logTarget: 'player',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xunjue');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L4887：LoseAngry(player, 5)
            // 源 L4888：AddAbnormal(targets[1], "@abnormal_scary", 1, player)
            lib.bts.api.addAbnormal(target, 'scary', 1, player);
            // 源 L4889-4894：判定并获 ceil(点数/2) 赌注
            const judge = await player.judge().forResult();
            player.addMark('bts_duzhu', Math.ceil((judge.number || 0) / 2));
            // 源 L4895-4901：星启时所有拥有护盾的角色各+1护盾
            if (lib.bts.api.god(player))
                for (const candidate of game.filterPlayer((candidate) =>
                    lib.bts.api.getShield(candidate),
                ))
                    lib.bts.api.addShield(candidate, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xunjue') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·宾果（源 st_binguo = TriggerSkill Compulsory DamageInflicted，L4915-4947）──
    // 拥有护盾的角色受到伤害时，你获得1枚赌注；异常伤害额外令其获得等同伤害值的护盾；
    // 赌注达到7枚时弃7枚，对伤害来源及伤害关联角色视为使用【杀】。
    bts_st_binguo: {
        trigger: { global: 'damageBegin2' },
        forced: true,
        filter(event, player) {
            // 源 L4922：受伤者拥有护盾
            return event.player && lib.bts.api.getShield(event.player);
        },
        async content(event, trigger, player) {
            // 源 L4924：p:gainMark("@duzhu")
            player.addMark('bts_duzhu', 1);
            // 源 L4925-4927：异常伤害（reason 含 "abnormal"）→ 受伤者获得等同伤害值的护盾（trigger=damageBegin2 事件）
            if (trigger.reason?.includes('abnormal'))
                lib.bts.api.addShield(trigger.player, trigger.num, player);
            // 源 L4928-4939：赌注>6 时弃7枚，对「本次伤害来源 + 曾伤过受伤者/砂金的角色」视为使用【杀】
            // （DamageLink 记在来源上、键=被伤者，与 bts_damage_link_ 同向；原实现误打全体其他角色，已按原版收窄）
            if (player.countMark('bts_duzhu') >= 7) {
                player.removeMark('bts_duzhu', 7);
                const targets = [];
                const seen = new Set();
                if (
                    trigger.source &&
                    trigger.source.isAlive() &&
                    trigger.source !== player
                ) {
                    targets.push(trigger.source);
                    seen.add(trigger.source.playerid);
                }
                for (const candidate of game.filterPlayer(
                    (candidate) =>
                        candidate !== player &&
                        candidate.isAlive() &&
                        (candidate.countMark(
                            `bts_damage_link_${trigger.player.playerid}`,
                        ) > 0 ||
                            candidate.countMark(
                                `bts_damage_link_${player.playerid}`,
                            ) > 0),
                )) {
                    if (!seen.has(candidate.playerid)) {
                        targets.push(candidate);
                        seen.add(candidate.playerid);
                    }
                }
                if (targets.length)
                    await player.useCard({ name: 'sha', isCard: true }, targets);
            }
        },
        ai: { noe: true },
    },

    // ── 触发技·基石（源 st_jishil = TriggerSkill EventPhaseStart Start + OneCardViewAsSkill，L4949-4981）──
    // 准备阶段开始时，可弃置一张【杀】，令一名角色获得1点护盾。
    bts_st_jishil: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L4977：准备阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L4978：askForUseCard("@@st_jishil") —— 弃【杀】选目标
            event.result = await player
                .chooseCardTarget({
                    prompt: '基石：弃置一张【杀】令一名角色获得1点护盾',
                    position: 'h',
                    filterCard: (card) => get.name(card) === 'sha',
                    filterTarget: () => true,
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选目标/牌在技能事件 event.targets/event.cards（标准约定）
            // 源 L4952：弃【杀】
            await player.discard(event.cards);
            // 源 L4955：AddAShield(targets[1], player)
            lib.bts.api.addShield(event.targets[0], 1, player);
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_shajin: '砂金',
    bts_st_xunjue: '勋爵',
    bts_st_xunjue_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令攻击范围内一名有牌角色附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}并判定，获得等同于判定点数一半（向上取整）的${get.poptip('bts_glossary_duzhu_faq')}标记，若你为${get.poptip('bts_glossary_xingqi_faq')}，令所有拥有${get.poptip('bts_glossary_hudun_faq')}的角色各附加1层${get.poptip('bts_glossary_hudun_faq')}。`,
    bts_st_binguo: '宾果',
    bts_st_binguo_info: `锁定技，拥有${get.poptip('bts_glossary_hudun_faq')}的角色受到伤害时，你获得1枚${get.poptip('bts_glossary_duzhu_faq')}；异常伤害额外令其获得等同伤害值的${get.poptip('bts_glossary_hudun_faq')}；${get.poptip('bts_glossary_duzhu_faq')}达到7枚时弃7枚，视为对本次伤害来源和所有对你或其造成过伤害的角色使用【杀】。`,
    bts_st_jishil: '基石',
    bts_st_jishil_info: `准备阶段开始时，你可以弃置一张【杀】，令一名角色获得1点${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_st_xunjue1': "骰子已经掷下",
    '$bts_st_xunjue2': "一无所有？或者，赢下所有！",
    '$bts_st_binguo1': "小心头顶！",
    '$bts_st_binguo2': "全部买入！",
    '$bts_st_jishil1': "全押了，我买单",
    '$bts_st_jishil2': "不用问，随便花",
    '~bts_shajin': "满盘皆输啊…",
};

export const simpleTranslate = {
    bts_st_xunjue_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}施加${get.poptip('bts_glossary_abnormal_scary_faq')}并判定获得${get.poptip('bts_glossary_duzhu_faq')}（${get.poptip('bts_glossary_xingqi_faq')}时全场+1${get.poptip('bts_glossary_hudun_faq')}）`,
    bts_st_binguo_info: `锁；${get.poptip('bts_glossary_hudun_faq')}角色受伤时+${get.poptip('bts_glossary_duzhu_faq')}，7枚后对来源与伤害关联者用杀`,
    bts_st_jishil_info: `准备阶段可弃杀令1名角色+1${get.poptip('bts_glossary_hudun_faq')}`,
};

export const pinyins = { bts_shajin: 'shajin' };
