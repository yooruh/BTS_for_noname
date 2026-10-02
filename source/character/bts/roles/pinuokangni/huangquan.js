// 黄泉（源 animal.lua L4760-4876）—— 残梦累积与终结出牌阶段。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
// 残梦封锁（源 st_canmeng flag，animal.lua L669-680）：任一存活角色带该标记期间全场生效。
// 黄泉角色技能特化方法（原在 rules/utils.js 全局 API，按 TODO 移入本技能 util，经 bts_sk_canmeng.util 挂载；
// 跨文件以 lib.skill['bts_sk_canmeng'].util.canmengActive 访问，如 resolver.js 混乱守卫/残梦全场禁牌、
// utils.js getBless 残梦期间祝福无效）。
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
        // 角色技能特化方法（叁岛 util 字段范式）：残梦全场封锁判定 canmengActive，见文件上方导出。
        util: { canmengActive },
        // 残梦封锁（源 setPlayerCardLimitation "use,response"；resolver chooseToUseBegin/
        // chooseToRespondBegin 迁入，2026-09-04）：残梦结算期间全场不能使用/打出任何牌。
        // 本触发挂在 bts_sk_canmeng（封锁器白名单放行），残梦期间仍可用；
        // filter/content 与发动分支合并（filter 以 triggername 区分，content 见下方）。
        trigger: { global: ['chooseToUseBegin', 'chooseToRespondBegin'] },
        forced: true,
        silent: true,
        // 子技能经 group 挂载（引擎 expandSkills 只展开 group、不自动展开 subSkill；
        // 蚀与收尾 finisher 不加 group 则永不挂载，残梦无法收尾/解除封锁 —— 已修正，参照
        // 知更鸟·迭奏 bts_sk_diezou_clear、乱破·天流 bts_sk_tianliu_jieyin 既有范式）
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
            // 触发分支（残梦封锁）：残梦结算期间全场不能使用/打出任何牌。
            // 只设 filterCard（封锁所有牌）。**绝不要设 filterButton**：chooseToUse/
            // chooseToRespond 的 AI 分支会直接拿事件调 game.check()，而 AI 事件没有
            // dialog，引擎 Check.button 读 event.dialog.buttons 会抛
            // 「Cannot read properties of undefined (reading 'buttons')」并中断事件链
            // （2026-09-27 两起实机 unhandled-rejection；check.js:94 / content.js:4649）。
            // 技能按钮的封锁由 bts_sk_canmeng_blocker（skillBlocker 排除 getSkills）负责，无需 filterButton。
            if (event.triggername) {
                trigger.filterCard = () => false;
                return;
            }
            lib.bts.aiGuard.record(player, 'bts_sk_canmeng');
            player.removeMark('bts_mk_canmeng', 9);
            // 源 L4766-4778：全场技能/祝福/护盾无效（护盾：源 GetShield 含 max_canmeng 检查，
            // 2026-10-02 于 getShield 补门）、不能使用/打出手牌；
            // 封锁器白名单放行残梦本体与「蚀」子技（bts_sk_canmeng_dis）。
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
                        game.filterPlayer((target) => {
                            return target !== player && target.isAlive() && target.countCards('he') > 0
                        })
                    );
                },
                filterTarget(event, player, target) {
                    return target !== player && target.countCards('he');
                },
                selectTarget: 1,
                async content(event, trigger, player) {
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
                            await target.damage(player, 1, 'nocard');
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
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_sk_canmeng') ? -1 : 9,
            result: { player: 1, target: -1 },
        },
    },
    // 残梦封锁器（原 rules/resolver.js，2026-09-04 迁入角色文件）：经
    // player.addSkillBlocker('bts_sk_canmeng_blocker') 挂载，getSkills/hasSkill 经
    // get.is.blocked 将其排除，实现源版 Qingcheng 标记的技能失效。随角色包 skill 注册进 lib.skill。
    bts_sk_canmeng_blocker: {
        skillBlocker(skill) {
            return !['bts_sk_canmeng', 'bts_sk_canmeng_dis', 'bts_sk_canmeng_finisher'].includes(skill);
        },
    },
    bts_sk_chigui: {
        // 源 st_chigui（animal.lua L4846-4864）监听 MarkChanged；源代码作 mark.gain<0，翻译写
        // 「当其他角色附加异常或诅咒后」——同族 7 处（赤鬼/揭露/凯撒/生德/顺风/生息/升格）均为
        // gain 方向与描述相反的系统性笔误，2026-10-02 用户定夺统一按描述方向实现。
        // 本技=「其他角色附加异常/诅咒后」触发（bts_mark_add 事件，标记名在 event.markName）。
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
        ai: { noe: true },
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
    bts_mk_canmeng_active: '残梦状态',
    bts_mk_canmeng_damage: '残梦伤害',
    bts_mk_canmeng_dis_used: '蚀已用',
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

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_canmeng_faq',
        name: '|残梦|',
        info: `黄泉专属：${get.poptip('bts_sk_chigui')}随他人附加异常/诅咒、${get.poptip('bts_sk_feidu')}弃杀各+1枚；满9由${get.poptip('bts_sk_canmeng')}发动，全场技能、${get.poptip('bts_glossary_bless_faq')}与${get.poptip('bts_glossary_hudun_faq')}无效。`,
    },
];
