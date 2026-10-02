// 银狼LV999（源 animal.lua L11324-11423，V2.2 欢愉子系统）—— 无启、爆射、狼尊与顺风。
// 技能：无启（必杀技·耗分数换额外回合）、爆射（准备弃杀换笑点）、狼尊（跳阶段换忙盒/电驰）、顺风（笑点获得转分数）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '虚数·欢愉·狂欢企划'; // 称号
export const intro =
    `${B('银狼LV999')}靠${get.poptip('bts_sk_baoshe_funny')}攒${get.poptip('bts_glossary_funnypoint_faq')}，${get.poptip('bts_sk_shunfeng')}把笑点获得转为分数，${get.poptip('bts_sk_wuqi')}烧60分抢额外回合，狂到${get.poptip('bts_sk_langzun_funny')}附体。`;

export const character = {
    bts_ch_yinlang_lv999: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_wuqi', 'bts_sk_baoshe_funny', 'bts_sk_shunfeng'],
    },
};

export const skill = {
    // ── 必杀技·无启（源 max_wuqi = SkillCard target_fixed + ZeroCardViewAsSkill，L11325-11344）──
    // 出牌阶段，消耗60分数，结束出牌阶段，99.9%（+欢愉祝福×10%）改为狼尊并执行额外回合。
    bts_sk_wuqi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（分数发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L11341）：GetOther(@fenshu, 60)
            return player.countMark('bts_mk_fenshu') >= 60;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wuqi');
            player.removeMark('bts_mk_fenshu', 60); // 源 L11329：LoseOther(@fenshu, 60)
            // 源 L11330：Global_PlayPhaseTerminated（结束出牌阶段）
            // 2026-09-28 修复：原 `trigger.getParent && …` 在主动技（trigger=null）读 null 属性即崩
            // （同 yuanbanlin「明心」族）；改用 _status.event 链（与 liuying 火萤同款），trigger 仅作回退。
            const phase =
                trigger?.getParent?.('phaseUse') || _status.event.getParent('phaseUse');
            if (phase && phase.name === 'phaseUse') phase.finish();
            // 源 L1671-1674：爆射→狼尊切换与额外回合于【回合结束（NotActive）】才结算——
            // 若在出牌阶段中途切换，狼尊的 phaseDiscardBegin 会跳过【当前回合】的弃牌阶段
            //（跳错回合，A-06）。故记 pending 标记，由 phaseAfter 统一收尾（乱破·天流同款范式）。
            player.addMark('bts_mk_wuqi_pending', 1);
        },
        group: ['bts_sk_wuqi_after'],
        subSkill: {
            // 回合结束收尾（源 gamerule_ex Player_NotActive L1671-1674：FunnyNumber 99.9% 切换 + 额外回合）
            after: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player) {
                    return player.countMark('bts_mk_wuqi_pending') > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_mk_wuqi_pending',
                        player.countMark('bts_mk_wuqi_pending'),
                    );
                    if (event.triggername === 'death') return; // 死亡不再切换/额外回合
                    // 源 L1673：FunnyNumber(p, 99.9)（+欢愉祝福每层+10%）→ 爆射→狼尊
                    if (lib.bts.api.funnyNumber(player, 99.9)) {
                        await player.removeSkill('bts_sk_baoshe_funny');
                        await player.addSkill('bts_sk_langzun_funny');
                    }
                    lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 源 L11331：extra_turn_max_wuqi
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_wuqi') ? -1 : 9;
            },
            result: { player: 2 },
        },
    },

    // ── 触发技·爆射（源 st_baoshe_funny = TriggerSkill EventPhaseStart，L11345-11355）──
    // 出牌阶段开始时，你可以弃置一张【杀】，获得5枚笑点。
    bts_sk_baoshe_funny: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            return player.getCards('he').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCard(
                    'he',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '爆射：是否弃置一张【杀】获得5枚笑点？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 源 L11349：askForCard 弃杀
            player.addMark('bts_mk_funnypoint', 5); // 源 L11351：gainMark(@funnypoint, 5)
        },
        // 欢愉行动注册（自注册重构）：funnyAct 泛化派发的 late 阶段（欢愉祝福结算之后）
        // ——获得15枚分数（源 L11351 尾块 / 旧 if 链爆射分支）。
        bts_funny: {
            order: 90,
            late: true,
            async act(ctx) {
                ctx.player.addMark('bts_mk_fenshu', 15);
                ctx.done = true;
            },
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·狼尊（源 st_langzun_funny = TriggerSkill EventPhaseChanging/CardsMoveOneTime，L11373-11404）──
    // 跳摸牌/出牌/弃牌阶段，各执行一次忙盒并+1电驰；电驰>8时恢复爆射、失去狼尊、清分数与电驰。
    // 由无启 99.9% 概率授予（不在角色基础技能内）。
    bts_sk_langzun_funny: {
        trigger: {
            player: ['phaseDrawBegin', 'phaseUseBegin', 'phaseDiscardBegin', 'loseAfter'],
        },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'loseAfter') {
                // 源 L11390-11399：弃置【杀】且笑点<60 → 忙盒
                return (
                    event.type === 'discard' &&
                    player.countMark('bts_mk_funnypoint') < 60 &&
                    (event.cards || []).some((card) => get.name(card) === 'sha')
                );
            }
            return true;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'loseAfter') {
                await lib.bts.api.manghe(player);
                return;
            }
            // 跳当前阶段 + 忙盒 + 电驰 +1（源 L11379-11383）。trigger 即对应阶段事件本身
            //（phaseDrawBegin/phaseUseBegin/phaseDiscardBegin 均为阶段事件 loop 的 Begin 派生点，
            // 见核实 F-07）。finish() 于 Begin 触发期跳过该阶段 content；勿用 getParent（排除自身、
            // 恒返回 {}，跳过块永不执行）。
            const name = { phaseDrawBegin: 'phaseDraw', phaseUseBegin: 'phaseUse', phaseDiscardBegin: 'phaseDiscard' }[event.triggername];
            if (trigger.name === name) {
                trigger.isSkipped = true;
                trigger.finish();
            }
            await lib.bts.api.manghe(player);
            player.addMark('bts_mk_dianchi', 1);
            // 源 L11384-11388：电驰>8 → 恢复爆射、失去狼尊、清分数与电驰
            if (player.countMark('bts_mk_dianchi') > 8) {
                await player.addSkill('bts_sk_baoshe_funny');
                await player.removeSkill('bts_sk_langzun_funny');
                player.removeMark('bts_mk_fenshu', player.countMark('bts_mk_fenshu'));
                player.removeMark('bts_mk_dianchi', player.countMark('bts_mk_dianchi'));
            }
        },
        ai: { noe: true },
    },

    // ── 锁定技·顺风（源 st_shunfeng = TriggerSkill Compulsory MarkChanged，L11405-11423）──
    // 当一名角色获得笑点后，你获得等量分数（源代码作笑点减少方向，翻译写「获得笑点」——
    // 同族 7 处 gain 方向与描述相反的系统性笔误，2026-10-02 用户定夺按描述方向实现）。
    bts_sk_shunfeng: {
        trigger: { global: 'bts_mark_add' },
        forced: true,
        filter(event) {
            return event.markName === 'bts_mk_funnypoint' && event.num > 0;
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_fenshu', trigger.num);
        },
        ai: { noe: true },
    },
};

