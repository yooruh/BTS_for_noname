// 银狼LV999（源 animal.lua L11324-11423，V2.2 欢愉子系统）—— 无启、爆射、狼尊与顺风。
// 技能：无启（必杀技·耗分数换额外回合）、爆射（准备弃杀换笑点）、狼尊（跳阶段换忙盒/电驰）、顺风（笑点获得转分数）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xinghelieshou';
export const title = '虚数·欢愉·无敌玩家'; // 称号
export const intro =
    `${B('银狼LV999')}靠${get.poptip('bts_sk_baoshe_funny')}攒${get.poptip('bts_glossary_funnypoint_faq')}，${get.poptip('bts_sk_shunfeng')}把笑点获得转为${get.poptip('bts_glossary_fenshu_faq')}，${get.poptip('bts_sk_wuqi')}烧60分抢额外回合，狂到${get.poptip('bts_sk_langzun_funny')}附体。` +
    `<li>${B('银狼LV999')}是欢愉角色：其造成的伤害会被欢愉规则取消，唯有处于${get.poptip('bts_glossary_huanju_shengge_faq')}时例外（阿哈·【欢愉万相】赋予，至其回合结束）——因此其杀伤依赖「失去体力」类效果（如${B(get.poptip('bts_sk_langzun_funny'))}·忙盒）。`;

export const character = {
    bts_ch_yinlang_lv999: {
        sex: 'female',
        group: 'xinghelieshou',
        hp: 4,
        skills: [
            'bts_sk_wuqi',
            'bts_sk_baoshe_funny',
            'bts_sk_shunfeng',
            'bts_sk_zhenju',
            'bts_sk_jiaju',
            'bts_sk_yincang',
            'bts_sk_funny_lock',
        ],
    },
};

