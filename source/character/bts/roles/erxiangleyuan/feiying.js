// 绯英（源 animal.lua L12576-12659，V2.5 新增可玩武将）—— 无赦、韶华与缭判。
// 技能：无赦（必杀技·怒气赌失体力+星启积标记）、韶华（锁定：怒气↔欢愉祝福互通、失血≥2改为欢愉行动）、
// 缭判（执行欢愉行动后可弃【杀】换笑点/摸牌/欢愉祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '虚数·欢愉·韶艾裁英'; // 属性·命途·称号
export const intro =
    `${B('绯英')}拿${get.poptip('bts_glossary_nuqi_faq')}赌${get.poptip('bts_sk_wushe')}，${get.poptip('bts_sk_shaohua')}把${get.poptip('bts_glossary_nuqi_faq')}与${get.poptip('bts_glossary_bless_funny_faq')}来回倒，${get.poptip('bts_sk_liaopan_funny')}在每次${get.poptip('bts_glossary_funny_act_faq')}后兑现。` +
    `<li>${B('绯英')}是欢愉角色：其造成的伤害会被欢愉规则取消，唯有处于${get.poptip('bts_glossary_huanju_shengge_faq')}时例外（阿哈·【欢愉万相】赋予，至其回合结束）。`;

export const character = {
    bts_ch_feiying: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_wushe', 'bts_sk_shaohua', 'bts_sk_liaopan_funny'],
    },
};

export const skill = {
    // ── 必杀技·无赦（源 max_wushe = SkillCard + ZeroCardViewAsSkill，V2.5 L12577-12617）──
    // 出牌阶段，失去1点怒气，选一名其他角色：14.6%（+欢愉祝福每层10%）其失去1点体力，否则你失去1点体力；
    // 若你为星启，获得1枚无赦标记——1枚时回复2点怒气，达到4枚时弃置全部标记。
    bts_sk_wushe: {
        bts_bisha: true, // 终结技（怒气发动 → 不设 bts_bisha_angry: false，拥有者可获怒气）
        enable: 'phaseUse',
        usable: 1, // 源 frequency = Skill_Limited 与本技能「4枚标记循环」自相矛盾，按描述取每回合一次
        filter(event, player) {
            // 源 enabled_at_play（L12606-12608）：GetAngry(player, 1) + 有其他角色可选
            return (
                lib.bts.api.getAngry(player, 1) &&
                game.hasPlayer((target) => target !== player)
            );
        },
        filterTarget(card, player, target) {
            return target !== player; // 源 filter（L12580-12582）：一名其他角色
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wushe');
            const target = event.targets[0];
            // 源 L12584：LoseAngry(player, 1)（译文写「2点」，按代码取1；filter 亦只要求1点）
            lib.bts.api.loseAngry(player, 1);
            // 源 L12585-12589：14.6% 令目标失去1点体力，失败则自己失去1点体力
            if (lib.bts.api.funnyNumber(player, 14.6)) await target.loseHp();
            else await player.loseHp();
            // 源 L12590-12597：星启→无赦标记，1枚回2怒，≥4枚全部弃置
            if (lib.bts.api.god(player)) {
                player.addMark('bts_mk_wushe', 1);
                const n = player.countMark('bts_mk_wushe');
                if (n === 1) lib.bts.api.addAngry(player, 2);
                else if (n >= 4) player.removeMark('bts_mk_wushe', n);
            }
        },
        ai: {
            // AI 口径：怒气≥1 即可赌——成率 = 14.6% + 欢愉祝福每层 10%，过 50% 才积极
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_wushe')) return -1;
                if (!lib.bts.api.getAngry(player, 1)) return -1; // filter 同门
                const chance =
                    14.6 + lib.bts.api.getBless(player, 'funny', -1) * 10;
                return chance >= 50 ? 7 : 4;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·韶华（源 st_shaohua = TriggerSkill Compulsory MarkChanged/PreHpLost，V2.5 L12618-12651）──
    // ① 你失去怒气后，附加等量欢愉祝福；② 你失去欢愉祝福后，回复等量怒气；
    // ③ 你将要失去的体力值大于1时，防止之并改为执行一次欢愉行动。
    // 另有规则层改写（源 GetBless L848）：你的欢愉祝福层数 = 欢愉祝福 + 致命祝福，且至少5层。
    bts_sk_shaohua: {
        trigger: { player: ['bts_mark_remove', 'loseHpBegin'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'loseHpBegin') {
                // 源 L12640：`data:toInt() > 1` → 防止本次失去体力
                return player.isAlive() && event.num > 1;
            }
            // 源 L12626-12638：仅怒气 / 欢愉祝福的**失去**（mark.gain < 0）
            return (
                event.player === player &&
                event.num > 0 &&
                (event.markName === 'bts_mk_angry' ||
                    event.markName === 'bts_bless_funny')
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'loseHpBegin') {
                trigger.num = 0; // 源 on_trigger 返回 true（取消本次失去体力）
                await lib.bts.api.funnyAct(player, null, null, event.name);
                return;
            }
            // 防互转死循环（源 shaohua_angry / shaohua_funny 双旗标的等价写法：单守卫即可）
            if (player.storage.bts_shaohua_guard) return;
            player.setStorage('bts_shaohua_guard', true);
            try {
                if (trigger.markName === 'bts_mk_angry')
                    await lib.bts.api.addBless(
                        player,
                        'funny',
                        trigger.num,
                        player,
                    );
                else lib.bts.api.addAngry(player, trigger.num);
            } finally {
                player.setStorage('bts_shaohua_guard', false);
            }
        },
    },

    // ── 触发技·缭判（源 st_liaopan_funny = TriggerSkill（空触发器，效果写在 AfterFunnyAct L1354-1360））──
    // 当你执行欢愉行动后，你可以弃置一张【杀】，获得10枚笑点、摸三张牌并附加1层欢愉祝福。
    bts_sk_liaopan_funny: {
        // 欢愉技标签：绯英以此成为「欢愉角色」（funnyPlayer），从而能执行欢愉行动/触发本技能
        bts_funny_skill: true,
        trigger: { player: 'bts_funny_act_after' },
        filter(event, player) {
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '缭判：是否弃置一张【杀】，获得10枚笑点并摸三张牌？',
                )
                .set('ai', (card) => 6 - get.value(card))
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards);
            player.addMark('bts_mk_funnypoint', 10); // 源 L1357：gainMark("@funnypoint", 10)
            await player.draw(3); // 源 L1358：drawCards(3)
            // 源译文「附加1层欢愉祝福」（源代码漏写，按描述先行补齐）
            await lib.bts.api.addBless(player, 'funny', 1, player);
        },
        ai: { result: { player: 2 } },
    },
};

