// 知更鸟·晴歌（源 animal.lua L10126-10232）—— 晴空乐手忆灵组合。
// 技能：狂想（必杀技·回怒+额外回合）、巡游（全局伤害/回复得气氛）、乐手（弃杀召唤晴空乐手）、
//       和声（气氛≥12翻面风伤关联目标、气氛耗尽移除乐手）；万风/心跳为源占位空技能。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '风·记忆·晴歌'; // 属性·命途
export const intro =
    `${B('知更鸟·晴歌')}拿${get.poptip('bts_glossary_qifen_faq')}攒出${get.poptip('bts_ch_qingkongyueshou')}，${get.poptip('bts_sk_hesheng')}一响就补一记${get.poptip('bts_glossary_nature_wind_faq')}追击。`;

export const character = {
    bts_ch_zhigengniao_qingge: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_sk_kuangxiang', 'bts_sk_xunyou', 'bts_sk_yueshou'],
    },
};

export const transformCharacter = {
    // 晴空乐手（源 qingkongyueshou，L10176 起）：知更鸟·晴歌的忆灵，3体力。
    bts_ch_qingkongyueshou: {
        isUnseen: true,
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 3,
        skills: ['bts_sk_wanfeng', 'bts_sk_xintiao', 'bts_sk_hesheng'],
    },
    // 组合形态（源 zhigengniao_qingge_and_qingkongyueshou，L10226-10232）：7体力，技能并集。
    bts_ch_zhigengniao_qingge_and_qingkongyueshou: {
        isUnseen: true,
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 7,
        skills: [
            'bts_sk_kuangxiang',
            'bts_sk_xunyou',
            'bts_sk_yueshou',
            'bts_sk_wanfeng',
            'bts_sk_xintiao',
            'bts_sk_hesheng',
        ],
    },
};

// 替代形态注册：晴歌召唤晴空乐手进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_ch_zhigengniao_qingge: [['bts_ch_zhigengniao_qingge_and_qingkongyueshou', []]],
};

