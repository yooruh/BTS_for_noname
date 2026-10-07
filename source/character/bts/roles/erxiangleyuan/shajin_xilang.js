// 砂金·戏浪（源 animal.lua L10233-10305）—— 量子元素与热意。
// 技能：胜局（必杀技·附加量子+热意/契约祝福）、热砂（受伤弃杀令全场量子化）、抛注（热意≥10补手牌）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '量子·欢愉·戏浪'; // 属性·命途
export const intro =
    `${B('砂金·戏浪')}给目标贴上量子元素，${get.poptip('bts_glossary_bless_reyi_faq')}攒满后把手牌补回五张。`;

export const character = {
    bts_ch_shajin_xilang: {
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_shengju', 'bts_sk_resha', 'bts_sk_paozhu_funny'],
    },
};

export const skill = {
    // ── 必杀技·胜局（源 st_shengju = SkillCard + ZeroCardViewAsSkill，L10234-10258）──
    // 出牌阶段，失5怒气，令任意名其他角色附加量子属性，你附加8层热意和4层契约祝福。
    bts_sk_shengju: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L10256）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10237）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shengju');
            lib.bts.api.loseAngry(player, 5); // 源 L10595：LoseAngry(player, 5)
            // 源 L10596-10598：目标各附加量子属性
            for (const target of event.targets)
                await lib.bts.api.addNature(target, 'dark');
            // 源 L10599-10600：自己附加8层热意、4层契约祝福
            await lib.bts.api.addBless(player, 'reyi', 8, player);
            await lib.bts.api.addBless(player, 'yingzi', 4, player);
            // 源 L10601-10612：各目标 15.6%（+欢愉祝福×10%）失1点体力；全成功则移除一半欢愉祝福并
            // 重复、任一失败停止。循环以「尚有欢愉祝福可半减」为前提（祝福耗尽即 break）——否则
            // targets 恒不减、只能靠概率失败退出，理论可无限循环（防回归）。
            while (event.targets.length) {
                let success = true;
                for (const target of event.targets) {
                    if (lib.bts.api.funnyNumber(player, 15.6)) await target.loseHp();
                    else {
                        success = false;
                        break;
                    }
                }
                if (!success) break;
                const funny = lib.bts.api.getBless(player, 'funny', -1);
                // 祝福<2 时 half=0 移除不掉、计数不再递减 → 停止（源「移除一半并重复」以能减半为前提）
                if (funny < 2) break;
                await lib.bts.api.removeBless(player, 'funny', Math.floor(funny / 2));
            }
        },
        ai: {
            // AI 口径：5怒气必杀，目标各附量子（重附→睡眠）并进概率失血循环（15.6%+欢愉每层10%，全成功弃半数续轮）；
            // 自身+8热意（≥2层时补至10触发抛注补牌）/+4影子；只打敌方（源 AI max_shengju value 8，StarRail-ai.lua；
            // 源 animal.lua L10594-10632）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_shengju')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() && t !== player && get.attitude(player, t) < 0,
                    )
                )
                    return -1; // 无敌方目标：附暗/失血循环对友方无正收益
                let value = 6;
                if (lib.bts.api.getBless(player, 'funny', -1) >= 2) value += 1; // 欢愉≥2：概率+20%
                if (lib.bts.api.getBless(player, 'reyi', -1) >= 2) value += 1; // 热意补至10触发抛注
                return Math.min(9, value);
            },
            result: {
                // 施动方：8层热意（热意≥2时本次触发抛注补牌）与4层影子
                player: (player) =>
                    lib.bts.api.getBless(player, 'reyi', -1) >= 2 ? 2 : 1.5,
                // 目标受损：概率失血期望（首轮≈0.16+0.1×欢愉）；重附量子→睡眠异常
                target: (player, target) => {
                    const funny = lib.bts.api.getBless(player, 'funny', -1);
                    let v = 0.6 + Math.min(1, 0.156 + 0.1 * funny) * 1.5;
                    if (lib.bts.api.getNature(null, target) === 'dark') v += 0.5;
                    return -v;
                },
            },
        },
    },

    // ── 触发技·热砂（源 st_resha = TriggerSkill DamageInflicted，L10260-10287）──
    // 你受到伤害时，可弃置一张【杀】，令所有量子/睡眠角色（含伤害来源）附加量子属性，你附加4层热意。
    bts_sk_resha: {
        trigger: { player: 'damageBegin2' },
        filter(event, player) {
            // 源 L10263-10265 + L10274：受伤且可弃【杀】（弃牌放 cost）；目标集 = 量子/睡眠角色 ∪
            // 伤害来源，集为空不触发（免白弃）。
            return (
                event.num > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                (game.hasPlayer(
                    (target) =>
                        lib.bts.api.getNature(null, target) === 'dark' ||
                        lib.bts.api.getAbnor(target, 'sleep'),
                ) ||
                    !!event.source)
            );
        },
        async cost(event, trigger, player) {
            // 源 L10274：askForCard(player, "Slash") —— 选择一张【杀】（结算移入 content）
            event.result = await player
                .chooseCard(
                    '热砂：是否弃置一张【杀】？',
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                )
                // AI 口径：弃1【杀】换4层热意（热意≥6时补至10触发抛注补牌）+量子/睡眠角色与来源各附暗；
                // 分数≤0 引擎取消=不发动（源 AI st_resha 有【杀】即愿挨打换收益，StarRail-ai.lua L3829）
                .set('ai', (card) => {
                    let value = 4;
                    if (lib.bts.api.getBless(player, 'reyi', -1) >= 6)
                        value += 1;
                    const spread = game.countPlayer(
                        (t) =>
                            lib.bts.api.getNature(null, t) === 'dark' ||
                            lib.bts.api.getAbnor(t, 'sleep'),
                    );
                    value += Math.min(3, spread) * 0.5;
                    return value - get.value(card);
                })
                .forResult();
        },
        logTarget(trigger, player) {
            // 源 L10265-10273：量子/睡眠角色 + 伤害来源
            const targets = game.filterPlayer(
                (target) =>
                    lib.bts.api.getNature(null, target) === 'dark' ||
                    lib.bts.api.getAbnor(target, 'sleep'),
            );
            if (trigger.source && !targets.includes(trigger.source))
                targets.push(trigger.source);
            return targets;
        },
        async content(event, trigger, player) {
            // 源 L10274：结算 cost 所选【杀】作为代价（自选数据在 event.cards）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L10280-10283：目标各附加量子属性，自己附加4层热意
            const targets = game.filterPlayer(
                (target) =>
                    lib.bts.api.getNature(null, target) === 'dark' ||
                    lib.bts.api.getAbnor(target, 'sleep'),
            );
            if (trigger.source && !targets.includes(trigger.source))
                targets.push(trigger.source);
            for (const target of lib.bts.api.seatOrder(targets))
                await lib.bts.api.addNature(target, 'dark');
            await lib.bts.api.addBless(player, 'reyi', 4, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·抛注（源 st_paozhu_funny = TriggerSkill Compulsory MarkChanged，L10289-10304）──
    // 热意达到10层时（每局限一次），将手牌补至五张。
    bts_sk_paozhu_funny: {
        trigger: { player: 'bts_mark_add' },
        forced: true,
        filter(event, player) {
            // 源 L10295：@bless_reyi 标记变化且热意≥10，且本技能未发动过
            return (
                event.markName === 'bts_bless_reyi' &&
                player.countMark('bts_bless_reyi') >= 10 &&
                !player.getStorage('bts_mk_paozhu_funny_used', false)
            );
        },
        async content(event, trigger, player) {
            // 源 L10671：记录已发动（@st_paozhu_funny 标记）
            player.setStorage('bts_mk_paozhu_funny_used', true, true);
            // 源 L10672：执行欢愉行动（效果见本技能 bts_funny 注册项）。initiator=event.name——
            // 自动日志已由引擎记录，行动时不再重复 logSkill。
            await lib.bts.api.funnyAct(player, null, null, event.name);
        },
        // 欢愉行动注册：funnyAct 泛化派发时执行——手牌补至5张（不设 ctx.done，跟随旧 if 链）。
        bts_funny: {
            order: 40,
            async act(ctx) {
                if (ctx.funny == null || ctx.funny === 5) ctx.after = false;
                if (ctx.funny == null) ctx.funny = 5;
                if (ctx.target.countCards('h') < ctx.funny)
                    await ctx.target.draw(
                        ctx.player,
                        ctx.funny - ctx.target.countCards('h'),
                    );
            },
        },
    },
};

export const marks = {
    bts_mk_paozhu_funny_used: {
        markKind: 'record',
    },
};

export const translate = {
    bts_ch_shajin_xilang: '砂金·戏浪',
    bts_sk_shengju: '胜局',
    bts_sk_shengju_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你附加8层${get.poptip('bts_glossary_bless_reyi_faq')}和4层${get.poptip('bts_glossary_bless_yingzi_faq')}，这些角色各附加${get.poptip('bts_glossary_nature_dark_faq')}，然后各以 15.6%（+${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）失去1点体力；若均成功，你移除一半${get.poptip('bts_glossary_bless_funny_faq')}并重复此流程。`,
    bts_sk_resha: '热砂',
    bts_sk_resha_info: `受到伤害时，你可以弃置一张【杀】，伤害来源和所有${get.poptip('bts_glossary_nature_dark_faq')}或${get.poptip('bts_glossary_abnormal_sleep_faq')}角色各附加${get.poptip('bts_glossary_nature_dark_faq')}，你附加4层${get.poptip('bts_glossary_bless_reyi_faq')}。`,
    bts_sk_paozhu_funny: '抛注',
    bts_sk_paozhu_funny_info: `锁定技，限定技，当你拥有至少10层${get.poptip('bts_glossary_bless_reyi_faq')}后，执行欢愉行动。仪式：欢愉时刻开始时，你拥有的${get.poptip('bts_glossary_bless_reyi_faq')}全部替换为${get.poptip('bts_glossary_bless_funny_faq')}，令此技能视为未发动过。`,
    bts_bless_reyi: '热意祝福',



    bts_bless_reyi_info: `来源：${get.poptip('bts_sk_shengju')}、${get.poptip('bts_sk_resha')}赋予；非暗/${get.poptip('bts_glossary_abnormal_sleep_faq')}造伤时全体+层；回合结束自然减少1层`,
    bts_mk_paozhu_funny_used: '抛注已用',

    '$bts_sk_shengju1': "准备好迎接大洗牌了么？",
    '$bts_sk_shengju2': "比浪潮先行一步，就能赢家通吃",
    '$bts_sk_resha1': "小心砸盘！",
    '$bts_sk_resha2': "硬着陆！",
    '$bts_sk_paozhu_funny1': "尽情享用，都算我的",
    '$bts_sk_paozhu_funny2': "这一杯，敬你们",

    '~bts_ch_shajin_xilang': "扫兴呐",
};

export const simpleTranslate = {
    bts_sk_shengju_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令目标+暗、自身+${get.poptip('bts_glossary_bless_reyi_faq')}和${get.poptip('bts_glossary_bless_yingzi_faq')}，目标各15.6%失1体力可连击`,
    bts_sk_resha_info: `受伤可弃杀令伤害来源和暗/${get.poptip('bts_glossary_abnormal_sleep_faq')}角色各+暗并+${get.poptip('bts_glossary_bless_reyi_faq')}`,
    bts_sk_paozhu_funny_info: `锁；${get.poptip('bts_glossary_bless_reyi_faq')}≥10执行欢愉行动，仪式换${get.poptip('bts_glossary_bless_funny_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_reyi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_reyi_faq',
        trigger: { global: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.num > 0 &&
                !!event.source &&
                lib.bts.api.getNature(null, event.source) !== 'dark' &&
                !lib.bts.api.getAbnor(event.source, 'sleep')
            );
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(player, 'reyi', 1, trigger.source);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_reyi_faq',
        name: '热意祝福',
        info: `当不为暗属性且不处于${get.poptip('bts_glossary_abnormal_sleep_faq')}的角色造成伤害后，所有${get.poptip('bts_glossary_bless_reyi_faq')}持有者各附加1层。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
