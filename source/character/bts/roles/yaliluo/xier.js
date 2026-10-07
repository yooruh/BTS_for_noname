// 希儿（源 animal.lua L4127-4234）—— 乱蝶必杀技增幅、再现击杀额外摸牌、归刃弃杀追击。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '量子·巡猎·惊风击雨之蝶'; // 属性·命途
export const intro =
    `${B('希儿')}是收割输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_glossary_abnormal_luandie_faq'))}${get.poptip('bts_glossary_bless_zengfu_faq')}伤害，${B(get.poptip('bts_sk_zaixian'))}击杀后额外摸牌，${B(get.poptip('bts_sk_guiren'))}摸牌阶段弃【杀】追击。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}时，${get.poptip('bts_sk_luandie')}伤害会令目标附加1层${get.poptip('bts_glossary_abnormal_luandie_faq')}`;

export const character = {
    bts_ch_xier: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_sk_luandie', 'bts_sk_zaixian', 'bts_sk_guiren'],
    },
};

export const skill = {
    // ── 必杀技·乱蝶（源 st_luandie = SkillCard + ZeroCardViewAsSkill + DamageCaused，L4128-4167）──
    // 出牌阶段，失5怒气并选择一名其他角色（移除其拥有的乱蝶数代替失去等量的怒气），
    // 你附加2层增幅祝福（平衡改动：源为1），对其造成1点伤害；若你为星启，以此法对其造成伤害前，令其附加1层乱蝶。
    bts_sk_luandie: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L4149-4155）：怒气≥5 或 某角色乱蝶数+怒气>4
            if (lib.bts.api.getAngry(player, 5)) return true;
            return game.hasPlayer(
                (target) =>
                    target !== player &&
                    lib.bts.api.getAbnor(target, 'luandie', -1) +
                        lib.bts.api.getAngry(player) >
                        4,
            );
        },
        filterTarget(card, player, target) {
            // 源 L4131：目标≠自己且（乱蝶数+怒气）>4——保证付得起 5-x 怒气（防低怒气选 0 乱蝶
            // 目标白嫖；loseAngry 钳 0 不报错，故须逐目标条件）。
            return (
                target !== player &&
                lib.bts.api.getAbnor(target, 'luandie', -1) + // 取层数（无 amount 返回 boolean，加法恒错，F-01）
                    lib.bts.api.getAngry(player) >
                    4
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_luandie');
            const target = event.targets[0];
            // 源 L4134-4138：x = min(5, 目标乱蝶数)，移除乱蝶并 LoseAngry(5-x)
            const x = Math.min(5, target.countMark('bts_abnormal_luandie'));
            if (lib.bts.api.getAbnor(target, 'luandie'))
                lib.bts.api.removeAbnormal(target, 'luandie', x);
            lib.bts.api.loseAngry(player, 5 - x); // 源 L4138：LoseAngry(5-x)
            // 源 L4139：AddBless(player, "@bless_zengfu")
            // 平衡改动（定夺）：出牌阶段叠 1 层会被回合结束的自然衰减抹掉 → 改 2 层（源为 1）。
            await lib.bts.api.addBless(player, 'zengfu', 2, player);
            // 源 L4140：room:damage
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_luandie';
            await damage;
        },
        group: ['bts_sk_luandie_nature'],
        subSkill: {
            nature: {
                // 源 L4163-4165（events=DamageCaused L4508、AddAbnormal L4512）：星启时以乱蝶造成的
                // 伤害令目标 +1 乱蝶。定夺挂 damageBefore（最早钩子，先于 damageBegin1-4；《技能开发
                // 规范》A13），先于雪球的 damageEnd「已持有」门控；打无乱蝶目标：先 +1、雪球再 +1 = 共 2 层。
                // 源为 events 自动触发（无询问）→ forced（否则每次乱蝶伤害都多弹一次「是否发动」）。
                trigger: { source: 'damageBefore' },
                forced: true,
                filter(event, player) {
                    return (
                        lib.bts.api.god(player) &&
                        event.reason?.includes('bts_sk_luandie') &&
                        !!event.player
                    );
                },
                async content(event, trigger, player) {
                    lib.bts.api.addAbnormal(trigger.player, 'luandie', 1, player); // 源：AddAbnormal(damage.to, "@abnormal_luandie")
                },
            },
        },
        ai: {
            // AI 口径：付得起（怒气+目标乱蝶>4；乱蝶抵扣越多实付越低）且存在敌方时发动。收益=2~3点必杀
            // 伤害（1基础+本技先附加的增幅祝福+1；星启再+1）+自身2层增幅祝福（本次用后即按层数摸牌）；
            // 再现额外牌局内乱蝶击杀属必杀击杀（isBishaReason 语义）可续连击 → 窗口内击杀线额外加值。
            //（源 animal.lua L4128-4167；源 AI StarRail-ai.lua max_luandie L1827-1851：估值9/优先9）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_luandie')) return -1;
                const angry = lib.bts.api.getAngry(player);
                const god = lib.bts.api.god(player);
                const comboWindow =
                    lib.bts.api.getExtraSkill() === 'bts_sk_zaixian';
                // 乱蝶伤害 reason='bts_sk_luandie'（markDamage 后缀追加后仍命中标签）——经 isBishaReason 判定为必杀
                const bishaKill = lib.bts.api.isBishaReason('bts_sk_luandie');
                const best = lib.bts.aiHelpers.bestEnemyScore(player, (t) => {
                    const discount = Math.min(
                        5,
                        lib.bts.api.getAbnor(t, 'luandie', -1),
                    );
                    if (discount + angry <= 4) return 0; // 付不起 5-discount 怒气（filterTarget 同门）
                    // 实际伤害=1基础+1（本技先附加的增幅祝福必生效）+（星启再+1）
                    const dmg = 2 + (god ? 1 : 0);
                    let v = lib.bts.aiHelpers.damageValue(dmg); // 伤害（1点≈1.5评估单位）
                    if (discount >= 3) v += 0.4; // 乱蝶抵扣多：实付怒气低
                    const lethal = lib.bts.aiHelpers.wouldKill(t, dmg); // 含护盾抵扣
                    if (lethal) v += 1; // 击杀压力
                    if (comboWindow && bishaKill && lethal)
                        v += 1.2; // 再现窗口：必杀击杀续连击（再得增幅+额外摸/出牌阶段）
                    return v;
                });
                if (!best) return -1;
                return Math.min(9, best); // 上限对齐源 AI 估值 9
            },
            result: {
                player: 1, // +2层增幅祝福（下次必杀伤害+1；本次用后即按层数摸牌）
                // 目标受损=2~3点必杀伤害（本技先附加增幅祝福再结算，星启再+1）；被移除的乱蝶层数属希儿资源返还、不计目标损益
                target: (player, target) => {
                    // 本技先附加2层增幅祝福再结算伤害 → 必得增幅+1；星启再+1（=2~3点）
                    const dmg = 2 + (lib.bts.api.god(player) ? 1 : 0);
                    return -lib.bts.aiHelpers.damageValue(dmg);
                },
            },
        },
    },

    // ── 锁定技·再现（源 st_zaixian = TriggerSkill Compulsory Death/EventPhaseStart，L4169-4198）──
    // 当你杀死一名角色后，此回合结束时，你附加1层增幅祝福并执行额外的摸牌/出牌阶段；
    // 若于这些额外出牌阶段中发动必杀技杀死角色，则重复此流程（可连击）。
    bts_sk_zaixian: {
        trigger: { source: 'dieAfter' },
        forced: true,
        filter(event, player) {
            // 源 L4172-4176：死者≠你且须为伤害致死。源以 st_zaixian flag 判定「再现额外出牌
            // 阶段」，本实现以阶段 .skill（extraPhase 传 turnName 'bts_sk_zaixian'）识别；该窗口内
            // 仅「必杀技击杀」续连击（击杀伤害 reason 命中 bts_bisha 标签）。
            if (event.player === player || !event.reason) return false;
            if (lib.bts.api.getExtraSkill() === 'bts_sk_zaixian') {
                const reason = event.reason?.reason; // dieAfter.reason = 致死事件（damage）→ .reason = 伤害原因串
                // 经 isBishaReason 判定（逐段剥后缀——兼容 markDamage 的 _through/_critical/_fatal 追加）；
                // 原 lib.skill[reason] 精确匹配遇后缀即漏判，连击窗口内必杀击杀可能数不进。
                return !!reason && lib.bts.api.isBishaReason(reason);
            }
            return true; // 平时（源 flag 未置）任意击杀计
        },
        async content(event, trigger, player) {
            // 源 L4177：addPlayerMark(死亡来源, "st_zaixian")
            player.addMark('bts_sk_zaixian', 1);
        },
        group: ['bts_sk_zaixian_chase'],
        subSkill: {
            // 源 L4180-4190：回合结束依击杀数逐一结算（每击：AddBless + ExtraPhase(Draw) +
            // ExtraPhase(Play)）。连击：杀于额外出牌期再续——本实现于「额外 Play 阶段结束」重判标记。
            chase: {
                // 源 L4180-4190 为锁定技内部自动结算（events 无询问）→ forced。
                trigger: { player: 'phaseAfter' },
                forced: true,
                filter(event, player) {
                    if (!player.countMark('bts_sk_zaixian')) return false;
                    const pl = event.phaseList;
                    // 兜底：无 phaseList（回合结束）视为可结算；或为希儿额外 Play 阶段结束（连环）
                    if (!Array.isArray(pl) || pl.length === 0) return true;
                    return pl.length >= 2 || (pl.length === 1 && pl[0] === 'phaseUse');
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_sk_zaixian', 1);
                    // 源 L4186：AddBless(p, "@bless_zengfu")
                    await lib.bts.api.addBless(player, 'zengfu', 1);
                    // 源 L4187-4188：ExtraPhase(Draw)+ExtraPhase(Play) —— 真实阶段；
                    // turnName 'bts_sk_zaixian' 供 dieAfter filter 经 phase.skill 识别「再现额外出牌阶段」
                    lib.bts.api.extraPhase(player, 'phaseDraw', null, 'bts_sk_zaixian');
                    lib.bts.api.extraPhase(player, 'phaseUse', null, 'bts_sk_zaixian');
                },
            },
        },
    },

    // ── 触发技·归刃（源 st_guiren = TriggerSkill EventPhaseEnd Draw + OneCardViewAsSkill，L4200-4232）──
    // 摸牌阶段结束时，你可以弃置一张【杀】并选择一名其他角色，对其造成1点伤害，然后摸1张牌。
    bts_sk_guiren: {
        trigger: { player: 'phaseDrawEnd' },
        filter(event, player) {
            // 源 L4228：摸牌阶段结束且手牌有【杀】可弃
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L4229：askForUseCard("@@st_guiren")
            // AI 口径：代价=弃1张【杀】；收益=1点无来源伤害+摸1张（近似换牌）。存在敌方即可发动
            //（源 AI Enemies_ThrowSlash_AI：有可伤害敌方即换；原实现未配 ai→chooseBool 无条件确认、
            // chooseTarget 默认态度2会把目标选成友方，属 AI 缺陷，此按收益矩阵修复）
            const worth = () =>
                game.hasPlayer(
                    (t) => t !== player && t.isAlive() && get.attitude(player, t) < 0,
                );
            const result = await player
                .chooseBool('归刃：是否弃置一张【杀】并选择一名其他角色？')
                .set('ai', worth)
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                // AI 口径：弃分值最低的【杀】（≥6 视为过贵→放弃发动；同风堇·虹光 ai1 范式）
                .set('ai', (card) =>
                    typeof card === 'object' && card ? 6 - get.value(card) : -1,
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            const target = await player
                .chooseTarget(
                    '归刃：选择一名其他角色',
                    [1, 1],
                    (card, source, target) => target !== source,
                )
                // AI 口径：只打敌方（默认态度2会误选友方）；血线越低越优先（1点伤害的击杀压力）
                //（chooseTarget 的 ai 实参签名 (target, targets)，首参即候选目标）
                .set('ai', (target) => {
                    const att = get.attitude(player, target);
                    if (target === player || att >= 0) return -1;
                    return 2 - target.hp * 0.3;
                })
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            // 源 L4206：room:damage
            const damage = event.targets[0].damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_guiren';
            await damage;
            // 源 L4207：player:drawCards(1)
            await player.draw(player, 1);
        },
        ai: {
            // 发动决策在 cost 内联（cost 型触发技，引擎不询顶层 check）；此 result 供跨技能估值——
            // 施动方=1点伤害+摸1（净收益）；目标受损（源 animal.lua L4200-4232；源 AI Enemies_ThrowSlash_AI）
            result: { player: 1, target: -1.5 },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_xier_skin1': '皮肤1',
    'bts_ch_xier_skin2': '皮肤2',
    bts_ch_xier: '希儿',
    bts_sk_luandie: '乱蝶',
    bts_sk_luandie_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色（移除其拥有的${get.poptip('bts_glossary_abnormal_luandie_faq')}数代替失去等量的${get.poptip('bts_glossary_nuqi_faq')}），你附加2层${get.poptip('bts_glossary_bless_zengfu_faq')}，对其造成1点伤害，若你为${get.poptip('bts_glossary_xingqi_faq')}，以此法对其造成伤害前，令其附加1层${get.poptip('bts_glossary_abnormal_luandie_faq')}。`,
    bts_sk_zaixian: '再现',
    bts_sk_zaixian_info: `锁定技，当你杀死一名角色后，此回合结束时你进入一个额外的摸牌阶段和一个额外的出牌阶段，并各附加1层${get.poptip('bts_glossary_bless_zengfu_faq')}；若于上述额外出牌阶段中发动${get.poptip('bts_glossary_bisha_faq')}杀死一名角色，则再各进入一个（可连击）。`,
    bts_sk_guiren: '归刃',
    bts_sk_guiren_info:
        '摸牌阶段结束时，你可以弃置一张【杀】并选择一名其他角色，对其造成1点伤害，然后摸1张牌。',

    '$bts_sk_luandie1': "这就让你解脱",
    '$bts_sk_luandie2': "随蝴蝶一起消散吧，旧日的幻影",
    '$bts_sk_zaixian1': "早点给你个痛快",
    '$bts_sk_zaixian2': "下一个",
    '$bts_sk_guiren1': "纠缠不清",
    '$bts_sk_guiren2': "别来惹我",
    '~bts_ch_xier': "我…还能……",
    bts_abnormal_luandie: '乱蝶',
};

export const simpleTranslate = {
    bts_sk_luandie_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}（可用目标${get.poptip('bts_glossary_abnormal_luandie_faq')}数抵扣）对1名其他角色造成1点伤害，+2${get.poptip('bts_glossary_bless_zengfu_faq')}（${get.poptip('bts_glossary_xingqi_faq')}造成伤害前令其+1${get.poptip('bts_glossary_abnormal_luandie_faq')}）`,
    bts_sk_zaixian_info: `锁；杀死角色后回合结束进入额外摸牌+出牌阶段各1并+1${get.poptip('bts_glossary_bless_zengfu_faq')}，期间${get.poptip('bts_glossary_bisha_faq')}再杀可连击`,
    bts_sk_guiren_info: '摸牌阶段结束，弃1杀对1名其他角色造成1点伤害并摸1张牌',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_luandie: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_luandie_faq',
        // 源全局 Damaged 分支（L1390-1391，标记文案 L13289）：**已持有**乱蝶者受伤后附加等量乱蝶
        //（定夺「按源来」恢复雪球；门控补「已持有」——GetAbnor 无参数返回 >0）。
        // 获取：星启希儿乱蝶伤害前 +1（nature，先于雪球结算）；用途：被指定为乱蝶目标时抵扣怒气
        //（bts_sk_luandie.content）。
        trigger: { player: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            // 门控：已持有乱蝶才附加（if GetAbnor(player, "@abnormal_luandie")）
            return (
                event.player === player &&
                event.num > 0 &&
                player.countMark('bts_abnormal_luandie') > 0
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.addAbnormal(player, 'luandie', trigger.num); // AddAbnormal(player, "@abnormal_luandie", damage.damage)
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_luandie_faq',
        name: '|乱蝶|',
        // 语义按源三处：星启必杀伤害前 +1（L4512）、持有者受伤 +等量（L1390-1391）、抵扣怒气（L4481-4485）。
        info: `异常状态：${get.poptip('bts_glossary_xingqi_faq')}希儿以${get.poptip('bts_sk_luandie')}造成伤害前+1层；持有者受到伤害后，附加等量层数；希儿发动${get.poptip('bts_sk_luandie')}指定你为目标时，移除你的${get.poptip('bts_glossary_abnormal_luandie_faq')}层数（至多5层）、等量减少其${get.poptip('bts_glossary_nuqi_faq')}消耗。`,
    },
];
