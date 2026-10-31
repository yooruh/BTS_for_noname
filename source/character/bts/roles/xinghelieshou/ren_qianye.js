// 千冶·刃（源 animal.lua L9572-9750）—— 薪肉切换、煞火与刃葬。
// 技能：薪肉（必杀技·变身为千冶形态）、千冶（必杀技·群体通常伤害）、忿怒（暴击+致命+濒死还原）、
//       尽偿（伤害附加煞火）、刃葬（吸收煞火群杀 / 附加地狱群决斗）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xinghelieshou';
export const title = '火·虚无·千冶成刃'; // 属性·命途
export const intro =
    `${B('千冶·刃')}用${get.poptip('bts_sk_xinrou')}换出${get.poptip('bts_glossary_abnormal_shahuo_faq')}形态，濒死后再把${get.poptip('bts_sk_xinrou')}拿回来。`;

export const character = {
    bts_ch_ren_qianye: {
        sex: 'male',
        group: 'xinghelieshou',
        hp: 4,
        skills: ['bts_sk_xinrou'],
    },
};

export const skill = {
    // ── 必杀技·薪肉（源 st_xinrou = SkillCard + ZeroCardViewAsSkill，L9573-9594）──
    // 出牌阶段，失5怒气和1点体力，移除薪肉并取得千冶/忿怒/尽偿/刃葬，所有其他角色各附加2层煞火。
    bts_sk_xinrou: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L9592）：怒气≥5 且体力>0
            return lib.bts.api.getAngry(player, 5) && player.hp > 0;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xinrou');
            lib.bts.api.loseAngry(player, 5); // 源 L9577：LoseAngry(player, 5)
            await player.loseHp(); // 源 L9578：room:loseHp(player)
            // 源 L9579 handleAcquireDetachSkills：移除薪肉、取得千冶形态四技。
            await player.removeSkill('bts_sk_xinrou');
            await player.addSkill('bts_sk_qianye');
            await player.addSkill('bts_sk_fennu');
            await player.addSkill('bts_sk_jinchang');
            await player.addSkill('bts_sk_renzang');
            // 源 L9580-9582：所有其他角色各附加2层煞火
            for (const target of lib.bts.api.seatOrder(
                game.filterPlayer((target) => target !== player),
            ))
                lib.bts.api.addAbnormal(target, 'shahuo', 2, player);
        },
        ai: {
            // AI 口径：怒气≥5 且体力>1 时积极变身（源 AI max_xinrou value/priority 9，StarRail-ai.lua）；
            // 体力=1 时变身失血即濒死、风险高降档（源 animal.lua L9573-9594）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_xinrou')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                return player.hp > 1 ? 9 : 6;
            },
            // 施动方：失5怒气+1体力换千冶/忿怒/尽偿/刃葬四技（形态一体化，代价已计入 order）
            result: { player: 3 },
        },
    },

    // ── 必杀技·千冶（源 st_qianye = SkillCard + ZeroCardViewAsSkill，L9596-9617）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点通常伤害。
    bts_sk_qianye: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        charlotte: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L9615）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9599）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        multitarget: true, // 一次性结算；非 multitarget 会按目标重跑 content（《技能开发规范》B14）
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_qianye');
            lib.bts.api.loseAngry(player, 5); // 源 L9602：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L9604：reason 含 "_normal"（通常伤害，_common 等价标记使 reason 不触发特殊伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_qianye_bts_reason_common';
                await damage;
            }
        },
        ai: {
            // AI 口径：5怒气必杀，对任意名敌各1点通常伤害；群体收益随敌方数放大（源 AI max_qianye
            // value/priority 9，StarRail-ai.lua；源 animal.lua L9596-9617）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_qianye')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                const enemies = game.countPlayer(
                    (t) => t.isAlive() && t !== player && get.attitude(player, t) < 0,
                );
                if (!enemies) return -1; // 无敌方目标：纯耗怒
                return Math.min(9, 5 + enemies); // 1敌=6、2敌=7…（每敌1点伤害）
            },
            result: {
                // 目标受损：1点通常伤害；残血（≤1）击杀加权
                target: (player, target) => -1 - (target.hp <= 1 ? 0.9 : 0),
            },
        },
    },

    // ── 锁定技·忿怒（源 st_fennu = TriggerSkill Compulsory EnterDying/ConfirmDamage，L9620-9643）──
    // 你造成的伤害视为暴击+致命伤害；进入濒死时回复至3点，移除本形态技能并重获薪肉。
    bts_sk_fennu: {
        charlotte: true,
        trigger: { source: 'damageBegin1', player: 'dying' },
        forced: true,
        filter(event, player, triggername) {
            // 源 L9625-9641：自己濒死/自己造成伤害；triggername 判变体（event.name 仅为基名）。
            return triggername === 'damageBegin1' || (event.player === player && player.hp < 1);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'damageBegin1') {
                // 源 L9639：AddNew(damage,"_critical_fatal")——视为暴击+致命（改触发事件 damage）。
                lib.bts.api.markDamage(trigger, '_critical');
                lib.bts.api.markDamage(trigger, '_fatal');
                return;
            }
            // 源 L9630：恢复至3点体力
            await player.recover(player, 3 - player.hp);
            // 源 L9631-9634：移除全部可见技能并重获薪肉（还原为原始形态）
            for (const skill of [
                'bts_sk_qianye',
                'bts_sk_fennu',
                'bts_sk_jinchang',
                'bts_sk_renzang',
            ])
                if (player.hasSkill(skill)) await player.removeSkill(skill);
            await player.addSkill('bts_sk_xinrou');
        },
    },

    // ── 锁定技·尽偿（源 st_jinchang = TriggerSkill Compulsory Damage，L9659-9689）──
    // 当你对其他角色造成伤害后，令其附加1层煞火。同盟：未对你造成过伤害的角色
    //（源 L9665-9677：非持技来源、从未伤害过你，经双方同意可代发，来源仍记为伤害来源）。
    bts_sk_jinchang: {
        charlotte: true,
        trigger: { source: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 源 L9666-9667：伤害目标 ≠ 自己（且存活）
            return event.player !== player && event.num > 0;
        },
        async content(event, trigger, player) {
            // 源 L9681：AddAbnormal(damage.to, "@abnormal_shahuo", 1, player)（trigger=伤害事件）
            lib.bts.api.addAbnormal(trigger.player, 'shahuo', 1, player);
        },
        group: ['bts_sk_jinchang_alliance'],
        subSkill: {
            alliance: {
                // 同盟分支（源 L9668-9677）：伤害来源非持技者、从未伤害过千冶·刃（累计 DamageLink==0）
                // 且双方同意时，由千冶·刃代发1层煞火（来源仍记为伤害来源）。
                audio: 'bts_sk_jinchang',
                trigger: { global: 'damageEnd' },
                filter(event, player) {
                    const source = event.source;
                    if (!source || source === player) return false;
                    if (event.player === player) return false; // 伤害目标≠自己
                    if (event.player === source) return false; // 无自伤
                    if (!event.player.isAlive() || event.num <= 0) return false;
                    if (source.hasSkill('bts_sk_jinchang')) return false; // 持技者走主分支
                    // 源 L9672：来源从未伤害过持技者（累计 DamageLink）
                    return !source.countMark(
                        `bts_damage_link_${player.playerid}`,
                    );
                },
                async cost(event, trigger, player) {
                    const source = trigger.source;
                    if (!source || source.isDead()) return false;
                    const mine = await player
                        .chooseBool(
                            `尽偿（同盟）：是否与${get.translation(source)}共同发动，令其伤害目标附加1层煞火？`,
                        )
                        // AI 口径：伤害来源为友方才代发（源 AI st_jinchang=asFriend(来源)，StarRail-ai.lua L3441）
                        .set('ai', () => get.attitude(player, source) > 0)
                        .forResult();
                    if (!mine.bool) return false;
                    const theirs = await source
                        .chooseBool(
                            `尽偿（同盟）：${get.translation(player)}想与你共同发动，是否同意？`,
                        )
                        // AI 口径：来源视角——持技者是其友方才同意（双方门槛对称，同源 AI）
                        .set('ai', () => get.attitude(source, player) > 0)
                        .forResult();
                    if (!theirs.bool) return false;
                    event.result = { bool: true };
                },
                async content(event, trigger, player) {
                    // 源 L9681：AddAbnormal(damage.to, "@abnormal_shahuo", 1, player)（player=伤害来源）
                    lib.bts.api.addAbnormal(
                        trigger.player,
                        'shahuo',
                        1,
                        trigger.source,
                    );
                },
            },
        },
    },

    // ── 主动技·刃葬（源 st_renzang = SkillCard + ZeroCardViewAsSkill，V2.5 L11020-11117）──
    // 出牌阶段，煞火总数≥9时可吸收全场煞火视为使用【杀】；体力>1时可附加地狱并视为使用【决斗】。
    bts_sk_renzang: {
        charlotte: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L11110-11116）：体力>1 或全场煞火≥9；
            // 另需至少一个合法目标（源 Card filter L11060 已按两路各自校验，无目标时等于空转）
            return (
                (player.hp > 1 || renzangShahuoTotal() >= 9) &&
                game.hasPlayer((target) => renzangTargetable(player, target))
            );
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L11060）：(体力>1 且不违禁可【决斗】) 或 (煞火≥9 且可【杀】)
            return renzangTargetable(player, target);
        },
        selectTarget: [1, Infinity],
        multitarget: true, // 一次性结算；非 multitarget 会按目标重跑 content（《技能开发规范》B14）
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_renzang');
            const total = renzangShahuoTotal();
            // 源 L11074-11084：按本次实际所选目标重算两路合法集（filter 里用的是 sgs.Self，
            // 与真正 player 未必一致），再只在非空的分支里询问。
            const slashTo = event.targets.filter(
                (target) => total >= 9 && renzangCanSlash(player, target),
            );
            const duelTo = event.targets.filter(
                (target) => player.hp > 1 && renzangCanDuel(player, target),
            );
            const choices = [];
            if (slashTo.length) choices.push('吸收煞火后【杀】');
            if (duelTo.length) choices.push('地狱决斗');
            // 源 L11086：没有任何能打出去的目标 → 不吸收煞火、不结算（不留副作用）
            if (!choices.length) return;
            // chooseControl 控件须为纯字符串（数组会原样进 result.control 致下游崩溃）；文案走 set('prompt')。
            const choice =
                choices.length === 1
                    ? { index: 0 }
                    : await player
                          .chooseControl(...choices)
                          .set('prompt', '刃葬：选择效果')
                          // AI 口径：有【杀】分支一律取【杀】（吸收全场、输出更稳）；否则取【决斗】
                          .set('ai', () => choices[0])
                          .forResult();
            if (choices[choice.index] === '吸收煞火后【杀】') {
                // 源 L11089-11095：先收集其他角色全部煞火、清零，再整体附加给自己后移除9层
                for (const target of lib.bts.api.seatOrder(game.filterPlayer()))
                    lib.bts.api.removeAbnormal(target, 'shahuo', -1);
                lib.bts.api.addAbnormal(
                    player,
                    'shahuo',
                    Math.max(0, total - 9),
                    player,
                );
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { bts_sk_renzang: true },
                    },
                    slashTo,
                );
                return;
            }
            // 源 L11096-11101：附加1层地狱 + 单次多目标【决斗】（地狱 PreCardUsed 每次「使用」
            // 只扣1血；逐目标循环会使 N 目标扣 N 血——必须单次多目标）。
            lib.bts.api.addAbnormal(player, 'diyu', 1, player);
            await player.useCard(
                {
                    name: 'juedou',
                    isCard: true,
                    storage: { bts_sk_renzang: true },
                },
                duelTo,
            );
        },
        ai: {
            // AI 口径：煞火总数≥9 吸收全场群体出【杀】，否则体力>1 附加地狱（手牌视为【决斗】）群出【决斗】；
            // 读全场煞火与体力（源 animal.lua L10040-10098；源 AI 无本技条目，按收益矩阵补）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_renzang')) return -1;
                const total = renzangShahuoTotal();
                if (player.hp <= 1 && total < 9) return -1; // filter 同门
                if (!game.hasPlayer((t) => renzangTargetable(player, t)))
                    return -1;
                let value = 6;
                if (total >= 9) value += 2; // 【杀】分支：吸收全场煞火（余量自留）+群体1点伤害
                if (player.hp > 1) value += 1; // 【决斗】分支可用
                return Math.min(9, value);
            },
            result: {
                player: 1, // 吸收后煞火余量自留（炎属性联动资源）
                // 目标受损：视为【杀】/【决斗】（约1点，可被响应）；残血击杀加权
                target: (player, target) => -1.2 - (target.hp <= 1 ? 0.8 : 0),
            },
        },
    },
};