export const skill = {
    // ── 必杀技·狂想（源 st_kuangxiang = SkillCard + ZeroCardViewAsSkill，L10127-10148）──
    // 出牌阶段，失5怒气，令一名其他角色回复1点怒气并执行一个额外回合。
    bts_sk_kuangxiang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L10146）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L10130）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        // 清理子技能：晴歌下回合开始时移除被赠回合角色的狂想增益（源 L1502-1507）。
        group: ['bts_sk_kuangxiang_clear'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_kuangxiang');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L10133：LoseAngry(player, 5)
            // 源 L10134：AddAngry(targets[1], 1, player) —— 目标回复1点怒气
            lib.bts.api.addAngry(target, 1, player);
            // 源 L10135：setPlayerMark(player, "max_kuangxiang"..目标.."-start", 1)——目标于你的
            // 下个准备阶段开始前额定摸牌数+1（gamerule_draw L1464，无条件）；以临时 buff 近似。
            target.storage.bts_kuangxiang_owner = player.playerid;
            await target.addSkill('bts_sk_kuangxiang_buff');
            // 源 L10136：addPlayerMark(target, "extra_turn") —— 目标执行额外回合
            lib.bts.api.extraTurn(target, 'bts_extra_turn');
        },
        subSkill: {
            clear: {
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return game.hasPlayer(
                        (p) =>
                            p.hasSkill('bts_sk_kuangxiang_buff') &&
                            p.storage.bts_kuangxiang_owner === player.playerid,
                    );
                },
                async content(event, trigger, player) {
                    // 源 L1502-1507：标记于晴歌下回合 RoundStart 清除（"于你的下个准备阶段开始前"）。
                    // 无名杀以 phaseZhunbeiBegin 近似 RoundStart（同知更鸟·迭奏 clear 范式）。
                    for (const p of lib.bts.api.seatOrder(
                        game.filterPlayer(
                            (p) =>
                                p.hasSkill('bts_sk_kuangxiang_buff') &&
                                p.storage.bts_kuangxiang_owner === player.playerid,
                        ),
                    )) {
                        delete p.storage.bts_kuangxiang_owner;
                        p.removeSkill('bts_sk_kuangxiang_buff');
                    }
                },
            },
            // ── 临时技·狂想增益（挂在被赠回合角色身上，源 max_kuangxiang<目标>-start 标记 L10135；
            //   gamerule_draw L1464：目标额定摸牌数+1（无条件，非星启限定）；
            //   由本父技能 subSkill.clear 于晴歌下回合开始移除）──
            buff: {
                sub: true,
                sourceSkill: 'bts_sk_kuangxiang',
                charlotte: true,
                mark: true,
                marktext: '狂',
                intro: {
                    name: '狂想',
                    content: '摸牌阶段额定摸牌数+1。',
                },
                trigger: { player: 'phaseDrawBegin2' },
                forced: true,
                async content(event, trigger, player) {
                    event.num += 1; // 源 gamerule_draw L1464：额定摸牌数+1
                },
            },
        },
        ai: {
            // AI 口径：5怒气必杀赐1名其他角色额外回合+回1怒+下回合摸牌+1；只给友方（源 AI max_kuangxiang
            // Friends_Angry_AI 取怒气最高友方、无友方不发，StarRail-ai.lua L3948；源 animal.lua L10486-10513）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_kuangxiang')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() && t !== player && get.attitude(player, t) > 0,
                    )
                )
                    return -1; // 无友方可赠：给敌方额外回合为负收益
                return 8;
            },
            result: {
                player: -1, // 5怒气必杀代价（收益在受赠方）
                // 受赠方：整回合+回1怒（怒气越多越优先，源取怒气最高友方）+摸牌+1
                target: (player, target) => {
                    let v = 3;
                    v += Math.min(2, target.countMark('bts_mk_angry')) * 0.5;
                    v += target.isDamaged() ? 0.5 : 0;
                    return v;
                },
            },
        },
    },

    // ── 锁定技·巡游（源 st_xunyou = TriggerSkill Compulsory Damage/HpRecover，L10150-10163）──
    // 一名角色造成伤害、回复体力或附加护盾后，你获得2枚气氛标记。
    // （「附加护盾」为源描述承诺、源代码缺事件——定夺按描述补：监听 bts_mark_add）
    bts_sk_xunyou: {
        trigger: { global: ['damageEnd', 'recoverEnd', 'bts_mark_add'] },
        forced: true,
        filter(event, player, triggername) {
            // 源 L10153-10158：Damage / HpRecover 事件（无名杀 damageEnd/recoverEnd）
            if (triggername === 'bts_mark_add')
                return event.markName === 'bts_shield';
            return event.num > 0;
        },
        async content(event, trigger, player) {
            // 源 L10157：p:gainMark("@qifen", 2)
            player.addMark('bts_mk_qifen', 2);
        },
    },

    // ── 触发技·乐手（源 st_yueshou = TriggerSkill TargetSpecified，L10165-10174）──
    // 当你使用牌指定目标后（目标不含自己），可弃置一张【杀】，召唤晴空乐手。
    bts_sk_yueshou: {
        // 召唤忆灵的技能均为 unique:true（定夺）
        unique: true,
        // 源 TargetSpecified 焦点=牌使用者（QSanguosha gamerule.cpp:635）——「你使用牌指定目标后」；
        // 以 player:'useCard' 近似。
        trigger: { player: 'useCard' },
        filter(event, player) {
            // 源 L10170：使用非技能牌（not isKindOf("SkillCard")）且目标不含自己
            // （not use.to:contains(player)），当前未召唤乐手。非技能牌判据：无名杀实体/直用对象卡
            // isCard:true、经典转化为 falsy——`!isCard` 恰为反向；改「非转化且非虚拟」
            //（引擎标准武将同款，extra/skill.js:3057）。
            return (
                !!event.card &&
                !get.is.convertedCard(event.card) &&
                !get.is.virtualCard(event.card) &&
                !event.targets?.includes(player) &&
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                !lib.bts.api.getPet(player, 'qingkongyueshou')
            );
        },
        async cost(event, trigger, player) {
            // 源 L10170：askForCard(player, "Slash") —— 选择一张【杀】（结算移入 content）
            event.result = await player
                .chooseCard(
                    '乐手：是否弃置一张【杀】召唤晴空乐手？',
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                )
                // AI 口径：弃1【杀】召唤忆灵（组合形态：+3体力池、得晚风/心跳/和声；心跳首召+1怒；
                // 离场由晚风赐额外回合）——收益远大于1张【杀】（源 animal.lua L10524-10534；源 AI 无条目）
                .set('ai', (card) => 6 - get.value(card))
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L10170：结算 cost 所选【杀】（自选数据在 event.cards）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L10171：AddPet(player, "qingkongyueshou")
            await lib.bts.api.addPet(player, 'qingkongyueshou');
        },
        ai: {
            // 发动决策在 cost 的 ai（cost 型触发技不询顶层 check）；此 result 供跨技能估值——召唤忆灵=
            // 组合形态（+3体力池+3技），离场另得额外回合（源 animal.lua L10524-10534）
            result: { player: 2 },
        },
    },

    // ── 锁定技·万风（源 st_wanfeng = TriggerSkill Compulsory，L10177-10183）──
    // 源壳为空（效果硬编码在 RemovePet）；监听 bts_pet_remove——晴空乐手离场时执行一个额外回合。
    bts_sk_wanfeng: {
        charlotte: true,
        trigger: { player: 'bts_pet_remove' },
        forced: true,
        filter(event, player) {
            return event.pet === 'qingkongyueshou' && player.isAlive();
        },
        async content(event, trigger, player) {
            lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 乐手离场：额外回合（源 st_wanfeng）
        },
    },

    // ── 锁定技·心跳（源 st_xintiao = TriggerSkill Compulsory，L10185-10191）──
    // 源壳为空（效果硬编码在 AddPet）；监听 bts_pet_add——首次召唤 +1 怒气（源首起分支）、
    // 重复召唤 +6 气氛（源 L812-814）。
    bts_sk_xintiao: {
        charlotte: true,
        trigger: { player: 'bts_pet_add' },
        forced: true,
        filter(event) {
            return event.pet === 'qingkongyueshou';
        },
        async content(event, trigger, player) {
            if (trigger.repeated)
                player.addMark('bts_mk_qifen', 6); // 重复召唤：+6 气氛（源 L812-814）
            else lib.bts.api.addAngry(player); // 首次召唤：+1 怒气（源 st_xintiao 首起分支）
        },
    },

    // ── 锁定技·和声（源 st_hesheng，L10552-10585）──
    // 气氛达 12 时翻面；此后每回合开始结算：弃气氛（min(气氛, max(12, 气氛/2))）、对上个伤害你者
    // 造成风属性伤害，气氛耗尽移除晴空乐手并恢复朝上。源 TurnOver 的防翻回分支在本引擎无对应
    //（不自动翻回/跳过面朝下回合）；以 subskill phaseZhunbeiBegin 承载同款结算（定夺 A-12）。
    bts_sk_hesheng: {
        trigger: { player: 'bts_mark_add' },
        forced: true,
        filter(event, player) {
            // 源 L10557-10559：气氛标记增加且达12、未发动过（st_hesheng 标记）、朝上（faceUp）
            return (
                event.markName === 'bts_mk_qifen' &&
                player.countMark('bts_mk_qifen') >= 12 &&
                !player.countMark('bts_mk_hesheng_used') &&
                !player.isTurnedOver()
            );
        },
        group: ['bts_sk_hesheng_turn', 'bts_sk_hesheng_leave', 'bts_sk_hesheng_die'],
        // 源 EventAcquireSkill/LoseSkill 重置 st_hesheng（L10578-10582）——以 init（获得本技能时）等效。
        init(player) {
            const n = player.countMark('bts_mk_hesheng_used');
            if (n > 0) player.removeMark('bts_mk_hesheng_used', n);
        },
        async content(event, trigger, player) {
            // 源 L10560-10562：MarkChanged 分支 —— turnOver() 翻面 + 记标记
            player.addMark('bts_mk_hesheng_used', 1);
            await player.turnOver();
            // 技能 BGM：翻面后切专属曲（从 9s 起播；还原由 leave/die 手动调用）。
            lib.bts.bgm.switch({
                file: 'bts_ch_zhigengniao_qingge',
                startAt: 9,
            });
        },
        subSkill: {
            // 每回合开始结算（源 TurnOver L10564-10577：面朝下角色回合开始时被尝试翻回，和声拦截并
            // 结算二重效果）。本引擎 turnOver 仅切换 class，故以 phaseZhunbeiBegin 承载。
            turn: {
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return player.countMark('bts_mk_hesheng_used') > 0;
                },
                async content(event, trigger, player) {
                    // 源 L10565：loseMark("@qifen", min(气氛, max(12, 气氛/2)))
                    // 取整（定夺 A-09）：按源浮点截断 → Math.floor（仅奇 qifen≥25 与 ceil 差 1）。
                    const spent = Math.min(
                        player.countMark('bts_mk_qifen'),
                        Math.max(12, Math.floor(player.countMark('bts_mk_qifen') / 2)),
                    );
                    player.removeMark('bts_mk_qifen', spent);
                    // 源 L10566-10572：对上个伤害你者（须存活）造成风属性伤害；取 damage 历史末尾
                    // 来源（同风堇·走开范式）。
                    const last = player
                        .getAllHistory('damage')
                        .filter((ev) => ev.source)
                        .pop();
                    if (last?.source?.isAlive()) {
                        const damage = last.source.damage(player, 1, 'nocard');
                        damage.reason = 'bts_sk_hesheng_wind';
                        lib.bts.api.setDamageNature(damage, 'wind');
                        await damage;
                    }
                    // 源 L10573-10576：气氛耗尽时移除晴空乐手；面朝下状态随之恢复朝上
                    if (player.countMark('bts_mk_qifen') === 0) {
                        await lib.bts.api.removePet(player, 'qingkongyueshou');
                        if (player.isTurnedOver()) await player.turnOver();
                    }
                },
            },
            // ── 子技·离场 BGM 还原（和声结算移除 / 忆灵生命归零移除都经 bts_pet_remove：
            //   removePet 先派发事件、此刻忆灵形态技能仍挂载）──
            leave: {
                trigger: { player: 'bts_pet_remove' },
                forced: true,
                // 主人已阵亡时如有离场清理（忆灵随主处理等）也须还原——BGM 为全局状态，
                // 不依赖拥有者存活，同样放开死亡拦截
                forceDie: true,
                filter(event, player) {
                    return event.pet === 'qingkongyueshou';
                },
                async content(event, trigger, player) {
                    lib.bts.bgm.restore('bts_ch_zhigengniao_qingge');
                },
            },
            // ── 子技·阵亡 BGM 还原（和声翻面后未及离场即阵亡）──
            die: {
                trigger: { player: 'dieAfter' },
                forced: true,
                // 死亡后触发：die 流程先标 dead 再派发 dieAfter，默认触发器被拦，须 forceDie
                forceDie: true,
                async content(event, trigger, player) {
                    lib.bts.bgm.restore('bts_ch_zhigengniao_qingge');
                },
            },
        },
    },
};

