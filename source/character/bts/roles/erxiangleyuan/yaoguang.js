// 爻光（源 animal.lua L11838-11921，二相乐园·BOSS 包）—— 裳爻、光映与千光。
// 技能：裳爻（必杀技·失5怒发动指定层数的欢愉时刻，0.0116%概率全队连发）、
//       光映（欢愉角色用装备结算后弃【杀】为其附3层笑点祝福）、
//       千光（锁定技·其他角色回合结束时若你失过牌，其执行你的欢愉行动并与你拼点，你没输则再行动）。
// 笑点祝福（源 @bless_funnypoint，随本文件 buffSkills 注册）：持有者使用/弃置【杀】后获得3枚笑点。
import { lib, game, get, B } from '../../shared.js';
import { SKILL_AUDIO_BASE } from '../../../../tool/utils/audioPaths.js';
export const sort = 'erxiangleyuan';
export const title = '物理·欢愉·戎韬将军'; // 属性·命途·昵称
export const intro =
    `${B('爻光')}执签观照天意：${get.poptip('bts_sk_changyao')}挥签即来${get.poptip('bts_glossary_funny_time_faq')}，${get.poptip('bts_sk_guangying')}为登台的欢愉同伴备好${get.poptip('bts_glossary_bless_funnypoint_faq')}，${get.poptip('bts_sk_qianguang_funny')}则回敬离场的对手一次拼点。` +
    `<li>${B('爻光')}是欢愉角色：其造成的伤害会被欢愉规则取消，唯有处于${get.poptip('bts_glossary_huanju_shengge_faq')}时例外（阿哈·【欢愉万相】赋予，至其回合结束）——其定位为欢愉资源调度与补牌，本身几乎不依赖伤害输出。`;

export const character = {
    bts_ch_yaoguang: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: [
            'bts_sk_changyao',
            'bts_sk_guangying',
            'bts_sk_qianguang_funny',
            'bts_sk_funny_lock',
        ],
    },
};

