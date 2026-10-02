// 娜塔莎（源 animal.lua L3433-3500）—— 新生必杀技群体回复、生机锁定强化回复、救护弃杀给治愈。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '物理·丰饶·地火首领'; // 属性·命途
export const intro =
    `${B('娜塔莎')}是治疗核心：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_xinsheng'))}群体回复，${B(get.poptip('bts_sk_shengji'))}助体力≤1的角色多回血，${B(get.poptip('bts_sk_jiuhu'))}受伤后弃【杀】给${get.poptip('bts_glossary_bless_zhiyu_faq')}。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}时${get.poptip('bts_sk_xinsheng')}还给目标附加${get.poptip('bts_glossary_bless_zhiyu_faq')}`;

export const character = {
    bts_ch_natasha: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_xinsheng', 'bts_sk_shengji', 'bts_sk_jiuhu'],
    },
};

export const skill = {
    // ── 必杀技·新生（源 st_xinsheng = SkillCard + ZeroCardViewAsSkill，L3434-3461）──
    // 出牌阶段，失3怒气并选择至少一名其他角色，你与这些角色各回复1点体力；
    // 若你为星启，这些角色各附加1层治愈祝福。
    bts_sk_xinsheng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_xinsheng');
            lib.bts.api.loseAngry(player, 3); // 源 L3440：LoseAngry(player, 3)
            // 源 L3441：room:recover(player) —— 自己回复1点
            await player.recover(player, 1);
            // 源 L3442-3444：目标各回复1点
            for (const target of event.targets || []) await target.recover(player, 1);
            // 源 L3445-3449：星启时目标各附加1层治愈祝福
            // 平衡改动（2026-09-28 用户定夺）：出牌阶段叠 1 层会被当回合结束阶段自然衰减抹掉 → 改 2 层（源为 1）。
            if (lib.bts.api.god(player)) {
                for (const target of event.targets || [])
                    await lib.bts.api.addBless(target, 'zhiyu', 2, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_xinsheng')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: 1 },
        },
    },

    // ── 锁定技·生机（源 st_shengji = TriggerSkill Compulsory PreHpRecover，L3463-3479）──
    // 当你令一名体力值不大于1的角色回复体力时，其回复量+1。
    bts_sk_shengji: {
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
    // 当一名角色受到伤害后，你可以弃置一张【杀】，令其附加1层治愈祝福。
    bts_sk_jiuhu: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L3629-3648：findPlayersBySkillName 含受伤者本人，无自指排除
            //（源描述 L12931「当一名角色受到伤害后」，无「其他」）
            return (
                event.player &&
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
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_natasha_skin1': '皮肤1',
    'bts_ch_natasha_skin1': '皮肤1',
    bts_ch_natasha: '娜塔莎',
    bts_sk_xinsheng: '新生',
    bts_sk_xinsheng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各回复1点体力，若你为${get.poptip('bts_glossary_xingqi_faq')}，这些角色各附加2层${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    bts_sk_shengji: '生机',
    bts_sk_shengji_info:
        '锁定技，当你令一名体力值不大于1的角色回复体力时，其回复量+1。',

    bts_sk_jiuhu: '救护',
    bts_sk_jiuhu_info: `当一名角色受到伤害后，你可以弃置一张【杀】，令其附加1层${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    '$bts_sk_xinsheng1': "看来是赶上了",
    '$bts_sk_xinsheng2': "一点心意而已，不必在意",
    '$bts_sk_shengji1': "发现你了",
    '$bts_sk_shengji2': "你病得很重",
    '$bts_sk_jiuhu1': "吃药咯",
    '$bts_sk_jiuhu2': "不疼了吧",
    '~bts_ch_natasha': "我可是…医生啊……",
};

export const simpleTranslate = {
    bts_sk_xinsheng_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各回复1体力（${get.poptip('bts_glossary_xingqi_faq')}则目标各+2${get.poptip('bts_glossary_bless_zhiyu_faq')}）`,
    bts_sk_shengji_info: '锁；你令体力≤1的角色回复体力时回复量+1',
    bts_sk_jiuhu_info: `角色受伤后，弃1张【杀】令其+1${get.poptip('bts_glossary_bless_zhiyu_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
