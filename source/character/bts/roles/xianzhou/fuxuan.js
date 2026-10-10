// 符玄（源 animal.lua L6628-6715）—— 穷观分担与否极。
// 技能：天律（必杀技·清空否极）、穷观（弃杀标记他角色代伤）、否极（濒死时恢复至仅失1体力并得否极标记）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '量子·存护·太卜司太卜'; // 属性·命途
export const intro =
    `${B('符玄')}用${get.poptip('bts_sk_qiongguan')}替队友挨打，${get.poptip('bts_glossary_st_piji_faq')}能在濒死时把自己拉回来。`;

export const character = {
    bts_ch_fuxuan: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_tianlv', 'bts_sk_qiongguan', 'bts_sk_piji'],
    },
};

export const skill = {
    // ── 必杀技·天律（源 st_tianlv = SkillCard + ZeroCardViewAsSkill，L6629-6646）──
    // 出牌阶段，若拥有否极标记，失5怒气并移除全部否极标记。
    bts_sk_tianlv: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6644）：怒气≥5 且有否极标记
            return lib.bts.api.getAngry(player, 5) && player.countMark('bts_sk_piji') > 0;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_tianlv');
            lib.bts.api.loseAngry(player, 5); // 源 L6633：LoseAngry(player, 5)
            // 源 L6634：setPlayerMark("@st_piji", 0)
            player.removeMark('bts_sk_piji', player.countMark('bts_sk_piji'));
        },
        ai: {
            // AI 口径：怒气≥5且有否极标记（filter 同门）；收益=清空标记重新武装否极——再买一次
            // 濒死保命，血线越低越需要（源 animal.lua L6629-6646）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_tianlv')) return -1;
                if (
                    !lib.bts.api.getAngry(player, 5) ||
                    player.countMark('bts_sk_piji') === 0
                )
                    return -1;
                let value = 4; // 标记本身无被动收益：纯保命保险重置
                if (player.hp <= 2) value += 2; // 低血线：再次濒死概率高
                if (player.hp === 1) value += 1; // 濒死边缘：保险随时兑现
                return value;
            },
            result: {
                // 施动方：重置否极=多一次濒死回复至仅失1体力（保命）；血线低时更实
                player: (player) => (player.hp <= 2 ? 2 : 1),
            },
        },
    },

    // ── 触发技·穷观（源 st_qiongguan = TriggerSkill EventPhaseStart/DamageInflicted + OneCardViewAsSkill，L6648-6701）──
    // 准备阶段开始时，可弃置一张【杀】并选择任意名其他角色，本回合其受到伤害时由你承受等量伤害。
    bts_sk_qiongguan: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L6678-6680：准备阶段且可弃手牌
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6680：askForUseCard("@@st_qiongguan") —— 弃【杀】选目标
            event.result = await player
                .chooseCardTarget({
                    prompt: '穷观：弃置一张【杀】并选择任意名其他角色，代为承受其伤害',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    selectTarget: [1, Infinity],
                    // 本技为 cost 型触发技：引擎不走默认 chooseBool、无顶层 check 读取点，发动与否完全由
                    // 此处 ai1/ai2 决定（两层均以「最高分 ≤0 → 取消」，见引擎 ai/basic.js chooseCard/chooseTarget）。
                    // AI 口径：ai1=自身体力>2（扛得住代伤）才肯弃价值最低的【杀】；ai2=只选需要保命的友军
                    //（受伤/血线≤2），满血友军不给分——避免把全队伤害都吸到自己身上（源 L6648-6701）
                    ai1: (card) => (player.hp > 2 ? 6 : -1) - get.value(card),
                    ai2: (target) => {
                        const att = get.attitude(player, target);
                        if (att <= 0) return att; // 敌方/中立不给分：全员非友军→本次不发动
                        return target.isDamaged() || target.hp <= 2
                            ? att + 0.5
                            : 0;
                    },
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L6654-6656：标记记在符玄上、键含目标（"st_qiongguan<目标>-start"），
            // 于符玄下个回合开始前生效（源 L1503-1506 RoundStart 清 -start）。
            // 已修正：①标记键 bts_mk_ 前缀（原裸 qiongguan_，违反命名规范）；
            // ②删除冗余 clear 子技：-start 后缀标记由 rules/globalrules.js bts_gamerule_phase
            // 于符玄下个 phaseZhunbeiBegin 统一清除，且其 priority(1)>穷观(0) 先执行、不会误伤
            // 本回合刚添加的标记；原 clear 子技同优先级随后执行，会把新标记当场抹掉（E-03）。
            // ③动态键（含目标 playerid）运行时注册：addMark/removeMark 在 log!==false 时会 get.info(key)，
            // 未注册即告警「孩子，你的技能…」；clearSuffixMarks 的移除走同一告警路径，故注册为记录型标记。
            for (const target of event.targets) {
                const key = `bts_mk_qiongguan_${target.playerid}-start`;
                lib.skill[key] ??= { markKind: 'record' };
                lib.translate[key] ??= '穷观庇护';
                player.addMark(key, 1);
            }
        },
        group: ['bts_sk_qiongguan_transfer'],
        subSkill: {
            transfer: {
                // 源 L6682-6695：标记目标受到伤害时重定向到符玄（damage.to = p）
                audio: 'bts_sk_qiongguan',
                trigger: { global: 'damageBegin2' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player &&
                        event.player !== player &&
                        player.countMark(
                            `bts_mk_qiongguan_${event.player.playerid}-start`,
                        ) > 0 &&
                        event.num > 0 &&
                        !event._btsQiongguan
                    );
                },
                async content(event, trigger, player) {
                    trigger._btsQiongguan = true; // 防重入
                    // 源 L6690-6692：damage.to = p 并重结算（等量代伤；保留原牌，源版为转移）
                    const damage = player.damage(trigger.source, trigger.num, 'nocard');
                    damage.reason = trigger.reason || 'bts_sk_qiongguan';
                    if (trigger._btsNature) lib.bts.api.setDamageNature(damage, trigger._btsNature);
                    if (trigger.card) damage.card = trigger.card;
                    await damage;
                    trigger.cancel(); // 源 L6693：return true 阻止原伤害
                },
            },
        },
        // 触发技（cost 型）：发动决策在 cost 内联 AI；result 供跨技能估值查询（弃1杀换友军整轮代伤）
        ai: { result: { player: 1 } },
    },

};

