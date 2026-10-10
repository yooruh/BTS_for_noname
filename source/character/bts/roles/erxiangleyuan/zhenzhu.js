// 真珠（源 animal.lua L12182-12334，二相乐园·BOSS 包）—— 鉴映、补缀、吞纳与「升格」三连。
// 技能：鉴映（必杀技·按欢愉角色数为目标铺开额外阶段）、补缀（他人受伤后弃【杀】回血，兼为欢愉行动注册项）、
//       吞纳（耗欢愉祝福抵消伤害）；艺垒 / 容差 / 洞察（锁定技·「欢愉升格」状态下回怒 / 增疗 / 叠祝福——
//       源为 # 前缀隐藏副技，本移植列入技能表以使触发有据可查）。
import { lib, game, ui, get, _status, B } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '冰·欢愉·二相乐园首席执行官'; // 属性·命途·昵称
export const intro =
    `${B('真珠')}为欢愉的同伴推开舞台：以${get.poptip('bts_sk_jianying')}铺开额外阶段，借${get.poptip('bts_sk_buzhui_funny')}应援伤者、以${get.poptip('bts_sk_tunna')}消解伤害；当${get.poptip('bts_glossary_huanju_shengge_faq')}加身，${get.poptip('bts_sk_yilei')}、${get.poptip('bts_sk_rongcha')}与${get.poptip('bts_sk_dongcha')}随之运转。`;

export const character = {
    bts_ch_zhenzhu: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: [
            'bts_sk_jianying',
            'bts_sk_buzhui_funny',
            'bts_sk_tunna',
            'bts_sk_yilei',
            'bts_sk_rongcha',
            'bts_sk_dongcha',
        ],
    },
};

// ── 鉴映·赠礼回收（源 L12200-12201 赠 / L12214-12215 收，礼包包住四个额外阶段）──
// 源 ExtraPhase 为同步嵌套，四个阶段跑完即回收赠礼；无名杀阶段只能入队（不可嵌套），故赠礼先记，
// 回收步骤排进伪回合同队 FIFO 之后再执行（白厄·燔世 pushFanshiEvent 范式，勿依赖阶段结束事件——
// 阶段可能被跳过，队列步骤仍会到达）。
export function pushJianyingCleanup(target, x) {
    const current = _status.event?.getParent?.('phase');
    let host = null;
    if (current && current.parent && current.parent.next) host = current.parent;
    else if (_status.event?.parent && _status.event.parent.next)
        host = _status.event.parent;
    if (!host) {
        // 非预期路径（无宿主队列，如控制台直调）：立即回收全部赠礼——宁少给不滞留
        target.removeMark('bts_mk_funnypoint', x * 20);
        return lib.bts.api.removeBless(target, 'funny', x);
    }
    const next = game.createEvent('bts_sk_jianying_cleanup', false, host);
    next.player = target;
    next.forceDie = true;
    next.includeOut = true;
    next._bts_jianying_gift = x; // 赠礼层数随事件携带（x*20 枚笑点 + x 层欢愉祝福）
    next.setContent(async (event, trigger, owner) => {
        owner.removeMark('bts_mk_funnypoint', event._bts_jianying_gift * 20);
        await lib.bts.api.removeBless(owner, 'funny', event._bts_jianying_gift);
    });
    return next;
}

