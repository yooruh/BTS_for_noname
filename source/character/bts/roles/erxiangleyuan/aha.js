// 阿哈（原创角色，非太阳神移植——源 animal.lua 无阿哈）—— 愿力、愉使与欢愉万相。
// 技能：阿哈！（必杀技·弃8愿力连发【欢愉万相】）、愉使（弃杀钦定唯一欢愉令使，不限次；被指定者可用1张
// 虚拟【杀】）、公演（使用/弃置【杀】或执行欢愉行动攒愿力）。规则：①【无中生有】在阿哈手上变为【欢愉万相】；②阿哈时刻——欢愉时刻
// （源 FunnyTime，本移植原本无触发点）改由阿哈的准备阶段开始时触发；③「欢愉升格」豁免源版
// 「欢愉角色伤害被取消」约束（还原见 rules/globalrules.js bts_gamerule_damage）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '虚数·欢愉·欢愉星神'; // 称号
export const intro =
    `${B('阿哈')}是欢愉本身：以${get.poptip('bts_glossary_yuanli_faq')}驱动${B(get.poptip('bts_sk_aha'))}让【${get.poptip('bts_glossary_huanju_wanxiang_faq')}】在出牌阶段接连上演，${B(get.poptip('bts_sk_yushizhe'))}钦定${get.poptip('bts_glossary_huanju_lingshi_faq')}代收信仰，${B(get.poptip('bts_sk_gongyan'))}为每一次谢幕累积愿力；当阿哈登台，${get.poptip('bts_glossary_aha_moment_faq')}降临——欢愉角色得以${get.poptip('bts_glossary_huanju_shengge_faq')}，暂获伤人的自由。` +
    `<li>${B(get.poptip('bts_sk_gongyan'))}用【杀】与欢愉行动攒愿力至8枚即可发动${B(get.poptip('bts_sk_aha'))}；欢愉角色造成的伤害原会被欢愉规则取消（源版约束），唯${get.poptip('bts_glossary_huanju_shengge_faq')}者例外`;

export const character = {
    bts_ch_aha: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_aha', 'bts_sk_yushizhe', 'bts_sk_gongyan'],
    },
};

