// 黄泉（源 animal.lua L4760-4876）—— 残梦累积与终结出牌阶段。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
// 残梦封锁（源 st_canmeng flag L669-680）：任一存活角色带标记期间全场生效。
// 特化方法经 bts_sk_canmeng.util 挂载（跨文件以 lib.skill['bts_sk_canmeng'].util.canmengActive 访问；
// 消费方：globalBuffs 混乱守卫、utils.getBless 残梦期间祝福无效）。
export function canmengActive() {
    return game.hasPlayer(
        (player) =>
            player.isAlive() && player.countMark('bts_mk_canmeng_active') > 0,
    );
}

export const sort = 'pinuokangni';
export const title = '雷·虚无·自称「巡海游侠」的旅人'; // 属性·命途
export const intro = `${B('黄泉')}靠异常与诅咒被移除攒${get.poptip('bts_glossary_canmeng_faq')}，攒满9枚开${get.poptip('bts_glossary_canmeng_faq')}终结全场。`;
export const character = {
    bts_ch_huangquan: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_canmeng', 'bts_sk_chigui', 'bts_sk_feidu'],
    },
};
export const skill = {
    bts_sk_canmeng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（残梦发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        // 特化方法（叁岛 util 范式）：残梦封锁判定 canmengActive，见文件上方导出。
        util: { canmengActive },
        // 残梦封锁（源 setPlayerCardLimitation "use,response"）：残梦结算期间全场不能使用/打出任何牌。
        // 触发挂 bts_sk_canmeng（封锁器白名单放行）；与发动分支共用一个技能对象，以 triggername 区分。
        trigger: { global: ['chooseToUseBegin', 'chooseToRespondBegin'] },
        forced: true,
        silent: true,
        // 子技须经 group 挂载（expandSkills 只展开 group、不自动展开 subSkill，否则残梦无法收尾/解除封锁；
        // 参照迭奏/天流范式）
        group: ['bts_sk_canmeng_dis', 'bts_sk_canmeng_finisher'],
        enable: 'phaseUse',
        filter(event, player, triggername) {
            // 触发分支（残梦封锁）：残梦期间全场禁牌（resolver chooseToUseBegin 迁入）。
            if (triggername)
                return lib.skill['bts_sk_canmeng']?.util?.canmengActive?.();
            // 发动分支：需9枚残梦标记。
            return player.countMark('bts_mk_canmeng') >= 9;
        },
        async content(event, trigger, player) {
            // 触发分支：只设 filterCard（封锁所有牌），**绝不要设 filterButton**——chooseToUse/
            // chooseToRespond 的 AI 分支直接调 game.check()，AI 事件无 dialog，Check.button 读
            // event.dialog.buttons 会抛错并中断事件链（check.js:94 / content.js:4649）。技能按钮封锁
            // 由 bts_sk_canmeng_blocker（skillBlocker）负责。
            if (event.triggername) {
                trigger.filterCard = () => false;
                return;
            }
            lib.bts.aiGuard.record(player, 'bts_sk_canmeng');
            player.removeMark('bts_mk_canmeng', 9);
            // 源 L4766-4778：全场技能/祝福/护盾无效、不能使用/打出手牌；封锁器白名单放行残梦本体
            // 与「蚀」子技（bts_sk_canmeng_dis）。
            player.addMark('bts_mk_canmeng_active', 1);
            const alive = lib.bts.api.seatOrder(
                game.filterPlayer((target) => target.isAlive()),
            );
            for (const target of alive)
                target.addSkillBlocker('bts_sk_canmeng_blocker');
            player.removeMark('bts_mk_canmeng_dis_used', player.countMark('bts_mk_canmeng_dis_used'));
            // 源 L4780 ExtraPhase(Play)：真实额外出牌阶段，期间只能以「蚀」子技行动，
            // 出牌阶段结束由 finisher 对被蚀角色造成伤害并解除封锁。
            lib.bts.api.extraPhase(player, 'phaseUse');
            // 刷新当前出牌阶段技能按钮缓存
            const chooseEvent = event.getParent?.('chooseToUse');
            if (chooseEvent) chooseEvent._skillChoice = void 0;
        },
        subSkill: {
            // 蚀（源 st_canmeng_dis，L4793-4813）：额外出牌阶段限三次，弃置一名角色一张牌并标记。
            dis: {
                enable: 'phaseUse',
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_canmeng_active') > 0 &&
                        player.countMark('bts_mk_canmeng_dis_used') < 3 &&
                        game.hasPlayer(
                            (target) =>
                                target !== player &&
                                target.isAlive() &&
                                target.countCards('he') > 0,
                        )
                    );
                },
                filterTarget(event, player, target) {
                    return target !== player && target.countCards('he');
                },
                selectTarget: 1,
                // AI 口径：残梦额外阶段限三次，弃目标1牌并标记（阶段末对被蚀者各1伤害）；
                // 优先未标记敌方（同一目标多标记只结算1次伤害，源 L4826-4842）；filter 已用 hasPlayer
                // 正确拦截（曾用 filterPlayer 数组恒真）；敌方全无可弃牌时 order 返回 -1 垫底。
                ai: {
                    order(item, player) {
                        if (lib.bts.aiGuard.blocked(player, 'bts_sk_canmeng_dis'))
                            return -1;
                        let best = 0;
                        for (const t of game.players) {
                            if (!t.isAlive() || t === player || get.attitude(player, t) >= 0)
                                continue;
                            if (t.countCards('he') === 0) continue;
                            const v =
                                t.countMark('bts_mk_canmeng_damage') > 0
                                    ? 1
                                    : 2.5;
                            if (v > best) best = v;
                        }
                        return best ? Math.min(8, 3 + best) : -1;
                    },
                    result: {
                        // 敌方=-（弃1牌≈1 + 未标记再≈1.5）；友方/自己不为目标（负分不可选）
                        target: (player, target) => {
                            if (get.attitude(player, target) >= 0) return -1;
                            return target.countMark('bts_mk_canmeng_damage') > 0
                                ? -1
                                : -2.5;
                        },
                    },
                },
                async content(event, trigger, player) {
                    lib.bts.aiGuard.record(player, 'bts_sk_canmeng_dis');
                    const target = event.targets[0];
                    player.addMark('bts_mk_canmeng_dis_used', 1);
                    await player
                        .discardPlayerCard('he', target, true)
                        .set('logSkill', ['bts_sk_canmeng', target]);
                    target.addMark('bts_mk_canmeng_damage', 1);
                },
            },
            // 残梦出牌阶段结束结算（源 st_canmeng L4826-4842）：
            // 出牌阶段结束时对被蚀角色各造成1点伤害，并解除全场封锁。
            finisher: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player, triggername) {
                    if (!player.countMark('bts_mk_canmeng_active')) return false;
                    if (triggername === 'death') return true;
                    const pl = event.phaseList;
                    return Array.isArray(pl) && pl.length === 1 && pl[0] === 'phaseUse';
                },
                async content(event, trigger, player) {
                    if (event.triggername === 'phaseAfter') {
                        for (const target of lib.bts.api.seatOrder(
                            game.filterPlayer(
                                (t) =>
                                    t.isAlive() &&
                                    t.countMark('bts_mk_canmeng_damage'),
                            ),
                        )) {
                            target.removeMark('bts_mk_canmeng_damage', target.countMark('bts_mk_canmeng_damage'));
                            const damage = target.damage(player, 1, 'nocard');
                            damage.reason = 'bts_sk_canmeng'; // 源 DamageStruct(max_canmeng)：供星启必杀+1 识别
                            await damage;
                        }
                    }
                    // 解除封锁与标记（死亡兜底同样释放）
                    for (const target of lib.bts.api.seatOrder(
                        game.filterPlayer((t) => t.isAlive()),
                    ))
                        target.removeSkillBlocker('bts_sk_canmeng_blocker');
                    player.removeMark('bts_mk_canmeng_active', player.countMark('bts_mk_canmeng_active'));
                    player.removeMark('bts_mk_canmeng_dis_used', player.countMark('bts_mk_canmeng_dis_used'));
                    const chooseEvent = trigger?.getParent?.('chooseToUse');
                    if (chooseEvent) chooseEvent._skillChoice = void 0;
                },
            },
        },
        ai: {
            // AI 口径：9枚残梦=收尾大招（全场技能/祝福/护盾封锁+禁牌，随后「蚀」限三次弃牌、
            // 被蚀者各1伤害）；敌方有牌可蚀才发动——无人可蚀则整段空转、白弃9枚（源 L4760-4876）。
            // 注：残梦期间 getBless/getShield 经 canmengActive 门控恒无效（utils.js），估值勿按常规加成
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_canmeng')) return -1;
                const targets = game.countPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0 &&
                        t.countCards('he') > 0,
                );
                if (!targets) return -1;
                return targets >= 2 ? 9 : 7;
            },
            // 无目标选择环节；数值供外部 get.effect 保守参考（额外回合+锁场为正，全场封锁含友方为小负）
            result: { player: 1, target: -1 },
        },
    },
    // 残梦封锁器：经 player.addSkillBlocker('bts_sk_canmeng_blocker') 挂载，getSkills/hasSkill 经
    // get.is.blocked 排除，实现源版 Qingcheng 标记的技能失效。
    bts_sk_canmeng_blocker: {
        skillBlocker(skill) {
            return !['bts_sk_canmeng', 'bts_sk_canmeng_dis', 'bts_sk_canmeng_finisher'].includes(skill);
        },
    },
    bts_sk_chigui: {
        // 源 st_chigui（L4846-4864）监听 MarkChanged；源代码 gain 方向与翻译描述相反——同族 7 处
        //（赤鬼/揭露/凯撒/生德/顺风/生息/升格）系统性笔误，定夺统一按描述方向实现：
        //「其他角色附加异常/诅咒后」触发（bts_mark_add 事件）。
        trigger: { global: 'bts_mark_add' },
        forced: true,
        filter(event, player) {
            return (
                event.player !== player &&
                (String(event.markName).includes('abnormal') ||
                    String(event.markName).includes('bts_curse')) &&
                player.countMark('bts_mk_canmeng') < 9
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_canmeng', 1);
        },
    },
    bts_sk_feidu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return player
                .getCards('h')
                .some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '飞渡：选择弃置一张【杀】获得1枚残梦？',
                )
                // AI 口径：残梦=9枚大招的主要储备（另一来源赤鬼）；弃【杀】换1枚恒为正收益，
                // 越接近9越积极（9枚后仍可结余给下一轮）（源 st_feidu，黄泉段 L4760-4876）
                .set('ai', (card) => {
                    const n = player.countMark('bts_mk_canmeng');
                    return 6 - get.value(card) + (n >= 7 ? 2 : 0);
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选【杀】在技能事件 event.cards，结算弃置
            await player.discard(event.cards);
            player.addMark('bts_mk_canmeng', 1);
        },
        ai: { result: { player: 1 } },
    },
};
export const marks = {
    bts_mk_canmeng_active: { markKind: 'record' },
    bts_mk_canmeng_damage: { markKind: 'record' },
    bts_mk_canmeng_dis_used: { markKind: 'record' },
    bts_mk_canmeng: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_canmeng_faq',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_huangquan_skin1': '皮肤1',
    'bts_ch_huangquan_skin10': '皮肤10',
    'bts_ch_huangquan_skin11': '皮肤11',
    'bts_ch_huangquan_skin2': '皮肤2',
    'bts_ch_huangquan_skin3': '皮肤3',
    'bts_ch_huangquan_skin4': '皮肤4',
    'bts_ch_huangquan_skin5': '皮肤5',
    'bts_ch_huangquan_skin6': '皮肤6',
    'bts_ch_huangquan_skin7': '皮肤7',
    'bts_ch_huangquan_skin8': '皮肤8',
    'bts_ch_huangquan_skin9': '皮肤9',
    bts_mk_canmeng_active: '残梦状态',
    bts_mk_canmeng_damage: '残梦伤害',
    bts_mk_canmeng_dis_used: '蚀已用',
    bts_ch_huangquan: '黄泉',
    bts_sk_canmeng: '残梦',
    bts_sk_canmeng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以弃9枚${get.poptip('bts_glossary_canmeng_faq')}标记，令所有角色于此技能结算完毕前所有技能、${get.poptip('bts_glossary_bless_faq')}、${get.poptip('bts_glossary_hudun_faq')}无效且不能使用或打出手牌；然后限三次，你可以弃置一名角色一张牌；结算完毕后，对这些角色各造成1点伤害。`,
    bts_sk_chigui: '赤鬼',
    bts_sk_chigui_info: `锁定技，当其他角色附加异常或诅咒后，若你的${get.poptip('bts_glossary_canmeng_faq')}少于9枚，你获得1枚${get.poptip('bts_glossary_canmeng_faq')}。`,
    bts_sk_feidu: '飞渡',
    bts_sk_feidu_info: `准备阶段开始时，你可以弃置一张【杀】，获得1枚${get.poptip('bts_glossary_canmeng_faq')}。`,

    '$bts_sk_canmeng1': "我为逝者哀哭……",
    '$bts_sk_canmeng2': "暮雨，终将落下",
    '$bts_sk_chigui1': "流淌吧…过往的刀光",
    '$bts_sk_chigui2': "你要去哪？",
    '$bts_sk_feidu1': "此生如朝露，身名俱灭",
    '$bts_sk_feidu2': "忘川无波澜，引渡徘徊",
    '~bts_ch_huangquan': "尘埃…终归大地……",
    bts_mk_canmeng: '残梦',
    bts_mk_canmeng_info: `来源：${get.poptip('bts_sk_chigui')}、${get.poptip('bts_sk_feidu')}赋予；${get.poptip('bts_glossary_canmeng_faq')}：满9发动`,
};
export const simpleTranslate = {
    bts_sk_canmeng_info: `${get.poptip('bts_glossary_bisha_faq')}；弃9${get.poptip('bts_glossary_canmeng_faq')}，全场技能/${get.poptip('bts_glossary_bless_faq')}/${get.poptip('bts_glossary_hudun_faq')}无效且禁出牌，可三次弃目标牌，结束各造成1伤害`,
    bts_sk_chigui_info: `锁；他人附加异常/诅咒后，${get.poptip('bts_glossary_canmeng_faq')}<9则+1`,
    bts_sk_feidu_info: `准备阶段可弃杀+1${get.poptip('bts_glossary_canmeng_faq')}`,
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_canmeng_faq',
        name: '|残梦|',
        info: `黄泉专属：${get.poptip('bts_sk_chigui')}随他人附加异常/诅咒、${get.poptip('bts_sk_feidu')}弃杀各+1枚；满9由${get.poptip('bts_sk_canmeng')}发动，全场技能、${get.poptip('bts_glossary_bless_faq')}与${get.poptip('bts_glossary_hudun_faq')}无效。`,
    },
];