export const skill = {
    // ── 必杀技·鉴映（源 max_jianying = SkillCard + ZeroCardViewAsSkill，L12183-12237）──
    // 出牌阶段，失5怒气：自身+2层欢愉祝福；按存活欢愉角色数 n，令首目标执行额外准备/摸牌/出牌/弃牌阶段
    //（n≥1/2/3/4 依次点亮弃牌/出牌/摸牌/准备）；n≥4 时先赠 60枚笑点+3层祝福、阶段完毕回收；
    // 星启：赠礼翻倍、且可追加任选欢愉角色为目标。
    bts_sk_jianying: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L12232）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        // 引擎约定：非 multitarget 技能 content 按每名目标各跑一次（useSkill 对 targets[num] 重建子事件）；
        // 鉴映为「一次性只对首目标结算」，须 multitarget:true（星启追加目标仍全量在 event.targets）。
        multitarget: true,
        selectTarget: [1, Infinity],
        filterTarget(card, player, target) {
            // 源 Card filter（L12185-12187）：首个目标自由（源无 ~=Self——自指允许，jizi 远征同型；
            // 源描述作「一名其他角色」，以代码为准）；星启时追加目标须为欢愉角色。
            if (ui.selected.targets.length === 0) return true;
            return lib.bts.api.god(player) && lib.bts.api.funnyPlayer(target);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_jianying');
            lib.bts.api.loseAngry(player, 5); // 源 L12189：LoseAngry(player, 5)
            await lib.bts.api.addBless(player, 'funny', 2); // 源 L12190：AddBless(player, "@bless_funny", 2)
            // 源 L12191-12192：统计存活「拥有欢愉行动」的角色数 n（含真珠自身——其拥有补缀）
            const n = game.filterPlayer(
                (p) => p.isAlive() && lib.bts.api.funnyPlayer(p),
            ).length;
            const x = lib.bts.api.god(player) ? 6 : 3; // 源 L12194-12195：星启翻倍（6），否则 3
            const target = event.targets[0]; // 源 L12200-12215：仅对首个目标结算
            // 礼包（n≥4）：先获得 60(x*20) 枚笑点与 3(x) 层欢愉祝福——阶段完毕由 pushJianyingCleanup 回收
            const gift = n >= 4;
            if (gift) {
                target.addMark('bts_mk_funnypoint', x * 20); // 源 L12200：gainMark("@funnypoint", x*20)
                await lib.bts.api.addBless(target, 'funny', x, player); // 源 L12201：AddBless(targets[1], "@bless_funny", x)
            }
            // 源 L12198-12211：n≥4/3/2/1 → 额外准备/摸牌/出牌/弃牌阶段（源逐条 ExtraPhase，按序执行）
            const phases = [];
            if (n >= 4) phases.push('phaseZhunbei');
            if (n >= 3) phases.push('phaseDraw');
            if (n >= 2) phases.push('phaseUse');
            if (n >= 1) phases.push('phaseDiscard');
            if (phases.length) {
                // 伪回合：仅这些阶段、无判定（源 ExtraPhase 同粒度；期间触发目标全部阶段技能/异常/祝福）
                lib.bts.api.extraPhase(target, phases, null, 'bts_sk_jianying');
                if (gift) pushJianyingCleanup(target, x); // FIFO：伪回合先执行、回收步骤随后
            }
        },
        ai: {
            // AI 口径：5怒气=为（友方/自己）铺开 n 个额外阶段 + 自身2层祝福；n 越大越积极，n=0 仅祝福。
            // 目标取向=友方（源 AI sgs.ai_skill_use_func["#max_jianying"]=Friends_AI + ai_use_value=9，
            // StarRail-ai.lua L4002-4017；给敌方额外阶段为负收益，态度加权自动排除）。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_jianying')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                const n = game.filterPlayer(
                    (p) => p.isAlive() && lib.bts.api.funnyPlayer(p),
                ).length;
                if (n >= 4) return 9; // 对齐源 ai_use_value 9（满档：四阶段+礼包）
                if (n >= 2) return 8; // 含出牌阶段（额外阶段的大头）
                if (n === 1) return 5; // 单段弃牌≈近乎无收益：怒气留待 ≥2 档再用
                return 4; // 例外：自身补缀被封锁致 n=0——只剩自身+2层祝福，收益有限
            },
            result: {
                player: 0.5, // 施动方：+2层欢愉祝福（概率资源）
                // 目标：获额外阶段——弃牌(1段)/+出牌(2)/+摸牌(3)/+准备且含临时礼包(4)；出牌阶段为大头
                target: (player, target) => {
                    const n = game.filterPlayer(
                        (p) => p.isAlive() && lib.bts.api.funnyPlayer(p),
                    ).length;
                    return n >= 4 ? 3 : n === 3 ? 2.4 : n === 2 ? 1.8 : n === 1 ? 0.6 : 0;
                },
            },
        },
    },

    // ── 触发技·补缀（源 st_buzhui_funny = TriggerSkill Damaged，L12238-12256）──
    // 当其他角色受到伤害后，你可以弃置一张【杀】，附加1层欢愉祝福，其（受伤者）回复1点体力；
    // 同时本技能是「欢愉行动」注册项（源 FunnyAct 分支）：任何欢愉行动派发时回复1点体力。
    bts_sk_buzhui_funny: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L12246：受伤者非本人（~= p）且可弃【杀】（弃置在 cost 完成）。
            // 补 isAlive：damageEnd 时死于本次伤害者已标 dead——跨玩家治疗不可作用于尸体
            //（罗刹·白花/白露·珠露同款定案）；死者不作询问。
            return (
                event.player !== player &&
                event.num > 0 &&
                event.player.isAlive() &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L12246：room:askForCard(p, "Slash", ...)——先问是否发动、再选【杀】（救护同款两步）
            const want = await player
                .chooseBool(
                    `补缀：是否弃置一张【杀】，令${get.translation(trigger.player)}回复1点体力？`,
                )
                // AI 口径：仅助友方（源 AI ai_skill_cardask @st_buzhui_funny，StarRail-ai.lua L4196-4205：
                // not isFriend(damage.to) 即不交【杀】——严格友方 attitude>0，与下方判定一致）
                .set('ai', () => {
                    const target = trigger.player;
                    if (!target || !target.isAlive()) return false;
                    return get.attitude(player, target) > 0;
                })
                .forResult();
            if (!want.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '弃置一张【杀】',
                )
                // AI 口径：候选已过滤为【杀】，弃价值最低者
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    return -get.value(card);
                })
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = { bool: true };
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            await player.discard(event.cards); // cost 的弃牌移入结算
            await lib.bts.api.addBless(player, 'funny', 1); // 源 L12247：AddBless(p, "@bless_funny")
            // 源 L12248：FunnyAct(p, nil, player=受伤者)——本技能自身的欢愉行动即「受伤者回复1点体力」
            //（见下方 bts_funny）；initiator=本技能，避免行动派发时重复记日志。
            await lib.bts.api.funnyAct(player, null, trigger.player, event.name);
        },
        // 欢愉行动注册（自注册重构）：派发序按源 FunnyAct 分支序——在抛注(40)之后、欢愉祝福结算之前。
        bts_funny: {
            order: 50,
            async act(ctx) {
                // 源分支：funny 为空或 1 时不做行动后置（after=false）；为空时视为 1 层。
                if (ctx.funny == null || ctx.funny === 1) ctx.after = false;
                if (ctx.funny == null) ctx.funny = 1;
                // 源：room:recover(target, RecoverStruct(player))——受伤者回复1点，来源=发动者。
                // 补 isAlive：跨玩家治疗守卫（同上）。
                if (ctx.target?.isAlive())
                    await ctx.target.recover(ctx.player, 1);
            },
        },
        ai: {
            // 供跨技能估值：受伤者+1点体力，自身+1层欢愉祝福
            result: {
                player: 0.5,
                target: (player, target) => (target.isDamaged() ? 1 : 0.3),
            },
        },
    },

    // ── 触发技·吞纳（源 st_tunna = TriggerSkill DamageInflicted，L12257-12277）──
    // 当一名角色受到伤害时，你可以（任一持有者，含受伤者本人）移除1层欢愉祝福，令此伤害-1。
    bts_sk_tunna: {
        // 受方减免槽（源 DamageInflicted = damageBegin4，见流萤·中枢注；damageBegin2 为造成方减免槽，勿互换）
        trigger: { global: 'damageBegin4' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L12264-12265：持有者拥有欢愉祝福（层数>0）即可应答
            return event.num > 0 && lib.bts.api.getBless(player, 'funny');
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseBool(
                    `吞纳：是否移除1层欢愉祝福，令${get.translation(trigger.player)}受到的伤害-1？`,
                )
                // AI 口径：受伤者为友（含自己，attitude 对己为正值）才消耗祝福。源 AI ai_skill_invoke.st_tunna
                // = asFriend(受伤者)（StarRail-ai.lua L4167-4170；asFriend 无 mid 参即严格 isFriend，见 L1-8），
                // 即 attitude>0——不替中立角色白耗祝福（原 >=0 会替中立掏层）。
                .set('ai', () => {
                    const target = trigger.player;
                    if (!target || !target.isAlive()) return false;
                    return get.attitude(player, target) > 0;
                })
                .forResult();
        },
        async content(event, trigger, player) {
            await lib.bts.api.removeBless(player, 'funny', 1); // 源 L12266：RemoveBless(p, "@bless_funny")
            trigger.num -= 1; // 源 L12267：damage.damage - 1
        },
        ai: {
            // effect.target 供出牌方 AI 感知减伤可能（流萤·中枢同款范式：受损评估×0.5）。真机制为
            // 「任一持有者（含他人）可消耗1层欢愉祝福」，故按全员扫描估算：持有者视受伤者为友
            //（attitude>0，与 cost 发动口径一致）即计入可能减 1。
            effect: {
                target(card, player, target, current) {
                    if (current >= 0 || !card) return;
                    if (!get.tag(card, 'damage')) return;
                    if (
                        game.hasPlayer(
                            (p) =>
                                p.isAlive() &&
                                p.hasSkill('bts_sk_tunna') &&
                                lib.bts.api.getBless(p, 'funny') &&
                                get.attitude(p, target) > 0,
                        )
                    ) {
                        return 0.5;
                    }
                },
            },
        },
    },

    // ── 锁定技·艺垒（源 #st_yilei，L12278-12292；源为隐藏副技）──
    // 当你发动必杀技后，若你拥有「欢愉升格」标记，回复2点怒气。
    bts_sk_yilei: {
        trigger: { player: 'useSkillAfter' },
        forced: true,
        filter(event, player) {
            // 源 L12284：使用牌技能名含 "max_"（必杀技）且拥有升格标记；以 bts_bisha 标签判定
            //（勿子串匹配，同增幅祝福 useSkillAfter 先例）；升格 = bts_mk_huanju_shengge-clear
            //（阿哈·欢愉万相授予，-clear 后缀由 bts_gamerule_phase 于其回合结束清理）。
            return (
                event.player === player &&
                lib.skill[event.skill]?.bts_bisha === true &&
                player.countMark('bts_mk_huanju_shengge-clear') > 0
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.addAngry(player, 2); // 源 L12286：AddAngry(player, 2)
        },
    },

    // ── 锁定技·容差（源 #st_rongcha，L12293-12314；源为隐藏副技）──
    // 若你拥有至少5层欢愉祝福且拥有「欢愉升格」标记，令其他角色回复的体力值+1。
    bts_sk_rongcha: {
        trigger: { global: 'recoverBegin' },
        forced: true,
        filter(event, player) {
            // 源 L12300-12301：recover.who（=施与者，经太阳神引擎 guo.cpp / 生机 / 寸强三处实证）
            // 须存在且非本人；自身≥5层欢愉祝福且拥有升格标记。
            // 注：源描述作「令其他角色回复的体力值+1」，源代码实为「施与者非你的回复+1」、
            // 且无来源回复（如【桃】）不生效——按代码移植（万敌·血仇同型取舍）。
            return (
                event.num > 0 &&
                !!event.source &&
                event.source !== player &&
                lib.bts.api.getBless(player, 'funny', 5) &&
                player.countMark('bts_mk_huanju_shengge-clear') > 0
            );
        },
        async content(event, trigger, player) {
            trigger.num += 1; // 源 L12303：recover.recover + 1
        },
    },

    // ── 锁定技·洞察（源 #st_dongcha，L12315-12334；源为隐藏副技）──
    // 欢愉角色准备阶段开始时，若你拥有「欢愉升格」标记，你附加1层欢愉祝福。
    bts_sk_dongcha: {
        trigger: { global: 'phaseZhunbeiBegin' },
        forced: true,
        filter(event, player) {
            // 源 L12319-12322：阶段归属者为欢愉角色、持有者有升格标记（逐个持有者各自结算）
            return (
                lib.bts.api.funnyPlayer(event.player) &&
                player.countMark('bts_mk_huanju_shengge-clear') > 0
            );
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(player, 'funny', 1); // 源 L12324：AddBless(p, "@bless_funny")
        },
    },
};