export const skill = {
    // ── 必杀技·裳爻（源 max_changyao = SkillCard + ZeroCardViewAsSkill，L11839-11867）──
    // 出牌阶段，失去5点怒气，执行一次「不消耗笑点、按20枚（星启40枚）笑点换算」的欢愉时刻；
    // 此时刻内每名角色各有 0.0116%+（欢愉祝福每层+10%）概率将欢愉行动执行十次。
    bts_sk_changyao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L11861）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_changyao');
            lib.bts.api.loseAngry(player, 5); // 源 L11843：LoseAngry(player, 5)
            const n = lib.bts.api.god(player) ? 40 : 20; // 源 L11844-11845：God → 40，否则 20
            // 源 L11846：FunnyTime(room, n, "max_changyao")——20/40 枚换算=2/4 层；num='max_changyao'
            // 由 utils.funnyTime 承接 0.0116% 连发分支（概率含欢愉祝福加成）。
            await lib.bts.api.funnyTime(null, n, 'max_changyao', event.name);
        },
        ai: {
            // AI 口径（源 StarRail-ai L3966-3981：怒满即用，use_value 9 / priority 3）：
            // 欢愉时刻对全场欢愉角色均生效——己方欢愉角色更多才积极；敌方占优时压低（行动受益归敌）。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_changyao')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1;
                const friends = game.filterPlayer(
                    (p) =>
                        p.isAlive() &&
                        p !== player &&
                        lib.bts.api.funnyPlayer(p) &&
                        get.attitude(player, p) > 0,
                ).length;
                const enemies = game.filterPlayer(
                    (p) =>
                        p.isAlive() &&
                        p !== player &&
                        lib.bts.api.funnyPlayer(p) &&
                        get.attitude(player, p) < 0,
                ).length;
                if (enemies > friends) return 3; // 敌方欢愉角色更多：行动收益偏敌，仅保底
                return friends >= 1 ? 8 : 7; // 己方欢愉受益，或至少自身摸2+2层祝福
            },
            result: {
                player: 1.5, // 自身欢愉行动（摸2）+2层欢愉祝福
            },
        },
    },

    // ── 触发技·光映（源 st_guangying = TriggerSkill Compulsory CardFinished，L11868-11885）──
    // 某名欢愉角色（含爻光自己）使用装备牌结算完毕后，你可以弃置一张【杀】，为其附加3层笑点祝福。
    // 引擎机制：源 can_trigger 绕开「焦点须拥有技能」的基类检查（仅要求焦点是 FunnyPlayer）——
    // 无名杀以 global useCardAfter 对每名爻光触发还原。
    bts_sk_guangying: {
        trigger: { global: 'useCardAfter' },
        logTarget: 'player',
        filter(event, player) {
            // 源 can_trigger L11881-11883：用牌者存活且拥有欢愉行动；弃【杀】在 cost 完成
            return (
                !!event.player &&
                event.player.isAlive() &&
                lib.bts.api.funnyPlayer(event.player) &&
                !!event.card &&
                get.type(event.card) === 'equip' &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L11874：room:askForCard(p, "Slash", ...)——先问是否发动、再选【杀】（补缀同款两步）
            const want = await player
                .chooseBool(
                    `光映：是否弃置一张【杀】，为${get.translation(trigger.player)}附加3层笑点祝福？`,
                )
                // AI 口径（源 ai_skill_cardask["@st_guangying"] L4952-4963：use.from 非友方即取消；
                // isFriend 视自己为友方——get.attitude(self,self)=0 须特判）
                .set('ai', () => {
                    const target = trigger.player;
                    if (!target || !target.isAlive()) return false;
                    return (
                        target === player || get.attitude(player, target) > 0
                    );
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
            await lib.bts.api.addBless(trigger.player, 'funnypoint', 3); // 源 L11877：AddBless(player=用装备者, "@bless_funnypoint", 3)
        },
        ai: {
            // 供跨技能估值：自身弃1【杀】，目标得3层笑点祝福（使用/弃置【杀】后+3笑点，随回合衰减）
            result: { player: 0.5, target: 1.5 },
        },
    },

    // ── 锁定技·千光（源 st_qianguang_funny = TriggerSkill Compulsory CardsMoveOneTime/EventPhaseStart，L11886-11920）──
    // 其他角色的回合结束时，若你于此回合内失去过牌，其执行你的欢愉行动（摸2）并与你拼点；
    // 若你没输，你执行欢愉行动（摸2）。欢愉行动：摸两张牌。
    //
    // 实现要点：
    // ① 「本回合内失去过牌」= 爻光失去手牌/装备区的牌（含使用、弃置、被获得）→ 打内部标记；
    //    标记于**任意角色回合结束时**先消费后清除（源 gamerule_ex NotActive 的 -clear 全场清理、
    //    检查优先级高于清理——移植以单技能内「先读后清」还原；勿用 bts_gamerule_phase 的 -clear，
    //    其只清回合归属者自己的标记，语义不符）。
    // ② 读失牌用 lose 事件的顶层 hs/es 字段（与 getlx 无关——使用牌的 lose 带 getlx:false，
    //    getl() 会返回空、顶层字段照填，源语义「使用也算失去」由此还原）。
    // ③ 拼点次序按源：先「其执行你的欢愉行动」→ 双活且有手牌才拼点 → 爻光没输（含平局）再行动。
    // ④ silent：失牌/清理两路静默，仅效果路径手动播报（源 SendComLog 随机语音1/2；
    //    拼点结果 3/4 经 logAudio 指定条目，等价源 broadcastSkillInvoke）。
    bts_sk_qianguang_funny: {
        bts_funny_skill: true, // 欢愉技标签：funnyPlayer 据此判定「拥有欢愉行动」
        trigger: { player: 'loseAfter', global: 'phaseAfter' },
        forced: true,
        silent: true,
        // 指定语音：logSkill(args=[n]) → 播第 n 条（官方 logAudio 范式，potyinhui/mbsizi 同款）
        logAudio: (index) =>
            typeof index === 'number'
                ? `${SKILL_AUDIO_BASE}bts_sk_qianguang_funny${index}.mp3`
                : 2,
        filter(event, player, triggername) {
            if (triggername === 'loseAfter') {
                // 源 L11890-11893：失去手牌或装备区的牌（from_places 含 PlaceHand/PlaceEquip）
                return !!(event.hs?.length || event.es?.length);
            }
            // phaseAfter：有任何失牌标记即进入（效果与清理共用入口）
            return player.countMark('bts_sk_qianguang_funny') > 0;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'loseAfter') {
                player.addMark('bts_sk_qianguang_funny', 1);
                return;
            }
            // 快照进入条件。源 gamerule_ex：检查在 NotActive 先行、清理随后（优先级 -9）——即效果
            // 期间的失牌（如拼点牌消耗）同样被同回合清理吃掉；实机教训（2026-10-11）：清理若提前
            // 到效果前，拼点耗牌会残留到下个回合结束造成连锁触发——故改为「效果后统一清理」。
            const n = player.countMark('bts_sk_qianguang_funny');
            if (n > 0 && trigger.player !== player && player.isAlive()) {
                // 其他角色的回合结束：其执行你的欢愉行动（源 L11900：FunnyAct(p, nil, player)）
                player.logSkill('bts_sk_qianguang_funny', null, null, null, [
                    get.rand(1, 2),
                ]);
                await lib.bts.api.funnyAct(
                    player,
                    null,
                    trigger.player,
                    event.name,
                );
                // 双活且有手牌才拼点（源 L11901-11903）
                if (
                    player.isAlive() &&
                    trigger.player.isAlive() &&
                    player.countCards('h') &&
                    trigger.player.countCards('h')
                ) {
                    const result = await trigger.player
                        .chooseToCompare(player)
                        .forResult();
                    if (!result.cancelled) {
                        // 爻光没输（赢或平局）→ 你执行欢愉行动（源 L11905-11910：回合者未获胜即
                        // FunnyAct(p)；语音3=爻光没输、4=回合者获胜——纯播报，经 trySkillAudio）。
                        game.trySkillAudio(
                            'bts_sk_qianguang_funny',
                            player,
                            true,
                            null,
                            null,
                            [result.bool ? 4 : 3],
                        );
                        if (!result.bool)
                            await lib.bts.api.funnyAct(
                                player,
                                null,
                                null,
                                event.name,
                            );
                    }
                }
            }
            // 效果后清理（也覆盖自己回合结束的静默清理；含效果期间新产生的失牌标记）
            const left = player.countMark('bts_sk_qianguang_funny');
            if (left > 0) player.removeMark('bts_sk_qianguang_funny', left);
        },
        // 欢愉行动注册：摸 `funny` 张（源 FunnyAct 首分支 L11678-11684；funny 缺省 2）。
        bts_funny: {
            order: 10, // 源分支序：千光(1) → 连线(3) → 抛注(4) → 补缀(5)
            async act(ctx) {
                if (ctx.funny == null || ctx.funny === 2) ctx.after = false;
                if (ctx.funny == null) ctx.funny = 2;
                await ctx.target.draw(ctx.funny);
                ctx.done = true;
            },
        },
    },
};

export const translate = {
    bts_ch_yaoguang: '爻光',
    bts_sk_changyao: '裳爻',
    bts_sk_changyao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，执行一次不消耗${get.poptip('bts_glossary_funnypoint_faq')}、且按20枚（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为40枚）${get.poptip('bts_glossary_funnypoint_faq')}换算的${get.poptip('bts_glossary_funny_time_faq')}；此时刻内，每名角色各有 0.0116%（+${get.poptip('bts_glossary_bless_funny_faq')}每层10%）的概率将${get.poptip('bts_glossary_funny_act_faq')}执行十次。`,
    bts_sk_guangying: '光映',
    bts_sk_guangying_info: `当拥有${get.poptip('bts_glossary_funny_act_faq')}的角色使用装备牌结算完毕后，你可以弃置一张【杀】，为其附加3层${get.poptip('bts_glossary_bless_funnypoint_faq')}。`,
    bts_sk_qianguang_funny: '千光',
    bts_sk_qianguang_funny_info: `锁定技，${get.poptip('bts_glossary_funny_skill_faq')}，其他角色的回合结束时，若你于此回合内失去过牌，其执行你的${get.poptip('bts_glossary_funny_act_faq')}并与你拼点，若你没输，你执行${get.poptip('bts_glossary_funny_act_faq')}。欢愉行动：摸两张牌。`,

    bts_bless_funnypoint: '笑点祝福',
    bts_bless_funnypoint_info: `来源：${get.poptip('bts_sk_guangying')}赋予；当你使用或弃置【杀】后，获得3枚${get.poptip('bts_glossary_funnypoint_faq')}；回合结束自然减少1层`,

    // ── 语音台词（源 L20321-20341；音频齐备，未命中的键将来再补）──
    '$bts_sk_changyao1': '世人总道天意难违……',
    '$bts_sk_changyao2': '本座偏要，执此一签，观照诸天。',
    '$bts_sk_guangying1': '景星，高照。',
    '$bts_sk_guangying2': '劫云，散尽。',
    '$bts_sk_qianguang_funny1': '手到擒来。',
    '$bts_sk_qianguang_funny2': '光映十方，百无禁忌。',
    '$bts_sk_qianguang_funny3': '祝你大运正当头，开门红！',
    '$bts_sk_qianguang_funny4': '赠你一支下下签，请笑纳。',
    '~bts_ch_yaoguang': '我不信…命定如此…',
};

export const simpleTranslate = {
    bts_sk_changyao_info: `失5${get.poptip('bts_glossary_nuqi_faq')}发动不耗笑点、按20/40枚（${get.poptip('bts_glossary_xingqi_faq')}）换算的${get.poptip('bts_glossary_funny_time_faq')}；此时刻内全场各有0.0116%+概率连发十次行动`,
    bts_sk_guangying_info: `欢愉角色用装备结算后，可弃1【杀】为其+3层${get.poptip('bts_glossary_bless_funnypoint_faq')}`,
    bts_sk_qianguang_funny_info: `锁，${get.poptip('bts_glossary_funny_skill_faq')}；其他角色回合结束时，若你本回合失去过牌，其执行你的${get.poptip('bts_glossary_funny_act_faq')}（摸2）并拼点，你没输则再行动；欢愉行动：摸2`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_funnypoint: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_funnypoint_faq',
        // 源 gamerule_ex·CardUsed L1119-1121 ＋ CardsMoveOneTime L1887-1891：
        // 持有者使用或弃置【杀】后，获得3枚笑点（固定值，与层数无关；层数仅决定持续时间）。
        trigger: { player: ['useCard', 'discardAfter'] },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (triggername === 'useCard') return event.card?.name === 'sha';
            // 弃置：恰好 1 张（源 card_ids:length() === 1）且为【杀】（雷杀/火杀 name 同为 'sha'）
            return (
                (event.cards || []).length === 1 &&
                event.cards[0].name === 'sha'
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_funnypoint', 3); // 源 L1120/L1889：gainMark("@funnypoint", 3)
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_funnypoint_faq',
        name: '笑点祝福',
        info: `当你使用或弃置【杀】后，获得3枚${get.poptip('bts_glossary_funnypoint_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
