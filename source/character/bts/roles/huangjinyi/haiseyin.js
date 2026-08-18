// 海瑟音（源 animal.lua L8486-8598）—— 绝海引爆与海妖赠牌。
// 技能：海曲（必杀技·附加绝海祝福）、海妖（他人出牌阶段弃牌令你摸牌，受伤后失效）、泛音（他人弃杀后赠绝海祝福）。
import { lib, game, get, _status, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '物理·虚无·奏浪的剑棋'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('海瑟音')}叠${get.poptip('bts_glossary_bless_haiqu_faq')}，打人或被打一轮就清掉场上的${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}；别人出牌时，也能用海妖、泛音搭把手。`;

export const character = {
    bts_haiseyin: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_haiqu', 'bts_st_haiyao', 'bts_st_fanyin'],
    },
};

export const skill = {
    // ── 必杀技·海曲（源 st_haiqu = SkillCard + ZeroCardViewAsSkill，L8487-8508）──
    // 出牌阶段，失5怒气，附加3层绝海祝福（组合形态时改为5层）。
    bts_st_haiqu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L8506）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_haiqu');
            lib.bts.api.loseAngry(player, 5); // 源 L8491：LoseAngry(player, 5)
            // 源 L8492-8496：n=3，组合形态（GetXiLian）时 +2，AddBless(@bless_haiqu, n)
            await lib.bts.api.addBless(
                player,
                'haiqu',
                player.hasSkill('bts_st_aishi') ? 5 : 3,
                player,
            );
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_haiqu')
                    ? -1
                    : 8;
            },
            result: { player: 2 },
        },
    },

    // ── 触发技·海妖（源 st_haiyao = TriggerSkill global EventPhaseStart/Damage，L8555-8576）──
    // 其他角色出牌阶段开始时，其可以弃置一张手牌令你摸一张牌；
    // 其以此法弃牌后首次受到伤害时，此效果对其失效（源为动态挂摘 "_give" 子技能，无名杀以标记近似）。
    bts_st_haiyao: {
        trigger: { global: 'phaseUseBegin' },
        filter(event, player) {
            // 源 L8561-8565：其他角色进入出牌阶段，且未失效（give_lose==0）
            const target = event.player;
            if (target === player) return false;
            // 源 enabled_at_play 用 hasUsed("#st_haiyao_give") 按回合限一次、每回合重新武装；
            // 无名杀以 bts_st_haiyao_used 标记近似，故每次出牌阶段开始时清除上轮使用记录（等效重挂）。
            if (target.countMark('bts_st_haiyao_used')) {
                target.removeMark(
                    'bts_st_haiyao_used',
                    target.countMark('bts_st_haiyao_used'),
                );
            }
            return (
                !target.countMark('bts_st_haiyao_lose') &&
                target.countCards('h') > 0
            );
        },
        async cost(event, trigger, player) {
            // 源 L8510-8522（st_haiyao_giveCard）：由出牌者（trigger.player）选一张手牌作代价
            // cost 只做选择；出牌者取消则技能干净不触发，避免「看似触发却没弃牌」
            const target = trigger.player;
            event.result = await target
                .chooseCard(
                    'h',
                    (card) => lib.filter.cardDiscardable(card, target),
                    `海妖：是否弃置一张手牌？`,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L8510-8512：先由在场海瑟音（player）同意，同意才弃当摸
            const target = trigger.player;
            if (!event.cards?.length) return; // cost 未弃牌则无效果
            const consent = await player
                .chooseBool(
                    `海妖：是否同意${get.translation(target)}弃置一张手牌并摸一张牌？`,
                )
                .set('ai', () => get.attitude(player, target) >= 0)
                .forResult();
            if (!consent.bool) return; // 海瑟音拒绝：不弃牌不摸
            await target.discard(event.cards); // 结算：真正弃牌（cost 已选择，弃牌移 content）
            target.addMark('bts_st_haiyao_used', 1, false);
            await target.draw(target, 1); // 源 L8512：出牌者 player 自己摸一张（弃一摸一）
        },
        group: ['bts_st_haiyao_lock'],
        subSkill: {
            lock: {
                // 源 L8569-8572：出牌者受到伤害后 detach "_give" 并标记 bts_st_haiyao_lose（失效）
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player &&
                        event.player !== player &&
                        event.player.countMark('bts_st_haiyao_used') &&
                        !event.player.countMark('bts_st_haiyao_lose') &&
                        event.num > 0
                    );
                },
                content(event, trigger, player) {
                    trigger.player.addMark('bts_st_haiyao_lose', 1); // trigger=damageEnd 事件
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 触发技·泛音（源 st_fanyin = TriggerSkill CardsMoveOneTime，L8578-8597）──
    // 其他角色于其出牌阶段弃置【杀】后，你可以令其获得1层海妖祝福。
    bts_st_fanyin: {
        trigger: { global: 'loseAfter' },
        filter(event, player) {
            // 源 L8589：其他角色于其出牌阶段（Play）从手牌弃置【杀】
            const lost = event.getl?.(event.player);
            return (
                event.type === 'discard' &&
                event.player &&
                event.player !== player &&
                _status.currentPhase === event.player &&
                lost?.hs?.some((card) => get.name(card) === 'sha')
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player; // trigger=loseAfter 事件
            // 源 L8591：AddBless(target, "@bless_haiyao", 1, p)（海妖祝福）
            const result = await player
                .chooseBool(
                    `泛音：是否令${get.translation(target)}获得1层海妖祝福？`,
                )
                .set('ai', () => get.attitude(player, target) > 0)
                .forResult();
            if (result.bool) {
                await lib.bts.api.addBless(target, 'haiyao', 1, player);
            }
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_haiseyin: '海瑟音',
    bts_st_haiqu: '海曲',
    bts_st_haiqu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，附加3层${get.poptip('bts_glossary_bless_haiqu_faq')}。`,
    bts_st_haiyao: '海妖',
    bts_st_haiyao_info:
        '其他角色出牌阶段开始时，其可以弃置一张手牌，经你同意后摸一张牌；其以此法弃牌后首次受到伤害时，此效果对其失效。',
    bts_st_fanyin: '泛音',
    bts_st_fanyin_info: `其他角色于其出牌阶段弃置【杀】后，你可以令其获得1层${get.poptip('bts_glossary_bless_haiyao_faq')}。`,
    bts_bless_haiqu: '绝海祝福',
    bts_bless_haiqu_info: `造成或受到伤害后，结算并移除全场${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}和${get.poptip('bts_glossary_zhongdu_faq')}；结束阶段开始时移除1层。`,
    bts_bless_haiyao: '海妖祝福',
    bts_bless_haiyao_info: `当你对其他角色造成伤害时，防止此伤害并令其附加1层${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}或${get.poptip('bts_glossary_zhongdu_faq')}（随机）。`,

    '$bts_st_haiqu1': "嘘，请在此驻足静听",
    '$bts_st_haiqu2': "这场永不餍足的深海欢宴中，来自各位的悲鸣",
    '$bts_st_haiyao1': "迷醉吧",
    '$bts_st_haiyao2': "张牙舞爪的虾蟹，还不足为惧",
    '$bts_st_fanyin1': "潮汐，与我沉沦",
    '$bts_st_fanyin2': "盛典，不醉不归",
    '~bts_haiseyin': "终究落幕了……",
};

export const simpleTranslate = {
    bts_st_haiqu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_haiqu_faq')}`,
    bts_st_haiyao_info: '别人出牌时可弃1手牌，你同意则其摸1；对方首次受伤后就不能再作为目标',
    bts_st_fanyin_info: `别人出牌阶段弃【杀】，可让他+1${get.poptip('bts_glossary_bless_haiyao_faq')}`,
};

export const pinyins = { bts_haiseyin: 'haiseyin' };
