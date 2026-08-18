// 希儿（源 animal.lua L4127-4234）—— 乱蝶必杀技增幅、再现击杀额外摸牌、归刃弃杀追击。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '量子·巡猎·惊风击雨之蝶'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('希儿')}是收割输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_glossary_abnormal_luandie_faq'))}${get.poptip('bts_glossary_bless_zengfu_faq')}伤害，${B('再现')}击杀后额外摸牌，${B('归刃')}摸牌阶段弃【杀】追击。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}时${get.poptip('bts_glossary_abnormal_luandie_faq')}会让目标持续附加${get.poptip('bts_glossary_abnormal_luandie_faq')}`;

export const character = {
    bts_xier: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_st_luandie', 'bts_st_zaixian', 'bts_st_guiren'],
    },
};

export const skill = {
    // ── 必杀技·乱蝶（源 st_luandie = SkillCard + ZeroCardViewAsSkill + DamageCaused，L4128-4167）──
    // 出牌阶段，失5怒气并选择一名其他角色（移除其拥有的乱蝶数代替失去等量的怒气），
    // 你附加1层增幅祝福，对其造成1点伤害；若你为星启，以此法对其造成伤害后，令其附加1层乱蝶。
    bts_st_luandie: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L4149-4155）：怒气≥5 或 某角色乱蝶数+怒气>4
            if (lib.bts.api.getAngry(player, 5)) return true;
            return game.hasPlayer(
                (target) =>
                    target !== player &&
                    lib.bts.api.getAbnor(target, 'luandie', -1) +
                        lib.bts.api.getAngry(player) >
                        4,
            );
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L4131）：目标 ≠ 自己且（目标乱蝶数+怒气）>4，
            // 保证所选目标能付得起 5-x 怒气（原实现只判 ≠ 自己，可低怒气选 0 乱蝶目标
            // 白嫖伤害与增幅祝福——loseAngry 走 removeMark 钳 0 不报错，已补逐目标条件）。
            return (
                target !== player &&
                lib.bts.api.getAbnor(target, 'luandie') +
                    lib.bts.api.getAngry(player) >
                    4
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_luandie');
            const target = event.targets[0];
            // 源 L4134-4138：x = min(5, 目标乱蝶数)，移除乱蝶并 LoseAngry(5-x)
            const x = Math.min(5, target.countMark('bts_abnormal_luandie'));
            if (lib.bts.api.getAbnor(target, 'luandie'))
                lib.bts.api.removeAbnormal(target, 'luandie', x);
            lib.bts.api.loseAngry(player, 5 - x); // 源 L4138：LoseAngry(5-x)
            // 源 L4139：AddBless(player, "@bless_zengfu")
            await lib.bts.api.addBless(player, 'zengfu');
            // 源 L4140：room:damage
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_luandie';
            await damage;
        },
        group: ['bts_st_luandie_nature'],
        subSkill: {
            nature: {
                // 源 L4163-4165：星启时乱蝶伤害后目标+1乱蝶
                trigger: { source: 'damageEnd' },
                filter(event, player) {
                    return (
                        lib.bts.api.god(player) &&
                        event.reason?.includes('bts_st_luandie') &&
                        !!event.player
                    );
                },
                async content(event, trigger, player) {
                    lib.bts.api.addAbnormal(trigger.player, 'luandie', 1, player); // 源 L4164：AddAbnormal(damage.to, "@abnormal_luandie")
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_luandie') ? -1 : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·再现（源 st_zaixian = TriggerSkill Compulsory Death/EventPhaseStart，L4169-4198）──
    // 当你杀死一名角色后，此回合结束时，你附加1层增幅祝福并执行额外的摸牌/出牌阶段；
    // 若于这些额外出牌阶段中发动必杀技杀死角色，则重复此流程（可连击）。
    bts_st_zaixian: {
        trigger: { source: 'dieAfter' },
        forced: true,
        filter(event, player) {
            // 源 L4172-4176：死亡角色 ≠ 你（你杀死他人）且须为伤害致死（death.damage）
            if (event.player === player || !event.reason) return false;
            // 源 L4171-4175：再现授予的额外出牌阶段期间（源置 st_zaixian flag）仅
            // 「必杀技击杀」续连击（reason 含 "max_"）。无名杀以额外阶段事件 .skill
            // 识别再现额外出牌阶段（extraPhase 传 turnName 'bts_st_zaixian'）替代 flag；
            // getExtraSkill() 返回当前额外回合 phase 的 .skill（= 'bts_st_zaixian'）；
            // 击杀是否必杀技由击杀伤害 reason 命中技能对象的 bts_bisha 终结技标签判定。
            if (lib.bts.api.getExtraSkill() === 'bts_st_zaixian') {
                const reason = event.reason?.reason; // dieAfter.reason = 致死事件（damage）→ .reason = 伤害原因串
                return !!reason && lib.skill[reason]?.bts_bisha === true;
            }
            return true; // 平时（源 flag 未置）任意击杀计
        },
        async content(event, trigger, player) {
            // 源 L4177：addPlayerMark(死亡来源, "st_zaixian")
            player.addMark('bts_st_zaixian', 1);
        },
        group: ['bts_st_zaixian_chase'],
        subSkill: {
            // 源 L4180-4190：回合结束（NotActive）时依击杀数逐一结算 ——
            // 每点击杀：AddBless(zengfu) + ExtraPhase(Draw) + ExtraPhase(Play)。
            // 连击（源 while mark>0 即时重判）：杀于额外出牌期间会再续一轮 → 无名杀
            // 于「希儿额外 Play 阶段结束」时重判 st_zaixain 标记决定是否续。
            chase: {
                trigger: { player: 'phaseAfter' },
                filter(event, player) {
                    if (!player.countMark('bts_st_zaixian')) return false;
                    const pl = event.phaseList;
                    // 兜底：无 phaseList（回合结束）视为可结算；或为希儿额外 Play 阶段结束（连环）
                    if (!Array.isArray(pl) || pl.length === 0) return true;
                    return pl.length >= 2 || (pl.length === 1 && pl[0] === 'phaseUse');
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_st_zaixian', 1);
                    // 源 L4186：AddBless(p, "@bless_zengfu")
                    await lib.bts.api.addBless(player, 'zengfu', 1);
                    // 源 L4187-4188：ExtraPhase(Draw)+ExtraPhase(Play) —— 真实阶段；
                    // turnName 'bts_st_zaixian' 供 dieAfter filter 经 phase.skill 识别「再现额外出牌阶段」
                    lib.bts.api.extraPhase(player, 'phaseDraw', null, 'bts_st_zaixian');
                    lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_st_zaixian');
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 触发技·归刃（源 st_guiren = TriggerSkill EventPhaseEnd Draw + OneCardViewAsSkill，L4200-4232）──
    // 摸牌阶段结束时，你可以弃置一张【杀】并选择一名其他角色，对其造成1点伤害，然后摸1张牌。
    bts_st_guiren: {
        trigger: { player: 'phaseDrawEnd' },
        filter(event, player) {
            // 源 L4228：摸牌阶段结束且手牌有【杀】可弃
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L4229：askForUseCard("@@st_guiren")
            const result = await player
                .chooseBool('归刃：是否弃置一张【杀】并选择一名其他角色？')
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
            const target = await player
                .chooseTarget(
                    '归刃：选择一名其他角色',
                    [1, 1],
                    (card, source, target) => target !== source,
                )
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            // 源 L4206：room:damage
            const damage = event.targets[0].damage(player, 1, 'nocard');
            damage.reason = 'bts_st_guiren';
            await damage;
            // 源 L4207：player:drawCards(1)
            await player.draw(player, 1);
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    bts_xier: '希儿',
    bts_st_luandie: '乱蝶',
    bts_st_luandie_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色（移除其拥有的${get.poptip('bts_glossary_abnormal_luandie_faq')}数代替失去等量的${get.poptip('bts_glossary_nuqi_faq')}），你附加1层${get.poptip('bts_glossary_bless_zengfu_faq')}，对其造成1点伤害，若你为${get.poptip('bts_glossary_xingqi_faq')}，以此法对其造成伤害后，令其附加1层${get.poptip('bts_glossary_abnormal_luandie_faq')}。`,
    bts_st_zaixian: '再现',
    bts_st_zaixian_info: `锁定技，当你杀死一名角色后，此回合结束时你进入一个额外的摸牌阶段和一个额外的出牌阶段，并各附加1层${get.poptip('bts_glossary_bless_zengfu_faq')}；若于上述额外出牌阶段中发动${get.poptip('bts_glossary_bisha_faq')}杀死一名角色，则再各进入一个（可连击）。`,
    bts_st_guiren: '归刃',
    bts_st_guiren_info:
        '摸牌阶段结束时，你可以弃置一张【杀】并选择一名其他角色，对其造成1点伤害，然后摸1张牌。',

    '$bts_st_luandie1': "这就让你解脱",
    '$bts_st_luandie2': "随蝴蝶一起消散吧，旧日的幻影",
    '$bts_st_zaixian1': "早点给你个痛快",
    '$bts_st_zaixian2': "下一个",
    '$bts_st_guiren1': "纠缠不清",
    '$bts_st_guiren2': "别来惹我",
    '~bts_xier': "我…还能……",
};

export const simpleTranslate = {
    bts_st_luandie_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}（可用目标${get.poptip('bts_glossary_abnormal_luandie_faq')}数抵扣）对1名其他角色造成1点伤害，+1${get.poptip('bts_glossary_bless_zengfu_faq')}（${get.poptip('bts_glossary_xingqi_faq')}令其+1${get.poptip('bts_glossary_abnormal_luandie_faq')}）`,
    bts_st_zaixian_info: `锁；杀死角色后回合结束进入额外摸牌+出牌阶段各1并+1${get.poptip('bts_glossary_bless_zengfu_faq')}，期间${get.poptip('bts_glossary_bisha_faq')}再杀可连击`,
    bts_st_guiren_info: '摸牌阶段结束，弃1杀对1名其他角色造成1点伤害并摸1张牌',
};

export const pinyins = { bts_xier: 'xier' };
