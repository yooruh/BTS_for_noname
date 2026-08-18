// 黄泉（源 animal.lua L4760-4876）—— 残梦累积与终结出牌阶段。
import { lib, game, get, B } from '../../shared.js';

// 残梦封锁（源 st_canmeng flag，animal.lua L669-680）：任一存活角色带该标记期间全场生效。
// 黄泉角色技能特化方法（原在 rules/utils.js 全局 API，按 TODO 移入本技能 util，经 bts_st_canmeng.util 挂载；
// 跨文件以 lib.skill['bts_st_canmeng'].util.canmengActive 访问，如 resolver.js 混乱守卫/残梦全场禁牌、
// utils.js getBless 残梦期间祝福无效）。
export function canmengActive() {
    return game.hasPlayer(
        (player) =>
            player.isAlive() && player.countMark('bts_st_canmeng_active') > 0,
    );
}

export const sort = 'pinuokangni';
export const title = '雷·虚无·自称「巡海游侠」的旅人'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('黄泉')}靠异常与诅咒被移除攒${get.poptip('bts_glossary_canmeng_faq')}，攒满9枚开残梦终结全场。`;
export const character = {
    bts_huangquan: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_canmeng', 'bts_st_chigui', 'bts_st_feidu'],
    },
};
export const skill = {
    bts_st_canmeng: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 角色技能特化方法（叁岛 util 字段范式）：残梦全场封锁判定 canmengActive，见文件上方导出。
        util: { canmengActive },
        // 子技能经 group 挂载（引擎 expandSkills 只展开 group、不自动展开 subSkill；
        // 蚀与收尾 finisher 不加 group 则永不挂载，残梦无法收尾/解除封锁 —— 已修正，参照
        // 知更鸟·迭奏 bts_st_diezou_clear、乱破·天流 bts_st_tianliu_jieyin 既有范式）
        group: ['bts_st_canmeng_dis', 'bts_st_canmeng_finisher'],
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return player.countMark('bts_canmeng') >= 9;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_canmeng');
            player.removeMark('bts_canmeng', 9);
            // 源 L4766-4778：全场技能/祝福无效（护盾源版未禁用，保持一致）、不能使用/打出手牌；
            // 封锁器白名单放行残梦本体与「蚀」子技（bts_st_canmeng_dis）。
            player.addMark('bts_st_canmeng_active', 1);
            const alive = game.filterPlayer((target) => target.isAlive());
            for (const target of alive)
                target.addSkillBlocker('bts_canmeng_blocker');
            player.removeMark('bts_canmeng_dis_used', player.countMark('bts_canmeng_dis_used'));
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
                        player.countMark('bts_st_canmeng_active') > 0 &&
                        player.countMark('bts_canmeng_dis_used') < 3 &&
                        lib.bts.api.otherAlive(player).some((t) => t.countCards('he'))
                    );
                },
                filterTarget(event, player, target) {
                    return target !== player && target.countCards('he');
                },
                selectTarget: 1,
                async content(event, trigger, player) {
                    const target = event.targets[0];
                    player.addMark('bts_canmeng_dis_used', 1);
                    await player
                        .discardPlayerCard('he', target, true)
                        .set('logSkill', ['bts_st_canmeng', target]);
                    target.addMark('bts_canmeng_damage', 1);
                },
            },
            // 残梦出牌阶段结束结算（源 st_canmeng L4826-4842）：
            // 出牌阶段结束时对被蚀角色各造成1点伤害，并解除全场封锁。
            finisher: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player, triggername) {
                    if (!player.countMark('bts_st_canmeng_active')) return false;
                    if (triggername === 'death') return true;
                    const pl = event.phaseList;
                    return Array.isArray(pl) && pl.length === 1 && pl[0] === 'phaseUse';
                },
                async content(event, trigger, player) {
                    if (event.triggername === 'phaseAfter') {
                        for (const target of game.filterPlayer(
                            (t) => t.isAlive() && t.countMark('bts_canmeng_damage'),
                        )) {
                            target.removeMark('bts_canmeng_damage', target.countMark('bts_canmeng_damage'));
                            await target.damage(player, 1, 'nocard');
                        }
                    }
                    // 解除封锁与标记（死亡兜底同样释放）
                    for (const target of game.filterPlayer((t) => t.isAlive()))
                        target.removeSkillBlocker('bts_canmeng_blocker');
                    player.removeMark('bts_st_canmeng_active', player.countMark('bts_st_canmeng_active'));
                    player.removeMark('bts_canmeng_dis_used', player.countMark('bts_canmeng_dis_used'));
                    const chooseEvent = trigger?.getParent?.('chooseToUse');
                    if (chooseEvent) chooseEvent._skillChoice = void 0;
                },
            },
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_canmeng') ? -1 : 9,
            result: { player: 1, target: -1 },
        },
    },
    bts_st_chigui: {
        // 源 st_chigui（animal.lua L4846-4864）监听 MarkChanged 且 mark.gain<0。
        // room.cpp setPlayerMark L2205：gain = 新值-旧值，故 gain<0 = 标记被移除——
        // 仅在其他角色「移除」异常/诅咒标记时触发（源翻译「附加后」与代码不符，以代码为准）。
        // 无名杀 removeMark 事件的标记名在 event.markName（event.name 恒为 'removeMark'）。
        trigger: { global: 'removeMark' },
        forced: true,
        filter(event, player) {
            return (
                event.player !== player &&
                (String(event.markName).includes('abnormal') ||
                    String(event.markName).includes('bts_curse')) &&
                player.countMark('bts_canmeng') < 9
            );
        },
        content(event, trigger, player) {
            player.addMark('bts_canmeng', 1);
        },
        ai: { noe: true },
    },
    bts_st_feidu: {
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
            player.addMark('bts_canmeng', 1);
        },
        ai: { result: { player: 1 } },
    },
};
export const translate = {
    bts_huangquan: '黄泉',
    bts_st_canmeng: '残梦',
    bts_st_canmeng_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以弃9枚${get.poptip('bts_glossary_canmeng_faq')}标记，令所有角色于此技能结算完毕前所有技能、${get.poptip('bts_glossary_bless_faq')}无效且不能使用或打出手牌；然后限三次，你可以弃置一名角色一张牌；结算完毕后，对这些角色各造成1点伤害。`,
    bts_st_chigui: '赤鬼',
    bts_st_chigui_info: `锁定技，当其他角色的异常或诅咒标记被移除后，若你的${get.poptip('bts_glossary_canmeng_faq')}少于9枚，你获得1枚${get.poptip('bts_glossary_canmeng_faq')}。（源翻译写「附加后」，与源码不符，以代码为准）`,
    bts_st_feidu: '飞渡',
    bts_st_feidu_info: `准备阶段开始时，你可以弃置一张【杀】，获得1枚${get.poptip('bts_glossary_canmeng_faq')}。`,

    '$bts_st_canmeng1': "我为逝者哀哭……",
    '$bts_st_canmeng2': "暮雨，终将落下",
    '$bts_st_chigui1': "流淌吧…过往的刀光",
    '$bts_st_chigui2': "你要去哪？",
    '$bts_st_feidu1': "此生如朝露，身名俱灭",
    '$bts_st_feidu2': "忘川无波澜，引渡徘徊",
    '~bts_huangquan': "尘埃…终归大地……",
};
export const simpleTranslate = {
    bts_st_canmeng_info: `${get.poptip('bts_glossary_bisha_faq')}；弃9${get.poptip('bts_glossary_canmeng_faq')}，全场技能/${get.poptip('bts_glossary_bless_faq')}无效且禁出牌，可三次弃目标牌，结束各造成1伤害`,
    bts_st_chigui_info: `锁；他人异常/诅咒被移除后，${get.poptip('bts_glossary_canmeng_faq')}<9则+1`,
    bts_st_feidu_info: `准备阶段可弃杀+1${get.poptip('bts_glossary_canmeng_faq')}`,
};
export const pinyins = { bts_huangquan: 'huangquan' };
