// 阿兰（源 animal.lua L2814-2880）—— 狂裁必杀技拿牌、至痛锁定防异常伤害、解禁反伤。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'heitakongjianzhan';
export const title = '雷·毁灭·以身作引'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('阿兰')}是续航反击：${get.poptip('bts_glossary_bisha_faq')}${B('狂裁')}花${get.poptip('bts_glossary_nuqi_faq')}拿走多人手牌，${B('至痛')}免疫异常伤害但会触发仪式，${B('解禁')}受伤后叠${get.poptip('bts_glossary_bless_busi_faq')}并反伤。` +
    '<li>至痛触发仪式后失去技能，注意时机';

export const character = {
    bts_alan: {
        sex: 'male',
        group: 'heitakongjianzhan',
        hp: 3,
        skills: ['bts_st_kuangcai', 'bts_st_zhitong', 'bts_st_jiejin'],
    },
};

export const skill = {
    // ── 必杀技·狂裁（源 st_kuangcai = ZeroCardViewAsSkill，L2815-2838）──
    bts_st_kuangcai: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            if (target === player || target.countCards('h') === 0) return false;
            const max = lib.bts.api.god(player)
                ? Infinity
                : Math.max(player.maxHp - player.hp, 1);
            return ui.selected.targets.length < max;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_kuangcai');
            lib.bts.api.loseAngry(player, 3); // 源 L2833
            for (const t of event.targets || []) {
                await player.gainPlayerCard(t, 'h', 'visible'); // 源 obtainCard：获得一张手牌
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_kuangcai')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·至痛（源 st_zhitong = TriggerSkill Compulsory DamageInflicted/Damaged，L2839-2861）──
    bts_st_zhitong: {
        trigger: { player: 'damageBegin2' },
        forced: true,
        filter(event, player) {
            return event.reason?.includes('abnormal');
        },
        async content(event, trigger, player) {
            trigger.cancel(); // 防止此异常伤害（取消触发事件 damageBegin2）
            player.addMark('bts_st_zhitong', 1);
        },
        group: ['bts_st_zhitong_lose'],
        subSkill: {
            lose: {
                trigger: { player: 'damageEnd' },
                filter(event, player) {
                    return player.countMark('bts_st_zhitong') > 0 && event.num > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_st_zhitong',
                        player.countMark('bts_st_zhitong'),
                    );
                    player.removeSkill('bts_st_zhitong'); // 源 detachSkillFromPlayer：失去此技能
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 解禁（源 st_jiejin = TriggerSkill Damaged，L2862-2880）──
    bts_st_jiejin: {
        trigger: { player: 'damageEnd' },
        logTarget: (trigger, player) => trigger.source,
        filter(event, player) {
            return player.hp > 1 && event.num > 0 && !!event.source;
        },
        async content(event, trigger, player) {
            const r = await player
                .chooseBool(
                    '解禁：是否附加1层不死祝福并对' +
                        get.translation(trigger.source) +
                        '造成1点伤害？',
                )
                .forResult();
            if (!r.bool) return;
            await lib.bts.api.addBless(player, 'busi'); // 源 AddBless(@bless_busi)
            const damage = trigger.source.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_jiejin'; // 源 DamageStruct(st_jiejin, ...)
            await damage;
        },
        ai: {
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_alan: '阿兰',
    bts_st_kuangcai: '狂裁',
    bts_st_kuangcai_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择X名有手牌的其他角色（X为你已损失的体力值且至少为1，若你为${get.poptip('bts_glossary_xingqi_faq')}则无限制），获得这些角色各一张手牌。`,

    bts_st_zhitong: '至痛',
    bts_st_zhitong_info:
        '锁定技，当你受到由异常造成的伤害时，防止此伤害。仪式：当你受到伤害后，失去此技能。',

    bts_st_jiejin: '解禁',
    bts_st_jiejin_info: `当你受到伤害后，若你的体力值大于1，你可以附加1层${get.poptip('bts_glossary_bless_busi_faq')}，对来源造成1点伤害。`,

    '$bts_st_kuangcai1': "这点疼痛不足挂齿",
    '$bts_st_kuangcai2': "而你们将会，痛苦万倍！嘿啊！",
    '$bts_st_zhitong1': "嗯？",
    '$bts_st_zhitong2': "真碍事",
    '$bts_st_jiejin1': "成全你们",
    '$bts_st_jiejin2': "都给我闭嘴",
    '~bts_alan': "不能保护大家了……",
};

export const simpleTranslate = {
    bts_st_kuangcai_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}获得最多X名（X=已损失体力，${get.poptip('bts_glossary_xingqi_faq')}无限制）有手牌角色各1张手牌`,
    bts_st_zhitong_info: '锁；防止异常造成的伤害，之后受到伤害后失去此技能',
    bts_st_jiejin_info: `受到伤害后，若体力>1可+1${get.poptip('bts_glossary_bless_busi_faq')}并对来源造成1点伤害`,
};

export const pinyins = { bts_alan: 'alan' };