export const marks = {
    // 无赦标记（源 @max_wushe）：星启下累积，1枚回怒、4枚清空。
    bts_mk_wushe: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_wushe_faq',
    },
};

export const translate = {
    bts_ch_feiying: '绯英',
    bts_sk_wushe: '无赦',
    bts_sk_wushe_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去1点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，其以 14.6%（+${get.poptip('bts_glossary_bless_funny_faq')}每层+10%）失去1点体力，若未成功则你失去1点体力；若你为${get.poptip('bts_glossary_xingqi_faq')}，你获得1枚${get.poptip('bts_mk_wushe')}，${get.poptip('bts_mk_wushe')}为1枚时你回复2点${get.poptip('bts_glossary_nuqi_faq')}，不小于4枚时弃置全部${get.poptip('bts_mk_wushe')}。`,
    bts_sk_shaohua: '韶华',
    bts_sk_shaohua_info: `锁定技，你失去${get.poptip('bts_glossary_nuqi_faq')}后，你附加等量的${get.poptip('bts_glossary_bless_funny_faq')}；你失去${get.poptip('bts_glossary_bless_funny_faq')}后，你回复等量的${get.poptip('bts_glossary_nuqi_faq')}；你的${get.poptip('bts_glossary_bless_funny_faq')}层数视为「${get.poptip('bts_glossary_bless_funny_faq')}+${get.poptip('bts_glossary_bless_fatal_faq')}」，且至少为5层；当你将要失去的体力值大于1时，你防止之，改为执行一次${get.poptip('bts_glossary_funny_act_faq')}。`,
    bts_sk_liaopan_funny: '缭判',
    bts_sk_liaopan_funny_info: `${get.poptip('bts_glossary_funny_skill_faq')}，当你执行${get.poptip('bts_glossary_funny_act_faq')}后，你可以弃置一张【杀】，获得10枚${get.poptip('bts_glossary_funnypoint_faq')}、摸三张牌并附加1层${get.poptip('bts_glossary_bless_funny_faq')}。`,
    bts_mk_wushe: '无赦',

    // ── 语音台词（源 L31781-31795）──
    // 音频：源按技能 id 分文件（audio/skill/<技能id><序号>.ogg），已逐个 ogg→mp3 转到本项目命名
    //（bts_sk_wushe1/2、bts_sk_shaohua1/2、bts_sk_liaopan_funny1/2）；阵亡音为 audio/skill/<武将id>.ogg
    //（st_feiying.ogg → audio/die/bts_ch_feiying.mp3）。
    '$bts_sk_wushe1': '一起上吧，狐狸老师——',
    '$bts_sk_wushe2': '游戏的规则，我来裁定——你，out了！',
    '$bts_sk_shaohua1': '再见啦，各位！',
    '$bts_sk_shaohua2': '代表幻月消灭你！',
    '$bts_sk_liaopan_funny1': '踩到红线咯~',
    '$bts_sk_liaopan_funny2': '已成定局啦~',
    '~bts_ch_feiying': '没到时间呢……',
};

export const simpleTranslate = {
    bts_sk_wushe_info: `${get.poptip('bts_glossary_bisha_faq')}；失1${get.poptip('bts_glossary_nuqi_faq')}，目标 14.6% 失1体力、否则你失1体力；${get.poptip('bts_glossary_xingqi_faq')}积${get.poptip('bts_mk_wushe')}（1枚回2怒、4枚清空）`,
    bts_sk_shaohua_info: `锁；失${get.poptip('bts_glossary_nuqi_faq')}换等量${get.poptip('bts_glossary_bless_funny_faq')}、反之换回；${get.poptip('bts_glossary_bless_funny_faq')}层数计${get.poptip('bts_glossary_bless_fatal_faq')}且≥5；失血>1改为执行${get.poptip('bts_glossary_funny_act_faq')}`,
    bts_sk_liaopan_funny_info: `执行${get.poptip('bts_glossary_funny_act_faq')}后可弃【杀】：+10${get.poptip('bts_glossary_funnypoint_faq')}、摸3、+1层${get.poptip('bts_glossary_bless_funny_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_wushe_faq',
        name: '|无赦|',
        info: `绯英专属：${get.poptip('bts_sk_wushe')}在${get.poptip('bts_glossary_xingqi_faq')}下获得；1枚回复2点${get.poptip('bts_glossary_nuqi_faq')}，4枚时全部弃置。`,
    },
];
