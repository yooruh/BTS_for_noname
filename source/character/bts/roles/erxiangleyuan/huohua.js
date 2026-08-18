// 火花（源 animal.lua L11263-11323，V2.2 欢愉子系统）—— 狂欢、连线与花手。
// 技能：狂欢（必杀技·随机失体）、连线（出牌阶段欢愉行动+补手）、花手（欢愉行动后弃牌堆底5张）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '火·欢愉·狂欢企划'; // 称号
export const intro =
    `${B('火花')}点燃狂欢，用${get.poptip('bts_glossary_funnypoint_faq')}与${get.poptip('bts_glossary_bless_funny_faq')}赌一场大起大落。`;

export const character = {
    bts_ch_huohua: {
        isUnseen: true, // 欢愉体系
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_kuanghuan', 'bts_sk_lianxian_funny', 'bts_sk_huashou'],
    },
};

export const skill = {
    // ── 必杀技·狂欢（源 max_kuanghuan = SkillCard + ZeroCardViewAsSkill，L11264-11288）──
    // 出牌阶段，失5怒气并选择至少一名其他角色，各以 14.4%+（欢愉祝福×10%）令其失去4点体力。
    bts_sk_kuanghuan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L11285）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L11267）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_kuanghuan');
            lib.bts.api.loseAngry(player, 5); // 源 L11270：LoseAngry(player, 5)
            // 源 L11271-11274：各目标 FunnyNumber(14.4) → loseHp(4)
            for (const target of event.targets)
                if (lib.bts.api.funnyNumber(player, 14.4)) await target.loseHp(4);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_kuanghuan')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 主动技·连线（源 st_lianxian_funny = SkillCard target_fixed + ZeroCardViewAsSkill，L11289-11309）──
    // 出牌阶段限两次，执行欢愉行动，若手牌不足5张补至5张。
    bts_sk_lianxian_funny: {
        enable: 'phaseUse',
        usable: 2, // 源 enabled_at_play（L11306）：usedTimes("#st_lianxian_funny") < 2
        async content(event, trigger, player) {
            // 源 L11293-11300：FunnyAct(player)，成功且手牌<5 时补至5张（发动记录由引擎自动）。
            // afterFunnyAct（花手：+1笑点、弃牌堆底5张）由 funnyAct 内部统一出口调用
            //（见 utils.funnyAct 连线分支），此处不再显式调用，避免与 funnyTime（funny≠1）路径双触发。
            const done = await lib.bts.api.funnyAct(player);
            if (done && player.countCards('h') < 5)
                await player.draw(player, 5 - player.countCards('h'));
        },
        ai: { order: 4, result: { player: 1 } },
    },

    // ── 触发技·花手（源 st_huashou = TriggerSkill Damaged 空触发，L11317-11323）──
    // 半成品空技能；实际结算在 utils.js afterFunnyAct（欢愉行动后弃牌堆底5张）。
    bts_sk_huashou: {
        silent: true,
    },
};

export const translate = {
    bts_ch_huohua: '火花',
    bts_sk_kuanghuan: '狂欢',
    bts_sk_kuanghuan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各以 14.4%+（${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）的概率失去4点体力。`,
    bts_sk_lianxian_funny: '连线',
    bts_sk_lianxian_funny_info: `出牌阶段限两次，你可以执行欢愉行动，若手牌不足5张补至5张。欢愉行动：你弃置一张【杀】（若处于欢愉时刻则改为弃置牌）。`,
    bts_sk_huashou: '花手',
    bts_sk_huashou_info: '锁定技，当你执行欢愉行动后，弃置牌堆底五张牌。',
    '~bts_ch_huohua': '哼，不演了……',
};

export const simpleTranslate = {
    bts_sk_kuanghuan_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令目标各14.4%+倍祝福失4体力`,
    bts_sk_lianxian_funny_info: `限两次执行欢愉行动（弃杀），手牌补至5`,
    bts_sk_huashou_info: '欢愉行动后弃牌堆底5张',
};

export const pinyins = { bts_ch_huohua: 'huohua' };