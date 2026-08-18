// 吉尔伽美什（源 animal.lua L9909-10032）—— 兴致阈值与王之三技。
// 技能：乖离（必杀技·群体虚数通常伤害）、财宝（跳摸+兴致积累）、悦王（他人必杀后增幅）、
//       承认（兴致当摸牌）、允许（他人回合结束获兴致）、背负（手牌【杀】当【过河拆桥】）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '雷·毁灭·古老的英雄王'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('吉尔伽美什')}拿${get.poptip('bts_glossary_xingzhi_faq')}换跳摸牌，攒满10点后取得王之权能。`;

export const character = {
    bts_gilgamesh: {
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_guaili', 'bts_st_caibao', 'bts_st_yuewang'],
    },
};

export const skill = {
    // ── 必杀技·乖离（源 st_guaili = SkillCard + ZeroCardViewAsSkill，L9910-9931）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点虚数通常伤害。
    bts_st_guaili: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9929）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9913）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_guaili');
            lib.bts.api.loseAngry(player, 5); // 源 L9916：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L9918：reason 含 "_light_common"（虚数属性 + 通常伤害，_common 使 reason 不触发特殊伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_guaili_common_light';
                lib.bts.api.setDamageNature(damage, 'light');
                await damage;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_guaili')
                    ? -1
                    : 9;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·财宝（源 st_caibao = TriggerSkill EventPhaseStart/EventPhaseChanging，L9933-9960）──
    // 锁定技，你跳过摸牌阶段；其他角色回合结束时，其可以令你获得1枚兴致，
    // 兴致达到10后你获得承认、允许、背负（并移除财宝）。
    bts_st_caibao: {
        trigger: { global: 'phaseAfter', player: 'phaseDrawBegin2' },
        forced: true,
        filter(event, player, triggername) {
            // 源 L9938：他人回合结束才触发（triggername 判变体，event.name 是基名）
            return triggername === 'phaseAfter'
                ? event.player !== player && !player.countMark('bts_st_caibao_done')
                : true;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'phaseDrawBegin2') {
                // 源 L9952-9955：进入摸牌阶段时跳过摸牌（skip Player_Draw）
                trigger.num = 0;
                return;
            }
            // 源 L9941-9944：其他角色回合结束，其可令你获得1枚兴致
            const result = await trigger.player
                .chooseBool(
                    `财宝：是否令${get.translation(player)}获得1枚兴致？`,
                )
                .set('ai', () => get.attitude(trigger.player, player) > 0)
                .forResult();
            if (!result.bool) return;
            player.addMark('bts_xingzhi', 1); // 源 L9942：p:gainMark("@xingzhi")
            // 源 L9943：setPlayerMark(p, "wanglai_chengren"..同意者.."-start") —— 同意标记，
            // 允许据此判定「令你获得过兴致标记的角色」（已修正：原实现漏打同意标记、允许无条件给）
            player.addMark(
                `bts_wanglai_chengren_${trigger.player.playerid}`,
                1,
            );
            if (player.countMark('bts_xingzhi') < 10) return; // 源 L9945：未达10枚
            // 源 L9946-9948：达到10枚 → 移除财宝并取得承认/允许/背负
            player.addMark('bts_st_caibao_done', 1);
            await player.removeSkill('bts_st_caibao');
            await player.addSkill('bts_wanglai_chengren');
            await player.addSkill('bts_wanglai_yunxu');
            await player.addSkill('bts_wanglai_beifu');
        },
        ai: { noe: true },
    },

    // ── 关联技·承认（源 wanglai_chengren = TriggerSkill Compulsory DrawNCards，L9979-9991）──
    // 锁定技，摸牌阶段额定摸牌数+兴致数，然后弃置全部兴致。
    bts_wanglai_chengren: {
        charlotte: true,
        trigger: { player: 'phaseDrawBegin2' },
        forced: true,
        filter(event, player) {
            return player.countMark('bts_xingzhi') > 0; // 源 L9984：有兴致才触发
        },
        content(event, trigger, player) {
            // 源 L9986-9988：额定摸牌数 += 兴致，然后清空兴致（改触发事件 phaseDrawBegin2 的 num）
            trigger.num += player.countMark('bts_xingzhi');
            player.removeMark('bts_xingzhi', player.countMark('bts_xingzhi'));
        },
        ai: { noe: true },
    },

    // ── 关联技·允许（源 wanglai_yunxu = TriggerSkill Compulsory EventPhaseStart，L9961-9978）──
    // 锁定技，其他角色回合结束时，你获得1枚兴致。
    bts_wanglai_yunxu: {
        charlotte: true,
        trigger: { global: 'phaseAfter' },
        forced: true,
        filter(event, player) {
            // 源 L9967-9972：仅「令你获得过兴致标记的角色」（曾同意财宝者）回合结束时才给。
            // 无名杀以同意标记 bts_wanglai_chengren_<id> 门控（已修正：原实现无条件给）
            return (
                event.player !== player &&
                player.countMark(`bts_wanglai_chengren_${event.player.playerid}`) >
                    0
            );
        },
        content(event, trigger, player) {
            player.addMark('bts_xingzhi', 1); // 源 L9970：p:gainMark("@xingzhi")
        },
        ai: { noe: true },
    },

    // ── 关联技·背负（源 wanglai_beifu = FilterSkill，L9992-10004）──
    // 你的手牌【杀】视为【过河拆桥】（源为 dismantlement）。
    bts_wanglai_beifu: {
        charlotte: true,
        enable: 'phaseUse',
        filterCard(card) {
            // 源 view_filter（L9995）：手牌且为【杀】
            return get.name(card) === 'sha';
        },
        position: 'h',
        selectCard: 1,
        viewAs: { name: 'guohe', isCard: true }, // 源 L9998：克隆 dismantlement
        ai: { order: 6, result: { target: -1 } },
    },

    // ── 触发技·悦王（源 st_yuewang = TriggerSkill Compulsory CardFinished，L10012-10031）──
    // 锁定技，其他角色发动必杀技（st_ 技能）后，你附加1层增幅祝福。
    bts_st_yuewang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        trigger: { global: 'useSkillAfter' },
        forced: true,
        filter(event, player) {
            // 源 L10018-10020：使用 SkillCard 且技能名含 "max_"（必杀技），且使用者 ≠ 你。
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）。
            return (
                event.player !== player &&
                lib.skill[event.skill]?.bts_bisha === true
            );
        },
        async content(event, trigger, player) {
            // 源 L10023：AddBless(p, "@bless_zengfu")
            await lib.bts.api.addBless(player, 'zengfu', 1, player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_gilgamesh: '吉尔伽美什',
    bts_st_guaili: '乖离',
    bts_st_guaili_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对这些角色各造成1点${get.poptip('bts_glossary_nature_guang_dmg_faq')}通常伤害。`,
    bts_st_caibao: '财宝',
    bts_st_caibao_info: `锁定技，你跳过摸牌阶段；其他角色回合结束时，其可以令你获得1枚${get.poptip('bts_glossary_xingzhi_faq')}，${get.poptip('bts_glossary_xingzhi_faq')}达到10后你获得承认、允许、背负。`,
    bts_st_yuewang: '悦王',
    bts_st_yuewang_info: `锁定技，其他角色发动${get.poptip('bts_glossary_bisha_faq')}后，你附加1层${get.poptip('bts_glossary_bless_zengfu_faq')}。`,
    bts_wanglai_chengren: '承认',
    bts_wanglai_chengren_info: '锁定技，摸牌阶段，你弃全部兴致标记并多摸等量的牌。',
    bts_wanglai_yunxu: '允许',
    bts_wanglai_yunxu_info: `锁定技，令你获得过${get.poptip('bts_glossary_xingzhi_faq')}标记的角色的回合结束时，你获得1枚${get.poptip('bts_glossary_xingzhi_faq')}标记。`,
    bts_wanglai_beifu: '背负',
    bts_wanglai_beifu_info: '锁定技，你的【杀】视为【过河拆桥】。',
    bts_xingzhi: '兴致',

    '$bts_st_guaili1': "醒来吧，Ea!",
    '$bts_st_guaili2': "知晓原初之理吧——Enuma Elish！",
    '$bts_st_caibao1': "无聊",
    '$bts_st_caibao2': "喝彩吧，你们的王回来了！",
    '$bts_st_yuewang1': "景色真好啊！",
    '$bts_st_yuewang2': "呵，堪比沙漠中的绿洲啊",
    '$bts_wanglai_beifu1': "轮到你了，天之锁哟！",
    '$bts_wanglai_chengren1': "尽情膜拜吧——呼哈哈哈哈哈哈！",
    '$bts_wanglai_yunxu1': "就陪你玩玩吧",
    '$bts_wanglai_beifu2': "给你上镣铐！",
    '$bts_wanglai_chengren2': "哈哈哈哈哈哈哈哈哈！",
    '$bts_wanglai_yunxu2': "不错，来兴致了",
    '~bts_gilgamesh': "本王就先抽身了…",
};

export const simpleTranslate = {
    bts_st_guaili_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}群体光通常伤害`,
    bts_st_caibao_info: `锁；跳摸，其他回合后可+${get.poptip('bts_glossary_xingzhi_faq')}，10后获得王之三技`,
    bts_st_yuewang_info: `锁；他人${get.poptip('bts_glossary_bisha_faq')}后+${get.poptip('bts_glossary_bless_zengfu_faq')}`,
};

export const pinyins = { bts_gilgamesh: 'gilgamesh' };
