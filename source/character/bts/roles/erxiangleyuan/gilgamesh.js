// 吉尔伽美什（源 animal.lua L9909-10032）—— 兴致阈值与王之三技。
// 技能：乖离（必杀技·群体虚数通常伤害）、财宝（跳摸+兴致积累）、悦王（他人必杀后增幅）、
//       承认（兴致当摸牌）、允许（他人回合结束获兴致）、背负（手牌【杀】当【过河拆桥】）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '雷·毁灭·古老的英雄王'; // 属性·命途
export const intro =
    `${B('吉尔伽美什')}拿${get.poptip('bts_glossary_xingzhi_faq')}换跳摸牌，攒满10点后取得王之权能。`;

export const character = {
    bts_ch_gilgamesh: {
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_guaili', 'bts_sk_caibao', 'bts_sk_yuewang'],
    },
};

export const skill = {
    // ── 必杀技·乖离（源 max_guaili = SkillCard + ZeroCardViewAsSkill，L9922-9945）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点虚数通常伤害。
    bts_sk_guaili: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        // 源描述（L13840）未写「每回合限一次」，仅怒气门槛（GetAngry>=5）——不加 usable:1（按原描述）
        filter(event, player) {
            // 源 enabled_at_play（L9941）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9913）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_guaili');
            lib.bts.api.loseAngry(player, 5); // 源 L9916：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L9918：reason 含 "_light_common"（虚数属性 + 通常伤害，_common 使 reason 不触发特殊伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_guaili_bts_reason_common_light';
                lib.bts.api.setDamageNature(damage, 'light');
                await damage;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_guaili')
                    ? -1
                    : 9;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·财宝（源 st_caibao = TriggerSkill EventPhaseStart/EventPhaseChanging，L9933-9960）──
    // 锁定技，你跳过摸牌阶段；其他角色回合结束时，其可以令你获得1枚兴致，
    // 兴致达到10后你获得承认、允许、背负（并移除财宝）。
    bts_sk_caibao: {
        // 源 L9952-9955：EventPhaseChanging to Draw 时 skip(Player_Draw) 整段跳摸牌；
        // 无名杀以自己准备阶段 player.skip('phaseDraw') 预标（skipList 于摸牌阶段起始检查，等效整段跳）。
        trigger: { global: 'phaseAfter', player: 'phaseZhunbeiBegin' },
        forced: true,
        filter(event, player, triggername) {
            // 源 L9938：他人回合结束才触发（triggername 判变体，event.name 是基名）
            return triggername === 'phaseAfter'
                ? event.player !== player && !player.countMark('bts_mk_caibao_done')
                : true;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'phaseZhunbeiBegin') {
                player.skip('phaseDraw'); // 源 L9955：skip(Player_Draw)
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
            player.addMark('bts_mk_xingzhi', 1); // 源 L9942：p:gainMark("@xingzhi")
            // 源 L9943：setPlayerMark(p, "wanglai_chengren"..同意者.."-start") —— 同意标记，
            // 允许据此判定「令你获得过兴致标记的角色」（已修正：原实现漏打同意标记、允许无条件给）
            // 动态键（含同意者 playerid）为内部簿记：固定键镜像已承担显示（下一行），
            // log=false 关闭日志与 get.info 校验（否则未注册键触发「孩子，你的技能…」告警；
            // 2026-09-26 实机警告同类修复——此调用跨行，此前单行版扫描器漏检）。
            player.addMark(
                `bts_mk_wanglai_chengren_${trigger.player.playerid}`,
                1,
                false,
            );
            player.addMark('bts_mk_wanglai_chengren', 1); // 固定键镜像：累计承认数（动态 per-同意者 键不可静态注册）
            if (player.countMark('bts_mk_xingzhi') < 10) return; // 源 L9945：未达10枚
            // 源 L9946-9948：达到10枚 → 移除财宝并取得承认/允许/背负
            player.addMark('bts_mk_caibao_done', 1);
            await player.removeSkill('bts_sk_caibao');
            await player.addSkill('bts_sk_wanglai_chengren');
            await player.addSkill('bts_sk_wanglai_yunxu');
            await player.addSkill('bts_sk_wanglai_beifu');
        },
        ai: { noe: true },
    },

    // ── 关联技·承认（源 wanglai_chengren = TriggerSkill Compulsory DrawNCards，L9979-9991）──
    // 锁定技，摸牌阶段额定摸牌数+兴致数，然后弃置全部兴致。
    bts_sk_wanglai_chengren: {
        charlotte: true,
        trigger: { player: 'phaseDrawBegin2' },
        forced: true,
        filter(event, player) {
            return player.countMark('bts_mk_xingzhi') > 0; // 源 L9984：有兴致才触发
        },
        async content(event, trigger, player) {
            // 源 L9986-9988：额定摸牌数 += 兴致，然后清空兴致（改触发事件 phaseDrawBegin2 的 num）
            trigger.num += player.countMark('bts_mk_xingzhi');
            player.removeMark('bts_mk_xingzhi', player.countMark('bts_mk_xingzhi'));
        },
        ai: { noe: true },
    },

    // ── 关联技·允许（源 wanglai_yunxu = TriggerSkill Compulsory EventPhaseStart，L9961-9978）──
    // 锁定技，其他角色回合结束时，你获得1枚兴致。
    bts_sk_wanglai_yunxu: {
        charlotte: true,
        trigger: { global: 'phaseAfter' },
        forced: true,
        filter(event, player) {
            // 源 L9967-9972：仅「令你获得过兴致标记的角色」（曾同意财宝者）回合结束时才给。
            // 无名杀以同意标记 bts_mk_wanglai_chengren_<id> 门控（已修正：原实现无条件给）
            return (
                event.player !== player &&
                player.countMark(`bts_mk_wanglai_chengren_${event.player.playerid}`) >
                    0
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_mk_xingzhi', 1); // 源 L9970：p:gainMark("@xingzhi")
        },
        ai: { noe: true },
    },

    // ── 关联技·背负（源 wanglai_beifu = FilterSkill，L10005-10017）──
    // 锁定技，你的手牌【杀】视为【过河拆桥】：【杀】不能直接使用/响应，只能经本技能当【过河拆桥】用。
    // 源为 FilterSkill 强制全局替换；无名杀以 mod 屏蔽原牌 + viewAs 转化近似（参照 new_jiangchi3 范式）。
    bts_sk_wanglai_beifu: {
        charlotte: true,
        enable: 'chooseToUse',
        filterCard(card) {
            // 源 view_filter（L10008）：手牌且为【杀】
            return get.name(card) === 'sha';
        },
        position: 'h',
        selectCard: 1,
        viewAs: { name: 'guohe', isCard: true }, // 源 L10010-10015：克隆 dismantlement
        mod: {
            // 源 FilterSkill：手牌【杀】不可作为【杀】使用/响应（仅真实手牌，不影响其他技能的虚拟杀）
            cardEnabled(card) {
                if (get.position(card) === 'h' && get.name(card) === 'sha')
                    return false;
            },
            cardRespondable(card) {
                if (get.position(card) === 'h' && get.name(card) === 'sha')
                    return false;
            },
        },
        ai: { order: 6, result: { target: -1 } },
    },

    // ── 触发技·悦王（源 st_yuewang = TriggerSkill Compulsory CardFinished，L10012-10031）──
    // 锁定技，其他角色发动必杀技后，你附加1层增幅祝福。
    bts_sk_yuewang: {
        // 源 st_yuewang 是 Compulsory 锁定技（L10027），非必杀技——不标 bts_bisha
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

export const marks = {
    bts_mk_caibao_done: { markKind: 'record' },
    bts_mk_xingzhi: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_xingzhi_faq',
    },
    bts_mk_wanglai_chengren: {
        // 固定键镜像：累计承认数（动态 bts_mk_wanglai_chengren_<pid> 无法静态注册，图标已就位）
        markKind: 'mark',
    },
};

export const translate = {
    bts_mk_caibao_done: '财宝达成',
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_gilgamesh_skin1': '皮肤1',
    'bts_ch_gilgamesh_skin2': '皮肤2',
    'bts_ch_gilgamesh_skin3': '皮肤3',
    bts_ch_gilgamesh: '吉尔伽美什',
    bts_sk_guaili: '乖离',
    bts_sk_guaili_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对这些角色各造成1点${get.poptip('bts_glossary_nature_light_dmg_faq')}通常伤害。`,
    bts_sk_caibao: '财宝',
    bts_sk_caibao_info: `锁定技，你跳过摸牌阶段；其他角色回合结束时，其可以令你获得1枚${get.poptip('bts_glossary_xingzhi_faq')}，${get.poptip('bts_glossary_xingzhi_faq')}达到10后你获得承认、允许、背负。`,
    bts_sk_yuewang: '悦王',
    bts_sk_yuewang_info: `锁定技，其他角色发动${get.poptip('bts_glossary_bisha_faq')}后，你附加1层${get.poptip('bts_glossary_bless_zengfu_faq')}。`,
    bts_sk_wanglai_chengren: '承认',
    bts_sk_wanglai_chengren_info: '锁定技，摸牌阶段，你弃全部兴致标记并多摸等量的牌。',
    bts_sk_wanglai_yunxu: '允许',
    bts_sk_wanglai_yunxu_info: `锁定技，令你获得过${get.poptip('bts_glossary_xingzhi_faq')}标记的角色的回合结束时，你获得1枚${get.poptip('bts_glossary_xingzhi_faq')}标记。`,
    bts_sk_wanglai_beifu: '背负',
    bts_sk_wanglai_beifu_info: '锁定技，你的【杀】视为【过河拆桥】。',
    bts_mk_xingzhi: '兴致',
    bts_mk_wanglai_chengren: '承认',
    bts_mk_wanglai_chengren_info: '来源：财宝赋予；累计被同意的次数',

    '$bts_sk_guaili1': "醒来吧，Ea!",
    '$bts_sk_guaili2': "知晓原初之理吧——Enuma Elish！",
    '$bts_sk_caibao1': "无聊",
    '$bts_sk_caibao2': "喝彩吧，你们的王回来了！",
    '$bts_sk_yuewang1': "景色真好啊！",
    '$bts_sk_yuewang2': "呵，堪比沙漠中的绿洲啊",
    '$bts_sk_wanglai_beifu1': "轮到你了，天之锁哟！",
    '$bts_sk_wanglai_chengren1': "尽情膜拜吧——呼哈哈哈哈哈哈！",
    '$bts_sk_wanglai_yunxu1': "就陪你玩玩吧",
    '$bts_sk_wanglai_beifu2': "给你上镣铐！",
    '$bts_sk_wanglai_chengren2': "哈哈哈哈哈哈哈哈哈！",
    '$bts_sk_wanglai_yunxu2': "不错，来兴致了",
    '~bts_ch_gilgamesh': "本王就先抽身了…",
    bts_mk_xingzhi_info: '来源：财宝、允许赋予；承认：改摸牌、解锁王技',
};

export const simpleTranslate = {
    bts_sk_guaili_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}群体虚数通常伤害`,
    bts_sk_caibao_info: `锁；跳摸，其他回合后可+${get.poptip('bts_glossary_xingzhi_faq')}，10后获得王之三技`,
    bts_sk_yuewang_info: `锁；他人${get.poptip('bts_glossary_bisha_faq')}后+${get.poptip('bts_glossary_bless_zengfu_faq')}`,
};

export const pinyins = { bts_ch_gilgamesh: 'gilgamesh' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_xingzhi_faq',
        name: '|兴致|',
        info: `吉尔伽美什专属：${get.poptip('bts_sk_caibao')}、${get.poptip('bts_sk_wanglai_yunxu')}获得；满10由${get.poptip('bts_sk_wanglai_chengren')}按兴致摸牌并清空。`,
    },
];
