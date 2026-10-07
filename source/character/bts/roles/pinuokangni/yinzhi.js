// 银枝（源 animal.lua L4514-4587）—— 尽美、公正与崇高。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
// 源 L4748：p:canDiscard(p,"h") —— 目标「he」牌能否被弃置。
// 引擎无 player.canDiscard，用 lib.filter.canBeDiscarded(card, 弃牌者, 持牌者)（library/index.js L11348）。
export const canDiscardCards = (player, target) =>
    target.getCards('he').some((card) =>
        lib.filter.canBeDiscarded(card, player, target),
    );

export const sort = 'pinuokangni';
export const title = '物理·智识·纯美骑士团的骑士'; // 属性·命途
export const intro = `${B('银枝')}用${get.poptip('bts_glossary_nuqi_faq')}二选一（缴械或通常伤害），杀和锦囊都能攒${get.poptip('bts_glossary_bless_shengge_faq')}。`;
export const character = {
    bts_ch_yinzhi: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_jinmei', 'bts_sk_gongzheng', 'bts_sk_chonggao'],
    },
};
export const skill = {
    bts_sk_jinmei: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 2);
        },
        filterTarget(event, player, target) {
            // 源 L4748：怒气≥4 或 目标「he」牌可弃（非 countCards）
            return (
                target !== player &&
                (lib.bts.api.getAngry(player, 4) ||
                    canDiscardCards(player, target))
            );
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_jinmei');
            // 源 on_use L4751-4756：任一无不可弃目标（且怒气≥4）→ 整批强制转4怒气伤害
            let n = 2;
            for (const target of event.targets) {
                if (
                    lib.bts.api.getAngry(player, 4) &&
                    !canDiscardCards(player, target)
                )
                    n = 4;
            }
            // 源 L4755：n=2 且怒气≥4 时询问 2/4 选一
            if (n === 2 && lib.bts.api.getAngry(player, 4)) {
                const choice = (
                    await player
                        .chooseControl('缴械（失2怒气）', '伤害（失4怒气）')
                        // AI 口径（源 AI StarRail-ai max_jinmei 的 choice）：怒气≥4 一律取伤害模式
                        //（多目标各1点直伤 > 各弃1张牌，代价多2怒气；进入此分支怒气必然≥4）
                        .set('ai', () => '伤害（失4怒气）')
                        .forResult()
                ).control;
                if (choice.includes('伤害')) n = 4;
            }
            lib.bts.api.loseAngry(player, n);
            for (const target of event.targets) {
                if (n === 4) {
                    const hurt = target.damage(player, 1, 'nocard');
                    hurt.reason = 'bts_sk_jinmei_bts_reason_common';
                    await hurt;
                } else if (canDiscardCards(player, target))
                    await player.discardPlayerCard(target, 'he', true);
            }
            // 源 L4818-4820 st_chonggao TargetSpecified：尽美指定目标后按目标数附加升格祝福
            //（无名杀尽美为直选 phaseUse 技能、不产生 useCard 事件，故在 content 内补崇高结算）
            await lib.bts.api.addBless(
                player,
                'shengge',
                event.targets.length,
                player,
            );
        },
        ai: {
            // AI 口径（源 AI StarRail-ai max_jinmei）：存在敌人，且怒气≥4（可转伤害）或怒气≥2 且不可
            // 弃牌敌人<2（缴械目标足够）时接；4怒伤害/2怒缴械的选面见 content 内联 ai。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_jinmei')) return -1;
                const enemies = game.filterPlayer(
                    (t) =>
                        t !== player &&
                        t.isAlive() &&
                        get.attitude(player, t) < 0,
                );
                if (!enemies.length) return -1;
                if (lib.bts.api.getAngry(player, 4)) return 6; // 4怒伤害模式
                const blocked = enemies.filter(
                    (t) => !canDiscardCards(player, t),
                ).length;
                if (blocked >= 2) return -1; // 缴械目标不足（源 AI：n<2 才出手）
                if (!enemies.some((t) => canDiscardCards(player, t))) return -1;
                return 5; // 2怒缴械模式
            },
            result: {
                // 敌方受损：缴械弃1张「he」牌（牌多更值）；可转伤害时残血目标优先
                target: (player, target) => {
                    let v = -1;
                    if (canDiscardCards(player, target))
                        v -= Math.min(2, target.countCards('he')) * 0.25;
                    else if (lib.bts.api.getAngry(player, 4)) v -= 0.5;
                    if (target.hp <= 1) v -= 1;
                    return v;
                },
            },
        },
    },
    bts_sk_gongzheng: {
        trigger: { player: 'useCardAfter' },
        forced: true,
        filter(event) {
            return get.type(event.card) === 'trick';
        },
        async content(event, trigger, player) {
            if (player.hasSkill('bts_sk_chonggao'))
                await lib.bts.api.addBless(player, 'shengge', game.countPlayer());
            for (const target of lib.bts.api.seatOrder(game.filterPlayer()))
                if (target.countCards('h'))
                    await player.discardPlayerCard(target, 'h', true);
        },
    },
    bts_sk_chonggao: {
        trigger: { player: 'useCardToPlayered' },
        forced: true,
        filter(event) {
            // 源 st_chonggao（TargetSpecified）：整次使用只结算一次，附加量=use.to:length()。
            // 无名杀 useCardToPlayered 逐目标派发 → 以 isFirstTarget 收敛为首目标时结算一次，
            // 否则 N 目标【杀】会 N×N 结算（尽美分支无 useCard 事件，已由 bts_sk_jinmei content 内补）。
            return event.isFirstTarget && event.card?.name === 'sha';
        },
        async content(event, trigger, player) {
            // trigger=useCardToPlayered（首目标实例）：按本次使用目标总数附加
            await lib.bts.api.addBless(player, 'shengge', trigger.targets?.length || 1);
            // 升格祝福达10层的消耗与回复怒气统一由规则结算器 addMark 处理（源 gamerule_ex
            // MarkChanged L1700-1704），此处不再内联，避免双重结算。
        },
    },
};
export const translate = {
    bts_ch_yinzhi: '银枝',
    bts_sk_jinmei: '尽美',
    bts_sk_jinmei_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去2点${get.poptip('bts_glossary_nuqi_faq')}并弃置至少一名其他角色一张牌；或失去4点${get.poptip('bts_glossary_nuqi_faq')}，对这些角色各造成1点通常伤害。`,
    bts_sk_gongzheng: '公正',
    bts_sk_gongzheng_info: `锁定技，当你使用锦囊牌结算后，弃置每名角色一张手牌；若你拥有${get.poptip('bts_sk_chonggao')}，获得等同于存活角色数的${get.poptip('bts_glossary_bless_shengge_faq')}。`,
    bts_sk_chonggao: '崇高',
    bts_sk_chonggao_info: `锁定技，当你使用【杀】或以${get.poptip('bts_sk_jinmei')}造成伤害指定目标后，获得等同于目标数的${get.poptip('bts_glossary_bless_shengge_faq')}。`,

    '$bts_sk_jinmei1': "再次见到那道光芒之前……",
    '$bts_sk_jinmei2': "银河中的一切美丽，我将捍卫至最后一刻",
    '$bts_sk_jinmei3': "……献给伊德莉拉",
    '$bts_sk_gongzheng1': "纯美，永驻",
    '$bts_sk_gongzheng2': "卑劣，消亡",
    '$bts_sk_chonggao1': "荣光在上",
    '$bts_sk_chonggao2': "就此向善吧",
    '~bts_ch_yinzhi': "没找到…「祂」……",
    bts_bless_shengge: '升格祝福',
    bts_bless_shengge_info: `来源：${get.poptip('bts_sk_gongzheng')}、${get.poptip('bts_sk_chonggao')}赋予；达到≥10层时移除10层回${get.poptip('bts_glossary_nuqi_faq')}；回合结束自然减少1层`,
};
export const simpleTranslate = {
    bts_sk_jinmei_info: `${get.poptip('bts_glossary_bisha_faq')}；失2${get.poptip('bts_glossary_nuqi_faq')}弃目标牌，或失4${get.poptip('bts_glossary_nuqi_faq')}对目标造成通常伤害`,
    bts_sk_gongzheng_info: `锁；锦囊后全场各弃1手牌，并可能获得${get.poptip('bts_glossary_bless_shengge_faq')}`,
    bts_sk_chonggao_info: `锁；杀或${get.poptip('bts_sk_jinmei')}指定目标后获得${get.poptip('bts_glossary_bless_shengge_faq')}`,
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_shengge: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_shengge_faq',
        // 达到至少10层时（源描述；源代码作被移除时——同族 7 处系统性笔误，定夺按描述方向实现：
        // 监听 bts_mark_add，计数含本次增量；减少不再触发）。
        trigger: { global: 'bts_mark_add' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.markName === 'bts_bless_shengge' &&
                lib.bts.api.getBless(player, 'shengge', 10)
            );
        },
        async content(event, trigger, player) {
            await lib.bts.api.removeBless(player, 'shengge', 10);
            lib.bts.api.addAngry(player);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_shengge_faq',
        name: '升格祝福',
        info: `达到至少10层时，移除10层此${get.poptip('bts_glossary_bless_faq')}并回复1点${get.poptip('bts_glossary_nuqi_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}自然减少1层（减少不再触发）。`,
    },
];
