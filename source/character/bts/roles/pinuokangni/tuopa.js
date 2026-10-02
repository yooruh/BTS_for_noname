// 托帕（源 animal.lua L4410-4513）—— 负债循环与涨幅。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'pinuokangni';
export const title = '火·巡猎·投资机构高级专员'; // 属性·命途
export const intro = `${B('托帕')}用${get.poptip('bts_sk_touzhi')}给目标挂${get.poptip('bts_glossary_abnormal_fuzhai_faq')}，开${get.poptip('bts_sk_niukui')}拿${get.poptip('bts_sk_zhangfu')}。`;
export const character = {
    bts_ch_tuopa: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_niukui', 'bts_sk_jinrong', 'bts_sk_touzhi'],
    },
};
export const skill = {
    bts_sk_niukui: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return (
                lib.bts.api.getAngry(player, 5) && !player.hasSkill('bts_sk_zhangfu')
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_niukui');
            lib.bts.api.loseAngry(player, 5);
            await player.addSkill('bts_sk_zhangfu');
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_sk_niukui') ? -1 : 7,
            result: { player: 1 },
        },
    },
    bts_sk_zhangfu: {
        charlotte: true,
        forced: true,
        // 负债②（源 st_zhangfu Damaged 分支）：任意负债角色受伤后 +1（2026-10-02 按源改为
        // 「任意负债角色」视角，取代原「仅技能持有者自身」范围）。
        trigger: { player: ['useCard'], global: ['damageEnd'] },
        filter(event, player, triggername) {
            // 源 L4812（use.card:getSubcards():isEmpty()）→ 虚拟判定统一 get.is.virtualCard
            //（2026-09-28；待实机复核）。
            return triggername === 'damageEnd'
                ? event.num > 0 && lib.bts.api.getAbnor(event.player, 'fuzhai')
                : event.card?.name === 'sha' && get.is.virtualCard(event.card);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'damageEnd')
                lib.bts.api.addAbnormal(trigger.player, 'fuzhai', 1, player);
            else {
                player.addMark('bts_mk_zhangfu', 1);
                const threshold = lib.bts.api.god(player) ? 2 : 1;
                if (player.countMark('bts_mk_zhangfu') > threshold) {
                    player.removeMark('bts_mk_zhangfu', player.countMark('bts_mk_zhangfu'));
                    player.removeSkill('bts_sk_zhangfu');
                }
            }
        },
        ai: { noe: true },
    },
    bts_sk_jinrong: {
        // 源 st_jinrong（animal.lua L4462-4479）：MarkChanged 时负债≥4 即移除3层并视为用杀，
        // 不限于受伤（原实现误挂 damageEnd，导致透支/涨幅叠层后不即时触发）。
        trigger: { global: ['bts_mark_add', 'bts_mark_remove'] },
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
                    storage: { bts_sk_jinrong: true },
                },
                target,
            );
        },
        ai: { noe: true },
    },
    bts_sk_touzhi: {
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
    bts_ch_tuopa: '托帕',
    bts_sk_niukui: '扭亏',
    bts_sk_niukui_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得“${get.poptip('bts_sk_zhangfu')}”。`,
    bts_sk_zhangfu: '涨幅',
    bts_sk_zhangfu_info: `锁定技，任意角色拥有${get.poptip('bts_glossary_abnormal_fuzhai_faq')}时受伤后，其附加1层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}；使用虚拟【杀】后获得${get.poptip('bts_sk_zhangfu')}，达到阈值时失去此技能。`,
    bts_sk_jinrong: '金融',
    bts_sk_jinrong_info: `锁定技，当角色拥有至少4层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}后，你移除其3层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}并视为对其使用【杀】。`,
    bts_sk_touzhi: '透支',
    bts_sk_touzhi_info: `准备阶段开始时，你可以弃置一张【杀】，令一名其他角色附加3层${get.poptip('bts_glossary_abnormal_fuzhai_faq')}。`,

    '$bts_sk_niukui1': "行情扑朔迷离……",
    '$bts_sk_niukui2': "啊？对哦。目光放远，聚焦长线…就是投资成功的秘诀！",
    '$bts_sk_jinrong1': "还不还款？",
    '$bts_sk_jinrong2': "我看涨哦",
    '$bts_sk_touzhi1': "账账，狠狠地砸！",
    '$bts_sk_touzhi2': "清算时间到啦！",
    '$bts_sk_zhangfu1': "连本带息，还债！",
    '$bts_sk_zhangfu2': "全部资产，没收！",
    '~bts_ch_tuopa': "还没填…事假申请……",
    bts_abnormal_fuzhai: '负债',
    bts_mk_zhangfu: '涨幅',
};
export const simpleTranslate = {
    bts_sk_niukui_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}获得${get.poptip('bts_sk_zhangfu')}`,
    bts_sk_jinrong_info: `锁；角色${get.poptip('bts_glossary_abnormal_fuzhai_faq')}≥4时移除其3层并视为对其用杀`,
    bts_sk_touzhi_info: `准备阶段可弃杀令1名其他角色+3${get.poptip('bts_glossary_abnormal_fuzhai_faq')}`,
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const marks = {
    bts_mk_zhangfu: {
        // 涨幅计数：使用虚拟【杀】后+1，达阈值失去涨幅技能；图标已就位（image/mark/bts_mk_zhangfu.png）
        markKind: 'mark',
    },
};

export const buffSkills = {
    bts_abnormal_fuzhai: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_fuzhai_faq',
        trigger: { player: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            // 源 L1393（damage.card:subcardsLength()==0）→ 虚拟判定统一 get.is.virtualCard
            //（2026-09-28；待实机复核）。
            return (
                event.player === player &&
                event.num > 0 &&
                event.card?.name === 'sha' &&
                get.is.virtualCard(event.card)
            );
        },
        async content(event, trigger, player) {
            lib.bts.api.addAbnormal(player, 'fuzhai');
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_fuzhai_faq',
        name: '|负债|',
        // 两条 +1 路径（2026-09-28 按源对齐）：
        // ① 全局分支（参照本 L1393-1395）：持有者受「视为使用【杀】」（无实体牌）伤害后 +1；
        // ② 涨幅分支（源 st_zhangfu Damaged）：任意负债角色受伤后 +1（2026-10-02 按源改，
        //   取代原「仅技能持有者自身」范围）。
        info: `异常状态：由${get.poptip('bts_sk_zhangfu')}、${get.poptip('bts_sk_touzhi')}赋予；受到视为使用的【杀】的伤害后+1层（任意${get.poptip('bts_glossary_abnormal_fuzhai_faq')}角色受伤后另+1层）；层数≥4时由${get.poptip('bts_sk_jinrong')}移除3层并视为对其使用【杀】。`,
    },
];
