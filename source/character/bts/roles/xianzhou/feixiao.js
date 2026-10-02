// 飞霄（源 animal.lua L7095-7265）—— 飞黄、凿荒连斩与钺贯。
// 技能：凿荒（必杀技·弃6飞黄两段致命【杀】+每段二选一）、雷狩（他人杀结算后追击）、钺贯（弃杀得飞黄+锦囊当风杀）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '风·巡猎·天击将军'; // 属性·命途
export const intro =
    `${B('飞霄')}攒${get.poptip('bts_glossary_feihuang_faq')}砸${get.poptip('bts_sk_zaohuang')}连斩，${get.poptip('bts_sk_yueguan')}把锦囊当风【杀】劈。`;

export const character = {
    bts_ch_feixiao: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_zaohuang', 'bts_sk_leishou', 'bts_sk_yueguan'],
    },
};

export const skill = {
    // ── 必杀技·凿荒（源 st_zaohuang = SkillCard + ZeroCardViewAsSkill + 两段杀，L7096-7204）──
    // 定夺 2026-09-12（E-02）：按太阳神描述实现（源描述与代码矛盾，按描述）——
    // 弃6飞黄，攻击范围于此技能结算完毕前+6，视为使用两张致命【杀】（目标相同、有距离限制），
    // 每张【杀】使用时二选一：风杀（目标拥有属性则伤害值+1）/ 弃目标手牌（无属性+1，星启再+1）；
    // 星启时以此法造成的伤害视为贯通伤害且弃置的牌数+1。
    bts_sk_zaohuang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（飞黄发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7122）：飞黄≥6
            return player.countMark('bts_mk_feihuang') >= 6;
        },
        filterTarget(card, player, target) {
            // 源 st_zaohuang_slashCard filter（L7135）：距离限制按攻击范围+6（源范围标记在选目标前已生效）
            return target !== player && get.distance(player, target) <= player.getAttackRange() + 6;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zaohuang');
            player.removeMark('bts_mk_feihuang', 6); // 源 L7100：LoseOther(@feihuang, 6)
            // 描述「攻击范围于此技能结算完毕前+6」：临时挂 +6 攻击范围，两段杀结算完移除
            player.addTempSkill('bts_sk_zaohuang_range');
            try {
                // 源 L7137-7160：两段致命【杀】——目标相同（每段仅对存活目标），均有距离限制
                let targets = event.targets.filter((target) => target.isAlive());
                for (let i = 0; i < 2 && targets.length; i++) {
                    await player.useCard(
                        {
                            name: 'sha',
                            isCard: true,
                            skill: 'bts_sk_zaohuang',
                            storage: { bts_zaohuang: true },
                        },
                        targets,
                    );
                    targets = targets.filter((target) => target.isAlive());
                }
            } finally {
                player.removeSkill('bts_sk_zaohuang_range');
            }
        },
        group: ['bts_sk_zaohuang_choice', 'bts_sk_zaohuang_damage'],
        subSkill: {
            range: {
                // 描述「攻击范围于此技能结算完毕前+6」：凿荒结算期间攻击范围临时 +6
                charlotte: true,
                mod: {
                    attackRange(player, range) {
                        return range + 6;
                    },
                },
            },
            choice: {
                // 源 L7174-7203：每张凿荒【杀】使用时二选一结算
                trigger: { player: 'useCard' },
                forced: true,
                filter(event, player) {
                    // 源 L7176：技能名含 "st_zaohuang_fatal"（凿荒【杀】）
                    return event.card?.storage?.bts_zaohuang;
                },
                async content(event, trigger, player) {
                    const targets = trigger.targets.filter((target) => target.isAlive()); // trigger=useCard 事件
                    // 源 L7177：askForChoice("st_zaohuang1+st_zaohuang2")
                    const result = await player
                        .chooseControl(
                            '此杀视为风杀（目标拥有属性则伤害值+1）',
                            '弃置目标手牌（无属性+1张，星启+1张）',
                        )
                        .set('prompt', '凿荒：选择本次【杀】的结算方式')
                        .set('ai', () => 0)
                        .forResult();
                    if (result.index === 0) {
                        // 描述选项1：此【杀】视为风【杀】，若目标拥有属性，伤害值+1（目标级，damage 子技判定）
                        trigger.card.storage.bts_zaohuang_wind = true;
                    } else {
                        // 描述选项2：弃置目标角色一张手牌，没有属性的目标角色弃置的牌数+1；星启弃置的牌数+1
                        for (const target of targets) {
                            let num =
                                1 +
                                (lib.bts.api.getNature(null, target) ? 0 : 1) +
                                (lib.bts.api.god(player) ? 1 : 0);
                            if (target.countCards('h'))
                                await target.chooseToDiscard(
                                    `凿荒：弃置${get.cnNumber(num)}张手牌`,
                                    'h',
                                    [num, num],
                                    true,
                                );
                        }
                    }
                },
                ai: { noe: true },
            },
            damage: {
                // 凿荒【杀】伤害：致命化 + 风属性（目标拥有属性则+1）+ 贯通（星启）
                trigger: { source: 'damageBegin1' },
                forced: true,
                priority: 10,
                filter(event, player) {
                    return (
                        event.card?.storage?.bts_zaohuang_wind ||
                        event.card?.storage?.bts_zaohuang
                    );
                },
                async content(event, trigger, player) {
                    trigger.reason = 'bts_sk_zaohuang_bts_reason_fatal'; // 源 L7146/7156：setSkillName "st_zaohuang_fatal"
                    if (trigger.card.storage.bts_zaohuang_wind) {
                        // 描述选项1：此【杀】视为风【杀】，若目标拥有属性，伤害值+1
                        //（按目标级判定——trigger.player 为该次伤害的目标）
                        lib.bts.api.setDamageNature(trigger, 'wind');
                        if (lib.bts.api.getNature(null, trigger.player)) trigger.num += 1;
                    }
                    // 描述：星启时以此法造成的伤害视为贯通伤害
                    if (lib.bts.api.god(player)) lib.bts.api.markDamage(trigger, '_through');
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zaohuang') ? -1 : 9;
            },
            result: { target: -2 },
        },
    },

    // ── 触发技·雷狩（源 st_leishou = TriggerSkill CardFinished，L7207-7232）──
    // 其他角色使用【杀】结算完毕后，你可以视为对这些目标使用【杀】，获得1枚飞黄。
    bts_sk_leishou: {
        trigger: { global: 'useCardAfter' },
        filter(event, player) {
            // 源 L7214-7220：其他角色使用【杀】且你有目标可【杀】
            return (
                event.player !== player &&
                event.card?.name === 'sha' &&
                event.targets?.some(
                    (target) =>
                        player.canUse({ name: 'sha', isCard: true }, target, true), // 源 L7217 canSlash+isProhibited
                )
            );
        },
        async content(event, trigger, player) {
            const targets = trigger.targets.filter( // trigger=useCardAfter 事件
                (target) =>
                    player.canUse({ name: 'sha', isCard: true }, target, true)
            );
            if (!targets.length) return;
            // 源 L7221：askForSkillInvoke
            const result = await player
                .chooseBool('雷狩：是否视为对这些目标使用【杀】并获得1枚飞黄？')
                .forResult();
            if (result.bool) {
                player.addMark('bts_mk_feihuang', 1); // 源 L7222：p:gainMark("@feihuang")
                // 源 L7223：ViewAsCard(p, tos) —— 视为对这些目标使用【杀】
                await player.useCard({ name: 'sha', isCard: true }, targets);
            }
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·钺贯（源 st_yueguan = TriggerSkill EventPhaseStart Start，L7234-7263）──
    // 准备阶段开始时，可弃置一张【杀】，获得1枚飞黄，本回合你的锦囊牌视为风【杀】。
    bts_sk_yueguan: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L7238：准备阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L7238：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '钺贯：是否弃置一张【杀】获得飞黄，并令锦囊牌本回合视为风【杀】？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7244：gainMark(@feihuang)；L7245：acquireSkill("#st_yueguan-clear")——
            // 源为 FilterSkill 动态挂摘；无名杀 installBuffSkillLifecycle 按「标记名==技能名」
            // 才自动挂载，bts_sk_yueguan_buff ≠ 标记名，故须显式 addSkill（曾漏挂，整块失效）。
            player.addMark('bts_mk_feihuang', 1);
            player.addMark('bts_mk_yueguan-clear', 1);
            await player.addSkill('bts_sk_yueguan_buff');
        },
        // 回合结束清理（源描述「于此回合内」，L12975；源 acquireSkill("#st_yueguan-clear")
        // 无 detach 实际整局持久——按用户定夺「源码没定义按描述来」补回合清理）
        group: ['bts_sk_yueguan_clear'],
        subSkill: {
            clear: {
                trigger: { player: 'phaseEnd' },
                forced: true,
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_mk_yueguan-clear',
                        player.countMark('bts_mk_yueguan-clear'),
                    );
                    player.removeSkill('bts_sk_yueguan_buff');
                    player.removeSkill('bts_sk_yueguan_buff_hit');
                },
                ai: { noe: true },
            },
            // ── 关联技·钺贯强化（源 st_yueguan_buff = FilterSkill "#st_yueguan-clear"，L7251-7263）──
            // 本回合（有钺贯标记时）手牌锦囊视为风【杀】。
            // 源描述「不能被响应且无距离限制」（L12975）：「无距离限制」源代码经 gamerule_card
            // distance_limit_func 实现（L1814-1816，skillName 含 st_yueguan → 距离1000）；「不能被响应」
            // 源代码未实现（_wind_hit 仅翻译键）——按用户定夺「源码没定义按描述来」补直接命中。
            buff: {
                sub: true,
                sourceSkill: 'bts_sk_yueguan',
                charlotte: true,
                enable: 'phaseUse',
                filter(event, player) {
                    // 源 view_filter（L7254）：手牌且为锦囊（有钺贯标记）
                    return (
                        player.countMark('bts_mk_yueguan-clear') &&
                        player.getCards('h').some((card) => get.type(card) === 'trick')
                    );
                },
                filterCard: (card) => get.type(card) === 'trick',
                position: 'h',
                selectCard: 1,
                filterTarget(card, player, target) {
                    // 源 gamerule_card distance_limit_func（L1814-1816）：无距离限制——
                    // canUse 第三参 false 跳过距离检查，仍保留 targetEnabled（禁目标等）规则
                    return player.canUse(card, target, false);
                },
                // 源 L7256-7262：克隆 slash（风属性，skillName 含 "_wind_hit"）；
                // storage bts_sk_yueguan 供 useCard 触发识别（直接命中）
                viewAs: {
                    name: 'sha',
                    isCard: true,
                    storage: { _btsNature: 'wind', bts_sk_yueguan: true },
                },
                group: ['bts_sk_yueguan_buff_hit'],
                ai: { order: 5, result: { target: -1 } },
            },
            // ── 关联技·钺贯直接命中（原 bts_sk_yueguan_buff.subSkill.hit；父技能并入本 parent
            //    的 subSkill 后按注册名规则升为兄弟键，保留 bts_sk_yueguan_buff_hit 注册名）──
            buff_hit: {
                sub: true,
                sourceSkill: 'bts_sk_yueguan_buff',
                trigger: { player: 'useCard' },
                forced: true,
                filter(event, player) {
                    return event.card?.storage?.bts_sk_yueguan;
                },
                async content(event, trigger, player) {
                    // trigger 即本次 useCard 事件：本体在其 content 前段已把 directHit 转为数组
                    // （转数组先于 trigger("useCard")），故此处 addArray 合法、无需兜底。
                    // event 只是技能自身的 "trigger" 包装事件（directHit 恒为 false），不能写。
                    trigger.directHit.addArray(trigger.targets);
                },
                ai: { noe: true },
            },
        },
        ai: { result: { player: 1 } },
    },
};