export const skill = {
    // ── 必杀技·阿哈！（原创设计）──
    // 出牌阶段，弃8枚愿力：此刻立即视为使用【欢愉万相】，并在接下来的两个出牌阶段开始时各再使用一次。
    bts_sk_aha: {
        // 终结技（原创必杀，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（愿力发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        enable: 'phaseUse',
        filter(event, player) {
            return player.countMark('bts_mk_yuanli') >= 8;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_aha');
            player.removeMark('bts_mk_yuanli', 8);
            // 此刻：立即视为使用【欢愉万相】
            await lib.bts.api.useHuanjuWanxiang(player);
            // 之后的两个出牌阶段开始时各再放一次（计数待发；重复发动叠加——用户定夺）
            player.addMark('bts_mk_aha_pending', 2);
        },
        group: ['bts_sk_aha_after', 'bts_sk_aha_rule'],
        subSkill: {
            // 待放结算：出牌阶段开始时消耗1枚计数并视为使用【欢愉万相】（银狼999·无启 pending 标记范式）
            after: {
                trigger: { player: 'phaseUseBegin' },
                forced: true,
                filter(event, player) {
                    return player.countMark('bts_mk_aha_pending') > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_mk_aha_pending', 1);
                    await lib.bts.api.useHuanjuWanxiang(player);
                },
            },
            // 规则技（非显示）：①【无中生有】在阿哈手上变为【欢愉万相】；②阿哈时刻（欢愉时刻改由阿哈准备阶段触发）
            rule: {
                name: '欢愉规则',
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                popup: false,
                async content(event, trigger, player) {
                    // 阿哈时刻：欢愉时刻（源 FunnyTime L11356-11368，原本由洗牌触发；本设计改为阿哈的
                    // 准备阶段开始时）→ 全场各执行一次欢愉行动（funnyAct 按各技能的 bts_funny
                    // 注册表泛化派发，含阿哈自己的「视为使用【欢愉万相】」行动）。
                    // initiator=event.name（本规则子技无自动日志）→ 行动执行时由 funnyAct 补记各技能日志。
                    await lib.bts.api.funnyTime(null, null, null, event.name);
                },
                mod: {
                    cardname(card, player, name) {
                        // 规则①：本次使用中，阿哈手上的【无中生有】按【欢愉万相】结算
                        //（useCard 创建时经 VCard→get.name(card, owner) 走本 mod 链改名）
                        if (name === 'wuzhong') return 'bts_cd_huanju_wanxiang';
                    },
                },
            },
        },
        // 欢愉行动注册（自注册重构）：funnyAct 泛化派发时执行——视为使用【欢愉万相】
        //（阿哈（原创）：其【无中生有】已按规则变为万相；体系统一入口 utils.useHuanjuWanxiang）。
        bts_funny: {
            order: 10,
            async act(ctx) {
                await lib.bts.api.useHuanjuWanxiang(ctx.player);
                ctx.done = true;
            },
        },
        ai: {
            // AI 口径：愿力≥8（filter 门控）即发动——收益=3 次万相（自己+令使+全场各摸1、欢愉升格）；
            // 令使在场时万相额外给其摸1，评分略高（原创设计）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_aha')) return -1;
                return game.hasPlayer(
                    (p) => p.isAlive() && p.countMark('bts_mk_huanju_lingshi') > 0,
                )
                    ? 9
                    : 8;
            },
            // 自己摸 1~2 张 + 欢愉升格；万相结算详见 card/bts_cd
            result: { player: 2 },
        },
    },

    // ── 主动技·愉使（原创设计）──
    // 出牌阶段（不限次），弃置一张【杀】并选择一名其他角色（不可选自己）：其成为唯一的「欢愉令使」。
    // 注：id 取「愉使者」拼写（yushizhe），避免与风堇·愈世（bts_sk_yushi）撞名。
    bts_sk_yushizhe: {
        enable: 'phaseUse',
        usable: Infinity, // 「每回合无限制」（显式声明；不写 usable 时本就不限次）
        filter(event, player) {
            return (
                player.countCards('he', (card) => get.name(card) === 'sha') > 0
            );
        },
        filterCard(card, player) {
            return (
                get.name(card) === 'sha' &&
                lib.filter.cardDiscardable(card, player)
            );
        },
        selectCard: 1,
        position: 'he',
        filterTarget(card, player, target) {
            return target !== player; // 其他角色（不可选自己）
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yushizhe');
            await player.discard(event.cards);
            // 欢愉令使唯一：先撤全场旧令使，再授予新令使（换人即转移）
            for (const p of game.filterPlayer(
                (p) => p.countMark('bts_mk_huanju_lingshi') > 0,
            )) {
                p.removeMark(
                    'bts_mk_huanju_lingshi',
                    p.countMark('bts_mk_huanju_lingshi'),
                );
            }
            const target = event.targets[0];
            target.addMark('bts_mk_huanju_lingshi', 1);
            // 被指定为欢愉令使的角色可使用1张虚拟【杀】——不计入使用次数；
            // 即时机会（此刻不用则作废，须待阿哈再次指定）。
            if (!target.isAlive()) return;
            const vsha = { name: 'sha', isCard: true };
            if (
                !game.hasPlayer(
                    (p) => p.isAlive() && p !== target && target.canUse(vsha, p, true),
                )
            ) {
                return; // 无合法目标（含距离限制）：无处可用则不给机会（机会作废）
            }
            const want = await target
                .chooseBool('愉使：是否使用一张虚拟【杀】（不计次数）？')
                // AI 口径：存在对令使（评估者）净收益为正的目标（get.effect 含态度）才用刀（原创设计）
                .set('ai', () =>
                    game.hasPlayer(
                        (p) =>
                            p.isAlive() &&
                            p !== target &&
                            target.canUse(vsha, p, true) &&
                            get.effect(p, vsha, target, target) > 0,
                    ),
                )
                .forResult();
            if (!want.bool) return;
            const result = await target
                .chooseTarget(
                    '愉使：请选择【杀】的目标',
                    [1, 1],
                    (card, p, t) => t !== p && p.canUse(vsha, t, true),
                )
                // AI 口径：价值取 get.effect（对敌为正、对友为负→自然不误伤）（原创设计）
                .set('ai', (t) => get.effect(t, vsha, target, target))
                .forResult();
            const t = result.targets?.[0];
            if (!t) return;
            const next = target.useCard(vsha, t);
            next.addCount = false; // 不计入出牌阶段的【杀】使用次数（福利刀）
            await next;
        },
        group: ['bts_sk_yushizhe_lingshi'],
        subSkill: {
            // 欢愉令使的回合开始时，阿哈获得1枚愿力
            lingshi: {
                trigger: { global: 'phaseZhunbeiBegin' },
                forced: true,
                popup: false,
                filter(event, player) {
                    return event.player.countMark('bts_mk_huanju_lingshi') > 0;
                },
                async content(event, trigger, player) {
                    player.addMark('bts_mk_yuanli', 1);
                },
            },
        },
        ai: {
            // AI 口径：弃1【杀】换唯一令使（其回合开始+1愿力）；已有友方令使不再换人（白耗杀）；
            // 距8愿力临门（≥6）时借令使管道加速（原创设计）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_yushizhe')) return -1;
                const lingshi = game.filterPlayer(
                    (p) => p.isAlive() && p.countMark('bts_mk_huanju_lingshi') > 0,
                );
                if (lingshi.length && lingshi.every((p) => get.attitude(player, p) >= 0))
                    return -1;
                const sha = player.countCards('he', (c) => get.name(c) === 'sha');
                if (!sha) return -1; // filter 兜底（防按钮评估期误评）
                if (player.countMark('bts_mk_yuanli') >= 6) return 6;
                return sha >= 2 ? 4 : 2;
            },
            result: {
                // 令使管道每回合+1愿力（持续收益）；目标获1张虚拟【杀】机会=目标获益（态度加权排除敌方）
                player: (player) => (player.countMark('bts_mk_yuanli') >= 6 ? 2 : 1.5),
                target: 1,
            },
        },
    },

    // ── 锁定技·公演（原创设计）──
    // 当你使用或弃置【杀】，或执行欢愉行动（使用/视为使用【无中生有】或【欢愉万相】）后，获得1枚愿力。
    bts_sk_gongyan: {
        trigger: { player: ['useCard', 'loseAfter'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'loseAfter') {
                // 弃置【杀】（照银狼999·狼尊的 discard 判据：含各途径弃置；不含“使用”进处理区）
                return (
                    event.type === 'discard' &&
                    (event.cards || []).some(
                        (card) => get.name(card) === 'sha',
                    )
                );
            }
            // 使用【杀】；【无中生有】在阿哈手上已变为【欢愉万相】，故直接判万相（含各种“视为使用”）
            return ['sha', 'bts_cd_huanju_wanxiang'].includes(event.card?.name);
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_yuanli', 1);
        },
    },
};

