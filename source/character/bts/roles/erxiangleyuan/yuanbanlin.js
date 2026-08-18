// 远坂凛（源 animal.lua L10033-10125）—— 宝石与概率实验。
// 技能：明薪（必杀技·暗属性+诅咒，星启额外宝石与回合）、实验（弃手牌消耗宝石概率暗伤）、魔术（他人弃杀得宝石+致命祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '量子·智识·天才少女'; // 属性·命途
export const intro =
    `${B('远坂凛')}拿${get.poptip('bts_glossary_magic_diamond_faq')}赌一把：手牌或宝石够多，就清光手牌去赌${get.poptip('bts_glossary_nature_dark_faq')}伤害；别人弃【杀】，她顺手再收一波${get.poptip('bts_glossary_magic_diamond_faq')}。`;

export const character = {
    bts_ch_yuanbanlin: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_mingxin', 'bts_sk_shiyan', 'bts_sk_moshu'],
    },
};

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
        // 清理子技能：本回合结束时移除视为【杀】的临时技能（定夺 2026-09-12 按源描述补实现）。
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
                // 2026-09-28 修复（实机 3 起「reading 'getParent'」）：主动技 content 的 trigger 为
                // null（引擎合法形态），`trigger.getParent?.()` 读 null 属性即崩；两处均降级为可选链，
                // 拿不到 phase 时静默跳过（phaseEvent?.phaseList 既有守卫）。案例：09-26 21:51/23:32、09-27 23:40。
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
                ai: { noe: true },
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
                ai: { order: 8, result: { target: 1 } },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_mingxin')
                    ? -1
                    : 9;
            },
            result: { target: -1 },
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
            // 源内部矛盾。定夺 2026-09-12 按描述保持 ≥（A-08）。
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
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_shiyan')
                    ? -1
                    : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·魔术（源 st_moshu = TriggerSkill CardsMoveOneTime，L10099-10124）──
    // 一名其他角色弃置【杀】后，你可以获得其数量两倍的宝石；若其没有致命祝福，令其附加2层。
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
        async content(event, trigger, player) {
            // trigger = loseAfter 事件（弃【杀】者在其 .player、弃置详情用 trigger.getl）
            const target = trigger.player;
            const count = trigger
                .getl(target)
                .hs.filter((card) => get.name(card) === 'sha').length;
            // 源 L10114：askForSkillInvoke —— 询问是否发动
            const result = await player
                .chooseBool(
                    `魔术：是否获得${count * 2}枚宝石并令${get.translation(target)}获得致命祝福？`,
                )
                .set('ai', () => get.attitude(player, target) > 0)
                .forResult();
            if (!result.bool) return;
            // 源 L10116：p:gainMark("@magic_diamond", 2*n)
            player.addMark('bts_mk_magic_diamond', count * 2);
            // 源 L10117-10119：目标无致命祝福时附加2层
            if (!lib.bts.api.getBless(target, 'fatal'))
                await lib.bts.api.addBless(target, 'fatal', 2, player);
        },
        ai: { noe: true },
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
    bts_sk_mingxin_slash_info: '你可以将明薪展示的牌当【杀】使用（本回合内）。',
    bts_sk_shiyan: '实验',
    bts_sk_shiyan_info: `出牌阶段，若你拥有至少7张手牌或15枚${get.poptip('bts_glossary_magic_diamond_faq')}，可以弃置所有手牌并选择至少一名其他角色，消耗${get.poptip('bts_glossary_magic_diamond_faq')}以7%起始概率造成${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害；失败时下次概率翻倍，最后摸两张牌并结束出牌阶段。`,
    bts_sk_moshu: '魔术',
    bts_sk_moshu_info: `一名其他角色弃置【杀】后，你可以获得其数量两倍的${get.poptip('bts_glossary_magic_diamond_faq')}，若其没有${get.poptip('bts_glossary_bless_fatal_faq')}，令其附加2层${get.poptip('bts_glossary_bless_fatal_faq')}。`,
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
    bts_sk_moshu_info: `别人弃【杀】你能拿双倍${get.poptip('bts_glossary_magic_diamond_faq')}，顺手送他${get.poptip('bts_glossary_bless_fatal_faq')}`,
};

export const pinyins = { bts_ch_yuanbanlin: 'yuanbanlin' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_magic_diamond_faq',
        name: '|宝石|',
        info: `远坂凛专属：${get.poptip('bts_sk_mingxin')}星启、${get.poptip('bts_sk_moshu')}他人弃杀各+量；${get.poptip('bts_sk_shiyan')}耗3枚概率暗伤。`,
    },
];