export const marks = {
    bts_mk_feihuang: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_feihuang_faq',
    },
};

export const translate = {
    bts_ch_feixiao: '飞霄',
    bts_sk_zaohuang: '凿荒',
    bts_sk_zaohuang_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以弃6枚${get.poptip('bts_glossary_feihuang_faq')}标记，令你的攻击范围于此技能结算完毕前+6，然后视为使用两张${get.poptip('bts_glossary_bless_fatal_faq')}【杀】（目标相同且有距离限制）；以此法使用【杀】时选择一项：1.此【杀】视为风【杀】，若目标拥有属性，伤害值+1；2.弃置目标角色一张手牌，没有属性的目标角色弃置的牌数+1。若你为${get.poptip('bts_glossary_xingqi_faq')}，以此法造成的伤害视为${get.poptip('bts_glossary_guantong_faq')}伤害且弃置的牌数+1。`,
    bts_sk_leishou: '雷狩',
    bts_sk_leishou_info: `其他角色使用【杀】结算完毕后，你可以视为对其中目标使用【杀】，获得1枚${get.poptip('bts_glossary_feihuang_faq')}标记。`,
    bts_sk_yueguan: '钺贯',
    bts_sk_yueguan_info: `准备阶段开始时，你可以弃置一张【杀】，获得1枚${get.poptip('bts_glossary_feihuang_faq')}，本回合你的锦囊牌视为风【杀】（不能被响应且无距离限制）。`,

    '$bts_sk_zaohuang1': "我将，巡征追猎",
    '$bts_sk_zaohuang2': "翾翔不坠，万载常胜！",
    '$bts_sk_zaohuang3': "大捷，已定！",
    '$bts_sk_leishou1': "哼，太慢！",
    '$bts_sk_leishou2': "呵，不行",
    '$bts_sk_yueguan1': "不避，不悔！",
    '$bts_sk_yueguan2': "无惧，无畏！",
    '~bts_ch_feixiao': "各位…拜托了……",
    bts_mk_feihuang: '飞黄',
    bts_mk_feihuang_info: `来源：${get.poptip('bts_sk_leishou')}、${get.poptip('bts_sk_yueguan')}赋予；${get.poptip('bts_sk_zaohuang')}：满6发动`,
};

export const simpleTranslate = {
    bts_sk_zaohuang_info: `${get.poptip('bts_glossary_bisha_faq')}；弃6${get.poptip('bts_glossary_feihuang_faq')}，结算前范围+6，用两张${get.poptip('bts_glossary_bless_fatal_faq')}杀（目标相同、有距离限制），每张选风杀（目标有属性伤害+1）或弃1牌（无属性+1/${get.poptip('bts_glossary_xingqi_faq')}+1）；${get.poptip('bts_glossary_xingqi_faq')}时伤害${get.poptip('bts_glossary_guantong_faq')}且弃牌+1`,
    bts_sk_leishou_info: `他人杀结算后可追击其目标并+1${get.poptip('bts_glossary_feihuang_faq')}`,
    bts_sk_yueguan_info: `准备阶段可弃杀+1${get.poptip('bts_glossary_feihuang_faq')}，本回合锦囊当风杀（不能被响应且无距离限制）`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_feihuang_faq',
        name: '|飞黄|',
        info: `飞霄专属：${get.poptip('bts_sk_leishou')}击杀追击、${get.poptip('bts_sk_yueguan')}弃杀各+1枚；满6由${get.poptip('bts_sk_zaohuang')}连斩。`,
    },
];
