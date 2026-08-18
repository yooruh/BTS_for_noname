// 托帕（源 animal.lua L4410-4513）—— 负债循环与涨幅。
import { lib, game, get, B } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '火·巡猎·投资机构高级专员'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('托帕')}用透支给目标挂${get.poptip('bts_glossary_abnormal_fuzhai_faq')}，开扭亏拿涨幅。`;
export const character = {
    bts_tuopa: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_niukui', 'bts_st_jinrong', 'bts_st_touzhi'],
    },
};
export const skill = {
    bts_st_niukui: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return (
                lib.bts.api.getAngry(player, 5) && !player.hasSkill('bts_st_zhangfu')
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_niukui');
            lib.bts.api.loseAngry(player, 5);
            await player.addSkill('bts_st_zhangfu');
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_niukui') ? -1 : 7,
            result: { player: 1 },
        },
    },
    bts_st_zhangfu: {
        charlotte: true,
        forced: true,
        trigger: { player: ['damageEnd', 'useCard'] },
        filter(event, player, triggername) {
            return triggername === 'damageEnd'
                ? lib.bts.api.getAbnor(player, 'fuzhai')
                : event.card?.name === 'sha' && !event.card.cards?.length;
        },
        content(event, trigger, player) {
            if (event.triggername === 'damageEnd')
                lib.bts.api.addAbnormal(player, 'fuzhai', 1, player);
            else {
                player.addMark('bts_zhangfu', 1);
                const threshold = lib.bts.api.god(player) ? 2 : 1;
                if (player.countMark('bts_zhangfu') > threshold) {
                    player.removeMark('bts_zhangfu', player.countMark('bts_zhangfu'));
                    player.removeSkill('bts_st_zhangfu');
                }
            }
        },
        ai: { noe: true },
    },
    bts_st_jinrong: {
        // 源 st_jinrong（animal.lua L4462-4479）：MarkChanged 时负债≥4 即移除3层并视为用杀，
        // 不限于受伤（原实现误挂 damageEnd，导致透支/涨幅叠层后不即时触发）。
        trigger: { global: ['addMark', 'removeMark'] },
        logTarget: 'player',
        forced: true,
        filter(event, player) {
            return (
                event.markName === 'bts_abnormal_fuzhai' &&
                event.player?.isAlive() &&
                lib.bts.api.getAbnor(event.player, 'fuzhai', 4)
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player; // trigger=addMark/removeMark 事件
            lib.bts.api.removeAbnormal(target, 'fuzhai', 3);
            await player.useCard(
                {
                    name: 'sha',
                    isCard: true,
                    storage: { bts_st_jinrong: true },
                },
                target,
            );
        },
        ai: { noe: true },
    },
    bts_st_touzhi: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return player
                .getCards('h')
                .some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCardTarget({
                    prompt: '透支：弃置一张【杀】令一名其他角色附加3层负债',
                    position: 'h',
                    filterCard: (card) => get.name(card) === 'sha',
                    filterTarget: (card, source, target) => source !== target,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选【杀】在技能事件 event.cards，结算弃置
            await player.discard(event.cards);
            lib.bts.api.addAbnormal(event.targets[0], 'fuzhai', 3, player);
        },
        ai: { result: { target: -1 } },
    },
};
export const translate = {
    bts_tuopa: '托帕',
    bts_st_niukui: '扭亏',
    bts_st_niukui_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得“涨幅”。`,
    bts_st_zhangfu: '涨幅',
    bts_st_zhangfu_info: `锁定技，拥有${get.poptip('bts_glossary_abnormal_fuzhai_faq')}时受伤后，你附加1层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}；使用虚拟【杀】后获得涨幅，达到阈值时失去此技能。`,
    bts_st_jinrong: '金融',
    bts_st_jinrong_info: `锁定技，当角色拥有至少4层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}后，你移除其3层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}并视为对其使用【杀】。`,
    bts_st_touzhi: '透支',
    bts_st_touzhi_info: `准备阶段开始时，你可以弃置一张【杀】，令一名其他角色附加3层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}。`,

    '$bts_st_niukui1': "行情扑朔迷离……",
    '$bts_st_niukui2': "啊？对哦。目光放远，聚焦长线…就是投资成功的秘诀！",
    '$bts_st_jinrong1': "还不还款？",
    '$bts_st_jinrong2': "我看涨哦",
    '$bts_st_touzhi1': "账账，狠狠地砸！",
    '$bts_st_touzhi2': "清算时间到啦！",
    '$bts_st_zhangfu1': "连本带息，还债！",
    '$bts_st_zhangfu2': "全部资产，没收！",
    '~bts_tuopa': "还没填…事假申请……",
};
export const simpleTranslate = {
    bts_st_niukui_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}获得涨幅`,
    bts_st_jinrong_info: `锁；角色${get.poptip('bts_glossary_abnormal_fuzhai_faq')}≥4时移除其3层并视为对其用杀`,
    bts_st_touzhi_info: `准备阶段可弃杀令1名其他角色+3${get.poptip('bts_glossary_abnormal_fuzhai_faq')}`,
};
export const pinyins = { bts_tuopa: 'tuopa' };
