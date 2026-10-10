// 应星DIY白厄（群友投稿 DIY 角色；设计文案见 群友投稿/应星/白厄/描述.txt，无太阳神源版）——
// 同角色可能有多份投稿：文件与 ID 以投稿人后缀区分（本文件 baie_yingxing ↔ bts_diy_ch_baie_yingxing）。
// 逐火攒火种后清场，负世蓄力八回合爆发并归还逐火，支柱在失去逐火期间持续压场。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '物理·毁灭·救世主'; // 属性·命途·昵称
export const intro =
    `${B('应星DIY白厄')}以${get.poptip('bts_diy_sk_zhuhuo')}攒${get.poptip('bts_diy_glossary_huozhong_faq')}，` +
    `满12枚即令至多三名其他角色${get.poptip('bts_diy_glossary_lichang_faq')}；` +
    `失去【逐火】期间靠${get.poptip('bts_diy_sk_fushi')}的${get.poptip('bts_diy_glossary_xuli_faq')}与${get.poptip('bts_diy_sk_zhizhu')}反打，蓄力耗尽时全场爆发并收回【逐火】。`;

export const character = {
    bts_diy_ch_baie_yingxing: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_diy_sk_zhuhuo', 'bts_diy_sk_fushi', 'bts_diy_sk_zhizhu'],
    },
};

// 技能代码引用的模块级助手一律导出（check.mjs --globals：包级标识符不得被技能代码裸引用——
// 防同步 content 字符串化后丢绑定）；标记键/阈值按各角色文件惯例直接内联字面量。
/** 因本技能离场者（离场者不在 game.filterPlayer 内，须走 game.players 全量）。 */
export function lichangPlayers(player) {
    return (game.players || []).filter(
        (target) =>
            target !== player &&
            target.isAlive() &&
            (target.hasSkill('bts_diy_sk_zhuhuo_lichang') ||
                target.hasSkill('bts_diy_sk_zhuhuo_lichang', true)),
    );
}

/** 施加/解除离场（真离场：跳过其回合、不计距离座次、不能使用或打出牌、不能成为目标）。 */
export function setLichang(target, out) {
    if (out) target.addSkill('bts_diy_sk_zhuhuo_lichang');
    else target.removeSkill('bts_diy_sk_zhuhuo_lichang', true);
}

