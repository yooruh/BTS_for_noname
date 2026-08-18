// 丹恒（源 animal.lua L1740-1828）—— 三技能范式模板：
// 必杀技（零牌主动技，怒气门槛）+ 锁定触发技 + 转化技（弃杀发动）
// 技能命名：bts_ 前缀保留原 ID（st_/st_），便于对照 Lua 源码。
import {
    lib,
    game,
    ui,
    get,
    ai,
    _status,
    X,
    Y,
    Z,
    styleText,
    B,
    
} from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '风·巡猎·迷离过去的陌客'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('丹恒')}是反击型角色：${get.poptip('bts_glossary_nuqi_faq')}/${get.poptip('bts_glossary_bless_faq')}/${get.poptip('bts_glossary_hudun_faq')}供给时积累${B(get.poptip('bts_glossary_guantong_faq'))}，用【杀】转化的${B('疾雨')}触发${B(get.poptip('bts_glossary_abnormal_fossilize_faq'))}。` +
    `<li>尽量在受到供给后积攒${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}再输出，洞天对处于异常的目标伤害更高` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}（主公）时洞天击杀可获得额外回合`;

export const character = {
    bts_danheng: {
        sex: 'male',
        group: 'xingqionglieche',
        hp: 3,
        skills: ['bts_st_dongtian', 'bts_st_cunqiang', 'bts_st_jiyu'],
    },
};

export const skill = {
    // ── 必杀技·洞天（源 st_dongtian = ZeroCardViewAsSkill + SkillCard，L1744-1762）──
    bts_st_dongtian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return (
                target !== player &&
                get.distance(player, target) <= player.getAttackRange()
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_dongtian');
            const target = event.targets[0];
            if (!target) return;
            lib.bts.api.loseAngry(player, 3); // 源 L1752
            // 目标处于异常时伤害+1；reason 带 _fatal = 致命伤害（无法回怒气，见 resolver damageEnd）
            const num = lib.bts.api.getAbnor(target) ? 2 : 1; // 源 L1754
            const damage = target.damage(player, num, 'nocard');
            damage.reason = 'bts_st_dongtian_fatal';
            await damage;
            // 星启且击杀 → 回合结束后由全局结算器插入一个完整回合。
            if (lib.bts.api.god(player) && target.isDead()) {
                lib.bts.api.extraTurn(player, 'bts_extra_turn');
                game.log(player, '因星启将执行一个额外回合');
            }
        },
        ai: {
            order(item, player) {
                if (lib.bts?.aiGuard?.blocked(player, 'bts_st_dongtian'))
                    return -1;
                return lib.bts.api.getAngry(player) >= 5 ? 7 : 4;
            },
            threaten: 2.5,
            result: { player: 1, target: -2 },
            effect: {
                target(card, player, target, current) {
                    // 优先对处于异常的目标使用
                    if (lib.bts.api.getAbnor(target)) return [1, 2];
                },
            },
        },
    },

    // ── 锁定技·寸强（源 st_cunqiang = TriggerSkill Compulsory，L1766-1790）──
    bts_st_cunqiang: {
        trigger: {
            // 怒气/护盾由 lib.bts.api.addAngry/addShield 中的直接联动处理；
            // 此处保留其他角色令你回复体力或获得牌两类事件。
            player: ['recoverEnd', 'gainAfter'],
        },
        forced: true,
        filter(event, player, triggername) {
            if (lib.bts.api.getBless(player, 'through')) return false;
            if (triggername === 'recoverEnd') {
                // 其他角色令你回复体力（源 HpRecover: recover.who != player）
                return !!event.source && event.source !== player;
            }
            if (triggername === 'gainAfter') {
                // 其他角色令你获得牌（源 CardsMoveOneTime: from 存活且非自己）
                return !!event.source && event.source !== player;
            }
            return false;
        },
        async content(event, trigger, player) {
            lib.bts.api.addBless(player, 'through'); // 源 L1788（发动由引擎自动记录）
        },
        ai: { noe: true },
    },

    // ── 转化技·疾雨（源 st_jiyu = OneCardViewAsSkill + SkillCard + DamageCaused，L1792-1826）──
    bts_st_jiyu: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        }, // filter_pattern = Slash
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对攻击范围内的一名角色造成1点伤害',
        filterTarget(event, player, target) {
            return (
                target !== player &&
                get.distance(player, target) <= player.getAttackRange()
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_jiyu');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards); // 弃置所选【杀】
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_jiyu';
            await damage; // 源 L1805
            // 石化由子技能在 damageEnd 统一判定（仅"特殊伤害"才附加，源 L1821-1826）
        },
        group: ['bts_st_jiyu_fossilize'],
        subSkill: {
            fossilize: {
                trigger: { source: 'damageEnd' },
                filter(event, player) {
                    return (
                        !!event.reason?.includes('bts_st_jiyu') &&
                        lib.bts.api.isSpecialDamage(event, '_allspecial')
                    );
                },
                async content(event, trigger, player) {
                    if (trigger.player)
                        lib.bts.api.addAbnormal(trigger.player, 'fossilize', 1, player);
                },
                ai: { noe: true },
            },
        },
        ai: {
            order: 5,
            useful: 2,
            value: 5,
            result: { player: 1 },
            effect: {
                target(card, player, target, current) {
                    if (lib.bts.api.getAbnor(target)) return [1, 2]; // 目标有异常，疾雨价值翻倍
                },
            },
        },
    },
};