export const marks = {
    // 愿力（阿哈资源标记；原创）
    bts_mk_yuanli: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_yuanli_faq',
    },
    // 欢愉令使（唯一身份标记；换人即转移）
    bts_mk_huanju_lingshi: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_huanju_lingshi_faq',
    },
    // 欢愉升格（持续至该角色回合结束；'-clear' 后缀由 bts_gamerule_phase 于其回合结束时统一清理）
    'bts_mk_huanju_shengge-clear': {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_huanju_shengge_faq',
    },
    // 阿哈·万相待放次数（出牌阶段开始时消耗；intro 文案见 translate _info）
    bts_mk_aha_pending: {
        markKind: 'mark',
        markType: 'text',
    },
};

export const glossary = [
    {
        id: 'bts_glossary_yuanli_faq',
        name: '愿力',
        info: `阿哈的资源标记：${get.poptip('bts_sk_gongyan')}与其欢愉令使的回合开始时赋予；「${get.poptip('bts_sk_aha')}」消耗8枚发动。`,
    },
    {
        id: 'bts_glossary_huanju_lingshi_faq',
        name: '欢愉令使',
        info: `由「${get.poptip('bts_sk_yushizhe')}」授予的唯一身份（再次授予则转移）：其回合开始时，阿哈获得1枚愿力。`,
    },
    {
        id: 'bts_glossary_huanju_shengge_faq',
        name: '欢愉升格',
        info: '由【欢愉万相】赋予：持续至该角色的回合结束。期间该角色造成的伤害不再被欢愉行动约束——欢愉角色造成的伤害原本会被欢愉规则取消。',
    },
    {
        id: 'bts_glossary_aha_moment_faq',
        name: '阿哈时刻',
        info: '阿哈的准备阶段开始时降临的欢愉时刻：全场角色各执行一次欢愉行动。',
    },
    {
        id: 'bts_glossary_huanju_wanxiang_faq',
        name: '欢愉万相',
        info: `阿哈与其欢愉令使各摸一张牌，目标摸一张牌，所有角色各摸一张牌；拥有欢愉行动的角色进入欢愉${get.poptip('bts_glossary_bless_shengge_faq')}状态。`,
    },
];