export const skill = {
    // ── 锁定技·逐火（DIY 设计 §逐火）──
    // 成为牌的目标 +1 火种、使用【杀】+2 火种（至多15枚）；你的回合结束时若火种≥12，
    // 移去12枚、失去逐火，得3点护盾与8点蓄力点，并令至多三名其他角色离场。
    bts_diy_sk_zhuhuo: {
        trigger: {
            player: ['useCard', 'phaseAfter'],
            target: 'useCardToTargeted',
        },
        forced: true,
        subSkill: {
            // 离场：引擎 out（classList 'out'）+ undist（退出距离/座次/目标计算）；范本见 bts 白厄
            // 燔世·除名（character/bts/roles/huangjinyi/baie.js）。
            lichang: {
                sub: true,
                sourceSkill: 'bts_diy_sk_zhuhuo',
                group: 'undist',
                init(player) {
                    if (player.isIn()) {
                        game.broadcastAll((p) => p.classList.add('out'), player);
                        game.log(player, '因【逐火】离场，移出了游戏');
                    }
                },
                onremove(player) {
                    if (player.isOut()) {
                        game.broadcastAll((p) => p.classList.remove('out'), player);
                        game.log(player, '因【逐火】离场结束，移回了游戏');
                    }
                },
            },
        },
        filter(event, player, triggername) {
            // 触发变体判据必须用完整触发名（《技能开发规范》B17）
            if (triggername === 'useCard') return get.name(event.card) === 'sha';
            if (triggername === 'useCardToTargeted') return true;
            // 你的回合结束时：火种达线（12）才结算
            return player.countMark('bts_diy_mk_huozhong') >= 12;
        },
        async content(event, trigger, player) {
            // 火种积累（成为目标 +1 / 使用【杀】+2，封顶15）
            if (event.triggername !== 'phaseAfter') {
                const gain = event.triggername === 'useCard' ? 2 : 1;
                const room = 15 - player.countMark('bts_diy_mk_huozhong');
                if (room > 0)
                    player.addMark('bts_diy_mk_huozhong', Math.min(gain, room));
                return;
            }
            player.removeMark('bts_diy_mk_huozhong', 12);
            // 失去逐火：第二参 true 绕过 fixed 保护，技能集合与触发器一并摘除
            player.removeSkill('bts_diy_sk_zhuhuo', true);
            lib.bts.api.addShield(player, 3);
            // 蓄力值走本体机制（上限见 bts_diy_sk_fushi.chargeSkill = 8）
            player.addCharge(8);
            const others = game.filterPlayer(
                (target) => target !== player && target.isAlive(),
            );
            if (!others.length) {
                // 场上无其他角色：移去一名其他角色的离场状态（取最早离场者）
                const outPlayers = lichangPlayers(player);
                if (outPlayers.length) setLichang(outPlayers[0], false);
                return;
            }
            const result = await player
                .chooseTarget(
                    '逐火：令至多三名其他角色离场',
                    [0, Math.min(3, others.length)],
                    (card, source, target) => target !== source && !target.isOut(),
                    // AI 口径：离场 = 其停摆（无回合、不可被指定、不吃伤害），优先移走敌方；
                    // 友方负分不选（chooseTarget 的 ai 实参签名 (target, targets)）
                    (target) => -get.attitude(player, target),
                )
                .forResult();
            for (const target of result.targets || []) setLichang(target, true);
        },
    },

    // ── 蓄力技·负世（DIY 设计 §负世；蓄力值走本体 chargeSkill/addCharge 机制）──
    // 结束阶段减1点蓄力点；本回合受过伤害则回1点体力、失去过牌则摸两张。蓄力归零时：
    // 对所有非离场角色各造成1点伤害，移去全部离场状态，收回逐火并移去自身全部护盾。
    // 阵亡收尾（本体「燔世·还原」dieAfter 范式）：死亡时令全部离场者回归——否则离场者失去
    // 回合与交互途径、永久停摆，无法正常终局。
    bts_diy_sk_fushi: {
        // 本体蓄力技机制：chargeSkill = 蓄力值上限（player.addCharge/removeCharge/countCharge，
        // 底层标记 `charge`；展示与加值日志走引擎内置 charge 技能——2026-10-09 按本体规范改）
        chargeSkill: 8,
        trigger: { player: ['phaseJieshuBegin', 'dieAfter'] },
        forced: true,
        // dieAfter（自己阵亡）在标记 dead 后派发，须顶层 forceDie（引擎约定，同本体「燔世·还原」）
        forceDie: true,
        filter(event, player, triggername) {
            // 蓄力技（0/8）：蓄力值为 0 即失效
            if (triggername === 'dieAfter')
                return lichangPlayers(player).length > 0;
            return player.countCharge() > 0;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'dieAfter') {
                // 死亡回归：仅令全部离场者回归（不结算蓄力与爆发）
                for (const target of lichangPlayers(player))
                    setLichang(target, false);
                return;
            }
            player.removeCharge(1);
            // 「你本回合」= 本回合内（actionHistory 逐回合清空）
            if (player.getHistory('damage', (evt) => evt.num > 0).length)
                await player.recover(player, 1);
            if (
                player.getHistory(
                    'lose',
                    (evt) => evt.cards2 && evt.cards2.length,
                ).length
            )
                await player.draw(player, 2);
            if (player.countCharge() > 0) return;
            // 蓄力归零：全场爆发（含自己；离场者不参与）
            for (const target of game.filterPlayer(() => true)) {
                await target.damage(player, 1);
            }
            for (const target of lichangPlayers(player)) setLichang(target, false);
            player.addSkill('bts_diy_sk_zhuhuo');
            // 定夺：只移去自身护盾（前后文均为自身状态复原）
            lib.bts.api.removeShield(player, lib.bts.api.getShield(player));
        },
    },

    // ── 锁定技·支柱（DIY 设计 §支柱）──
    // 失去逐火期间：你的回合开始时对所有其他角色各随机造成0~2点伤害；
    // 其他角色回合开始时，你视为使用一张无距离限制的雷【杀】。
    bts_diy_sk_zhizhu: {
        trigger: { global: 'phaseBefore' },
        forced: true,
        filter(event, player) {
            if (player.hasSkill('bts_diy_sk_zhuhuo')) return false; // 未失去逐火不生效
            if (event.player === player) return true;
            // 其他角色回合开始：须有可指定的其他角色
            return (
                game.filterPlayer((target) => target !== player && target.isAlive())
                    .length > 0
            );
        },
        async content(event, trigger, player) {
            if (trigger.player === player) {
                // 随机 0~2（设计文案即随机，非可预测收益）
                for (const target of game.filterPlayer(
                    (t) => t !== player && t.isAlive(),
                )) {
                    const num = Math.floor(Math.random() * 3);
                    if (num > 0) await target.damage(player, num);
                }
                return;
            }
            const result = await player
                .chooseTarget(
                    '支柱：视为使用一张无距离限制的雷【杀】，选择目标',
                    [1, 1],
                    (card, source, target) => target !== source && !target.isOut(),
                    // AI 口径：只打敌方，残血优先；无敌方则不给分（最高分≤0 → 不选，放弃本次）
                    (target) => {
                        if (get.attitude(player, target) >= 0) return -1;
                        return target.hp <= 1 ? 2 : 1;
                    },
                )
                .forResult();
            if (!result.bool) return;
            // 无距离限制：直接 useCard 不经选牌距离过滤（同 bts 各「视为使用」范式）
            await player.useCard(
                { name: 'sha', nature: 'thunder', isCard: true },
                result.targets[0],
            );
        },
    },
};

