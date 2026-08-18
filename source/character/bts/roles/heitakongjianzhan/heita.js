// 黑塔（源 animal.lua L2881-3073）—— 魔法必杀技同体力伤害、效率锁定霜杀、一锤拼点反击。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'heitakongjianzhan';
export const title = '冰·智识·天才人偶'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('黑塔')}是压制输出：${get.poptip('bts_glossary_bisha_faq')}${B('魔法')}对同体力目标造成通常伤害，${B('效率')}锁定追击残血目标，${B('一锤')}造成伤害后拼点反打。` +
    '<li>效率对同一角色每局限一次';

export const character = {
    bts_heita: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 3,
        skills: ['bts_st_xiaomofa', 'bts_st_xiaolv', 'bts_st_yichui'],
    },
};

export const skill = {
    // ── 必杀技·魔法（源 st_xiaomofa = ZeroCardViewAsSkill，L2882-2905）──
    bts_st_xiaomofa: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            if (target === player) return false;
            if (ui.selected.targets.length === 0) return true; // 第一个目标
            return target.hp === ui.selected.targets[0].hp; // 同体力
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xiaomofa');
            lib.bts.api.loseAngry(player, 3); // 源 L2888
            for (const t of event.targets || []) {
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_xiaomofa_common'; // 通常伤害
                if (lib.bts.api.god(player)) lib.bts.api.setDamageNature(damage, 'frost'); // 星启霜属性
                await damage;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xiaomofa')
                    ? -1
                    : 5;
            },
            threaten: 2,
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·效率（源 st_xiaolv = TriggerSkill Damaged，L2906-2944）──
    bts_st_xiaolv: {
        trigger: { global: 'damageEnd' },
        forced: true,
        logTarget: 'player',
        filter(event, player) {
            if (!event.player || event.player === player) return false;
            if (event.player.countMark('bts_st_xiaolv') > 0) return false; // 每角色限一次
            if (!(event.player.hp < event.player.maxHp - event.player.hp))
                return false; // hp < 已损失体力
            return (
                player.countMark('bts_damage_link_' + event.player.playerid) > 0
            ); // 你对其造成过伤害
        },
        async content(event, trigger, player) {
            trigger.player.addMark('bts_st_xiaolv', 1);
            const use = player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'frost' } },
                trigger.player,
            );
            await use; // 视为霜【杀】（trigger=damageEnd 事件，其 .player 为受伤者）
        },
        ai: { noe: true },
    },

    // ── 一锤（源 st_yichui = TriggerSkill Damage/Pindian + ViewAsSkill n=2，L2936-3061）：多目标拼点 ──
    bts_st_yichui: {
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            return (
                event.num > 0 &&
                player.hp > player.maxHp - player.hp &&
                player.getCards('h').some((c) => get.name(c) === 'sha') &&
                player.countCards('h') > 1
            );
        },
        async cost(event, trigger, player) {
            // 弃一张【杀】作为代价
            const slash = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '一锤：弃置一张【杀】',
                )
                .forResult();
            if (!slash.bool) {
                event.result = { bool: false };
                return;
            }
            // 选一张非装备牌作为拼点牌（与所有目标共用）
            const pindian = await player
                .chooseCard(
                    'h',
                    (card) =>
                        card !== slash.cards[0] && get.type(card) !== 'equip',
                    '一锤：选择一张拼点牌',
                )
                .set('ai', (card) => get.number(card))
                .forResult();
            if (!pindian.bool) {
                event.result = { bool: false };
                return;
            }
            // 选至少一名有手牌的其他角色
            const targets = await player
                .chooseTarget(
                    '一锤：选择拼点目标',
                    [1, Infinity],
                    (c, p, t) => t !== p && t.countCards('h') > 0,
                    (x) => -get.attitude(player, x),
                )
                .forResult();
            if (!targets.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = targets;
            event.result.cost_data = { pindian: pindian.cards[0], cards: slash.cards };
        },
        async content(event, t, player) {
            // 多目标拼点：黑塔的拼点牌固定，逐一比较（event=技能事件，cost 结果在此）
            await player.discard(event.cost_data.cards); // 源：弃【杀】移入 content 结算
            const result = await player
                .chooseToCompare(event.targets)
                .set('fixedResult', {
                    [player.playerid]: event.cost_data.pindian,
                })
                .forResult();
            if (result.cancelled) return;
            const targets = event.targets;
            for (let i = 0; i < targets.length; i++) {
                const x = targets[i];
                const num1 = result.num1[i],
                    num2 = result.num2[i];
                // 源 L3026-3055：输家（体力>已损失）受伤并摸2；平局时黑塔为输家、目标为赢家，双方均结算
                const tie = num1 === num2;
                const loser = tie || num1 < num2 ? player : x;
                const winner = tie || num1 < num2 ? x : player;
                if (loser.isAlive() && loser.hp > loser.maxHp - loser.hp) {
                    const d = loser.damage(player, 1, 'nocard');
                    d.reason = 'bts_st_yichui';
                    await d;
                    if (loser.isAlive()) {
                        await loser.draw(player, 2);
                        if (
                            tie &&
                            winner.isAlive() &&
                            winner.hp > winner.maxHp - winner.hp
                        ) {
                            const d2 = winner.damage(player, 1, 'nocard');
                            d2.reason = 'bts_st_yichui';
                            await d2;
                            if (winner.isAlive()) await winner.draw(player, 2);
                        }
                    }
                }
            }
        },
        ai: {
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_heita: '黑塔',
    bts_st_xiaomofa: '魔法',
    bts_st_xiaomofa_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名体力值相同的其他角色，对这些角色各造成1点通常伤害，若你为${get.poptip('bts_glossary_xingqi_faq')}，视为${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害。`,

    bts_st_xiaolv: '效率',
    bts_st_xiaolv_info:
        '锁定技，当其他角色受到伤害后，若你对其造成过伤害且其体力值小于已损失的体力值，你视为对其使用霜【杀】。每名角色限一次。',

    bts_st_yichui: '一锤',
    bts_st_yichui_info:
        '当你造成伤害后，若你的体力值大于已损失的体力值，你可以弃置一张【杀】并选择一张非装备牌作为拼点牌，与至少一名有手牌的其他角色各拼点；每次拼点，没赢的角色（平局时双方）若体力值大于已损失体力值，受到你造成的1点伤害并摸两张牌。',

    '$bts_st_xiaomofa1': "知道我是谁吗？",
    '$bts_st_xiaomofa2': "没见过这么大的钻石吧？送给你啦~",
    '$bts_st_xiaolv1': "转圈圈喽~",
    '$bts_st_xiaolv2': "骨碌碌~",
    '$bts_st_yichui1': "能不能安静一点！",
    '$bts_st_yichui2': "疼死你",
    '~bts_heita': "断开…连接……",
};

export const simpleTranslate = {
    bts_st_xiaomofa_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}对至少1名同体力其他角色各造成1点通常伤害（${get.poptip('bts_glossary_xingqi_faq')}${get.poptip('bts_glossary_nature_frost_faq')}）`,
    bts_st_xiaolv_info:
        '锁；其他角色受伤后，若你伤过他且其体力<已损失体力，视为对其用霜杀（每角色限一次）',
    bts_st_yichui_info:
        '造成伤害后，若体力>已损失体力，可弃1杀+1非装备牌与任意名角色拼点，输家（平局双方，体力>已损失）受1伤并摸2张',
};

export const pinyins = { bts_heita: 'heita' };
