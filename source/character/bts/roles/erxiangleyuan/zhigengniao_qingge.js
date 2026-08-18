// 知更鸟·晴歌（源 animal.lua L10126-10232）—— 晴空乐手忆灵组合。
// 技能：狂想（必杀技·回怒+额外回合）、巡游（全局伤害/回复得气氛）、乐手（弃杀召唤晴空乐手）、
//       和声（气氛≥12翻面风伤关联目标、气氛耗尽移除乐手）；万风/心跳为源占位空技能。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '风·记忆·晴歌'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('知更鸟·晴歌')}拿${get.poptip('bts_glossary_qifen_faq')}攒出晴空乐手，和声一响就补一记${get.poptip('bts_glossary_nature_feng_faq')}追击。`;

export const character = {
    bts_zhigengniao_qingge: {
        isUnseen: true, // 太阳神源角色未完成（半成品），先隐藏待完善
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_kuangxiang', 'bts_st_xunyou', 'bts_st_yueshou'],
    },
};

export const transformCharacter = {
    // 晴空乐手（源 qingkongyueshou，L10176 起）：知更鸟·晴歌的忆灵，3体力。
    bts_qingkongyueshou: {
        isUnseen: true,
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 3,
        skills: ['bts_st_wanfeng', 'bts_st_xintiao', 'bts_st_hesheng'],
    },
    // 组合形态（源 zhigengniao_qingge_and_qingkongyueshou，L10226-10232）：7体力，技能并集。
    bts_zhigengniao_qingge_and_qingkongyueshou: {
        isUnseen: true,
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 7,
        skills: [
            'bts_st_kuangxiang',
            'bts_st_xunyou',
            'bts_st_yueshou',
            'bts_st_wanfeng',
            'bts_st_xintiao',
            'bts_st_hesheng',
        ],
    },
};

// 替代形态注册：晴歌召唤晴空乐手进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_zhigengniao_qingge: [['bts_zhigengniao_qingge_and_qingkongyueshou', []]],
};

