// 忘归人（源 animal.lua L7266-7348）—— 照世、摇风与流布。
// 技能：照世（必杀技·失怒弃牌附炎）、摇风（他人准备阶段无狐祈时弃杀+狐祈）、流布（他人弃置空城后记牌，受伤时夺牌失体）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '火·虚无·狐人少女'; // 属性·命途
export const intro =
    `${B('忘归人')}用照世给对手挂火、拆手牌、削怒气；${get.poptip('bts_glossary_bless_huqi_faq')}护着队友，别人一旦空手卖牌，流布还能把那张牌记下来。`;

export const character = {
    bts_ch_tingyun_wangguiren: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_zhaoshi', 'bts_sk_yaofeng', 'bts_sk_liubu'],
    },
};

export const skill = {
    // ── 必杀技·照世（源 st_zhaoshi = SkillCard + ZeroCardViewAsSkill，L7267-7299）──
    // 出牌阶段，失5怒气并选择至少一名其他角色：各失去1点怒气、弃置一张手牌并附加火属性；
    // 若你为星启，未被选择的其他角色各获得一个额外出牌阶段。
    bts_sk_zhaoshi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7297）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7270）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zhaoshi');
            lib.bts.api.loseAngry(player, 5); // 源 L7273：LoseAngry(player, 5)
            const selected = event.targets;
            // 源 L7275-7282：目标各失去1点怒气、弃1手牌、附加火属性
            for (const target of selected) {
                lib.bts.api.loseAngry(target, 1); // 源 L7276：LoseAngry(p, 1, player, false)
                if (target.countCards('h'))
                    await target.chooseToDiscard('照世：弃置一张手牌', 'h', 1, true); // 源 L7278
                await lib.bts.api.addNature(target, 'flame'); // 源 L7280：AddNature(p, "fire")
            }
            // 源 L7283-7287（God 分支 L7633-7637）：星启时未被选择的其他角色各获得额外出牌阶段。
            // 源为 addPlayerMark(p,"extra_play")，由 gamerule_ex 于回合末 NotActive 统一
            // ExtraPhase 消费；无名杀全库无该惰性标记消费方，直接调 extraPhase 开额外出牌
            // 阶段（同姬子·启行 L59 等库内范式，以功能真实生效为要）。
            if (lib.bts.api.god(player))
                for (const target of game.filterPlayer(
                    (target) => target !== player && !selected.includes(target),
                ))
                    lib.bts.api.extraPhase(target, 'phaseUse');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zhaoshi') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·摇风（源 st_yaofeng = TriggerSkill EventPhaseStart Start，L7301-7328）──
    // 其他角色准备阶段开始时，若没有角色拥有狐祈祝福，可弃置一张【杀】，令其附加3层狐祈祝福。
    bts_sk_yaofeng: {
        trigger: { global: 'phaseZhunbeiBegin' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L7305-7312：其他角色准备阶段开始且全场无狐祈祝福。
            // 定夺 2026-09-12（E-07）：均不允许自指——源代码放开（可自得狐祈）但源描述
            // 写「其他角色」，与禳命统一口径，按描述排除（event.player !== player）。
            return (
                event.player &&
                event.player !== player &&
                !game.hasPlayer((target) => lib.bts.api.getBless(target, 'huqi')) &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7316：askForCard(p, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）。
            // AI 决策（函数式 ai，等价源 StarRail-ai L3722-3727 ai_skill_cardask["@st_yaofeng"]）：
            // 受益者须为属性/元素系角色（NaturePlayer 判定）且为友方（ThrowSlash_AI typ=2 的
            // asFriend 检查）才弃【杀】相助；两者任一不满足 → 最佳牌估值 ≤0 → 引擎整体取消。
            const target = trigger.player;
            const helpful =
                lib.bts.api.naturePlayer(target) &&
                get.attitude(player, target) > 0;
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    `摇风：是否弃置一张【杀】令${get.translation(target)}获得3层狐祈？`,
                    (card) => (helpful ? 6 - get.value(card) : -1),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7319：AddBless(player=准备阶段角色, "@bless_huqi", 3, p)
            await lib.bts.api.addBless(trigger.player, 'huqi', 3, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·流布（源 st_liubu = TriggerSkill Compulsory CardsMoveOneTime，L7330-7347）──
    // 其他角色因弃置而失去所有手牌后，你可以令其摸一张牌并展示之；
    // 其于本回合内受到伤害时，若其手牌区内存在此牌，你获得之，其失去1点体力。
    bts_sk_liubu: {
        trigger: { global: 'loseAfter' },
        filter(event, player) {
            // 源 L7336：其他角色因弃置从手牌失去最后一张手牌。
            // 定夺 2026-09-12（E-04）：补「本次失去含手牌」校验（event.hs），
            // 避免已空手角色仅弃装备牌时误触发。
            return (
                event.type === 'discard' &&
                event.hs?.length > 0 &&
                event.player &&
                event.player !== player &&
                event.player.countCards('h') === 0
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player;
            // 源 L7336：askForSkillInvoke —— 是否发动
            const result = await player
                .chooseBool(
                    `流布：是否令${get.translation(target)}摸一张牌并记录该牌？`,
                )
                .forResult();
            if (!result.bool) return;
            // 源 L7689-7692：getNCards(1) + obtainCard + showCard —— 目标摸一张牌并展示之
            await target.draw(player);
            const card = target.getCards('h').at(-1);
            if (!card) return;
            target.showCards(card); // 源 L7692：room:showCard —— 明牌
            // 记录该牌与发起者（源 L7693：st_liubu<id><cardid>-Clear 标记，无名杀以 storage 记录）
            target.storage.bts_liubu_card = card.cardid;
            target.storage.bts_liubu_owner = player.playerid;
            target.addMark('bts_mk_liubu-clear', 1);
        },
        group: ['bts_sk_liubu_take', 'bts_sk_liubu_clear'],
        subSkill: {
            take: {
                // 定夺 2026-09-12（E-04）：按用户描述「当其于此回合内受到伤害时」——
                // 不限定伤害来源（源 L1276-1281 经 damage.from 匹配标记、实际仅你，按描述放开）；
                // 夺牌后目标失去1点体力（源描述 L13410 含、源代码未实现，按描述补）。
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        event.num > 0 &&
                        event.player?.storage?.bts_liubu_owner === player.playerid &&
                        event.player.storage.bts_liubu_card &&
                        // 注意：countCards 返回数字（旧写 countCards('h').some 实机崩溃，
                        // 2026-09-26 连续游玩实机修复）；取牌数组须用 getCards。
                        event.player
                            .getCards('h')
                            .some(
                                (card) =>
                                    card.cardid ===
                                    event.player.storage.bts_liubu_card,
                            )
                    );
                },
                async content(event, trigger, player) {
                    const target = trigger.player,
                        card = target
                            .getCards('h')
                            .find(
                                (card) =>
                                    card.cardid === target.storage.bts_liubu_card,
                            );
                    // 源 L1278-1280：obtainCard —— 你获得该牌；然后目标失去1点体力（按描述补）
                    if (card) await player.gain(card, target, 'giveAuto');
                    await target.loseHp();
                    delete target.storage.bts_liubu_card;
                    delete target.storage.bts_liubu_owner;
                    target.removeMark(
                        'bts_mk_liubu-clear',
                        target.countMark('bts_mk_liubu-clear'),
                    );
                },
                ai: { noe: true },
            },
            clear: {
                // 源 -Clear 标记于回合末自动清除：记录未在当回合内被夺走则移除。
                // 记录可于他人回合产生（他人回合内弃牌至空），故按标记持有者逐个清，非仅回合结束者。
                trigger: { global: 'phaseAfter' },
                forced: true,
                silent: true,
                filter(event, player) {
                    return game.hasPlayer(
                        (p) => p.countMark('bts_mk_liubu-clear') > 0,
                    );
                },
                async content(event, trigger, player) {
                    for (const target of game.players.filter(
                        (p) => p.countMark('bts_mk_liubu-clear') > 0,
                    )) {
                        delete target.storage.bts_liubu_card;
                        delete target.storage.bts_liubu_owner;
                        target.removeMark(
                            'bts_mk_liubu-clear',
                            target.countMark('bts_mk_liubu-clear'),
                        );
                    }
                },
            },
        },
    },
};

export const marks = {
    'bts_mk_liubu-clear': { markKind: 'record' },
};

export const translate = {
    'bts_mk_liubu-clear': '流布标记',
    bts_ch_tingyun_wangguiren: '忘归人',
    bts_sk_zhaoshi: '照世',
    bts_sk_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，各失去1点${get.poptip('bts_glossary_nuqi_faq')}、弃置一张手牌并附加${get.poptip('bts_glossary_nature_flame_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，未被选择的其他角色各获得一个额外出牌阶段。`,
    bts_sk_yaofeng: '摇风',
    bts_sk_yaofeng_info: `其他角色准备阶段开始时，若没有角色拥有${get.poptip('bts_glossary_bless_huqi_faq')}，你可以弃置一张【杀】，令其附加3层${get.poptip('bts_glossary_bless_huqi_faq')}。`,
    bts_sk_liubu: '流布',
    bts_sk_liubu_info:
        '当一名角色因弃置而失去所有手牌后，你可以令其摸一张牌并展示之。当其于此回合内受到伤害时，若其手牌区内存在此牌，你获得之，其失去1点体力。',
    bts_bless_huqi: '狐祈祝福',
    bts_bless_huqi_info: '来源：摇风赋予；属性伤后目标弃一张；回合结束自然减少1层',
};

export const simpleTranslate = {
    bts_sk_zhaoshi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}，让至少1名其他人掉怒气、弃手牌、着火；${get.poptip('bts_glossary_xingqi_faq')}再给剩下的人多一轮出牌`,
    bts_sk_yaofeng_info: `别人准备阶段若没${get.poptip('bts_glossary_bless_huqi_faq')}，你可弃杀给他+3`,
    bts_sk_liubu_info:
        '别人弃到空手可让他摸1张并展示；他这回合内受伤时，若此牌还在手牌区，你拿走并使其失去1体',
};

export const pinyins = { bts_ch_tingyun_wangguiren: 'tingyunwangguiren' };

export const buffSkills = {
    bts_bless_huqi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_huqi_faq',
        // 描述「造成属性伤害前」弃牌 → 挂 damageBefore（最早钩子；不设 firstDo，
        // 须在赐福/暗之等属性转换（firstDo）之后再读 getNature，见《技能开发规范》A13）。
        trigger: { source: 'damageBefore' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 源版 L1162-1165：狐祈无 _common 排除，_common 属性伤害照样触发弃牌
                //（2026-09-13 回退至源版）。
                lib.bts.api.getNature(event) &&
                event.player.countCards('h') > 0
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了狐祈祝福');
            // 源 L1157-1158：askForCardChosen(player, damage.to, "h") + throwCard ——
            // 由狐祈持有者（伤害来源）选择受伤角色的一张手牌弃置（V2.2 由受伤角色自选改为来源选择）
            await player.discardPlayerCard(trigger.player, 'h', true);
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_huqi_faq',
        name: '狐祈祝福',
        info: '当你对其他角色造成属性伤害前，你弃置其一张手牌（由你选择）。你的结束阶段开始时，此祝福减少1层。',
    },
];