export const translate = {
    bts_ch_zhenzhu: '真珠',
    bts_sk_jianying: '鉴映',
    bts_sk_jianying_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，你附加2层${get.poptip('bts_glossary_bless_funny_faq')}，若拥有欢愉行动的角色数不小于4/3/2/1，其执行一个额外的准备/摸牌/出牌/弃牌阶段（若不小于4，其先获得60枚${get.poptip('bts_glossary_funnypoint_faq')}并附加3层${get.poptip('bts_glossary_bless_funny_faq')}再执行这些阶段且阶段执行完毕后均移除）。若你为${get.poptip('bts_glossary_xingqi_faq')}，以此法获得的${get.poptip('bts_glossary_funnypoint_faq')}和${get.poptip('bts_glossary_bless_funny_faq')}翻倍，此技能能额外选任意名其他拥有欢愉行动的角色为目标。`,
    bts_sk_buzhui_funny: '补缀',
    bts_sk_buzhui_funny_info: `当其他角色受到伤害后，你可以弃置一张【杀】，附加1层${get.poptip('bts_glossary_bless_funny_faq')}，其执行你的欢愉行动。欢愉行动：回复1点体力。`,
    bts_sk_tunna: '吞纳',
    bts_sk_tunna_info: `当一名角色受到伤害时，你可以移除1层${get.poptip('bts_glossary_bless_funny_faq')}，伤害值-1。`,
    bts_sk_yilei: '艺垒',
    bts_sk_yilei_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}后，若你拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，回复2点${get.poptip('bts_glossary_nuqi_faq')}。`,
    bts_sk_rongcha: '容差',
    bts_sk_rongcha_info: `锁定技，若你拥有至少5层${get.poptip('bts_glossary_bless_funny_faq')}且拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，令其他角色回复的体力值+1。`,
    bts_sk_dongcha: '洞察',
    bts_sk_dongcha_info: `锁定技，欢愉角色准备阶段开始时，若你拥有${get.poptip('bts_glossary_huanju_shengge_faq')}标记，你附加1层${get.poptip('bts_glossary_bless_funny_faq')}。`,

    // ── 语音台词来源优先级：无名杀既有 > 太阳神（见 文档/文案与语音规范.md §2.1）──
    // 本角色太阳神源侧无任何音频（下列键仅有文本；`~` 阵亡文本为多角色共用、疑占位）——
    // 声明键而无 mp3 会使 rebuild --audio --check 报错，故全部暂注释保留原文，待日后取得源音频再启用
    //（《太阳神音频差异对照》§1.4/§四 备查）。
    // '$bts_sk_jianying1': "世人总道天意难违……",
    // '$bts_sk_jianying2': "本座偏要，执此一签，观照诸天。",
    // '$bts_sk_buzhui_funny1': "景星，高照。",
    // '$bts_sk_buzhui_funny2': "劫云，散尽。",
    // '$bts_sk_tunna1': "手到擒来。",
    // '$bts_sk_tunna2': "光映十方，百无禁忌。",
    // '$bts_sk_tunna3': "祝你大运正当头，开门红！",
    // '$bts_sk_tunna4': "赠你一支下下签，请笑纳。",
    // '~bts_ch_zhenzhu': "我不信…命定如此…",
};

