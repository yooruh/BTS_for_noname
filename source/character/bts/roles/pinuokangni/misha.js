// 米沙（源 animal.lua L4533-4632）—— 传冲随机冻结/伤害与充能。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'pinuokangni';
export const title = '冰·毁灭·逐梦的门童'; // 属性·命途
export const intro = `${B('米沙')}捡别人弃的【杀】、自己也弃【杀】攒${get.poptip('bts_glossary_st_mengchong_faq')}；${get.poptip('bts_glossary_st_mengchong_faq')}多了，对范围内的人多砸几发${get.poptip('bts_glossary_abnormal_freeze_faq')}或伤害。`;
export const character = {
    bts_ch_misha: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 3,
        skills: ['bts_sk_mengchong', 'bts_sk_jizong', 'bts_sk_fuwu'],
    },
};
export const skill = {

    // ── 锁定技·机纵（源 st_jizong = TriggerSkill Compulsory CardsMoveOneTime，L4378-4394）──
    // 当角色弃置【杀】后，你获得1枚传冲标记。
    bts_sk_jizong: {
        trigger: { global: 'loseAfter' },
        forced: true,
        filter(event, player) {
            // 源 L4385：角色从手牌弃置【杀】
            return (
                event.type === 'discard' &&
                event.cards?.some((card) => get.name(card) === 'sha') &&
                event.player?.isAlive()
            );
        },
        async content(event, trigger, player) {
            // 源 L4388：room:addPlayerMark(p, "@st_mengchong")
            player.addMark('bts_sk_mengchong', 1);
        },
    },

    // ── 锁定技·服务（源 st_fuwu = TriggerSkill Compulsory CardsMoveOneTime，L4619-4632）──
    // 当你获得牌后，可弃置一张【杀】，获得1枚传冲标记。
    bts_sk_fuwu: {
        trigger: { player: 'gainAfter' },
        filter(event, player) {
            // 源 L4625：非首轮且获得牌到手牌、手牌有【杀】可弃（首轮 roundNumber==1，以 >=2 判非首轮）。
            return (
                game.roundNumber >= 2 &&
                event.cards?.length &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L4402：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算。
            // cost 型触发技无顶层 check 读取点：发动与否=本 ai（最高分≤0→取消，引擎 ai/basic.js chooseCard）。
            // AI 口径：弃1【杀】实得2枚传冲（服务+1，弃牌另触发机纵+1）；仅在【杀】富余（≥2）时换，
            // 唯一一张保留作攻击/响应（传冲≈必杀技多1次冲击，源 L4402-4404）。
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '服务：选择弃置一张【杀】获得1枚传冲？',
                )
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object')
                        return -1; // 技能按钮候选（非牌）不选
                    if (get.name(card) !== 'sha') return -1;
                    if (
                        player.countCards('h', (c) => get.name(c) === 'sha') < 2
                    )
                        return -1; // 只处理多余【杀】
                    return 2.5; // 富余杀换2枚传冲：正分即发动
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L4402：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L4404：room:addPlayerMark(player, "@st_mengchong")
            player.addMark('bts_sk_mengchong', 1);
        },
    },
};
export const marks = {
    'bts_mk_misha_frozen-turn': { markKind: 'record' },
    // 传冲：必杀技 + 展示标记（源 st_mengchong = SkillCard + ZeroCardViewAsSkill，L4317-4376）：
    // 失3怒气选至多三名攻击范围内其他角色，随机进行 3+传冲数 次冲击（星启额外+4）——
    // 每次随机目标 30% 附加冻结、否则受1点伤害。
    bts_sk_mengchong: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_st_mengchong_faq',
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L4374）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            // 源 Card filter（L4325）：目标数≤3、目标 ≠ 自己、在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: [1, 3],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_mengchong');
            lib.bts.api.loseAngry(player, 3); // 源 L4536：LoseAngry(player, 3)
            // 源 L4545-4547：n = 3 + 传冲数（星启+4），然后清空传冲标记
            const times =
                3 +
                player.countMark('bts_sk_mengchong') +
                (lib.bts.api.god(player) ? 4 : 0);
            player.removeMark(
                'bts_sk_mengchong',
                player.countMark('bts_sk_mengchong'),
            );
            // 源 L4548-4560：随机 n 次冲击（目标附加冻结或受1伤）
            for (let index = 0; index < times; index++) {
                const targets = event.targets.filter((target) =>
                    target.isAlive(),
                );
                if (!targets.length) break;
                // 源 L4548-4549：外层每轮仅 30% 概率动作（曾无条件执行、强度约为源 3.3 倍，已修）。
                if (Math.random() >= 0.3) continue;
                // 源 L4554-4556：随机选目标（略偏体力最高者；简化为最高者随机）。
                const highest = Math.max(...targets.map((target) => target.hp));
                const target =
                    targets.filter((item) => item.hp === highest).randomGet() ||
                    targets.randomGet();
                // 源 L4570-4576：30% 附加冻结（防连冻标记），否则受1伤；伤害 reason 须为必杀技名
                //（源 setSkillName "max_mengchong"），否则星启必杀+1/增幅+1 判定不到（alan.js 同款）。
                if (
                    Math.random() < 0.3 ||
                    !target.countMark('bts_mk_misha_frozen-turn')
                ) {
                    lib.bts.api.addAbnormal(target, 'freeze', 1, player);
                    target.addMark('bts_mk_misha_frozen-turn', 1, false);
                } else
                    await target
                        .damage(player, 1, 'nocard')
                        .set('reason', 'bts_sk_mengchong');
            }
            // 源 L4578-4580：本次使用结束后清除防连冻 flag（曾永驻——首次冻结后退化为纯
            // 30/70 掷骰，长期冻结率远低于源，已修）。
            for (const target of event.targets)
                target.removeMark(
                    'bts_mk_misha_frozen-turn',
                    target.countMark('bts_mk_misha_frozen-turn'),
                );
        },
        ai: {
            // AI 口径：代价=失3怒气并清空全部传冲；收益=对范围内至多3名角色做 3+传冲（星启+4）次冲击
            //（每次30%概率动作：目标首中必冻结，续中30%冻结/70%受1伤；星启必杀伤害+1）。
            // 有击杀窗口/传冲层数高/星启时更积极；无范围内敌方不发动（源 L4533-4580）。
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_mengchong'))
                    return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1;
                let hasEnemy = false;
                let killWindow = false;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    if (!player.inRange(target)) continue;
                    hasEnemy = true;
                    if (target.hp <= 1) killWindow = true;
                }
                if (!hasEnemy) return -1;
                const marks = player.countMark('bts_sk_mengchong');
                let value = 4; // 基础3次冲击的期望
                if (marks >= 2) value += 1;
                if (marks >= 5) value += 1; // 高传冲：一轮收割
                if (lib.bts.api.god(player)) value += 1; // 星启：+4次冲击且必杀伤害+1
                if (killWindow) value += 2;
                return Math.min(9, value);
            },
            result: {
                // 冲击在选中集内随机分配；目标掉血/被冻结均受损，1体力=击杀窗口（星启+1伤害）
                target: (player, target) => {
                    if (target === player) return -1;
                    if (get.attitude(player, target) >= 0) return -1.5;
                    let value = 1;
                    if (target.hp <= 1) value += 1.5;
                    if (lib.bts.api.god(player)) value += 0.3;
                    return -value;
                },
            },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_misha_skin1': '皮肤1',
    'bts_mk_misha_frozen-turn': '冻结回合',
    bts_ch_misha: '米沙',
    bts_sk_mengchong: '传冲',
    bts_sk_mengchong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至多三名攻击范围内的其他角色，随机进行3次（每枚${get.poptip('bts_glossary_st_mengchong_faq')}标记额外1次冲击，若你为${get.poptip('bts_glossary_xingqi_faq')}则改为7次）冲击：目标附加${get.poptip('bts_glossary_abnormal_freeze_faq')}，或受到1点伤害。`,
    bts_sk_jizong: '机纵',
    bts_sk_jizong_info: `锁定技，当角色弃置【杀】后，你获得1枚${get.poptip('bts_glossary_st_mengchong_faq')}标记。`,
    bts_sk_fuwu: '服务',
    bts_sk_fuwu_info: `锁定技，当你获得牌后，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_st_mengchong_faq')}标记。`,

    '$bts_sk_mengchong1': "不知道时间还剩多少…",
    '$bts_sk_mengchong2': "又、又要来不及了呜啊啊啊——！对不起…",
    '$bts_sk_jizong1': "请等一等…！",
    '$bts_sk_jizong2': "请…请让一下！",
    '$bts_sk_fuwu1': "我这就收拾干净！",
    '$bts_sk_fuwu2': "要随时保持整洁！",
    '~bts_ch_misha': "招待…不周……",
};
export const simpleTranslate = {
    bts_sk_jizong_info: `锁；有人弃【杀】就+1${get.poptip('bts_glossary_st_mengchong_faq')}`,
    bts_sk_fuwu_info: `锁；拿到牌后可弃杀换+1${get.poptip('bts_glossary_st_mengchong_faq')}`,
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_st_mengchong_faq',
        name: '|传冲|',
        info: `米沙专属：${get.poptip('bts_sk_jizong')}弃杀、${get.poptip('bts_sk_fuwu')}获牌各+1枚；${get.poptip('bts_sk_mengchong')}发动时增冲击次数。`,
    },
];
