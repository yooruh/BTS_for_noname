// 刃（源 animal.lua L2559-2641）—— 万死必杀技压血+暴击风伤、倏忽锁定不死祝福、狱变弃杀入地狱。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xinghelieshou';
export const title = '风·毁灭·业途游魂'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('刃')}是自损爆发：${get.poptip('bts_glossary_bisha_faq')}${B('万死')}把体力压到上限一半并对目标造成${get.poptip('bts_glossary_bless_critical_faq')}风伤，${B('倏忽')}掉血叠${get.poptip('bts_glossary_bless_busi_faq')}、满5层回血并反杀，${B('狱变')}弃【杀】入${get.poptip('bts_glossary_abnormal_diyu_faq')}把手牌当【决斗】。` +
    `<li>${get.poptip('bts_glossary_bless_busi_faq')}满5层会移除并回复2体力、对上个伤害你的角色使用【杀】`;

export const character = {
    bts_ren: {
        sex: 'male',
        group: 'xinghelieshou',
        hp: 4,
        skills: [
            'bts_st_wansi',
            'bts_st_shuhu',
            'bts_st_yubian',
        ],
    },
};

export const skill = {
    // ── 必杀技·万死（源 st_wansi = ZeroCardViewAsSkill，L2560-2585）──
    bts_st_wansi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return (
                target !== player &&
                get.distance(player, target) <= player.getAttackRange()
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_wansi');
            const target = event.targets[0];
            if (!target) return;
            lib.bts.api.loseAngry(player, 5); // 源 L2566
            // 体力调整至上限的一半
            const x = Math.floor(player.maxHp / 2);
            if (player.hp < x) await player.recover(player, x - player.hp);
            else if (player.hp > x) await player.loseHp(player.hp - x);
            // 1点风属性暴击伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_wansi_critical'; // 源 "st_wansi_critical_wind"
            lib.bts.api.setDamageNature(damage, 'wind');
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_wansi')
                    ? -1
                    : 6;
            },
            threaten: 2.5,
            result: { player: 1, target: -2 },
        },
    },

    // ── 锁定技·倏忽（源 st_shuhu = TriggerSkill Compulsory HpChanged，L2586-2616）──
    bts_st_shuhu: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        forced: true,
        filter(event, player) {
            return event.num > 0;
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(player, 'busi'); // 源 AddBless(@bless_busi)
            if (!lib.bts.api.getBless(player, 'busi', 5)) return;
            await player.recover(player, 2); // 源 recover 2（先回血，原版 L2604）
            await lib.bts.api.removeBless(player, 'busi', -1); // 再移除全部不死祝福（原版 L2605，归0时hp>0不触发濒死）
            // 原版：遍历存活角色，对每个 LastDamagedLink（伤害关联）角色各用一张【杀】。
            // 无名杀用 getAllHistory 反查所有存活伤害来源（去重），替代自维护标记。
            const targets = [];
            for (const d of player.getAllHistory('damage')) {
                const src = d.source;
                if (src && src.isAlive() && !targets.includes(src))
                    targets.push(src);
            }
            for (const target of targets) {
                const use = player.useCard(
                    { name: 'sha', isCard: true },
                    target,
                ); // 视为对每个伤害过你的角色使用【杀】
                await use;
            }
        },
        ai: { noe: true },
    },

    // ── 狱变（源 st_yubian = TriggerSkill EventPhaseStart，L2617-2627）──
    bts_st_yubian: {
        enable: 'phaseUse',
        filter(event, player) {
            return !lib.bts.api.getAbnor(player, 'diyu');
        },
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，失去1点体力，附加3层地狱',
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yubian');
            await player.discard(event.cards);
            await player.loseHp(1);
            lib.bts.api.addAbnormal(player, 'diyu', 3, player); // 源 AddAbnormal(@abnormal_diyu, 3)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yubian')
                    ? -1
                    : 3;
            },
            result: { player: 1 },
        },
    },
    // 地狱为全角色通用规则：手牌视为【决斗】+使用【决斗】失去1点体力。
    // 已上移至规则层（RULE_MARKS['bts_abnormal_diyu'] 标记技能 + resolver useCard），
    // 原 bts_st_yubian_diyu / bts_st_yubian_duel 移除（刃/千冶均自动生效）。
};

export const translate = {
    bts_ren: '刃',
    bts_st_wansi: '万死',
    bts_st_wansi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择攻击范围内的一名角色，你将体力值调整至${get.poptip('bts_glossary_bless_maxhp_faq')}的一半，然后对其造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}${get.poptip('bts_glossary_bless_critical_faq')}伤害。`,

    bts_st_shuhu: '倏忽',
    bts_st_shuhu_info: `锁定技，当你扣减体力后，附加1层${get.poptip('bts_glossary_bless_busi_faq')}，然后若拥有至少5层${get.poptip('bts_glossary_bless_busi_faq')}，移除全部${get.poptip('bts_glossary_bless_busi_faq')}，回复2点体力，视为对上个对你造成伤害的角色使用【杀】。`,

    bts_st_yubian: '狱变',
    bts_st_yubian_info: `出牌阶段，你可以弃置一张【杀】，失去1点体力，附加3层${get.poptip('bts_glossary_abnormal_diyu_faq')}。`,

    '$bts_st_wansi1': "此番美景，我虽求而不得……",
    '$bts_st_wansi2': "却能，邀诸位共赏",
    '$bts_st_shuhu1': "彼岸…葬送！",
    '$bts_st_shuhu2': "悉数…奉还！",
    '$bts_st_yubian1': "其势…已成！",
    '$bts_st_yubian2': "死兆…将至！",
    '~bts_ren': "这次能成功吗……",
};

export const simpleTranslate = {
    bts_st_wansi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}对攻击范围内1名角色造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}${get.poptip('bts_glossary_bless_critical_faq')}伤害，并将体力调整至上限一半`,
    bts_st_shuhu_info: `锁；扣减体力后+1${get.poptip('bts_glossary_bless_busi_faq')}；≥5层时移除全部，回复2体力，对上个伤害你的角色使用杀`,
    bts_st_yubian_info: `出牌阶段，弃1张【杀】失去1体力，+3层${get.poptip('bts_glossary_abnormal_diyu_faq')}`,
};

export const pinyins = { bts_ren: 'ren' };
