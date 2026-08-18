// 娜塔莎（源 animal.lua L3433-3500）—— 新生必杀技群体回复、生机锁定强化回复、救护弃杀给治愈。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '物理·丰饶·地火首领'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('娜塔莎')}是治疗核心：${get.poptip('bts_glossary_bisha_faq')}${B('新生')}群体回复，${B('生机')}助体力≤1的角色多回血，${B('救护')}受伤后弃【杀】给${get.poptip('bts_glossary_bless_zhiyu_faq')}。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}时新生还给目标附加${get.poptip('bts_glossary_bless_zhiyu_faq')}`;

export const character = {
    bts_natasha: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_st_xinsheng', 'bts_st_shengji', 'bts_st_jiuhu'],
    },
};

export const skill = {
    // ── 必杀技·新生（源 st_xinsheng = SkillCard + ZeroCardViewAsSkill，L3434-3461）──
    // 出牌阶段，失3怒气并选择至少一名其他角色，你与这些角色各回复1点体力；
    // 若你为星启，这些角色各附加1层治愈祝福。
    bts_st_xinsheng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L3459）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L3437）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xinsheng');
            lib.bts.api.loseAngry(player, 3); // 源 L3440：LoseAngry(player, 3)
            // 源 L3441：room:recover(player) —— 自己回复1点
            await player.recover(player, 1);
            // 源 L3442-3444：目标各回复1点
            for (const target of event.targets || []) await target.recover(player, 1);
            // 源 L3445-3449：星启时目标各附加1层治愈祝福
            if (lib.bts.api.god(player)) {
                for (const target of event.targets || [])
                    await lib.bts.api.addBless(target, 'zhiyu', 1, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xinsheng')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: 1 },
        },
    },

    // ── 锁定技·生机（源 st_shengji = TriggerSkill Compulsory PreHpRecover，L3463-3479）──
    // 当你令一名体力值不大于1的角色回复体力时，其回复量+1。
    bts_st_shengji: {
        trigger: { source: 'recoverBegin' },
        forced: true,
        filter(event, player) {
            // 源 L3469：目标体力≤1
            return event.player.hp <= 1 && event.num > 0;
        },
        async content(event, trigger, player) {
            // 源 L3472：recover.recover + 1
            trigger.num += 1;
        },
        ai: { noe: true },
    },

    // ── 触发技·救护（源 st_jiuhu = TriggerSkill Damaged，L3481-3499）──
    // 当一名其他角色受到伤害后，你可以弃置一张【杀】，令其附加1层治愈祝福。
    bts_st_jiuhu: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L3489：其他角色受伤且手牌有【杀】可弃
            return (
                event.player &&
                event.player !== player &&
                event.num > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L3489：askForCard(p, "Slash")
            const result = await player
                .chooseBool(
                    '救护：是否弃置一张【杀】令' +
                        get.translation(trigger.player) +
                        '附加1层治愈祝福？',
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
            // trigger=触发事件（damageEnd）；trigger.player = 受伤者
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            await lib.bts.api.addBless(trigger.player, 'zhiyu', 1, player); // 源 L3492：AddBless(player=受伤者, "@bless_zhiyu", 1, p)
        },
        ai: { result: { player: 1, target: 1 } },
    },
};

export const translate = {
    bts_natasha: '娜塔莎',
    bts_st_xinsheng: '新生',
    bts_st_xinsheng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各回复1点体力，若你为${get.poptip('bts_glossary_xingqi_faq')}，这些角色各附加1层${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    bts_st_shengji: '生机',
    bts_st_shengji_info:
        '锁定技，当你令一名体力值不大于1的角色回复体力时，其回复量+1。',

    bts_st_jiuhu: '救护',
    bts_st_jiuhu_info: `当一名其他角色受到伤害后，你可以弃置一张【杀】，令其附加1层${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    '$bts_st_xinsheng1': "看来是赶上了",
    '$bts_st_xinsheng2': "一点心意而已，不必在意",
    '$bts_st_shengji1': "发现你了",
    '$bts_st_shengji2': "你病得很重",
    '$bts_st_jiuhu1': "吃药咯",
    '$bts_st_jiuhu2': "不疼了吧",
    '~bts_natasha': "我可是…医生啊……",
};

export const simpleTranslate = {
    bts_st_xinsheng_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各回复1体力（${get.poptip('bts_glossary_xingqi_faq')}则目标+1${get.poptip('bts_glossary_bless_zhiyu_faq')}）`,
    bts_st_shengji_info: '锁；你令体力≤1的角色回复体力时回复量+1',
    bts_st_jiuhu_info: `其他角色受伤后，弃1张【杀】令其+1${get.poptip('bts_glossary_bless_zhiyu_faq')}`,
};

export const pinyins = { bts_natasha: 'natasha' };
