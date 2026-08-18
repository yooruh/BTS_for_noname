// 三月七（源 animal.lua L1960-2028）—— 冰箭必杀技冻结群控、可爱给盾、特权为源已注释空技能。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'xingqionglieche';
export const title = '冰·存护·超超超超厉害的本姑娘☆'; // 属性·命途
export const intro =
    `${B('三月七')}是控场辅助：${get.poptip('bts_glossary_bisha_faq')}${B('冰箭')}用${get.poptip('bts_glossary_nuqi_faq')}令多名角色${B(get.poptip('bts_glossary_abnormal_freeze_faq'))}，${B('可爱')}弃【杀】给盾，${get.poptip('bts_glossary_xingqi_faq')}时冰箭还能回复${get.poptip('bts_glossary_nuqi_faq')}。` +
    `<li>${get.poptip('bts_glossary_abnormal_freeze_faq')}令目标禁装备牌且伤害基数-1，注意目标选择`;

export const character = {
    bts_ch_sanyueqi: {
        sex: 'female',
        group: 'xingqionglieche',
        hp: 3,
        skills: ['bts_sk_bingjian', 'bts_sk_tequan', 'bts_sk_keai'],
    },
};

export const skill = {
    // ── 必杀技·冰箭（源 st_bingjian = ZeroCardViewAsSkill，L1961-1978）──
    bts_sk_bingjian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // enabled_at_play：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_bingjian');
            lib.bts.api.loseAngry(player, 3); // 源 L1971
            for (const t of event.targets || []) {
                lib.bts.api.addAbnormal(t, 'freeze', 1, player); // 源 L1973：各附加1层冻结
            }
            if (lib.bts.api.god(player)) lib.bts.api.addAngry(player, 1); // 源 L1975
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_bingjian')
                    ? -1
                    : 5;
            },
            threaten: 2,
            result: { player: 1 },
        },
    },

    // ── 特权（源 st_tequan，L1980-1995；on_trigger 整体被注释，实际为空技能）──
    bts_sk_tequan: {
        trigger: { global: 'damageEnd' },
        filter() {
            return false;
        }, // 源实现已注释，保持空技能（描述仍保留）
        async content() {},
        ai: { noe: true },
    },

    // ── 可爱（源 st_keai = OneCardViewAsSkill + filter_pattern Slash，L1997-2028）──
    bts_sk_keai: {
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
            lib.bts.aiGuard.record(player, 'bts_sk_keai');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards); // 弃置所选【杀】
            lib.bts.api.addShield(target, 1, player); // 源 AddAShield(target, player)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_keai') ? -1 : 3;
            },
            useful: 1,
            value: 3,
            result: { target: 1 },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_sanyueqi_skin1': '皮肤1',
    'bts_ch_sanyueqi_skin10': '皮肤10',
    'bts_ch_sanyueqi_skin11': '皮肤11',
    'bts_ch_sanyueqi_skin12': '皮肤12',
    'bts_ch_sanyueqi_skin13': '皮肤13',
    'bts_ch_sanyueqi_skin14': '皮肤14',
    'bts_ch_sanyueqi_skin15': '皮肤15',
    'bts_ch_sanyueqi_skin16': '皮肤16',
    'bts_ch_sanyueqi_skin17': '皮肤17',
    'bts_ch_sanyueqi_skin18': '皮肤18',
    'bts_ch_sanyueqi_skin19': '皮肤19',
    'bts_ch_sanyueqi_skin2': '皮肤2',
    'bts_ch_sanyueqi_skin20': '皮肤20',
    'bts_ch_sanyueqi_skin21': '皮肤21',
    'bts_ch_sanyueqi_skin22': '皮肤22',
    'bts_ch_sanyueqi_skin3': '皮肤3',
    'bts_ch_sanyueqi_skin4': '皮肤4',
    'bts_ch_sanyueqi_skin5': '皮肤5',
    'bts_ch_sanyueqi_skin6': '皮肤6',
    'bts_ch_sanyueqi_skin7': '皮肤7',
    'bts_ch_sanyueqi_skin8': '皮肤8',
    'bts_ch_sanyueqi_skin9': '皮肤9',
    bts_ch_sanyueqi: '三月七',
    bts_sk_bingjian: '冰箭',
    bts_sk_bingjian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层${get.poptip('bts_glossary_abnormal_freeze_faq')}，然后若你为${get.poptip('bts_glossary_xingqi_faq')}，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_sk_tequan: '特权',
    bts_sk_tequan_info: `锁定技，当一名角色因受到伤害而移除${get.poptip('bts_glossary_hudun_faq')}后，你可以视为对来源使用【杀】。（源实现已注释，暂无实际效果）`,

    bts_sk_keai: '可爱',
    bts_sk_keai_info: `出牌阶段，你可以弃置一张【杀】并选择一名角色，令其附加1层${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_sk_bingjian1': "偶尔也该认真一下",
    '$bts_sk_bingjian2': "来尝尝本姑娘的厉害~",
    '$bts_sk_tequan1': "不许跑！",
    '$bts_sk_tequan2': "你再打？",
    '$bts_sk_keai1': "本姑娘出马，怎么可能会输嘛~",
    '$bts_sk_keai2': "乖乖站好，这就给你加个祝福~",
    '~bts_ch_sanyueqi': "我不想…一个人……",
};

export const simpleTranslate = {
    bts_sk_bingjian_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1层${get.poptip('bts_glossary_abnormal_freeze_faq')}；若${get.poptip('bts_glossary_xingqi_faq')}则回复1点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_tequan_info: '锁；空技能（源实现已注释）',
    bts_sk_keai_info: `出牌阶段，弃1张【杀】令1名角色（含自己）+1层${get.poptip('bts_glossary_hudun_faq')}`,
};

export const pinyins = { bts_ch_sanyueqi: 'sanyueqi' };
