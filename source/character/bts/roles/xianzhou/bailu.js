// 白露（源 animal.lua L6212-6287）—— 生息、珠露与济世。
// 技能：雷音（必杀技·群体生息）、珠露（受伤后弃【杀】治疗）、济世（濒死回复至1点）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'xianzhou';
export const title = '雷·丰饶·衔药龙女'; // 属性·命途
export const intro = `${B('白露')}发${get.poptip('bts_glossary_bless_shengxi_faq')}给队友，用${get.poptip('bts_glossary_bailu_zhulu_faq')}和${get.poptip('bts_sk_jishi')}帮忙回血。`;
export const character = {
    bts_ch_bailu: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_leiyin', 'bts_sk_zhulu', 'bts_sk_jishi'],
    },
};
// 济世 AI 口径（cost 内联 ai 定发动）：只救友方——限定技每局一次，救敌方等于资敌（源 L6266-6286）。
export function jishiWorth(player, target) {
    return Boolean(target) && target !== player && get.attitude(player, target) > 0;
}
export const skill = {
    // ── 必杀技·雷音（源 st_leiyin = SkillCard + ZeroCardViewAsSkill，L6213-6235）──
    // 出牌阶段，失4怒气，令你与至少一名其他角色各附加2层生息。
    bts_sk_leiyin: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6232-6234）：怒气≥4 才可发动
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6215-6217）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_leiyin');
            lib.bts.api.loseAngry(player, 4); // 源 L6219：LoseAngry(player, 4)
            await lib.bts.api.addBless(player, 'shengxi', 2, player); // 源 L6220：AddBless(player, "@bless_shengxi", 2)
            // 源 L6221-6223：对每个目标 AddBless(p, "@bless_shengxi", 2, player)
            for (const target of event.targets)
                await lib.bts.api.addBless(target, 'shengxi', 2, player);
        },
        ai: {
            // AI 口径：至少1名友方可选才发动——生息对敌是纯增益（禁送）；自身/友军受伤时收益更实
            //（每层≈1次受伤后回血；源 animal.lua L6212-6235）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_leiyin')) return -1;
                if (
                    !game.hasPlayer(
                        (target) =>
                            target !== player &&
                            target.isAlive() &&
                            get.attitude(player, target) > 0,
                    )
                )
                    return -1; // 无可选友方：不给敌方贴生息
                let value = 6; // 4怒：自身+每名友方各2层生息（≈2~4次回血机会）
                if (player.isDamaged()) value += 1; // 自身受伤：1层立即兑现
                if (
                    game.hasPlayer(
                        (target) =>
                            target !== player &&
                            target.isAlive() &&
                            target.isDamaged() &&
                            get.attitude(player, target) > 0,
                    )
                )
                    value += 1; // 受伤友军：生息立即兑现
                return value;
            },
            result: {
                // 施动方：自身2层生息；受动方受伤兑现更快（态度由引擎加权——敌方自动计负不入围）
                player: 1.2,
                target: (player, target) => (target.isDamaged() ? 2 : 1.2),
            },
        },
    },

    // ── 限定技·济世（源 st_jishi = TriggerSkill EnterDying Limited，L6266-6286）──
    // 其他角色进入濒死状态时，你可以令其将体力值回复至1点。
    bts_sk_jishi: {
        trigger: { global: 'dying' },
        logTarget: 'player',
        limited: true,
        skillAnimation: true,
        animationColor: 'water',
        filter(event, player) {
            return (
                event.player &&
                event.player !== player &&
                player.countMark('bts_mk_jishi_used') === 0 // 源 L6275：p:getMark("@st_jishi") == 0
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            event.result = await player
                .chooseBool(
                    '济世：是否令' +
                        get.translation(trigger.player) +
                        '将体力回复至1点？',
                )
                .set('ai', () => jishiWorth(player, trigger.player))
                .forResult();
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_jishi_used', 1);
            // 源 L6279：RecoverStruct(p, nil, 1 - dying.who:getHp())（trigger=dying 事件）
            if (trigger.player.hp < 1)
                await trigger.player.recover(player, 1 - trigger.player.hp);
        },
        ai: {
            // 协议标签（消费方 Player#canSave → 濒死求桃 AI L2207）：他人濒死且未消耗时才视为可救
            save: true,
            skillTagFilter(player, tag, target) {
                return (
                    Boolean(target) &&
                    target !== player &&
                    player.countMark('bts_mk_jishi_used') === 0
                );
            },
            // 供跨技能估值：将濒死角色回复至1点=挽救（值3量级）
            result: { target: 3 },
        },
    },
};
export const marks = {
    bts_mk_jishi_used: { markKind: 'record' },
    // 珠露：展示标记 + 真实触发逻辑（源 st_zhulu = TriggerSkill Damaged，L6237-6264）。
    // 其他角色受到伤害后，你可以弃置一张【杀】，令其回复1点体力，
    // 然后令一名以此法回复过体力的角色回复1点体力。
    bts_sk_zhulu: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_bailu_zhulu_faq',
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            return (
                event.player &&
                event.player !== player &&
                // 修复（死者回血非法态）：damageEnd 晚于濒死链，被此伤害打死的目标此时
                // isAlive()===false；isDamaged() 对尸体恒真，须补 isAlive 门（同 moze.js 掠袭约定）。
                event.player.isAlive() &&
                event.player.isDamaged() &&
                // 源 L6244：p:canDiscard(p, "h") —— 手牌须有【杀】可弃
                player
                    .getCards('h')
                    .some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6244：room:askForCard(p, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 决定（最高分 ≤0 → 取消，
            // 见引擎 ai/basic.js chooseCard）。AI 口径：只救友方（敌方受疗为负收益）；弃价值最低的
            //【杀】换1点治疗+珠露标记（标记角色可被二次随机补奶选中；源 L6244-6257）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '珠露：是否弃置一张【杀】令受伤角色回复1点体力？',
                )
                .set('ai', (card) => {
                    // 敌方/中立受疗为负收益：不给分、取消
                    if (get.attitude(player, trigger.player) <= 0) return -1;
                    // 弃价值最低的【杀】；濒死边缘的友军治疗价值更高
                    const base = 6 + (trigger.player.hp <= 1 ? 1 : 0);
                    return base - get.value(card);
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            const target = trigger.player; // trigger=damageEnd 事件
            await target.recover(player); // 源 L6247：room:recover(player, RecoverStruct(p))
            target.addMark('bts_sk_zhulu', 1); // 源 L6248：room:addPlayerMark(player, "st_zhulu")
            // 源 L6249-6257：随机一名带标记的存活角色再次回复（适配：源版不限受伤，
            // 无名杀限定 isDamaged，避免满血空回复）
            const healed = game.filterPlayer(
                (player) =>
                    player.countMark('bts_sk_zhulu') && player.isDamaged(),
            );
            if (healed.length)
                await healed.randomGet().recover(player); // 源 L6255-6257：players:at(math.random(...)) 后 recover
        },
        ai: {
            // 供跨技能估值：受动方回复1点+获得珠露标记（可被二次随机补奶选中）
            result: { target: 1 },
        },
    },
};

export const translate = {
    bts_mk_jishi_used: '济世已用',
    bts_ch_bailu: '白露',
    bts_sk_leiyin: '雷音',
    bts_sk_leiyin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，你与至少一名其他角色各附加2层${get.poptip('bts_glossary_bless_shengxi_faq')}。`,
    bts_sk_zhulu: '珠露',
    bts_sk_zhulu_info:
        '其他角色受到伤害后，你可以弃置一张【杀】，令其回复1点体力，然后令一名以此法回复过体力的角色回复1点体力。',
    bts_sk_jishi: '济世',
    bts_sk_jishi_info:
        '限定技，其他角色进入濒死状态时，你可以令其将体力值回复至1点。',

    '$bts_sk_leiyin1': "就让你们看看……",
    '$bts_sk_leiyin2': "这葫芦里卖的什么药！",
    '$bts_sk_zhulu1': "乖乖~张嘴~",
    '$bts_sk_zhulu2': "补补~身子~",
    '$bts_sk_jishi1': "我看还能抢救一下",
    '$bts_sk_jishi2': "要雨露均沾哦~",
    '~bts_ch_bailu': "医不自医……",
    bts_bless_shengxi: '生息祝福',
    bts_bless_shengxi_info: `来源：${get.poptip('bts_sk_leiyin')}赋予；附加或受伤后移除1层并回复1；回合结束自然减少1层`,
};
export const simpleTranslate = {
    bts_sk_leiyin_info: `${get.poptip('bts_glossary_bisha_faq')}；失4${get.poptip('bts_glossary_nuqi_faq')}令自己与至少1名其他角色各+2${get.poptip('bts_glossary_bless_shengxi_faq')}`,
    bts_sk_jishi_info: '限定；他人濒死时可令其回复至1体力',
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_shengxi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_shengxi_faq',
        // 附加此祝福或受伤后（源描述；源代码作被移除时——同族 7 处系统性笔误，定夺按描述方向实现：
        // 监听 bts_mark_add；移除/回合结束自然减少不再触发回血）。
        trigger: { player: 'damageEnd', global: 'bts_mark_add' },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (triggername === 'bts_mark_add')
                return (
                    event.player === player &&
                    event.markName === 'bts_bless_shengxi' &&
                    player.isDamaged()
                );
            return event.player === player && event.num > 0 && player.isDamaged();
        },
        async content(event, trigger, player) {
            await lib.bts.api.removeBless(player, 'shengxi', 1);
            await player.recover(player);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_shengxi_faq',
        name: '生息祝福',
        info: `附加此${get.poptip('bts_glossary_bless_faq')}或受伤后，若已受伤，移除1层此${get.poptip('bts_glossary_bless_faq')}并回复1点体力。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}自然减少1层（减少不再触发回血）。`,
    },
    {
        id: 'bts_glossary_bailu_zhulu_faq',
        name: '|珠露|',
        info: `白露专属：${get.poptip('bts_sk_zhulu')}治疗时在被奶角色上充留；带${get.poptip('bts_glossary_bailu_zhulu_faq')}的角色之后可被${get.poptip('bts_glossary_bailu_zhulu_faq')}的二次随机补奶选中。`,
    },
];