export const simpleTranslate = {
    bts_sk_jianying_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}：自身+2层${get.poptip('bts_glossary_bless_funny_faq')}，欢愉角色数≥4/3/2/1时令目标执行额外准备/摸牌/出牌/弃牌阶段，≥4另赠60${get.poptip('bts_glossary_funnypoint_faq')}与3层祝福（阶段完毕回收）；${get.poptip('bts_glossary_xingqi_faq')}翻倍且可追加欢愉角色`,
    bts_sk_buzhui_funny_info: `其他角色受伤后，你可弃1杀并+1层${get.poptip('bts_glossary_bless_funny_faq')}，其回复1点体力`,
    bts_sk_tunna_info: `任意角色受伤时可移除1层${get.poptip('bts_glossary_bless_funny_faq')}，令伤害-1`,
    bts_sk_yilei_info: `锁；发动${get.poptip('bts_glossary_bisha_faq')}后若拥有${get.poptip('bts_glossary_huanju_shengge_faq')}，回复2点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_rongcha_info: `锁；≥5层${get.poptip('bts_glossary_bless_funny_faq')}且拥有${get.poptip('bts_glossary_huanju_shengge_faq')}时，其他角色回复的体力值+1`,
    bts_sk_dongcha_info: `锁；欢愉角色准备阶段开始时，若拥有${get.poptip('bts_glossary_huanju_shengge_faq')}则+1层${get.poptip('bts_glossary_bless_funny_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
