// 银枝（源 animal.lua L4514-4587）—— 尽美、公正与崇高。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
// 源 L4748：p:canDiscard(p,"h") —— 目标「he」牌能否被弃置。
// 引擎无 player.canDiscard，用 lib.filter.canBeDiscarded(card, 弃牌者, 持牌者)（library/index.js L11348）。
const canDiscardCards = (player, target) =>
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
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_sk_jinmei') ? -1 : 6,
            result: { target: -1 },
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
        ai: { noe: true },
    },
    bts_sk_chonggao: {
        trigger: { player: 'useCardToPlayered' },
        forced: true,
        filter(event) {
            return (
                event.card?.name === 'sha' ||
                event.card?.storage?.bts_sk_jinmei
            );
        },
        async content(event, trigger, player) {
            // trigger=useCardToPlayered 事件
            await lib.bts.api.addBless(player, 'shengge', trigger.targets?.length || 1);
            // 升格祝福达10层的消耗与回复怒气统一由规则结算器 addMark 处理（源 gamerule_ex
            // MarkChanged L1700-1704），此处不再内联，避免双重结算。
        },
        ai: { noe: true },
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
        // 达到至少10层时（源描述；源代码作被移除时——同族 7 处 gain 方向与描述相反
        // 的系统性笔误，2026-10-02 用户定夺按描述方向实现：监听 bts_mark_add，
        // 计数含本次增量；减少不再触发）。
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

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_shengge_faq',
        name: '升格祝福',
        info: `达到至少10层时，移除10层此${get.poptip('bts_glossary_bless_faq')}并回复1点${get.poptip('bts_glossary_nuqi_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}自然减少1层（减少不再触发）。`,
    },
];
