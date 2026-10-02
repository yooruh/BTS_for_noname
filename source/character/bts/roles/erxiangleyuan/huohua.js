// 火花（源 animal.lua L11263-11323，V2.2 欢愉子系统）—— 狂欢、连线与花手。
// 技能：狂欢（必杀技·随机失体）、连线（出牌阶段欢愉行动+补手）、花手（欢愉行动后弃牌堆底5张）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '火·欢愉·狂欢企划'; // 称号
export const intro =
    `${B('火花')}点燃${get.poptip('bts_sk_kuanghuan')}，用${get.poptip('bts_glossary_funnypoint_faq')}与${get.poptip('bts_glossary_bless_funny_faq')}赌一场大起大落。`;

export const character = {
    bts_ch_huohua: {
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
            // funnyAct 按各技能的 bts_funny 注册表逐条执行（本技能效果即下表连线项）；
            // afterFunnyAct（花手）由 funnyAct 收束步统一触发，此处不再显式调用，
            // 避免与 funnyTime（funny≠1）路径双触发（端口既定语义，连线项勿设 after=false）。
            // initiator=event.name：本技能自动日志已由引擎记录，行动时不再重复 logSkill。
            const done = await lib.bts.api.funnyAct(
                player,
                null,
                null,
                event.name,
            );
            if (done && player.countCards('h') < 5)
                await player.draw(player, 5 - player.countCards('h'));
        },
        // 欢愉行动注册（自注册重构）：funnyAct 泛化派发时执行——弃1【杀】/欢愉时刻弃牌；
        // 取消选牌时 ctx.aborted（对应旧 if 链的 return false 语义）。
        bts_funny: {
            order: 30,
            async act(ctx) {
                if (ctx.funny == null) ctx.funny = 1;
                if (
                    lib.bts.api.getBless(ctx.player, 'funny') ||
                    ctx.player.storage.bts_funny_time
                ) {
                    await ctx.target.chooseToDiscard(
                        '欢愉（连线）：弃置牌',
                        'he',
                        ctx.funny,
                        ctx.funny,
                        true,
                    );
                } else {
                    const card = await ctx.target
                        .chooseCard(
                            '欢愉（连线）：弃置一张【杀】',
                            'he',
                            (card) => get.name(card) === 'sha',
                        )
                        .forResult();
                    if (!card) {
                        ctx.aborted = true;
                        return;
                    }
                    await ctx.target.discard(card);
                }
                ctx.done = true;
            },
        },
        ai: { order: 4, result: { player: 1 } },
    },

    // ── 触发技·花手（源 st_huashou = TriggerSkill Damaged 空触发，L11317-11323）──
    // 锁定技，当你执行欢愉行动后，弃置牌堆底五张牌。触发点：utils.afterFunnyAct 在
    // +1 笑点后派发 bts_funny_act_after（规则层只广播，效果在本技能自注册；
    // 自动日志 + 音频即由此接通，原手动 logSkill 已删）。
    bts_sk_huashou: {
        trigger: { player: 'bts_funny_act_after' },
        forced: true,
        async content(event, trigger, player) {
            const cards = get.bottomCards(5);
            if (cards.length) game.cardsDiscard(cards);
        },
        ai: { noe: true },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_huohua_skin1': '皮肤1',
    bts_ch_huohua: '火花',
    bts_sk_kuanghuan: '狂欢',
    bts_sk_kuanghuan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各以 14.4%+（${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）的概率失去4点体力。`,
    bts_sk_lianxian_funny: '连线',
    bts_sk_lianxian_funny_info: `出牌阶段限两次，你可以执行欢愉行动，若手牌不足5张补至5张。欢愉行动：你弃置一张【杀】（若处于欢愉时刻则改为弃置牌）。`,
    bts_sk_huashou: '花手',
    bts_sk_huashou_info: '锁定技，当你执行欢愉行动后，弃置牌堆底五张牌。',
    '~bts_ch_huohua': "哼，不演了……",

    '$bts_sk_kuanghuan1': "亲爱的粉丝们，久等啦~",
    '$bts_sk_kuanghuan2': "和火花一起，狂欢到世界尽头吧！",
    '$bts_sk_lianxian_funny1': "PK一下？",
    '$bts_sk_lianxian_funny2': "正片开始！",
    '$bts_sk_lianxian_funny3': "惩罚时间！",
    '$bts_sk_lianxian_funny4': "全体起立！",
    '$bts_sk_huashou1': "来了来了！要被泼天的富贵——砸、中、咯！",
    '$bts_sk_huashou2': "不要走开！下一位幸运儿——就、是、你！",
};

export const simpleTranslate = {
    bts_sk_kuanghuan_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令目标各14.4%+倍${get.poptip('bts_glossary_bless_faq')}失4体力`,
    bts_sk_lianxian_funny_info: `限两次执行欢愉行动（弃杀），手牌补至5`,
    bts_sk_huashou_info: '欢愉行动后弃牌堆底5张',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音