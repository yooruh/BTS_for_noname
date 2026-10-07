// 远坂凛（源 animal.lua L10033-10125）—— 宝石与概率实验。
// 技能：明薪（必杀技·暗属性+诅咒，星启额外宝石与回合）、实验（弃手牌消耗宝石概率暗伤）、魔术（他人弃杀得宝石+致命祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '量子·智识·天才少女'; // 属性·命途
export const intro =
    `${B('远坂凛')}拿${get.poptip('bts_glossary_magic_diamond_faq')}赌一把：手牌或${get.poptip('bts_glossary_magic_diamond_faq')}够多，就清光手牌去赌${get.poptip('bts_glossary_nature_dark_faq')}伤害；别人弃【杀】，她顺手再收一波${get.poptip('bts_glossary_magic_diamond_faq')}。`;

export const character = {
    bts_ch_yuanbanlin: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_mingxin', 'bts_sk_shiyan', 'bts_sk_moshu'],
    },
};

// 魔术 AI 共用口径（cost 内联 chooseBool=发动决策；content 只执行）：
// 弃【杀】者为友方，或其已持致命祝福（条件分支跳过赠予、纯赚宝石）时发动
//（源 AI st_moshu=asFriend(弃牌者) or GetBless(fatal)，StarRail-ai.lua L3715）。
export function moshuWorth(player, target) {
    if (!target) return false;
    return (
        get.attitude(player, target) > 0 || lib.bts.api.getBless(target, 'fatal')
    );
}

