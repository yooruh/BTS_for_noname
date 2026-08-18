// 银枝（源 animal.lua L4514-4587）—— 金玫、公正与崇高。
import { lib, game, get, B } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '物理·智识·纯美骑士团的骑士'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('银枝')}用${get.poptip('bts_glossary_nuqi_faq')}二选一（缴械或通常伤害），杀和锦囊都能攒${get.poptip('bts_glossary_bless_shengge_faq')}。`;
export const character = {
    bts_yinzhi: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_jinmei', 'bts_st_gongzheng', 'bts_st_chonggao'],
    },
};
export const skill = {
    bts_st_jinmei: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 2);
        },
        filterTarget(event, player, target) {
            return (
                target !== player &&
                (lib.bts.api.getAngry(player, 4) || target.countCards('he'))
            );
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_jinmei');
            // 仅怒气≥4 时给「伤害」选项；怒气2-3 时直接缴械（避免提示选了伤害却被静默降级）
            let damage = false;
            if (lib.bts.api.getAngry(player, 4)) {
                damage = (
                    await player
                        .chooseControl('缴械（失2怒气）', '伤害（失4怒气）')
                        .forResult()
                ).control.includes('伤害');
            }
            const cost = damage ? 4 : 2;
            lib.bts.api.loseAngry(player, cost);
            for (const target of event.targets) {
                if (damage) {
                    const hurt = target.damage(player, 1, 'nocard');
                    hurt.reason = 'bts_st_jinmei_common';
                    await hurt;
                } else if (target.countCards('he'))
                    await player.discardPlayerCard(target, 'he', true);
            }
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_jinmei') ? -1 : 6,
            result: { target: -1 },
        },
    },
    bts_st_gongzheng: {
        trigger: { player: 'useCardAfter' },
        forced: true,
        filter(event) {
            return get.type(event.card) === 'trick';
        },
        async content(event, trigger, player) {
            if (player.hasSkill('bts_st_chonggao'))
                await lib.bts.api.addBless(player, 'shengge', game.countPlayer());
            for (const target of game.filterPlayer())
                if (target.countCards('h'))
                    await player.discardPlayerCard(target, 'h', true);
        },
        ai: { noe: true },
    },
    bts_st_chonggao: {
        trigger: { player: 'useCardToPlayered' },
        forced: true,
        filter(event) {
            return (
                event.card?.name === 'sha' ||
                event.card?.storage?.bts_st_jinmei
            );
        },
        async content(event, trigger, player) {
            // trigger=useCardToPlayered 事件
            await lib.bts.api.addBless(player, 'shengge', trigger.targets?.length || 1);
            // 升格祝福达10层的消耗与回复怒气统一由规则结算器 addMark 处理（源 gamerule_ex
            // MarkChanged L1700-1704），此处不再内联，避免双重结算。
        },
        ai: { noe: true },
    },
};
export const translate = {
    bts_yinzhi: '银枝',
    bts_st_jinmei: '金玫',
    bts_st_jinmei_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去2点${get.poptip('bts_glossary_nuqi_faq')}并弃置至少一名其他角色一张牌；或失去4点${get.poptip('bts_glossary_nuqi_faq')}，对这些角色各造成1点通常伤害。`,
    bts_st_gongzheng: '公正',
    bts_st_gongzheng_info: `锁定技，当你使用锦囊牌结算后，弃置每名角色一张手牌；若你拥有崇高，获得等同于存活角色数的${get.poptip('bts_glossary_bless_shengge_faq')}。`,
    bts_st_chonggao: '崇高',
    bts_st_chonggao_info: `锁定技，当你使用【杀】或以金玫造成伤害指定目标后，获得等同于目标数的${get.poptip('bts_glossary_bless_shengge_faq')}。`,

    '$bts_st_jinmei1': "再次见到那道光芒之前……",
    '$bts_st_jinmei2': "银河中的一切美丽，我将捍卫至最后一刻",
    '$bts_st_jinmei3': "……献给伊德莉拉",
    '$bts_st_gongzheng1': "纯美，永驻",
    '$bts_st_gongzheng2': "卑劣，消亡",
    '$bts_st_chonggao1': "荣光在上",
    '$bts_st_chonggao2': "就此向善吧",
    '~bts_yinzhi': "没找到…「祂」……",
};
export const simpleTranslate = {
    bts_st_jinmei_info: `${get.poptip('bts_glossary_bisha_faq')}；失2${get.poptip('bts_glossary_nuqi_faq')}弃目标牌，或失4${get.poptip('bts_glossary_nuqi_faq')}对目标造成通常伤害`,
    bts_st_gongzheng_info: `锁；锦囊后全场各弃1手牌，并可能获得${get.poptip('bts_glossary_bless_shengge_faq')}`,
    bts_st_chonggao_info: `锁；杀或金玫指定目标后获得${get.poptip('bts_glossary_bless_shengge_faq')}`,
};
export const pinyins = { bts_yinzhi: 'yinzhi' };
