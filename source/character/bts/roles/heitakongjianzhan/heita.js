// 黑塔（源 animal.lua L2881-3073）—— 魔法必杀技同体力伤害、效率锁定霜杀、一锤拼点反击。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'heitakongjianzhan';
export const title = '冰·智识·天才人偶'; // 属性·命途
export const intro =
    `${B('黑塔')}是压制输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_xiaomofa'))}对同体力目标造成通常伤害，${B(get.poptip('bts_sk_xiaolv'))}锁定追击残血目标，${B(get.poptip('bts_sk_yichui'))}造成伤害后拼点反打。` +
    `<li>${get.poptip('bts_sk_xiaolv')}对同一角色每局限一次`;

export const character = {
    bts_ch_heita: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 3,
        skills: ['bts_sk_xiaomofa', 'bts_sk_xiaolv', 'bts_sk_yichui'],
    },
};

export const skill = {
    // ── 必杀技·魔法（源 st_xiaomofa = ZeroCardViewAsSkill，L2882-2905）──
    bts_sk_xiaomofa: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            if (target === player) return false;
            if (ui.selected.targets.length === 0) return true; // 第一个目标
            return target.hp === ui.selected.targets[0].hp; // 同体力
        },
        selectTarget: [1, Infinity],
        multitarget: true, // 一次性结算；非 multitarget 会按目标重跑 content（《技能开发规范》B14）
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xiaomofa');
            lib.bts.api.loseAngry(player, 3); // 源 L2888
            for (const t of event.targets || []) {
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_xiaomofa_bts_reason_common'; // 通常伤害
                if (lib.bts.api.god(player)) lib.bts.api.setDamageNature(damage, 'frost'); // 星启霜属性
                await damage;
            }
        },
        ai: {
            // AI 口径：3怒气必杀对「同一体力」的敌方各造成1点通常伤害（首目标定体力、后续须同体力）；
            // 按体力分桶取最大敌方簇估值，残血击杀/星启（必杀+1、霜属性相克+1）加分（源 L2882-2905）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_xiaomofa')) return -1;
                const isGod = lib.bts.api.god(player);
                const buckets = {}; // 体力→该体力敌方簇的估值合计
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue;
                    let d = 1;
                    if (isGod) {
                        d += 1; // 星启：必杀技伤害+1（rules/globalrules.js L54-55）
                        const nat = lib.bts.api.getNature(null, t);
                        if (nat && nat !== 'frost') d += 1; // 霜与异属性相克+1（同文件 L56-64）
                    }
                    let v = d * 1.5; // 1点伤害≈1.5评估单位（与同批口径一致）
                    if (t.hp <= d) v += 2.5; // 击杀
                    buckets[t.hp] = (buckets[t.hp] || 0) + v;
                }
                let best = 0;
                for (const hp in buckets) best = Math.max(best, buckets[hp]);
                if (!best) return -1;
                return best >= 6 ? 8 : best >= 4 ? 6 : best >= 2 ? 4 : 2;
            },
            threaten: 2,
            result: {
                player: 1,
                // 目标受损=伤害d（星启+1、霜相克+1）+击杀加分；同体力簇越大越应先出手（首目标定整簇）
                target: (player, target) => {
                    let d = 1;
                    if (lib.bts.api.god(player)) {
                        d += 1;
                        const nat = lib.bts.api.getNature(null, target);
                        if (nat && nat !== 'frost') d += 1;
                    }
                    let v = d * 1.5;
                    if (target.hp <= d) v += 2.5;
                    const cluster = game.countPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0 &&
                            t.hp === target.hp,
                    );
                    v += Math.max(0, cluster - 1) * 0.4;
                    return -v;
                },
            },
        },
    },

    // ── 锁定技·效率（源 st_xiaolv = TriggerSkill Damaged，L2906-2944）──
    bts_sk_xiaolv: {
        trigger: { global: 'damageEnd' },
        forced: true,
        logTarget: 'player',
        filter(event, player) {
            if (!event.player || event.player === player) return false;
            if (event.player.countMark('bts_sk_xiaolv') > 0) return false; // 每角色限一次
            if (!(event.player.hp < event.player.maxHp - event.player.hp))
                return false; // hp < 已损失体力
            return (
                player.countMark('bts_damage_link_' + event.player.playerid) > 0
            ); // 你对其造成过伤害
        },
        async content(event, trigger, player) {
            trigger.player.addMark('bts_sk_xiaolv', 1);
            const use = player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'frost' } },
                trigger.player,
            );
            await use; // 视为霜【杀】（trigger=damageEnd 事件，其 .player 为受伤者）
        },
    },

    // ── 一锤（源 st_yichui = TriggerSkill Damage/Pindian + ViewAsSkill n=2，L2936-3061）：多目标拼点 ──
    // 当前机制（与源差异：不要求黑塔自身体力高于已损失，改为拼点目标须体力高于已损失；没赢者无条件结算）
    bts_sk_yichui: {
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            if (!(event.num > 0)) return false;
            // 弃置的【杀】与拼点牌须为两张不同手牌（拼点牌限非装备牌），否则无法完成发动
            const hand = player.getCards('h');
            if (
                !hand.some(
                    (card) =>
                        get.name(card) === 'sha' &&
                        hand.some((other) => other !== card && get.type(other) !== 'equip'),
                )
            )
                return false;
            // 需存在体力值大于已损失体力值且有手牌的其他存活角色（与 filterTarget 同款判据），否则无目标可选、不提示发动
            return game.hasPlayer(
                (target) =>
                    target !== player &&
                    target.isAlive() &&
                    target.countCards('h') > 0 &&
                    target.hp > target.maxHp - target.hp,
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
            // 拼点牌与拼点目标一体化（chooseCardTarget）：一次对话完成选牌+选目标并确认，
            // 不再「选拼点牌 → 选目标」两次确认。
            const pindian = await player
                .chooseCardTarget({
                    prompt: '一锤：选择一张拼点牌与拼点目标',
                    position: 'h',
                    filterCard: (card) =>
                        card !== slash.cards[0] && get.type(card) !== 'equip',
                    selectCard: 1,
                    selectTarget: [1, Infinity],
                    filterTarget: (card, source, target) =>
                        target !== source &&
                        target.countCards('h') > 0 &&
                        target.hp > target.maxHp - target.hp,
                    // AI 口径：拼点牌结算后损失——点数优先（赢面）、价值折价；
                    // 池内最高点数<7 时全部给 ≤0 分（取消发动，避免白损两张牌）
                    ai1: (card) => {
                        if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                        let best = 0;
                        for (const c of player.getCards('h')) {
                            if (get.type(c) === 'equip' || c === slash.cards[0])
                                continue;
                            best = Math.max(best, get.number(c));
                        }
                        if (best < 7) return -1;
                        return get.number(card) - get.value(card) / 3;
                    },
                    // AI 口径：只与敌方拼点；目标体力>已损失（filterTarget 已限），
                    // 其输了受1伤+摸2，赢或平你反而受伤 → 敌方按估值给正分
                    ai2: (target) => {
                        if (target === player) return -1;
                        if (get.attitude(player, target) >= 0) return -1;
                        return 2 - get.attitude(player, target) / 4;
                    },
                })
                .forResult();
            if (!pindian.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = pindian;
            event.result.cost_data = {
                pindian: pindian.cards[0],
                cards: slash.cards,
            };
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
            // 每次拼点独立结算：没赢的角色（平局时双方都没赢）各受1点伤害并摸两张
            for (let index = 0; index < event.targets.length; index++) {
                const target = event.targets[index];
                const num1 = result.num1[index];
                const num2 = result.num2[index];
                const losers = [];
                if (num1 <= num2) losers.push(player);
                if (num2 <= num1) losers.push(target);
                for (const loser of losers) {
                    if (!loser.isAlive()) continue;
                    const damage = loser.damage(player, 1, 'nocard');
                    damage.reason = 'bts_sk_yichui';
                    await damage;
                    if (loser.isAlive()) await loser.draw(player, 2);
                }
            }
        },
        ai: {
            result: {
                player: 1,
                // 多目标：没赢者受1伤并摸2（filterTarget 已保证其体力>已损失），敌方取负值、友方不介入
                target: (player, target) =>
                    get.attitude(player, target) < 0 ? -1 : 0,
            },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_heita_skin1': '皮肤1',
    'bts_ch_heita_skin2': '皮肤2',
    'bts_ch_heita_skin3': '皮肤3',
    bts_ch_heita: '黑塔',
    bts_sk_xiaomofa: '魔法',
    bts_sk_xiaomofa_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名体力值相同的其他角色，`
        + `对这些角色各造成1点通常伤害，若你为${get.poptip('bts_glossary_xingqi_faq')}，视为${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害。`,
    bts_sk_xiaolv: '效率',
    bts_sk_xiaolv_info: '锁定技，当其他角色受到伤害后，若你对其造成过伤害且其体力值小于已损失的体力值，你视为对其使用霜【杀】。每名角色限一次。',
    bts_sk_yichui: '一锤',
    bts_sk_yichui_info: '当你造成伤害后，你可以弃置一张【杀】并选择一张非装备牌作为拼点牌，与至少一名体力值大于已损失体力值且有手牌的其他角色各拼点；每次拼点，没赢的角色受到你造成的1点伤害并摸两张牌。',

    '$bts_sk_xiaomofa1': "知道我是谁吗？",
    '$bts_sk_xiaomofa2': "没见过这么大的钻石吧？送给你啦~",
    '$bts_sk_xiaolv1': "转圈圈喽~",
    '$bts_sk_xiaolv2': "骨碌碌~",
    '$bts_sk_yichui1': "能不能安静一点！",
    '$bts_sk_yichui2': "疼死你",
    '~bts_ch_heita': "断开…连接……",
};

export const simpleTranslate = {
    bts_sk_xiaomofa_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，-3${get.poptip('bts_glossary_nuqi_faq')}对至少1名同体力其他角色各造成1点通常伤害（${get.poptip('bts_glossary_xingqi_faq')}${get.poptip('bts_glossary_nature_frost_faq')}）`,
    bts_sk_xiaolv_info: '锁；其他角色受伤后，若你伤过他且其体力<已损失体力，视为对其用霜杀（每角色限一次）',
    bts_sk_yichui_info: '造成伤害后，可-1杀，与任意名体力>已损失且有手牌的其他角色拼点（拼点牌为1张非装备牌）；每次没赢的角色受1点伤害并+2牌',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