export const skill = {
    // ── 必杀技·明薪（源 max_mingxin = SkillCard + ZeroCardViewAsSkill，L10393-10421）──
    // 出牌阶段，失5怒气，摸一张牌并展示之（此牌视为【杀】），令任意名其他角色附加暗属性与1层诅咒；
    // 若你为星启，获得24枚宝石，此回合结束时执行额外的摸牌阶段和出牌阶段（源描述 L14532，按描述实现）。
    bts_sk_mingxin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L10420）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10396）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        // 清理子技能：本回合结束时移除视为【杀】的临时技能（按源描述补实现，定夺）。
        group: ['bts_sk_mingxin_clear'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_mingxin');
            lib.bts.api.loseAngry(player, 5); // 源 L10398：LoseAngry(player, 5)
            // 源描述 L14532：摸一张牌并展示之，此牌视为【杀】（源代码未实现该段，按描述补实现）
            await player.draw(player, 1);
            const drawn = player.getCards('h').pop();
            if (drawn) {
                drawn.storage.bts_sk_mingxin = true; // 视为杀标记（同花火·千役 storage 范式）
                player.showCards(drawn);
                // 临时技用引擎 addTempSkill（默认 expire 回合结束自动移除；clear subskill 兜底）
                player.addTempSkill('bts_sk_mingxin_slash');
            }
            for (const target of event.targets) {
                // 源 L10399-10400：AddNature(p, "dark") + AddACurse(p, player)
                await lib.bts.api.addNature(target, 'dark');
                lib.bts.api.addCurse(target, 1);
            }
            if (lib.bts.api.god(player)) {
                // 源 L10402-10405：星启时 gainMark(@magic_diamond, 24) + extra_draw + extra_play
                player.addMark('bts_mk_magic_diamond', 24);
                // 源 gamerule：extra_draw/extra_play 于回合末执行额外摸牌/出牌阶段——
                // 无名杀把阶段插入当前回合 phaseList 末尾（同回合内执行，非新回合）
                // 修复：主动技 content 的 trigger 为 null（引擎合法形态），`trigger.getParent?.()`
                // 读 null 属性即崩；两处均降级为可选链，拿不到 phase 时静默跳过（phaseEvent?.phaseList 既有守卫）。
                const phaseEvent =
                    trigger?.getParent?.('phase') ||
                    _status.event?.getParent?.('phase');
                if (phaseEvent?.phaseList)
                    phaseEvent.phaseList.push(
                        'phaseDraw|bts_sk_mingxin',
                        'phaseUse|bts_sk_mingxin',
                    );
            }
        },
        subSkill: {
            // 回合结束清除视为【杀】的临时技能
            clear: {
                trigger: { player: 'phaseEnd' },
                forced: true,
                filter(event, player) {
                    return player.hasSkill('bts_sk_mingxin_slash');
                },
                async content(event, trigger, player) {
                    player.removeSkill('bts_sk_mingxin_slash');
                },
            },
            // ── 临时技·明薪视为杀（明薪展示牌当作【杀】使用；源描述「此牌视为【杀】」，回合结束移除）──
            slash: {
                sub: true,
                sourceSkill: 'bts_sk_mingxin',
                charlotte: true,
                audio: false,
                enable: 'chooseToUse',
                position: 'h',
                filter(event, player) {
                    if (event.respondTo) return false;
                    return player
                        .getCards('h')
                        .some((card) => card.storage?.bts_sk_mingxin);
                },
                filterCard(card) {
                    return card.storage?.bts_sk_mingxin === true;
                },
                viewAs: { name: 'sha' },
                prompt: '将明薪展示牌当【杀】使用',
                // ai 口径：优先消耗明薪展示牌（回合结束移除，不用作废）；目标估值沿用【杀】卡牌自身
                // result——技能侧 target 必须为负（§7），正值会反号令 AI 不选敌方
                ai: { order: 8 }, // ai-guard: skip：viewAs 型无独立 content
            },
        },
        ai: {
            // AI 口径：5怒气必杀，目标各附暗属性+1诅咒（诅咒=下次受伤追加等量）；星启另得24宝石（实验门槛15）
            // 与本回合额外摸/出牌阶段——星启显著加分，只打敌方（源 AI max_mingxin value/priority 9，
            // StarRail-ai.lua；源 animal.lua L10390-10421）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_mingxin')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                const enemies = game.countPlayer(
                    (t) => t.isAlive() && t !== player && get.attitude(player, t) < 0,
                );
                if (!enemies) return -1; // 无敌方目标：诅咒/暗属性无收益
                let value = 7;
                if (lib.bts.api.god(player)) value += 2; // 24宝石+额外摸/出牌阶段
                if (enemies >= 2) value += 1; // 多目标：诅咒铺开
                return Math.min(9, value);
            },
            result: {
                player: (player) => (lib.bts.api.god(player) ? 2 : 0.5), // 摸1展示当杀；星启+24宝石/额外阶段
                // 目标受损：1层诅咒（下次受伤+等量）+暗属性（重附→睡眠异常）
                target: (player, target) => {
                    let v = 1 + Math.min(2, target.countMark('bts_curse')) * 0.4;
                    if (lib.bts.api.getNature(null, target) === 'dark') v += 1;
                    return -v;
                },
            },
        },
    },

    // ── 主动技·实验（源 st_shiyan = SkillCard + ZeroCardViewAsSkill，L10063-10097）──
    // 手牌≥7或宝石≥15时，弃置所有手牌，每消耗3枚宝石以7%起始概率对目标造成暗属性通常伤害，
    // 失败则概率翻倍；最后摸两张牌并结束出牌阶段。
    bts_sk_shiyan: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L10456）：严格大于（>7/>15）；源描述「至少7/15」为 ≥，
            // 源内部矛盾；按描述保持 ≥（定夺 A-08）。
            return player.countCards('h') >= 7 || player.countMark('bts_mk_magic_diamond') >= 15;
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10066）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shiyan');
            // 源 L10428：gainMark("@magic_diamond", 2*subcardsLength)
            // 弃置的每张手牌先转化为2枚宝石，再消耗宝石掷概率（跟随源，不再只消耗已有宝石）。
            const cards = player.getCards('h');
            if (cards.length) {
                await player.discard(cards);
                player.addMark('bts_mk_magic_diamond', 2 * cards.length);
            }
            let chance = 7; // 源 L10429：起始概率7%
            // 源 L10072：while 宝石>2 → 每轮消耗3枚，对目标按概率造成伤害
            while (player.countMark('bts_mk_magic_diamond') >= 3) {
                player.removeMark('bts_mk_magic_diamond', 3);
                let success = false;
                for (const target of event.targets.filter((target) => target.isAlive()))
                    if (Math.random() * 100 <= chance) {
                        // 源 L10076：reason 含 "_common_dark"（通常伤害 + 暗属性）
                        const damage = target.damage(player, 1, 'nocard');
                        damage.reason = 'bts_sk_shiyan_bts_reason_common_dark';
                        lib.bts.api.setDamageNature(damage, 'dark');
                        await damage;
                        success = true;
                    }
                chance = success ? 7 : chance * 2; // 源 L10081：失败概率翻倍，命中重置
            }
            await player.draw(player, 2); // 源 L10083：摸两张牌
            lib.bts.api.endPlayPhase(player); // 源 L10084：Global_PlayPhaseTerminated 结束出牌阶段
        },
        ai: {
            // AI 口径：手牌折2宝石/张、每3宝石1轮（7%起、失败翻倍）的暗伤概率赌；弃光手牌是代价，
            // 最后摸2并结束出牌阶段——需有敌方目标（源 AI st_shiyan 门槛手>7/宝石>15、value 9/priority 0，
            // StarRail-ai.lua；源 animal.lua L10451-10461）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_shiyan')) return -1;
                if (
                    player.countCards('h') < 7 &&
                    player.countMark('bts_mk_magic_diamond') < 15
                )
                    return -1; // filter 同门
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() && t !== player && get.attitude(player, t) < 0,
                    )
                )
                    return -1; // 无敌方目标：纯弃牌+摸2
                const diamonds =
                    player.countMark('bts_mk_magic_diamond') +
                    2 * player.countCards('h');
                if (diamonds < 3) return -1; // 不足1轮
                let value = 6;
                if (diamonds >= 15) value += 1; // ≥5轮（源门槛）
                if (player.countCards('h') >= 7) value += 1; // ≥7手牌（源门槛）
                if (player.countCards('h') <= 2) value -= 1; // 弃光后空手风险
                return Math.min(9, value);
            },
            result: {
                player: 1, // 收尾摸2
                // 目标受损：期望命中≈轮数/3.5（7%翻倍循环），封顶4轮；残血击杀加权
                target: (player, target) => {
                    const diamonds =
                        player.countMark('bts_mk_magic_diamond') +
                        2 * player.countCards('h');
                    const hits = Math.min(4, Math.floor(diamonds / 3) / 3.5);
                    let v = Math.max(0.5, hits * 1.5);
                    if (target.hp <= 1) v += 0.8;
                    return -v;
                },
            },
        },
    },

    // ── 触发技·魔术（源 st_moshu = TriggerSkill CardsMoveOneTime，L10099-10124）──
    // 一名角色弃置【杀】后（含弃牌者本人，源文本参照本 L14713「当一名角色的牌被弃置后」），
    // 你可以获得其数量两倍的宝石；若其没有致命祝福，令其附加2层。
    bts_sk_moshu: {
        trigger: { global: 'loseAfter' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L10463-10467：任一角色（含弃牌者本人，L10465 无 from≠p 限制）因弃置而从手牌失去【杀】
            return (
                event.type === 'discard' &&
                event.player &&
                event.getl?.(event.player)?.hs?.some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            // trigger = loseAfter 事件（弃【杀】者在其 .player、弃置详情用 trigger.getl）
            const target = trigger.player;
            const count = trigger
                .getl(target)
                .hs.filter((card) => get.name(card) === 'sha').length;
            // 源 L10114：askForSkillInvoke —— 询问是否发动
            event.result = await player
                .chooseBool(
                    `魔术：是否获得${count * 2}枚宝石并令${get.translation(target)}获得致命祝福？`,
                )
                // AI 口径：友方或已持致命祝福（纯赚宝石）才发动（moshuWorth）
                //（源 AI st_moshu=asFriend(弃牌者) or GetBless(fatal)，StarRail-ai.lua L3715；源 animal.lua L10463-10489）
                .set('ai', () => moshuWorth(player, target))
                .forResult();
        },
        async content(event, trigger, player) {
            // trigger = loseAfter 事件（弃【杀】者在其 .player、弃置详情用 trigger.getl）
            const target = trigger.player;
            const count = trigger
                .getl(target)
                .hs.filter((card) => get.name(card) === 'sha').length;
            // 源 L10116：p:gainMark("@magic_diamond", 2*n)
            player.addMark('bts_mk_magic_diamond', count * 2);
            // 源 L10117-10119：目标无致命祝福时附加2层
            if (!lib.bts.api.getBless(target, 'fatal'))
                await lib.bts.api.addBless(target, 'fatal', 2, player);
        },
    },
};

