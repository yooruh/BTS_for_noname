// 砂金·戏浪（源 animal.lua L10233-10305）—— 量子元素与热意。
// 技能：胜局（必杀技·附加量子+热意/契约祝福）、热砂（受伤弃杀令全场量子化）、抛注（热意≥10补手牌）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '量子·欢愉·戏浪'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('砂金·戏浪')}给目标贴上量子元素，${get.poptip('bts_glossary_bless_reyi_faq')}攒满后把手牌补回五张。`;

export const character = {
    bts_shajin_xilang: {
        isUnseen: true, // 太阳神源角色未完成（半成品），先隐藏待完善
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_shengju', 'bts_st_resha', 'bts_st_paozhu_funny'],
    },
};

export const skill = {
    // ── 必杀技·胜局（源 st_shengju = SkillCard + ZeroCardViewAsSkill，L10234-10258）──
    // 出牌阶段，失5怒气，令任意名其他角色附加量子属性，你附加8层热意和4层契约祝福。
    bts_st_shengju: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L10256）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10237）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_shengju');
            lib.bts.api.loseAngry(player, 5); // 源 L10241：LoseAngry(player, 5)
            // 源 L10242-10244：目标各附加量子属性
            for (const target of event.targets)
                await lib.bts.api.addNature(target, 'dark');
            // 源 L10245-10246：自己附加8层热意、4层契约祝福
            await lib.bts.api.addBless(player, 'reyi', 8, player);
            await lib.bts.api.addBless(player, 'yingzi', 4, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_shengju')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·热砂（源 st_resha = TriggerSkill DamageInflicted，L10260-10287）──
    // 你受到伤害时，可弃置一张【杀】，令所有量子/睡眠角色（含伤害来源）附加量子属性，你附加4层热意。
    bts_st_resha: {
        trigger: { player: 'damageBegin2' },
        filter(event, player) {
            // 源 L10263-10265 + L10274：受到伤害且可弃【杀】（无名杀把弃牌放进 cost）
            return (
                event.num > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L10274：askForCard(player, "Slash") —— 选择一张【杀】（结算移入 content）
            event.result = await player
                .chooseCard(
                    '热砂：是否弃置一张【杀】？',
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                )
                .forResult();
        },
        logTarget(trigger, player) {
            // 源 L10265-10273：量子/睡眠角色 + 伤害来源
            const targets = game.filterPlayer(
                (target) =>
                    lib.bts.api.getNature(null, target) === 'dark' ||
                    lib.bts.api.getAbnor(target, 'sleep'),
            );
            if (trigger.source && !targets.includes(trigger.source))
                targets.push(trigger.source);
            return targets;
        },
        async content(event, trigger, player) {
            // 源 L10274：结算 cost 所选【杀】作为代价（自选数据在 event.cards）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L10280-10283：目标各附加量子属性，自己附加4层热意
            const targets = game.filterPlayer(
                (target) =>
                    lib.bts.api.getNature(null, target) === 'dark' ||
                    lib.bts.api.getAbnor(target, 'sleep'),
            );
            if (trigger.source && !targets.includes(trigger.source))
                targets.push(trigger.source);
            for (const target of targets)
                await lib.bts.api.addNature(target, 'dark');
            await lib.bts.api.addBless(player, 'reyi', 4, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·抛注（源 st_paozhu_funny = TriggerSkill Compulsory MarkChanged，L10289-10304）──
    // 热意达到10层时（每局限一次），将手牌补至五张。
    bts_st_paozhu_funny: {
        trigger: { player: 'addMark' },
        forced: true,
        filter(event, player) {
            // 源 L10295：@bless_reyi 标记变化且热意≥10，且本技能未发动过
            return (
                event.markName === 'bts_bless_reyi' &&
                player.countMark('bts_bless_reyi') >= 10 &&
                !player.countMark('bts_st_paozhu_funny_used')
            );
        },
        async content(event, trigger, player) {
            // 源 L10298：记录已发动（@st_paozhu_funny 标记）
            player.addMark('bts_st_paozhu_funny_used', 1);
            // 源 L10299-10301：手牌不足5张时补至5张
            if (player.countCards('h') < 5)
                await player.draw(player, 5 - player.countCards('h'));
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_shajin_xilang: '砂金·戏浪',
    bts_st_shengju: '胜局',
    bts_st_shengju_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令至少一名其他角色附加${get.poptip('bts_glossary_nature_dark_faq')}，你附加8层${get.poptip('bts_glossary_bless_reyi_faq')}和4层${get.poptip('bts_glossary_bless_yingzi_faq')}。`,
    bts_st_resha: '热砂',
    bts_st_resha_info: `受到伤害时，你可以弃置一张【杀】，令${get.poptip('bts_glossary_nature_dark_faq')}或${get.poptip('bts_glossary_abnormal_sleep_faq')}角色附加${get.poptip('bts_glossary_nature_dark_faq')}，你附加4层${get.poptip('bts_glossary_bless_reyi_faq')}。`,
    bts_st_paozhu_funny: '抛注',
    bts_st_paozhu_funny_info: `锁定技，${get.poptip('bts_glossary_bless_reyi_faq')}达到10层时，你将手牌补至五张。`,
    bts_bless_reyi: '热意祝福',



};

export const simpleTranslate = {
    bts_st_shengju_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令目标+暗，自身+${get.poptip('bts_glossary_bless_reyi_faq')}和${get.poptip('bts_glossary_bless_yingzi_faq')}`,
    bts_st_resha_info: `受伤可弃杀令暗/${get.poptip('bts_glossary_abnormal_sleep_faq')}角色+暗并+${get.poptip('bts_glossary_bless_reyi_faq')}`,
    bts_st_paozhu_funny_info: `锁；${get.poptip('bts_glossary_bless_reyi_faq')}≥10补至5手牌`,
};

export const pinyins = { bts_shajin_xilang: 'shajinxilang' };