export const translate = {
    bts_danheng: '丹恒',
    bts_st_dongtian: '洞天',
    bts_st_dongtian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择攻击范围内的一名角色，对其造成1点${get.poptip('bts_glossary_bless_fatal_faq')}伤害（若其处于异常，伤害值+1），然后若其已死亡且你为${get.poptip('bts_glossary_xingqi_faq')}，此回合结束时，你执行一个额外的回合。`,
    bts_st_cunqiang: '寸强',
    bts_st_cunqiang_info: `锁定技，当其他角色令你回复${get.poptip('bts_glossary_nuqi_faq')}或体力，或附加${get.poptip('bts_glossary_hudun_faq')}，或获得牌后，若你没有${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}，你附加1层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}。`,
    bts_st_jiyu: '疾雨',
    bts_st_jiyu_info: `出牌阶段，你可以弃置一张【杀】并选择攻击范围内的一名角色，对其造成1点伤害，若如此做，当你以此法对其造成特殊伤害时，令其附加1层${get.poptip('bts_glossary_abnormal_fossilize_faq')}。`,

    '$bts_st_dongtian1': "生死虚实，一念之间",
    '$bts_st_dongtian2': "洞天幻化，长梦一觉…破！",
    '$bts_st_cunqiang1': "就是现在",
    '$bts_st_cunqiang2': "这样就万无一失了",
    '$bts_st_jiyu1': "争斗…并无意义",
    '$bts_st_jiyu2': "让开，我无意挑起争端",
    '~bts_danheng': "这…不可能……",
};

export const simpleTranslate = {
    bts_st_dongtian_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}对攻击范围内1名角色造成1点${get.poptip('bts_glossary_bless_fatal_faq')}伤害（目标异常则+1），若击杀且${get.poptip('bts_glossary_xingqi_faq')}，回合结束后执行额外回合`,
    bts_st_cunqiang_info: `锁；其他角色令你回${get.poptip('bts_glossary_nuqi_faq')}/体力、加${get.poptip('bts_glossary_hudun_faq')}或获得牌后，若无${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}则+1层${get.poptip('bts_glossary_guantong_faq')}`,
    bts_st_jiyu_info: `出牌阶段，弃1张【杀】对攻击范围内1名角色造成1点伤害；若造成特殊伤害则使其+1层${get.poptip('bts_glossary_abnormal_fossilize_faq')}`,
};

export const pinyins = { bts_danheng: 'danheng' };