export const skill = {
    // ── 必杀技·无启（源 max_wuqi = SkillCard target_fixed + ZeroCardViewAsSkill，V2.5 L12005-12035）──
    // 出牌阶段，消耗60分数，结束出牌阶段；99.9%（+欢愉祝福×10%）改为狼尊（失去无启与爆射），
    // 此回合结束时执行一个额外回合。
    bts_sk_wuqi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（分数发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L12023-12025）：GetOther(@fenshu, 60)
            return player.countMark('bts_mk_fenshu') >= 60;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wuqi');
            player.removeMark('bts_mk_fenshu', 60); // 源 L12009：LoseOther(@fenshu, 60)
            // 源 L12010：Global_PlayPhaseTerminated（结束出牌阶段）
            // 修复：原 `trigger.getParent && …` 在主动技（trigger=null）读 null 属性即崩
            // （同 yuanbanlin「明心」族）；改用 _status.event 链（与 liuying 火萤同款），trigger 仅作回退。
            const phase =
                trigger?.getParent?.('phaseUse') || _status.event.getParent('phaseUse');
            if (phase && phase.name === 'phaseUse') phase.finish();
            // 源 L12012-12014（V2.5 顺序前移）：99.9% 时切换技能——失去爆射与无启、获得狼尊。
            // 立即切换意味着本回合剩余的弃牌阶段也会被狼尊跳过（源 EventPhaseChanging 同样命中），
            // V2.3 曾延后到回合末结算，现已按源改回。
            if (lib.bts.api.funnyNumber(player, 99.9)) {
                if (player.hasSkill('bts_sk_baoshe_funny'))
                    await player.removeSkill('bts_sk_baoshe_funny');
                if (!player.hasSkill('bts_sk_langzun_funny'))
                    await player.addSkill('bts_sk_langzun_funny');
                // 源 handleAcquireDetachSkills 串里 max_wuqi 未带 "-" 属源侧笔误：狼尊超阈值时
                // 会重新 acquire max_wuqi（L12111），说明本技能确实应被移除，且译文写明「失去无启」。
                if (player.hasSkill('bts_sk_wuqi'))
                    await player.removeSkill('bts_sk_wuqi');
            }
            // 源 L12011 → gamerule NotActive：此回合结束时执行一个额外回合。insertPhase 即排队到
            // 本回合之后（无需 pending 标记，也不受技能被移除影响），故直接入队。
            lib.bts.api.extraTurn(player, 'bts_extra_turn');
        },
        ai: {
            // AI 口径：分数≥60 即积极发动（源 AI max_wuqi value 9/priority 3，StarRail-ai.lua）——消耗60分数
            // 结束出牌阶段，换整回合+99.9%转狼尊（源 animal.lua L12005-12035）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_wuqi')) return -1;
                if (player.countMark('bts_mk_fenshu') < 60) return -1; // filter 同门
                return 9;
            },
            result: { player: 2 },
        },
    },

    // ── 触发技·爆射（源 st_baoshe_funny = TriggerSkill EventPhaseStart，L11345-11355）──
    // 出牌阶段开始时，你可以弃置一张【杀】，获得5枚笑点。
    bts_sk_baoshe_funny: {
        // 欢愉技标签：funnyPlayer 以此判定「拥有欢愉行动」（utils.funnyPlayer）
        bts_funny_skill: true,
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
                // AI 口径：弃1【杀】换5笑点，顺风同额转分数（冲无启60分≈1/12额外回合）；分数未满更积极
                //（源 animal.lua L11334-11344）
                .set('ai', (card) => {
                    const need = player.countMark('bts_mk_fenshu') < 60;
                    return (need ? 6 : 4) - get.value(card);
                })
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

    // ── 锁定技·真局（源 #st_zhenju，源内为空触发器，效果写在 AfterFunnyAct L1344-1349）──
    // 当你执行欢愉行动后，若你拥有欢愉升格标记：+20分；若处于欢愉时刻且笑点≥40，改为+40分。
    bts_sk_zhenju: {
        trigger: { player: 'bts_funny_act_after' },
        forced: true,
        filter(event, player) {
            return player.countMark('bts_mk_huanju_shengge-clear') > 0;
        },
        async content(event, trigger, player) {
            const double =
                !!player.storage.bts_funny_time &&
                player.countMark('bts_mk_funnypoint') >= 40;
            player.addMark('bts_mk_fenshu', double ? 40 : 20); // 源 L1345-1348
        },
    },

    // ── 锁定技·假局（源 #st_jiaju，效果写在 FunnyAct L1266-1269）──
    // 若你拥有欢愉升格标记，你的欢愉行动执行数值+1（结算见 utils.funnyAct）。
    bts_sk_jiaju: {
        silent: true,
        noHidden: true,
    },

    // ── 锁定技·隐藏（源 #st_yincang = TriggerSkill Compulsory CardFinished，V2.5 L12182-12195）──
    // 当你发动必杀技后，若你拥有欢愉升格标记，获得20枚分数标记。
    bts_sk_yincang: {
        trigger: { player: 'useSkillAfter' },
        forced: true,
        filter(event, player) {
            // 源 V2.5 改为 CardFinished（V2.3 为 CardUsed）——无名杀以 useSkillAfter 表示「牌已用毕」，
            // 与真珠·艺垒同口径；必杀技以 bts_bisha 标签判定（勿子串匹配）。
            return (
                event.player === player &&
                lib.skill[event.skill]?.bts_bisha === true &&
                player.countMark('bts_mk_huanju_shengge-clear') > 0
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_fenshu', 20); // 源 L12190：gainMark("@fenshu", 20)
        },
    },

    // ── 锁定技·狼尊（源 st_langzun_funny = TriggerSkill EventPhaseChanging/CardsMoveOneTime/
    //    EventAcquireSkill/MarkChanged，V2.5 L12084-12143）──
    // 跳摸牌/出牌/弃牌阶段（已被其他来源跳过的阶段不再计入），各执行一次忙盒并+1电驰；
    // 电驰 > 8 + 狼尊计数×3 时恢复爆射与无启、失去狼尊、清分数与电驰。
    // 由无启 99.9% 概率授予（不在角色基础技能内）。
    bts_sk_langzun_funny: {
        // 欢愉技标签：funnyPlayer 以此判定「拥有欢愉行动」（utils.funnyPlayer）
        bts_funny_skill: true,
        trigger: {
            player: ['phaseDrawBegin', 'phaseUseBegin', 'phaseDiscardBegin', 'loseAfter'],
            global: 'bts_mark_remove',
        },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'loseAfter') {
                // 源 L12121-12132：弃置【杀】且笑点<60 → 忙盒；源用 "langzun_funny" 计数封顶 3 次
                return (
                    event.type === 'discard' &&
                    player.countMark('bts_mk_funnypoint') < 60 &&
                    (player.storage.bts_langzun_discard || 0) < 3 &&
                    (event.cards || []).some((card) => get.name(card) === 'sha')
                );
            }
            if (triggername === 'bts_mark_remove') {
                // 源 L12133-12139 MarkChanged：失去分数且拥有欢愉升格 → 按 120 分一档扩「电池」
                return (
                    event.player === player &&
                    event.markName === 'bts_mk_fenshu' &&
                    event.num > 0 &&
                    player.countMark('bts_mk_huanju_shengge-clear') > 0
                );
            }
            return true;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'loseAfter') {
                player.setStorage(
                    'bts_langzun_discard',
                    (player.storage.bts_langzun_discard || 0) + 1,
                );
                await lib.bts.api.manghe(player);
                return;
            }
            if (event.triggername === 'bts_mark_remove') {
                // 源 L12134：while ((langzun+1)*120 < 分数) → langzun+1 并追加额外摸/出/弃阶段。
                // 本库无 extra_draw/extra_play/extra_discard 的消费方，等价写法 = 插入一个含
                // 摸牌/出牌/弃牌三阶段的额外回合并计入狼尊数（阈值随之抬高）。
                let guard = 0;
                while (
                    player.countMark('bts_mk_fenshu') >
                        (langzunCount(player) + 1) * 120 &&
                    ++guard <= 9
                ) {
                    player.setStorage('bts_langzun', langzunCount(player) + 1);
                    lib.bts.api.extraPhase(
                        player,
                        ['phaseDraw', 'phaseUse', 'phaseDiscard'],
                        null,
                        'bts_langzun_extra',
                    );
                }
                return;
            }
            // 跳当前阶段 + 忙盒 + 电驰 +1（源 L12091-12109）。trigger 即对应阶段事件本身
            //（phaseDrawBegin/phaseUseBegin/phaseDiscardBegin 均为阶段事件 loop 的 Begin 派生点，
            // 见核实 F-07）。finish() 于 Begin 触发期跳过该阶段 content；勿用 getParent（排除自身、
            // 恒返回 {}，跳过块永不执行）。
            const name = { phaseDrawBegin: 'phaseDraw', phaseUseBegin: 'phaseUse', phaseDiscardBegin: 'phaseDiscard' }[event.triggername];
            // audit-triggername: skip — trigger 是阶段事件，name 是 Begin 派生点映射后的基名。
            if (trigger.name === name) {
                // 源 L12091：`not player:isSkipped(change.to)`——已被其他来源跳过的阶段不再计入
                //（非名杀：skipList 命中或事件已标 isSkipped）。
                if (player.skipList?.includes(name) || trigger.isSkipped)
                    return;
                trigger.isSkipped = true;
                trigger.finish();
            }
            await lib.bts.api.manghe(player);
            player.addMark('bts_mk_dianchi', 1);
            // 源 L12110-12119：电驰 > 8 + langzun*3 → 恢复爆射与无启、失去狼尊、清分数与电驰
            if (player.countMark('bts_mk_dianchi') > 8 + langzunCount(player) * 3) {
                if (!player.hasSkill('bts_sk_baoshe_funny'))
                    await player.addSkill('bts_sk_baoshe_funny');
                if (!player.hasSkill('bts_sk_wuqi'))
                    await player.addSkill('bts_sk_wuqi');
                player.setStorage('bts_langzun', 0);
                player.setStorage('bts_langzun_discard', 0);
                await player.removeSkill('bts_sk_langzun_funny');
                player.removeMark('bts_mk_fenshu', player.countMark('bts_mk_fenshu'));
                player.removeMark('bts_mk_dianchi', player.countMark('bts_mk_dianchi'));
            }
        },
    },

    // ── 锁定技·顺风（源 st_shunfeng = TriggerSkill Compulsory MarkChanged，L11405-11423）──
    // 当一名角色获得笑点后，你获得等量分数（源代码作笑点减少方向，翻译写「获得笑点」——
    // 同族 7 处 gain 方向与描述相反的系统性笔误，定夺按描述方向实现）。
    bts_sk_shunfeng: {
        trigger: { global: 'bts_mark_add' },
        forced: true,
        filter(event) {
            return event.markName === 'bts_mk_funnypoint' && event.num > 0;
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_fenshu', trigger.num);
        },
    },
};

