// 虎克（源 animal.lua L3674-3753）—— 飞火必杀技火伤、浇油暴击、玩火弃杀群体烧伤。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '火·毁灭·漆黑的虎克大人'; // 属性·命途
export const intro =
    `${B('虎克')}是火焰输出：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_feihuo'))}火伤积攒标记，${B(get.poptip('bts_sk_jiaoyou'))}对${get.poptip('bts_glossary_abnormal_burn_faq')}目标${get.poptip('bts_glossary_bless_critical_faq')}，${B(get.poptip('bts_sk_wanhuo'))}弃【杀】群体${get.poptip('bts_glossary_abnormal_burn_faq')}。` +
    `<li>${get.poptip('bts_sk_feihuo')}标记越多，${get.poptip('bts_sk_wanhuo')}能${get.poptip('bts_glossary_abnormal_burn_faq')}的目标越多`;

export const character = {
    bts_ch_huke: {
        sex: 'male',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_feihuo', 'bts_sk_jiaoyou', 'bts_sk_wanhuo'],
    },
};

export const skill = {
    // ── 必杀技·飞火（源 st_feihuo = ZeroCardViewAsSkill，L3675-3698）──
    bts_sk_feihuo: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return (
                target !== player &&
                get.distance(player, target) <= player.getAttackRange()
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_feihuo');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3);
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_feihuo';
            lib.bts.api.setDamageNature(damage, 'flame');
            await damage;
            player.addMark('bts_sk_feihuo', 1); // 源 addPlayerMark(@st_feihuo)
        },
        ai: {
            // AI 口径：3怒=1点炎伤+1枚飞火标记（玩火燃料：每枚≈1名角色1层烧伤）；取攻击范围内
            // 估值最高的敌方目标，元素互动口径同 ren.js 万死（源 max_feihuo L3675-3698；
            // 源 AI StarRail-ai.lua #max_feihuo：CanMaxSkillDamage+Enemies_Range_AI、优先级9）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_feihuo')) return -1;
                let best = 0;
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue;
                    if (get.distance(player, t) > player.getAttackRange()) continue;
                    let v = 1.5; // 1点炎伤
                    const nat = lib.bts.api.getNature(null, t);
                    if (nat && nat !== 'flame') v += 1.5; // 异元素相克：伤害+1
                    else if (nat === 'flame') v += 0.8; // 同元素：转附加1层烧伤
                    v += 0.5; // 飞火标记（玩火燃料）
                    if (v > best) best = v;
                }
                if (!best) return -1; // 无攻击范围内敌方目标
                return best >= 3.5 ? 6 : best >= 2.5 ? 5 : 4;
            },
            result: {
                player: 1,
                // 目标受损=炎伤+元素互动（相克+1/同炎转烧伤）
                target: (player, target) => {
                    let v = 1.5;
                    const nat = lib.bts.api.getNature(null, target);
                    if (nat && nat !== 'flame') v += 1.5;
                    else if (nat === 'flame') v += 0.8;
                    return -v;
                },
            },
        },
    },

    // ── 锁定技·浇油（源 st_jiaoyou = TriggerSkill ConfirmDamage，L3699-3711）──
    // 源描述 L12985「锁定技」，源代码无询问自动触发 → 标 forced 防引擎弹 chooseBool。
    bts_sk_jiaoyou: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            return (
                event.card?.name === 'sha' && lib.bts.api.getAbnor(event.player, 'burn')
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.markDamage(trigger, '_critical'); // 源 AddNew "_critical"
        },
        ai: {
            // 锁定技（无询问）；给引擎估值补联动：用【杀】命中烧伤目标时伤害视为暴击——暴击伤害来源
            // 回复1点怒气（rules/globalrules.js L93-94），故对烧伤目标的【杀】提值
            //（源 st_jiaoyou L3699-3711；联动：bts_sk_wanhuo 附加烧伤）
            effect: {
                player: (card, player, target) => {
                    if (!target || card?.name !== 'sha') return;
                    if (!lib.bts.api.getAbnor(target, 'burn')) return;
                    return [1, 0.8]; // 暴击标记 + 暴击回怒≈0.8
                },
            },
        },
    },

    // ── 玩火（源 st_wanhuo = OneCardViewAsSkill + EventPhaseStart，L3712-3753）──
    bts_sk_wanhuo: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return (
                player.countMark('bts_sk_feihuo') > 0 &&
                player.getCards('h').some((c) => get.name(c) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            const n = player.countMark('bts_sk_feihuo');
            // 本技为 cost 型触发技：发动与否由下方三段内联 AI 决定（全程最高分≤0→取消）。
            // AI 口径：有可及敌方目标才发动；弃估值最低的【杀】；目标取敌方、低血线/未烧伤者优先
            //（源 st_wanhuo L3712-3753；源 AI StarRail-ai.lua @@st_wanhuo：Enemies_ThrowSlash_AI，
            // 目标数=飞火标记+1、须在攻击范围）
            const r = await player
                .chooseBool(
                    '玩火：是否弃置一张【杀】令至多' + n + '名角色附加烧伤？',
                )
                .set('ai', () =>
                    game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0 &&
                            get.distance(player, t) <= player.getAttackRange(),
                    ),
                )
                .forResult();
            if (!r.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .set('ai', (card) => 6 - get.value(card)) // 弃估值最低的【杀】
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            const targets = await player
                .chooseTarget(
                    '玩火：选择攻击范围内至多' + n + '名角色',
                    [1, n],
                    // 源 L3892：目标须在攻击范围内（同飞火 filterTarget）
                    (c, p, t) =>
                        t !== p &&
                        get.distance(p, t) <= p.getAttackRange(),
                )
                .set('ai', (t) => {
                    let v = -get.attitude(player, t); // 敌方向正分、友方向负分（全非敌→取消）
                    if (v > 0) {
                        if (t.hp <= 2) v += 0.5; // 低血线：烧伤在其出牌阶段压血
                        if (!lib.bts.api.getAbnor(t, 'burn')) v += 0.3; // 未烧伤者：铺开浇油暴击点
                    }
                    return v;
                })
                .forResult();
            if (!targets.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = targets;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, t, player) {
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const n = player.countMark('bts_sk_feihuo');
            player.removeMark('bts_sk_feihuo', n);
            for (const x of event.targets || []) // event=技能事件，cost 结果目标
                lib.bts.api.addAbnormal(x, 'burn', 1, player);
        },
        // 触发技（cost 型）：发动决策在 cost 内联 AI；result 供跨技能估值查询（烧伤≈对方出牌阶段受1伤+攻击范围-1）
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    bts_ch_huke: '虎克',
    bts_sk_feihuo: '飞火',
    bts_sk_feihuo_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择攻击范围内的一名角色，对其造成1点${get.poptip('bts_glossary_nature_flame_dmg_faq')}伤害，你获得1枚${get.poptip('bts_sk_feihuo')}标记。`,

    bts_sk_jiaoyou: '浇油',
    bts_sk_jiaoyou_info: `锁定技，当你使用【杀】对处于${get.poptip('bts_glossary_abnormal_burn_faq')}的角色造成伤害时，此伤害视为${get.poptip('bts_glossary_bless_critical_faq')}伤害。`,

    bts_sk_wanhuo: '玩火',
    bts_sk_wanhuo_info: `准备阶段开始时，你可以弃置一张【杀】，令攻击范围内至多X名其他角色各附加1层${get.poptip('bts_glossary_abnormal_burn_faq')}（X为你拥有的${get.poptip('bts_sk_feihuo')}标记数），然后移除全部${get.poptip('bts_sk_feihuo')}标记。`,

    '$bts_sk_feihuo1': "跟着我，有肉吃！",
    '$bts_sk_feihuo2': "漆黑的虎克大人驾到，让开让开让开…呜呼~",
    '$bts_sk_jiaoyou1': "哦呼~嘿嘿嘿~",
    '$bts_sk_jiaoyou2': "你说谁是小家伙！哼~",
    '$bts_sk_wanhuo1': "诶嘿嘿…没想到吧？",
    '$bts_sk_wanhuo2': "我来了…我又走咯~",
    '~bts_ch_huke': "老爹…都没打过我……",
};

export const simpleTranslate = {
    bts_sk_feihuo_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}对攻击范围内1名角色造成1点炎伤，+1${get.poptip('bts_sk_feihuo')}标记`,
    bts_sk_jiaoyou_info: `锁；用杀对${get.poptip('bts_glossary_abnormal_burn_faq')}角色造成伤害时视为${get.poptip('bts_glossary_bless_critical_faq')}`,
    bts_sk_wanhuo_info: `准备阶段，弃1杀令攻击范围内至多X名其他角色各+1${get.poptip('bts_glossary_abnormal_burn_faq')}（X=${get.poptip('bts_sk_feihuo')}标记数），移除全部${get.poptip('bts_sk_feihuo')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