export const marks = {
    // 否极：觉醒标记 + 真实触发逻辑（源 st_piji = TriggerSkill Compulsory EnterDying，L6703-6714）。
    // 每局限一次，当你进入濒死状态且已失去至少2点体力时，获得1枚否极标记并将体力回复至仅失去1点。
    bts_sk_piji: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_st_piji_faq',
        trigger: { player: 'dying' },
        forced: true,
        filter(event, player) {
            // 源 L6708：无否极标记且已损失体力>1
            return !player.countMark('bts_sk_piji') && player.maxHp - player.hp > 1;
        },
        async content(event, trigger, player) {
            // 源 L6710：addPlayerMark("@st_piji")
            player.addMark('bts_sk_piji', 1);
            // 源 L6711：recover(getLostHp() - 1) —— 回复至仅失1体力
            const amount = Math.max(0, player.maxHp - player.hp - 1);
            if (amount) await player.recover(player, amount);
        },
    },
};

export const translate = {
    bts_ch_fuxuan: '符玄',
    bts_sk_tianlv: '天律',
    bts_sk_tianlv_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，若你拥有${get.poptip('bts_glossary_st_piji_faq')}标记，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并移除全部${get.poptip('bts_glossary_st_piji_faq')}标记。`,
    bts_sk_qiongguan: '穷观',
    // 源描述 L12020：「这些角色于你的下个回合开始前受到伤害时，伤害转移给你。」
    // 原写「本回合」与实际窗口（-start 标记于下个准备阶段清理）不符，改按源口径。
    bts_sk_qiongguan_info:
        '准备阶段开始时，你可以弃置一张【杀】并选择任意名其他角色，这些角色于你的下个回合开始前受到伤害时，由你承受等量伤害。',
    bts_sk_piji: '否极',
    bts_sk_piji_info: `锁定技，每局限一次，当你进入濒死状态且已失去至少2点体力时，获得1枚${get.poptip('bts_glossary_st_piji_faq')}标记并将体力回复至仅失去1点体力。`,

    '$bts_sk_tianlv1': "世间万物自有其法……",
    '$bts_sk_tianlv2': "但换斗移星，谋事，在人！",
    '$bts_sk_qiongguan1': "相与为一",
    '$bts_sk_qiongguan2': "上下象易",
    '$bts_sk_piji1': "阴阳变转，生生不绝",
    '$bts_sk_piji2': "颠扑不破",
    '~bts_ch_fuxuan': "事已前定…么……",
};

export const simpleTranslate = {
    bts_sk_tianlv_info: `${get.poptip('bts_glossary_bisha_faq')}；有${get.poptip('bts_glossary_st_piji_faq')}时失5${get.poptip('bts_glossary_nuqi_faq')}并清空${get.poptip('bts_glossary_st_piji_faq')}`,
    bts_sk_qiongguan_info: '准备阶段可弃杀标记其他角色，其于你的下个回合开始前受伤害时由你承伤',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_st_piji_faq',
        name: '|否极|',
        info: `符玄专属：${get.poptip('bts_sk_piji')}濒死时+1并回复；${get.poptip('bts_sk_tianlv')}发动时消耗全部。`,
    },
];