export const marks = {
    bts_mk_wuqi_pending: { markKind: 'record' },
    bts_mk_fenshu: {
        markKind: 'mark',
        markType: 'text',
    },
    bts_mk_dianchi: {
        markKind: 'mark',
        markType: 'text',
    },
};

export const translate = {
    bts_mk_wuqi_pending: '武器待结算',
    bts_ch_yinlang_lv999: '银狼LV999',
    bts_sk_wuqi: '无启',
    bts_sk_wuqi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以消耗60分数，结束出牌阶段并执行一个额外回合；同时有 99.9%（+${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）的概率将${get.poptip('bts_sk_baoshe_funny')}改为${get.poptip('bts_sk_langzun_funny')}。`,
    bts_sk_baoshe_funny: '爆射',
    bts_sk_baoshe_funny_info: '出牌阶段开始时，你可以弃置一张【杀】，获得5枚笑点。',
    bts_sk_langzun_funny: '狼尊',
    bts_sk_langzun_funny_info: `锁定技，你跳过摸牌、出牌、弃牌阶段，每跳过一个阶段执行一次忙盒并获得1枚电驰；电驰超过8时，恢复${get.poptip('bts_sk_baoshe_funny')}、失去${get.poptip('bts_sk_langzun_funny')}、清空分数与电驰。忙盒：随机摸两张牌、获得3枚笑点、或令伤过你的角色各失去1点体力。`,
    bts_sk_shunfeng: '顺风',
    bts_sk_shunfeng_info: '锁定技，当一名角色获得笑点后，你获得等量的分数。',
    bts_mk_fenshu: '分数',
    bts_mk_fenshu_info: `来源：${get.poptip('bts_sk_shunfeng')}赋予；${get.poptip('bts_sk_wuqi')}消耗60发动`,
    bts_mk_dianchi: '电驰',
    '~bts_ch_yinlang_lv999': '哼，不演了……',

    '$bts_sk_wuqi1': "哼，不装了",
    '$bts_sk_wuqi2': "接下来这把——高端局！",
    '$bts_sk_baoshe_funny1': "教你两招",
    '$bts_sk_baoshe_funny2': "无限火力",
    '$bts_sk_shunfeng1': "一波带走",
    '$bts_sk_shunfeng2': "爽就完了",
};

export const simpleTranslate = {
    bts_sk_wuqi_info: `${get.poptip('bts_glossary_bisha_faq')}；耗60分数结束出牌并额外回合，99.9%${get.poptip('bts_sk_baoshe_funny')}→${get.poptip('bts_sk_langzun_funny')}`,
    bts_sk_baoshe_funny_info: '出牌开始可弃杀+5笑点',
    bts_sk_langzun_funny_info: `锁；跳摸/出/弃阶段各忙盒+1电驰，电驰>8恢复${get.poptip('bts_sk_baoshe_funny')}`,
    bts_sk_shunfeng_info: '锁；笑点获得时+等量分数',
};

// 默认读音把「LV999」逐字符拆开：按叁岛式写「中文名 → 拼音数组」整段覆盖。
export const pinyins = {
    '银狼LV999': ['yín', 'láng', 'LV999'],
};