export const marks = {
    bts_mk_hesheng_used: { markKind: 'record' },
    bts_mk_qifen: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_qifen_faq',
    },
    bts_pet_qingkongyueshou: {
        // 忆灵体力（lib.bts.api 忆灵系统，markKind:'pet' 使体力可见）
        markKind: 'pet',
    },
};

export const translate = {
    bts_mk_hesheng_used: '和声已用',
    bts_ch_zhigengniao_qingge: '知更鸟·晴歌',
    bts_ch_qingkongyueshou: '晴空乐手',
    bts_ch_zhigengniao_qingge_and_qingkongyueshou: '知更鸟&晴空乐手',
    bts_sk_kuangxiang: '狂想',
    bts_sk_kuangxiang_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令一名其他角色回复1点${get.poptip('bts_glossary_nuqi_faq')}且于你的下个准备阶段开始前额定摸牌数+1。本回合结束时，其还会执行一个额外回合。`,
    bts_sk_xunyou: '巡游',
    bts_sk_xunyou_info: `锁定技，一名角色造成伤害、回复体力或附加${get.poptip('bts_glossary_hudun_faq')}后，你获得2枚${get.poptip('bts_glossary_qifen_faq')}标记。`,
    bts_sk_kuangxiang_buff: '狂想增益',
    bts_sk_kuangxiang_buff_info: '摸牌阶段额定摸牌数+1。',
    bts_sk_yueshou: '乐手',
    bts_sk_yueshou_info: `当你使用牌指定目标后，你可以弃置一张【杀】，召唤${get.poptip('bts_ch_qingkongyueshou')}。`,
    bts_sk_wanfeng: '晚风',
    bts_sk_wanfeng_info: `锁定技，当${get.poptip('bts_ch_qingkongyueshou')}被移除后，此回合结束时，你执行一个额外的回合。`,
    bts_sk_xintiao: '心跳',
    bts_sk_xintiao_info: `锁定技，当${get.poptip('bts_ch_qingkongyueshou')}登场时，若已存在${get.poptip('bts_ch_qingkongyueshou')}，你获得6枚${get.poptip('bts_glossary_qifen_faq')}标记，否则你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,
    bts_sk_hesheng: '和声',
    bts_sk_hesheng_info: `锁定技，当你拥有至少12枚${get.poptip('bts_glossary_qifen_faq')}标记后，你翻面；此后每回合开始时，弃X枚${get.poptip('bts_glossary_qifen_faq')}标记（X为标记数的一半且至少为12，向下取整），对上个对你造成伤害的角色造成1点${get.poptip('bts_glossary_nature_wind_dmg_faq')}伤害，然后若你没有${get.poptip('bts_glossary_qifen_faq')}标记，移除${get.poptip('bts_ch_qingkongyueshou')}。`,
    bts_mk_qifen: '气氛',
    bts_pet_qingkongyueshou: '晴空乐手',



    bts_mk_qifen_info: `来源：${get.poptip('bts_sk_xunyou')}赋予；${get.poptip('bts_sk_hesheng')}：满12翻面爆发`,

    '$bts_sk_hesheng1': "心弦拨奏——Bessie~",
    '$bts_sk_wanfeng1': "舞力全开——Paddie~",
    '$bts_sk_xintiao1': "节奏鬼才——Drummie~",
    '$bts_sk_hesheng2': "灵魂律动，solo时间~",
    '$bts_sk_wanfeng2': "节拍不止，音浪不息~",
    '$bts_sk_xintiao2': "跟随海风，自由摇摆~",

    '~bts_ch_qingkongyueshou': "还没…唱完……",
    '~bts_ch_zhigengniao_qingge': "还没…唱完……",
    '~bts_ch_zhigengniao_qingge_and_qingkongyueshou': "还没…唱完……",
};