export const translate = {
    bts_ch_aha: '阿哈',
    bts_sk_aha: '阿哈！',
    bts_sk_aha_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以弃8枚${get.poptip('bts_glossary_yuanli_faq')}，此刻以及之后的两个出牌阶段开始时，你视为使用【${get.poptip('bts_glossary_huanju_wanxiang_faq')}】。`,
    bts_sk_yushizhe: '愉使',
    bts_sk_yushizhe_info: `出牌阶段（每回合无限制），你可以弃置一张【杀】并选择一名其他角色，其视为${get.poptip('bts_glossary_huanju_lingshi_faq')}；被指定的角色可使用1张虚拟【杀】（不计入次数，此刻不用则作废）：其回合开始时，你获得1枚${get.poptip('bts_glossary_yuanli_faq')}。`,
    bts_sk_gongyan: '公演',
    bts_sk_gongyan_info: `锁定技，当你使用或弃置【杀】，或执行欢愉行动后，你获得1枚${get.poptip('bts_glossary_yuanli_faq')}。欢愉行动：使用或视为使用【无中生有】或【${get.poptip('bts_glossary_huanju_wanxiang_faq')}】。`,
    bts_mk_yuanli: '愿力',
    bts_mk_huanju_lingshi: '欢愉令使',
    'bts_mk_huanju_shengge-clear': '欢愉升格',
    bts_mk_aha_pending: '万相待放',
    bts_mk_aha_pending_info:
        '阿哈还能在之后的出牌阶段开始时视为使用【欢愉万相】（数字为剩余次数）。',
};

export const simpleTranslate = {
    bts_sk_aha_info: `${get.poptip('bts_glossary_bisha_faq')}；弃8${get.poptip('bts_glossary_yuanli_faq')}，此刻与之后2个出牌阶段开始时视为使用【欢愉万相】`,
    bts_sk_yushizhe_info: `不限次；弃1【杀】选一名其他角色为${get.poptip('bts_glossary_huanju_lingshi_faq')}（唯一）；被指定者可用1张虚拟杀（不计次）；其回合开始你+1愿力`,
    bts_sk_gongyan_info: `锁；使用/弃置【杀】或执行欢愉行动后+1${get.poptip('bts_glossary_yuanli_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