export const marks = {
    bts_diy_mk_huozhong: {
        markKind: 'mark',
        // 图标复用 bts 白厄火种（同素材不复制文件，《标记系统规范》§三）
        image: 'bts_mk_huozhong',
        glossaryId: 'bts_diy_glossary_huozhong_faq',
    },
};

export const glossary = [
    {
        id: 'bts_diy_glossary_huozhong_faq',
        name: '|火种|',
        info: `应星DIY白厄的资源：${get.poptip('bts_diy_sk_zhuhuo')}下成为牌的目标获1枚、使用【杀】获2枚（至多15枚）；满12枚由【逐火】消耗并令其他角色${get.poptip('bts_diy_glossary_lichang_faq')}。`,
    },
    {
        id: 'bts_diy_glossary_xuli_faq',
        name: '|蓄力点|',
        info: `应星DIY白厄的资源：${get.poptip('bts_diy_sk_zhuhuo')}结算时获得8点；${get.poptip('bts_diy_sk_fushi')}每个结束阶段消耗1点，归零时对全场非离场角色各造成1点伤害并复原自身状态。`,
    },
    {
        id: 'bts_diy_glossary_lichang_faq',
        name: '|离场|',
        info: `状态：跳过离场角色的回合，其不计入距离与座次计算、不能使用或打出牌、不能成为目标、受到伤害或失去体力；由${get.poptip('bts_diy_sk_zhuhuo')}赋予，${get.poptip('bts_diy_sk_fushi')}蓄力归零时全部移去；应星DIY白厄死亡时全部回归。`,
    },
];

