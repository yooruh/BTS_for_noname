// 三月七（源 animal.lua L1960-2028）—— 冰箭必杀技冻结群控、可爱给盾、特权为源已注释空技能。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '冰·存护·超超超超厉害的本姑娘☆'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('三月七')}是控场辅助：${get.poptip('bts_glossary_bisha_faq')}${B('冰箭')}用${get.poptip('bts_glossary_nuqi_faq')}令多名角色${B(get.poptip('bts_glossary_abnormal_freeze_faq'))}，${B('可爱')}弃【杀】给盾，${get.poptip('bts_glossary_xingqi_faq')}时冰箭还能回复${get.poptip('bts_glossary_nuqi_faq')}。` +
    `<li>${get.poptip('bts_glossary_abnormal_freeze_faq')}令目标禁装备牌且伤害基数-1，注意目标选择`;

export const character = {
    bts_sanyueqi: {
        sex: 'female',
        group: 'xingqionglieche',
        hp: 3,
        skills: ['bts_st_bingjian', 'bts_st_tequan', 'bts_st_keai'],
    },
};

export const skill = {
    // ── 必杀技·冰箭（源 st_bingjian = ZeroCardViewAsSkill，L1961-1978）──
    bts_st_bingjian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_bingjian');
            lib.bts.api.loseAngry(player, 3); // 源 L1971
            for (const t of event.targets || []) {
                lib.bts.api.addAbnormal(t, 'freeze', 1, player); // 源 L1973：各附加1层冻结
            }
            if (lib.bts.api.god(player)) lib.bts.api.addAngry(player, 1); // 源 L1975
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_bingjian')
                    ? -1
                    : 5;
            },
            threaten: 2,
            result: { player: 1 },
        },
    },

    // ── 特权（源 st_tequan，L1980-1995；on_trigger 整体被注释，实际为空技能）──
    bts_st_tequan: {
        trigger: { global: 'damageEnd' },
        filter() {
            return false;
        }, // 源实现已注释，保持空技能（描述仍保留）
        async content() {},
        ai: { noe: true },
    },

    // ── 可爱（源 st_keai = OneCardViewAsSkill + filter_pattern Slash，L1997-2028）──
    bts_st_keai: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，令一名角色（包括你）附加1层护盾',
        filterTarget(event, player, target) {
            return true;
        }, // 源 filter 仅 #targets==0，可含自己
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_keai');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards); // 弃置所选【杀】
            lib.bts.api.addShield(target, 1, player); // 源 AddAShield(target, player)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_keai') ? -1 : 3;
            },
            useful: 1,
            value: 3,
            result: { target: 1 },
        },
    },
};

export const translate = {
    bts_sanyueqi: '三月七',
    bts_st_bingjian: '冰箭',
    bts_st_bingjian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层${get.poptip('bts_glossary_abnormal_freeze_faq')}，然后若你为${get.poptip('bts_glossary_xingqi_faq')}，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_st_tequan: '特权',
    bts_st_tequan_info: `锁定技，当一名角色因受到伤害而移除${get.poptip('bts_glossary_hudun_faq')}后，你可以视为对来源使用【杀】。（源实现已注释，暂无实际效果）`,

    bts_st_keai: '可爱',
    bts_st_keai_info: `出牌阶段，你可以弃置一张【杀】并选择一名角色，令其附加1层${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_st_bingjian1': "偶尔也该认真一下",
    '$bts_st_bingjian2': "来尝尝本姑娘的厉害~",
    '$bts_st_tequan1': "不许跑！",
    '$bts_st_tequan2': "你再打？",
    '$bts_st_keai1': "本姑娘出马，怎么可能会输嘛~",
    '$bts_st_keai2': "乖乖站好，这就给你加个祝福~",
    '~bts_sanyueqi': "我不想…一个人……",
};

export const simpleTranslate = {
    bts_st_bingjian_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1层${get.poptip('bts_glossary_abnormal_freeze_faq')}；若${get.poptip('bts_glossary_xingqi_faq')}则回复1点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_st_tequan_info: '锁；空技能（源实现已注释）',
    bts_st_keai_info: `出牌阶段，弃1张【杀】令1名角色（含自己）+1层${get.poptip('bts_glossary_hudun_faq')}`,
};

export const pinyins = { bts_sanyueqi: 'sanyueqi' };