export const skill = {
    // ── 必杀技·狂想（源 st_kuangxiang = SkillCard + ZeroCardViewAsSkill，L10127-10148）──
    // 出牌阶段，失5怒气，令一名其他角色回复1点怒气并执行一个额外回合。
    bts_st_kuangxiang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
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
        group: ['bts_st_kuangxiang_clear'],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_kuangxiang');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L10133：LoseAngry(player, 5)
            // 源 L10134：AddAngry(targets[1], 1, player) —— 目标回复1点怒气
            lib.bts.api.addAngry(target, 1, player);
            // 源 L10135：setPlayerMark(player, "max_kuangxiang"..目标.."-start", 1) ——
            // 目标于你的下个准备阶段开始前额定摸牌数+1（gamerule_draw L1464，无条件）；
            // 无名杀以挂临时 buff bts_st_kuangxiang_buff 近似（已修正：原实现漏整块效果）。
            target.storage.bts_kuangxiang_owner = player.playerid;
            await target.addSkill('bts_st_kuangxiang_buff');
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
                            p.hasSkill('bts_st_kuangxiang_buff') &&
                            p.storage.bts_kuangxiang_owner === player.playerid,
                    );
                },
                content(event, trigger, player) {
                    // 源 L1502-1507：标记于晴歌下回合 RoundStart 清除（"于你的下个准备阶段开始前"）。
                    // 无名杀以 phaseZhunbeiBegin 近似 RoundStart（同知更鸟·迭奏 clear 范式）。
                    for (const p of game.filterPlayer(
                        (p) =>
                            p.hasSkill('bts_st_kuangxiang_buff') &&
                            p.storage.bts_kuangxiang_owner === player.playerid,
                    )) {
                        delete p.storage.bts_kuangxiang_owner;
                        p.removeSkill('bts_st_kuangxiang_buff');
                    }
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_kuangxiang')
                    ? -1
                    : 8;
            },
            result: { target: 2 },
        },
    },

    // ── 临时技·狂想增益（挂在目标身上，源 max_kuangxiang<目标>-start 标记 L10135；
    //   gamerule_draw L1464：目标额定摸牌数+1（无条件，非星启限定）；
    //   由 bts_st_kuangxiang_clear 于晴歌下回合开始移除）──
    bts_st_kuangxiang_buff: {
        charlotte: true,
        mark: true,
        marktext: '狂',
        intro: {
            name: '狂想',
            content: '摸牌阶段额定摸牌数+1。',
        },
        trigger: { player: 'phaseDrawBegin2' },
        forced: true,
        content(event, trigger, player) {
            event.num += 1; // 源 gamerule_draw L1464：额定摸牌数+1
        },
        ai: { noe: true },
    },

    // ── 锁定技·巡游（源 st_xunyou = TriggerSkill Compulsory Damage/HpRecover，L10150-10163）──
    // 一名角色造成伤害或回复体力后，你获得2枚气氛标记。
    // 注：源描述含「附加护盾」为虚标（源代码 events 仅 Damage/HpRecover 无护盾），以代码为准。
    bts_st_xunyou: {
        trigger: { global: ['damageEnd', 'recoverEnd'] },
        forced: true,
        filter(event) {
            // 源 L10153-10158：Damage / HpRecover 事件（无名杀 damageEnd/recoverEnd）
            return event.num > 0;
        },
        content(event, trigger, player) {
            // 源 L10157：p:gainMark("@qifen", 2)
            player.addMark('bts_qifen', 2);
        },
        ai: { noe: true },
    },

    // ── 触发技·乐手（源 st_yueshou = TriggerSkill TargetSpecified，L10165-10174）──
    // 当你使用牌指定目标后（目标不含自己），可弃置一张【杀】，召唤晴空乐手。
    bts_st_yueshou: {
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        // 源 TargetSpecified 焦点=牌使用者（QSanguosha gamerule.cpp:635
        // thread->trigger(TargetSpecified, room, card_use.from, data)）——「你使用牌指定目标后」；
        // 无名杀以 player:'useCard' 近似（原误用 target:'useCardToTargeted' 方向反转）
        trigger: { player: 'useCard' },
        filter(event, player) {
            // 源 L10170：使用非技能牌（not isKindOf("SkillCard")）且目标不含自己
            // （not use.to:contains(player)），当前未召唤乐手
            return (
                !event.card?.isCard &&
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
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L10170：结算 cost 所选【杀】（自选数据在 event.cards）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L10171：AddPet(player, "qingkongyueshou")
            lib.bts.api.addPet(player, 'qingkongyueshou');
        },
        ai: { result: { player: 1 } },
    },

    // ── 占位技·万风（源 st_wanfeng = TriggerSkill Compulsory，L10177-10183）──
    // 源实现为空技能（events 为空、on_trigger 无操作），无名杀以永不触发的过滤占位。
    bts_st_wanfeng: {
        charlotte: true,
        forced: true,
        trigger: { player: 'damageEnd' },
        filter() {
            return false;
        },
        content() { },
        ai: { noe: true },
    },

    // ── 占位技·心跳（源 st_xintiao = TriggerSkill Compulsory，L10185-10191）──
    // 源实现为空技能，无名杀以永不触发的过滤占位；登场效果（首次回怒/二次+6气氛）
    // 已实现于 rules/utils.js addPet 登场结算（用户定夺 2026-09-02 按描述补实现）。
    bts_st_xintiao: {
        charlotte: true,
        forced: true,
        trigger: { player: 'damageEnd' },
        filter() {
            return false;
        },
        content() { },
        ai: { noe: true },
    },

    // ── 锁定技·和声（源 st_hesheng = TriggerSkill Compulsory MarkChanged/TurnOver，L10193-10224）──
    // 气氛达12时翻面（二重：翻面被防止）并移除气氛，对上个伤害你的角色造成风属性伤害；
    // 气氛耗尽时移除晴空乐手。源在 MarkChanged（气氛达12）即时触发、TurnOver 分支 return true
    // 防止翻面、只打上个伤害者（LastDamagedLink 记被伤者/键=来源/只记最近，L1275-1283）。
    bts_st_hesheng: {
        trigger: { player: 'addMark' },
        forced: true,
        filter(event, player) {
            // 源 L10200：气氛标记增加且达12、未发动过（st_hesheng 标记）、朝上（faceUp）
            return (
                event.markName === 'bts_qifen' &&
                player.countMark('bts_qifen') >= 12 &&
                !player.countMark('bts_st_hesheng_used') &&
                !player.isTurnedOver()
            );
        },
        // 源 EventAcquireSkill/LoseSkill 重置 st_hesheng 标记（L10226-10228）——
        // 无名杀以 init（忆灵形态获得本技能时）清零等效
        init(player) {
            const n = player.countMark('bts_st_hesheng_used');
            if (n > 0) player.removeMark('bts_st_hesheng_used', n);
        },
        async content(event, trigger, player) {
            player.addMark('bts_st_hesheng_used', 1);
            // 源 L10207：loseMark("@qifen", min(气氛, max(12, 气氛/2)))（ceil 与源浮点截断同值）
            const spent = Math.min(
                player.countMark('bts_qifen'),
                Math.max(12, Math.ceil(player.countMark('bts_qifen') / 2)),
            );
            player.removeMark('bts_qifen', spent);
            // 源 L10202 turnOver() + TurnOver 分支 return true 防止翻面（L10226）——
            // 净效果晴歌不翻面、仅结算二重效果，故无名杀不调 turnOver()
            // 源 L10222-10224：对 LastDamagedLink>0 者（=上个伤害你者，须存活）造成 "_wind" 风属性伤害；
            // 用引擎 damage 历史（你受到的伤害）末尾来源取上个伤害者（同风堇·走开范式）
            const last = player
                .getAllHistory('damage')
                .filter((ev) => ev.source)
                .pop();
            if (last?.source?.isAlive()) {
                const damage = last.source.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_hesheng_wind';
                lib.bts.api.setDamageNature(damage, 'wind');
                await damage;
            }
            // 源 L10214-10216：气氛耗尽时移除晴空乐手
            if (player.countMark('bts_qifen') === 0)
                await lib.bts.api.removePet(player, 'qingkongyueshou');
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_zhigengniao_qingge: '知更鸟·晴歌',
    bts_qingkongyueshou: '晴空乐手',
    bts_zhigengniao_qingge_and_qingkongyueshou: '知更鸟&晴空乐手',
    bts_st_kuangxiang: '狂想',
    bts_st_kuangxiang_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令一名其他角色回复1点${get.poptip('bts_glossary_nuqi_faq')}且于你的下个准备阶段开始前额定摸牌数+1。本回合结束时，其还会执行一个额外回合。`,
    bts_st_xunyou: '巡游',
    bts_st_xunyou_info: `锁定技，一名角色造成伤害或回复体力后，你获得2枚${get.poptip('bts_glossary_qifen_faq')}标记。（源描述含「附加护盾」为虚标，源代码无护盾事件，以代码为准）`,
    bts_st_kuangxiang_buff: '狂想增益',
    bts_st_kuangxiang_buff_info: '摸牌阶段额定摸牌数+1。',
    bts_st_yueshou: '乐手',
    bts_st_yueshou_info: '当你使用牌指定目标后，你可以弃置一张【杀】，召唤晴空乐手。',
    bts_st_wanfeng: '晚风',
    bts_st_wanfeng_info: `锁定技，当晴空乐手被移除后，此回合结束时，你执行一个额外的回合。`,
    bts_st_xintiao: '心跳',
    bts_st_xintiao_info: `锁定技，当晴空乐手登场时，若已存在晴空乐手，你获得6枚气氛标记，否则你回复1点怒气。`,
    bts_st_hesheng: '和声',
    bts_st_hesheng_info: `锁定技，当你拥有至少12枚${get.poptip('bts_glossary_qifen_faq')}标记后，翻面并立即防止之（二重），对上个对你造成伤害的角色造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}伤害，弃X枚${get.poptip('bts_glossary_qifen_faq')}标记（X为标记数的一半且至少为12），然后若你没有${get.poptip('bts_glossary_qifen_faq')}标记，移除晴空乐手。`,
    bts_qifen: '气氛',
    bts_pet_qingkongyueshou: '晴空乐手',



};

export const simpleTranslate = {
    bts_st_kuangxiang_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色回怒并额外回合`,
    bts_st_xunyou_info: `锁；全局伤害/回复后+2${get.poptip('bts_glossary_qifen_faq')}`,
    bts_st_yueshou_info: '成为非技能牌目标后可弃杀召唤乐手',
    bts_st_hesheng_info: `锁；${get.poptip('bts_glossary_qifen_faq')}≥12时翻面(防止)弃${get.poptip('bts_glossary_qifen_faq')}风伤上个伤害你者；${get.poptip('bts_glossary_qifen_faq')}耗尽时移除乐手`,
};

export const pinyins = {
    bts_zhigengniao_qingge: 'zhigengniaoqingge',
    bts_qingkongyueshou: 'qingkongyueshou',
    bts_zhigengniao_qingge_and_qingkongyueshou:
        'zhigengniaoqinggeqingkongyueshou',
};