export const translate = {
    bts_diy_ch_baie_yingxing: '应星DIY白厄',
    // 武将名字前缀（引擎 get.slimName/get.prefixSpan 消费；值须为显示名的起始串）：
    // 同名多投稿以此区分；样式注册见 source/precontent.js 的 NAME_PREFIXES
    bts_diy_ch_baie_yingxing_prefix: '应星DIY',
    bts_diy_sk_zhuhuo: '逐火',
    bts_diy_sk_zhuhuo_info: `锁定技，当你成为牌的目标/使用【杀】时，你获得1/2枚${get.poptip('bts_diy_glossary_huozhong_faq')}（至多15枚）。你的回合结束时，若你的${get.poptip('bts_diy_glossary_huozhong_faq')}不少于12枚，则你移去12枚${get.poptip('bts_diy_glossary_huozhong_faq')}，失去【逐火】，获得3点${get.poptip('bts_glossary_hudun_faq')}和8点${get.poptip('bts_diy_glossary_xuli_faq')}，并令至多三名其他角色${get.poptip('bts_diy_glossary_lichang_faq')}（场上无其他角色时，移去一名其他角色的${get.poptip('bts_diy_glossary_lichang_faq')}状态）`,
    bts_diy_sk_fushi: '负世',
    bts_diy_sk_fushi_info: `蓄力技（0/8）。每个结束阶段，你减少1点${get.poptip('bts_diy_glossary_xuli_faq')}，若如此做，你本回合：1.受到过伤害，则你回复1点体力；2.失去过牌，则你摸两张牌。当【负世】的${get.poptip('bts_diy_glossary_xuli_faq')}为0时，你对所有非${get.poptip('bts_diy_glossary_lichang_faq')}角色各造成1点伤害，然后移去所有${get.poptip('bts_diy_glossary_lichang_faq')}状态，获得${get.poptip("bts_diy_sk_zhuhuo")}并移去你的所有${get.poptip('bts_glossary_hudun_faq')}。你死亡时，令所有${get.poptip('bts_diy_glossary_lichang_faq')}者回归`,
    bts_diy_sk_zhizhu: '支柱',
    bts_diy_sk_zhizhu_info: `锁定技，若你失去${get.poptip("bts_diy_sk_zhuhuo")}：1.回合开始时，你对所有其他角色各随机造成0~2点伤害；2.其他角色回合开始时，你视为使用一张无距离限制的雷【杀】`,
    bts_diy_sk_zhuhuo_lichang: '逐火·离场',

    bts_diy_mk_huozhong: '火种',
    bts_diy_mk_huozhong_info: `${get.poptip('bts_diy_sk_zhuhuo')}的资源：成为牌的目标+1、使用【杀】+2（上限15）。`,
};

export const simpleTranslate = {
    bts_diy_sk_zhuhuo_info: `锁；成为牌目标/使用【杀】各+1/+2枚${get.poptip('bts_diy_glossary_huozhong_faq')}（上限15）；你的回合结束≥12枚则去12枚、失去【逐火】，得3点${get.poptip('bts_glossary_hudun_faq')}与8点${get.poptip('bts_diy_glossary_xuli_faq')}并令至多3名其他角色${get.poptip('bts_diy_glossary_lichang_faq')}`,
    bts_diy_sk_fushi_info: `蓄力技（0/8）；每结束阶段-1蓄力：本回合受过伤则回1点体力、失去过牌则摸2；蓄力归零时对所有非${get.poptip('bts_diy_glossary_lichang_faq')}角色各1点伤害，清空${get.poptip('bts_diy_glossary_lichang_faq')}状态、收回${get.poptip('bts_diy_sk_zhuhuo')}并移去自身${get.poptip('bts_glossary_hudun_faq')}；死亡时令所有${get.poptip('bts_diy_glossary_lichang_faq')}者回归`,
    bts_diy_sk_zhizhu_info: `锁；失去${get.poptip('bts_diy_sk_zhuhuo')}期间：你的回合开始对所有其他角色随机造成0~2点伤害；其他角色回合开始你视为使用一张无距离限制的雷【杀】`,
};

// 默认读音把「DIY」逐字符拆开（D I Y）：按叁岛式以整词覆盖（先例：银狼LV999）。
export const pinyins = {
    '应星DIY白厄': ['yìng', 'xīng', 'DIY', 'bái', 'è'],
};