export const marks = {
    bts_mk_magic_diamond: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_magic_diamond_faq',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_yuanbanlin_skin1': '皮肤1',
    'bts_ch_yuanbanlin_skin2': '皮肤2',
    'bts_ch_yuanbanlin_skin3': '皮肤3',
    'bts_ch_yuanbanlin_skin4': '皮肤4',
    'bts_ch_yuanbanlin_skin5': '皮肤5',
    'bts_ch_yuanbanlin_skin6': '皮肤6',
    bts_ch_yuanbanlin: '远坂凛',
    bts_sk_mingxin: '明薪',
    bts_sk_mingxin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你摸一张牌并展示之，此牌视为【杀】；然后令这些角色各附加${get.poptip('bts_glossary_nature_dark_faq')}和1层诅咒，若你为${get.poptip('bts_glossary_xingqi_faq')}，获得24枚${get.poptip('bts_glossary_magic_diamond_faq')}，若如此做，此回合结束时，你执行一个额外的摸牌阶段和出牌阶段。`,
    bts_sk_mingxin_slash: '明薪·视为杀',
    bts_sk_mingxin_slash_info: `你可以将${get.poptip('bts_sk_mingxin')}展示的牌当【杀】使用（本回合内）。`,
    bts_sk_shiyan: '实验',
    bts_sk_shiyan_info: `出牌阶段，若你拥有至少7张手牌或15枚${get.poptip('bts_glossary_magic_diamond_faq')}，可以弃置所有手牌并选择至少一名其他角色，消耗${get.poptip('bts_glossary_magic_diamond_faq')}以7%起始概率造成${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害；失败时下次概率翻倍，最后摸两张牌并结束出牌阶段。`,
    bts_sk_moshu: '魔术',
    bts_sk_moshu_info: `一名角色弃置【杀】后，你可以获得其数量两倍的${get.poptip('bts_glossary_magic_diamond_faq')}，若其没有${get.poptip('bts_glossary_bless_fatal_faq')}，令其附加2层${get.poptip('bts_glossary_bless_fatal_faq')}。`,
    bts_mk_magic_diamond: '宝石',

    '$bts_sk_mingxin1': "伊什塔尔！（拿去吧~）",
    '$bts_sk_mingxin2': "为我所用吧—— An Gal Ta Ki Gal Šè！",
    '$bts_sk_shiyan1': "无限之旅路——于此集结！",
    '$bts_sk_shiyan2': "镜对镜的光芒——穿透无限！",
    '$bts_sk_moshu1': "宝石剑！",
    '$bts_sk_moshu2': "闪耀吧！",
    '~bts_ch_yuanbanlin': "宝石…耗尽了么……",
};

export const simpleTranslate = {
    bts_sk_mingxin_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}摸1牌展示当【杀】，群体${get.poptip('bts_glossary_nature_dark_faq')}+诅咒，${get.poptip('bts_glossary_xingqi_faq')}送${get.poptip('bts_glossary_magic_diamond_faq')}额外摸/出牌阶段`,
    bts_sk_shiyan_info: `手牌/${get.poptip('bts_glossary_magic_diamond_faq')}够数就清手牌，烧${get.poptip('bts_glossary_magic_diamond_faq')}赌${get.poptip('bts_glossary_nature_dark_faq')}暗伤`,
    bts_sk_moshu_info: `有人弃【杀】你能拿双倍${get.poptip('bts_glossary_magic_diamond_faq')}，顺手送他${get.poptip('bts_glossary_bless_fatal_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_magic_diamond_faq',
        name: '|宝石|',
        info: `远坂凛专属：${get.poptip('bts_sk_mingxin')}${get.poptip('bts_glossary_xingqi_faq')}、${get.poptip('bts_sk_moshu')}任一角色弃杀各+量；${get.poptip('bts_sk_shiyan')}耗3枚概率暗伤。`,
    },
];
