// 姬子（源 animal.lua L2223-2327）—— 天坠必杀技火属性群体通常伤害、乘胜攒标记炎杀、熔核点杀烧伤目标。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '火·智识·群星的探险家'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('姬子')}是${get.poptip('bts_glossary_nature_yan_dmg_faq')}输出：${get.poptip('bts_glossary_bisha_faq')}${B('天坠')}用${get.poptip('bts_glossary_nuqi_faq')}对多名角色造成${get.poptip('bts_glossary_nature_yan_dmg_faq')}通常伤害，${get.poptip('bts_glossary_xingqi_faq')}时再给体力最高者附加${get.poptip('bts_glossary_nature_yan_faq')}；${B('乘胜')}别人获得附加时攒标记，攒够挥出炎杀；${B('熔核')}点杀${get.poptip('bts_glossary_abnormal_burn_faq')}目标。` +
    `<li>${get.poptip('bts_glossary_nature_yan_dmg_faq')}伤害对无附加目标附加炎、对${get.poptip('bts_glossary_nature_yan_faq')}目标触发${get.poptip('bts_glossary_abnormal_burn_faq')}、对其他附加目标移除并增伤`;

export const character = {
    bts_himiko: {
        sex: 'female',
        group: 'xingqionglieche',
        hp: 4,
        skills: ['bts_st_tianzhui', 'bts_st_chengsheng', 'bts_st_ronghe'],
    },
};

export const skill = {
    // ── 必杀技·天坠（源 st_tianzhui = ZeroCardViewAsSkill + Death 触发，L2224-2264）──
    bts_st_tianzhui: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianzhui');
            lib.bts.api.loseAngry(player, 4); // 源 L2230
            let killed = false;
            for (const t of event.targets || []) {
                // 炎属性通常伤害：reason 带 _common（通常，不可被强化）+ 元素炎
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_tianzhui_common';
                lib.bts.api.setDamageNature(damage, 'flame');
                await damage;
                if (t.isDead()) killed = true;
            }
            // 星启：令其中体力值最多的角色各附加火属性（源 AddNature(p,"fire")）
            if (lib.bts.api.god(player)) {
                let maxHp = -1;
                for (const t of event.targets || [])
                    maxHp = Math.max(maxHp, t.hp);
                for (const t of event.targets || []) {
                    if (t.hp === maxHp) await lib.bts.api.addNature(t, 'flame');
                }
            }
            // 源 Death 触发：以此法杀死角色后回复1点怒气
            if (killed) lib.bts.api.addAngry(player, 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianzhui')
                    ? -1
                    : 6;
            },
            threaten: 2.5,
            result: { player: 1 },
        },
    },

    // ── 锁定技·乘胜（源 st_chengsheng = TriggerSkill Compulsory MarkChanged，L2266-2310）──
    bts_st_chengsheng: {
        trigger: { global: 'addMark' }, // 源 MarkChanged + mark.name 含 @n_ + gain>0（他人附加属性）
        forced: true,
        filter(event, player) {
            return (
                event.player !== player &&
                typeof event.markName === 'string' &&
                event.markName.startsWith('bts_n_')
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_st_chengsheng', 1); // 发动由引擎自动记录
            if (player.countMark('bts_st_chengsheng') < 3) return;
            player.removeMark(
                'bts_st_chengsheng',
                player.countMark('bts_st_chengsheng'),
            );
            // 视为对所有受到过由你造成伤害的角色使用炎【杀】
            const targets = game.players.filter(
                (p) =>
                    p.isAlive() &&
                    player.countMark('bts_damage_link_' + p.playerid) > 0,
            );
            if (!targets.length) return;
            const use = player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'flame' } },
                targets,
            );
            await use;
        },
        ai: { noe: true },
    },

    // ── 熔核（源 st_ronghe = OneCardViewAsSkill + filter_pattern Slash，L2312-2327）──
    bts_st_ronghe: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对一名处于烧伤的角色造成1点炎属性伤害',
        filterTarget(event, player, target) {
            return target !== player && lib.bts.api.getAbnor(target, 'burn'); // 源 filter: GetAbnor(@abnormal_burn)
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_ronghe');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards);
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_ronghe'; // 源 "st_ronghe_fire"
            lib.bts.api.setDamageNature(damage, 'flame');
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_ronghe')
                    ? -1
                    : 5;
            },
            useful: 2,
            value: 5,
            result: { player: 1, target: -2 },
        },
    },
};

export const translate = {
    bts_himiko: '姬子',
    bts_st_tianzhui: '天坠',
    bts_st_tianzhui_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对这些角色各造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}通常伤害，然后若你为${get.poptip('bts_glossary_xingqi_faq')}，你令其中体力值最多的角色各附加${get.poptip('bts_glossary_nature_yan_faq')}。当你以此法杀死一名角色后，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_st_chengsheng: '乘胜',
    bts_st_chengsheng_info:
        '锁定技，当其他角色获得属性后，你获得1枚乘胜标记，若标记数不小于3，移除这些标记，视为对所有受到过由你造成伤害的角色使用炎【杀】。',

    bts_st_ronghe: '熔核',
    bts_st_ronghe_info: `出牌阶段，你可以弃置一张【杀】并选择一名处于${get.poptip('bts_glossary_abnormal_burn_faq')}的角色，对其造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}伤害。`,

    '$bts_st_tianzhui1': "我想，你可能还不明白……",
    '$bts_st_tianzhui2': "人类从不掩饰掌控星空的欲望…当然，也包括我在内",
    '$bts_st_chengsheng1': "哼，逃不掉的！",
    '$bts_st_chengsheng2': "一个一个来！",
    '$bts_st_ronghe1': "我当然是来者不拒",
    '$bts_st_ronghe2': "燃尽吧",
    '~bts_himiko': "明明…才刚开始……",
};

export const simpleTranslate = {
    bts_st_tianzhui_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色各造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}通常伤害；${get.poptip('bts_glossary_xingqi_faq')}则令体力最高者各附加炎；杀死角色后回1${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_st_chengsheng_info:
        '锁；其他角色获得属性后，你+1枚乘胜；≥3时移除并对所有受到过你伤害的角色使用炎杀',
    bts_st_ronghe_info: `出牌阶段，弃1张【杀】对1名${get.poptip('bts_glossary_abnormal_burn_faq')}角色造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}伤害`,
};

export const pinyins = { bts_himiko: 'jizi' };