// ── 刃葬目标判定（filter / filterTarget / AI order / content 共用口径）────────────
// 源 V2.5（L11074-11084）把目标拆成「杀」「决斗」两路各自校验，两路皆空即不结算。
// 距离：源 `canSlash(p, false)` 忽略距离、`duel.targetFilter` 无距离限制 → canUse 第三参 false。
export function renzangShahuoTotal() {
    return game
        .filterPlayer()
        .reduce(
            (num, target) => num + lib.bts.api.getAbnor(target, 'shahuo', -1),
            0,
        );
}
export function renzangCanSlash(player, target) {
    return player.canUse({ name: 'sha', isCard: true }, target, false);
}
export function renzangCanDuel(player, target) {
    return player.canUse({ name: 'juedou', isCard: true }, target, false);
}
export function renzangTargetable(player, target) {
    if (target === player) return false;
    return (
        (renzangShahuoTotal() >= 9 && renzangCanSlash(player, target)) ||
        (player.hp > 1 && renzangCanDuel(player, target))
    );
}

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_ren_qianye_skin1': '皮肤1',
    bts_ch_ren_qianye: '千冶·刃',
    bts_sk_xinrou: '薪肉',
    bts_sk_xinrou_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}和1点体力，失去${get.poptip('bts_sk_xinrou')}，获得${get.poptip('bts_sk_qianye')}、${get.poptip('bts_sk_fennu')}、${get.poptip('bts_sk_jinchang')}、${get.poptip('bts_sk_renzang')}，所有其他角色各附加2层${get.poptip('bts_glossary_abnormal_shahuo_faq')}。`,
    bts_sk_qianye: '千冶',
    bts_sk_qianye_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对这些角色各造成1点通常伤害。`,
    bts_sk_fennu: '忿怒',
    bts_sk_fennu_info: `锁定技，你造成的伤害视为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}伤害；进入濒死时回复至3点，失去本形态技能并重获${get.poptip('bts_sk_xinrou')}。`,
    bts_sk_jinchang: '尽偿',
    bts_sk_jinchang_info: `锁定技，当你对其他角色造成伤害后，令其附加1层${get.poptip('bts_glossary_abnormal_shahuo_faq')}。${get.poptip('bts_glossary_tongmeng_faq')}：未对你造成过伤害的其他角色造成伤害后，可经你与其的同意，令其伤害目标附加1层${get.poptip('bts_glossary_abnormal_shahuo_faq')}。`,
    bts_sk_renzang: '刃葬',
    bts_sk_renzang_info: `出牌阶段，你可以在${get.poptip('bts_glossary_abnormal_shahuo_faq')}总数达到9时吸收${get.poptip('bts_glossary_abnormal_shahuo_faq')}视为使用【杀】，或体力大于1时附加${get.poptip('bts_glossary_abnormal_diyu_faq')}并视为使用【决斗】。`,
    bts_abnormal_shahuo: '煞火',

    // ── 语音台词来源优先级见《语音音频规范》§一 ──
    // 尽偿#1/2 台词随素材；薪肉#2 暂注释（无对应音频）——声明键而无 mp3 会使 rebuild --audio --check 报错。
    '$bts_sk_xinrou1': "支离血肉，千冶成刃",
    // '$bts_sk_xinrou2': "此行，迈向终结吧",
    '$bts_sk_qianye1': "于万死中归来……",
    '$bts_sk_fennu1': "为你送葬",
    '$bts_sk_renzang1': "炼狱…加身！",
    '$bts_sk_jinchang1': "恩怨，在此作别",
    '$bts_sk_qianye2': "焚此残躯，以尔等淬火！",
    '$bts_sk_fennu2': "剑若出鞘，不死不休",
    '$bts_sk_renzang2': "剑冢…无间！",
    '$bts_sk_jinchang2': "迈向终结吧",
    '~bts_ch_ren_qianye': "倏忽…还不能……",
};

export const simpleTranslate = {
    bts_sk_xinrou_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}和1体力变身，并令所有其他角色各+2${get.poptip('bts_glossary_abnormal_shahuo_faq')}`,
    bts_sk_qianye_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}群体通常伤害`,
    bts_sk_fennu_info: `锁；伤害${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}，濒死回复并还原`,
    bts_sk_jinchang_info: `锁；造成伤害后目标+${get.poptip('bts_glossary_abnormal_shahuo_faq')}；${get.poptip('bts_glossary_tongmeng_faq')}：未伤过你的其他角色伤害后经双方同意代发`,
    bts_sk_renzang_info: `${get.poptip('bts_glossary_abnormal_shahuo_faq')}≥9时吸收后群杀，或体力>1时附加${get.poptip('bts_glossary_abnormal_diyu_faq')}群决斗`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_shahuo: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_shahuo_faq',
        trigger: { player: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.num > 0 &&
                !lib.bts.api.getNature(event)
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.setDamageNature(trigger, 'flame');
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_shahuo_faq',
        name: '|煞火|',
        info: `异常状态：由技能效果赋予；持有者造成的无属性伤害视为炎属性。`,
    },
];