// 狼尊「电池」扩容计数（源 player:getMark("langzun")）：每次失去分数且剩余 ≥ (n+1)×120 时 +1，
// 每层把电驰阈值抬高 3。内部计数，不注册展示标记。
export function langzunCount(player) {
    return player.storage.bts_langzun || 0;
}

export const marks = {
    bts_mk_fenshu: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_fenshu_faq',
    },
    bts_mk_dianchi: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_dianchi_faq',
    },
};

export const translate = {
    bts_ch_yinlang_lv999: '银狼LV999',
    bts_sk_wuqi: '无启',
    bts_sk_wuqi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以消耗60${get.poptip('bts_glossary_fenshu_faq')}，结束出牌阶段；有 99.9%（+${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）的概率失去${get.poptip('bts_sk_wuqi')}与${get.poptip('bts_sk_baoshe_funny')}并获得${get.poptip('bts_sk_langzun_funny')}。此回合结束时，你执行一个额外回合。`,
    bts_sk_baoshe_funny: '爆射',
    bts_sk_baoshe_funny_info: `${get.poptip('bts_glossary_funny_skill_faq')}，出牌阶段开始时，你可以弃置一张【杀】，获得5枚${get.poptip('bts_glossary_funnypoint_faq')}。欢愉行动：获得15枚${get.poptip('bts_glossary_fenshu_faq')}。`,
    bts_sk_zhenju: '真局',
    bts_sk_zhenju_info: `锁定技，当你执行${get.poptip('bts_glossary_funny_act_faq')}后，若你拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，你获得20枚${get.poptip('bts_glossary_fenshu_faq')}；若此时为欢愉时刻且你拥有至少40枚${get.poptip('bts_glossary_funnypoint_faq')}，改为获得40枚。`,
    bts_sk_jiaju: '假局',
    bts_sk_jiaju_info: `锁定技，若你拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，你的${get.poptip('bts_glossary_funny_act_faq')}执行数值+1。`,
    bts_sk_yincang: '隐藏',
    bts_sk_yincang_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}后，若你拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，你获得20枚${get.poptip('bts_glossary_fenshu_faq')}。`,
    bts_sk_langzun_funny: '狼尊',
    bts_sk_langzun_funny_info: `锁定技，${get.poptip('bts_glossary_funny_skill_faq')}，你跳过摸牌、出牌、弃牌阶段，每跳过一个阶段执行一次忙盒并获得1枚${get.poptip('bts_glossary_dianchi_faq')}；${get.poptip('bts_glossary_dianchi_faq')}超过 8（每失去一次${get.poptip('bts_glossary_fenshu_faq')}时若余量≥120 则上限+3）时，恢复${get.poptip('bts_sk_baoshe_funny')}与${get.poptip('bts_sk_wuqi')}、失去${get.poptip('bts_sk_langzun_funny')}、清空${get.poptip('bts_glossary_fenshu_faq')}与${get.poptip('bts_glossary_dianchi_faq')}。忙盒：随机摸两张牌、获得3枚${get.poptip('bts_glossary_funnypoint_faq')}、或令伤过你的角色各失去1点体力。`,
    bts_sk_shunfeng: '顺风',
    bts_sk_shunfeng_info: `锁定技，当一名角色获得${get.poptip('bts_glossary_funnypoint_faq')}后，你获得等量的${get.poptip('bts_glossary_fenshu_faq')}。`,
    bts_mk_fenshu: '分数',
    bts_mk_fenshu_info: `来源：${get.poptip('bts_sk_shunfeng')}转化（有角色获得${get.poptip('bts_glossary_funnypoint_faq')}时）；${get.poptip('bts_sk_wuqi')}消耗60枚发动`,
    bts_mk_dianchi: '电驰',
    bts_mk_dianchi_info: `来源：${get.poptip('bts_sk_langzun_funny')}赋予（每跳过1个阶段+1）；超过8（+扩容×3）枚时恢复${get.poptip('bts_sk_baoshe_funny')}与${get.poptip('bts_sk_wuqi')}、失去${get.poptip('bts_sk_langzun_funny')}`,
    '~bts_ch_yinlang_lv999': '哼，不演了……',

    '$bts_sk_wuqi1': "哼，不装了",
    '$bts_sk_wuqi2': "接下来这把——高端局！",
    '$bts_sk_baoshe_funny1': "教你两招",
    '$bts_sk_baoshe_funny2': "无限火力",
    '$bts_sk_shunfeng1': "一波带走",
    '$bts_sk_shunfeng2': "爽就完了",

    '$bts_sk_langzun_funny1': "Crazy!",
    '$bts_sk_langzun_funny2': "Bravo!",
    '$bts_sk_langzun_funny3': "Amazing!",
};

export const simpleTranslate = {
    bts_sk_wuqi_info: `${get.poptip('bts_glossary_bisha_faq')}；耗60${get.poptip('bts_glossary_fenshu_faq')}结束出牌，99.9%失${get.poptip('bts_sk_wuqi')}/${get.poptip('bts_sk_baoshe_funny')}转${get.poptip('bts_sk_langzun_funny')}；回合末额外回合`,
    bts_sk_baoshe_funny_info: `${get.poptip('bts_glossary_funny_skill_faq')}；出牌开始可弃杀+5${get.poptip('bts_glossary_funnypoint_faq')}；欢愉行动+15${get.poptip('bts_glossary_fenshu_faq')}`,
    bts_sk_zhenju_info: `锁；执行${get.poptip('bts_glossary_funny_act_faq')}后若有${get.poptip('bts_glossary_huanju_shengge_faq')}则+20${get.poptip('bts_glossary_fenshu_faq')}（欢愉时刻且笑点≥40改+40）`,
    bts_sk_jiaju_info: `锁；有${get.poptip('bts_glossary_huanju_shengge_faq')}时，${get.poptip('bts_glossary_funny_act_faq')}数值+1`,
    bts_sk_yincang_info: `锁；发动${get.poptip('bts_glossary_bisha_faq')}后若有${get.poptip('bts_glossary_huanju_shengge_faq')}则+20${get.poptip('bts_glossary_fenshu_faq')}`,
    bts_sk_langzun_funny_info: `锁，${get.poptip('bts_glossary_funny_skill_faq')}；跳摸/出/弃阶段各忙盒+1${get.poptip('bts_glossary_dianchi_faq')}，${get.poptip('bts_glossary_dianchi_faq')}>8（每扩一次+3）恢复${get.poptip('bts_sk_baoshe_funny')}/${get.poptip('bts_sk_wuqi')}`,
    bts_sk_shunfeng_info: `锁；笑点获得时+等量${get.poptip('bts_glossary_fenshu_faq')}`,
};

// 默认读音把「LV999」逐字符拆开：按叁岛式写「中文名 → 拼音数组」整段覆盖。
export const pinyins = {
    '银狼LV999': ['yín', 'láng', 'LV999'],
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_fenshu_faq',
        name: '|分数|',
        info: `银狼LV999专属资源。来源：${get.poptip('bts_sk_shunfeng')}——有角色获得${get.poptip('bts_glossary_funnypoint_faq')}后，你等量获得；${get.poptip('bts_sk_wuqi')}消耗60枚发动。`,
    },
    {
        id: 'bts_glossary_dianchi_faq',
        name: '|电驰|',
        info: `来源：${get.poptip('bts_sk_langzun_funny')}——每跳过1个阶段获得1枚；超过8枚时，恢复${get.poptip('bts_sk_baoshe_funny')}、失去${get.poptip('bts_sk_langzun_funny')}并清空分数与电驰。`,
    },
];