export const simpleTranslate = {
    bts_sk_kuangxiang_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色回怒并额外回合`,
    bts_sk_xunyou_info: `锁；全局伤害/回复/${get.poptip('bts_glossary_hudun_faq')}后+2${get.poptip('bts_glossary_qifen_faq')}`,
    bts_sk_yueshou_info: `成为非技能牌目标后可弃杀召唤${get.poptip('bts_ch_qingkongyueshou')}`,
    bts_sk_hesheng_info: `锁；${get.poptip('bts_glossary_qifen_faq')}≥12时翻面，此后每回合开始弃${get.poptip('bts_glossary_qifen_faq')}（向下取整）风伤上个伤害你者；${get.poptip('bts_glossary_qifen_faq')}耗尽时移除${get.poptip('bts_ch_qingkongyueshou')}`,
};

// 默认读音有误（更→gēng、乐→yuè）：按叁岛式写「中文名 → 带声调拼音数组」覆盖。
export const pinyins = {
    '知更鸟·晴歌': ['zhī', 'gēng', 'niǎo', '·', 'qíng', 'gē'],
    '晴空乐手': ['qíng', 'kōng', 'yuè', 'shǒu'],
    '知更鸟&晴空乐手': ['zhī', 'gēng', 'niǎo', '&', 'qíng', 'kōng', 'yuè', 'shǒu'],
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_qifen_faq',
        name: '|气氛|',
        info: `知更鸟·晴歌专属：${get.poptip('bts_sk_xunyou')}获得；满12由${get.poptip('bts_sk_hesheng')}翻面并造成${get.poptip('bts_glossary_nature_feng_faq')}伤害。`,
    },
];
