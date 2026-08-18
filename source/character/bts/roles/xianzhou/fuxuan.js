// 符玄（源 animal.lua L6628-6715）—— 穷观分担与否极。
// 技能：天律（必杀技·清空否极）、穷观（弃杀标记他角色代伤）、否极（濒死时恢复至仅失1体力并得否极标记）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '量子·存护·太卜司太卜'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('符玄')}用穷观替队友挨打，${get.poptip('bts_glossary_st_piji_faq')}能在濒死时把自己拉回来。`;

export const character = {
    bts_fuxuan: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_tianlv', 'bts_st_qiongguan', 'bts_st_piji'],
    },
};

export const skill = {
    // ── 必杀技·天律（源 st_tianlv = SkillCard + ZeroCardViewAsSkill，L6629-6646）──
    // 出牌阶段，若拥有否极标记，失5怒气并移除全部否极标记。
    bts_st_tianlv: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6644）：怒气≥5 且有否极标记
            return lib.bts.api.getAngry(player, 5) && player.countMark('bts_st_piji') > 0;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianlv');
            lib.bts.api.loseAngry(player, 5); // 源 L6633：LoseAngry(player, 5)
            // 源 L6634：setPlayerMark("@st_piji", 0)
            player.removeMark('bts_st_piji', player.countMark('bts_st_piji'));
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianlv') ? -1 : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 触发技·穷观（源 st_qiongguan = TriggerSkill EventPhaseStart/DamageInflicted + OneCardViewAsSkill，L6648-6701）──
    // 准备阶段开始时，可弃置一张【杀】并选择任意名其他角色，本回合其受到伤害时由你承受等量伤害。
    bts_st_qiongguan: {
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
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L6654-6656：标记记在符玄上、键含目标（"st_qiongguan<目标>-start"），
            // 于符玄下个回合开始前生效（RoundStart 清 -start，源 L1503-1506）。
            // 已修正：①标记键 bts_st_ 前缀（原裸 qiongguan_，违反命名规范）；
            // ②原实现从不清理→永久代伤，现补 clear 于符玄下回合开始清除。
            for (const target of event.targets)
                player.addMark(`bts_st_qiongguan_${target.playerid}-start`, 1);
        },
        group: ['bts_st_qiongguan_transfer', 'bts_st_qiongguan_clear'],
        subSkill: {
            clear: {
                // 源 L1503-1506：符玄下个回合 RoundStart 清自身 "-start" 标记（"于你的下个回合开始前"）。
                // 无名杀以 phaseZhunbeiBegin 近似 RoundStart（同知更鸟·迭奏 clear 范式）。
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return Object.keys(player.storage).some(
                        (key) =>
                            key.startsWith('bts_st_qiongguan_') &&
                            key.endsWith('-start') &&
                            player.countMark(key) > 0,
                    );
                },
                content(event, trigger, player) {
                    for (const key of Object.keys(player.storage)) {
                        if (
                            key.startsWith('bts_st_qiongguan_') &&
                            key.endsWith('-start')
                        )
                            player.removeMark(key, player.countMark(key));
                    }
                },
                ai: { noe: true },
            },
            transfer: {
                // 源 L6682-6695：标记目标受到伤害时重定向到符玄（damage.to = p）
                trigger: { global: 'damageBegin2' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player &&
                        event.player !== player &&
                        player.countMark(
                            `bts_st_qiongguan_${event.player.playerid}-start`,
                        ) > 0 &&
                        event.num > 0 &&
                        !event._btsQiongguan
                    );
                },
                async content(event, trigger, player) {
                    trigger._btsQiongguan = true; // 防重入
                    // 源 L6690-6692：damage.to = p 并重结算（等量代伤；保留原牌，源版为转移）
                    const damage = player.damage(trigger.source, trigger.num, 'nocard');
                    damage.reason = trigger.reason || 'bts_st_qiongguan';
                    if (trigger._btsNature) lib.bts.api.setDamageNature(damage, trigger._btsNature);
                    if (trigger.card) damage.card = trigger.card;
                    await damage;
                    trigger.cancel(); // 源 L6693：return true 阻止原伤害
                },
                ai: { noe: true },
            },
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·否极（源 st_piji = TriggerSkill Compulsory EnterDying，L6703-6714）──
    // 每局限一次，当你进入濒死状态且已失去至少2点体力时，获得1枚否极标记并将体力回复至仅失去1点。
    bts_st_piji: {
        trigger: { player: 'dying' },
        forced: true,
        filter(event, player) {
            // 源 L6708：无否极标记且已损失体力>1
            return !player.countMark('bts_st_piji') && player.maxHp - player.hp > 1;
        },
        async content(event, trigger, player) {
            // 源 L6710：addPlayerMark("@st_piji")
            player.addMark('bts_st_piji', 1);
            // 源 L6711：recover(getLostHp() - 1) —— 回复至仅失1体力
            const amount = Math.max(0, player.maxHp - player.hp - 1);
            if (amount) await player.recover(player, amount);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_fuxuan: '符玄',
    bts_st_tianlv: '天律',
    bts_st_tianlv_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，若你拥有${get.poptip('bts_glossary_st_piji_faq')}标记，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并移除全部${get.poptip('bts_glossary_st_piji_faq')}标记。`,
    bts_st_qiongguan: '穷观',
    bts_st_qiongguan_info:
        '准备阶段开始时，你可以弃置一张【杀】并选择任意名其他角色，本回合其受到伤害时由你承受等量伤害。',
    bts_st_piji: '否极',
    bts_st_piji_info: `锁定技，每局限一次，当你进入濒死状态且已失去至少2点体力时，获得1枚${get.poptip('bts_glossary_st_piji_faq')}标记并将体力回复至仅失去1点体力。`,

    '$bts_st_tianlv1': "世间万物自有其法……",
    '$bts_st_tianlv2': "但换斗移星，谋事，在人！",
    '$bts_st_qiongguan1': "相与为一",
    '$bts_st_qiongguan2': "上下象易",
    '$bts_st_piji1': "阴阳变转，生生不绝",
    '$bts_st_piji2': "颠扑不破",
    '~bts_fuxuan': "事已前定…么……",
};

export const simpleTranslate = {
    bts_st_tianlv_info: `${get.poptip('bts_glossary_bisha_faq')}；有${get.poptip('bts_glossary_st_piji_faq')}时失5${get.poptip('bts_glossary_nuqi_faq')}并清空${get.poptip('bts_glossary_st_piji_faq')}`,
    bts_st_qiongguan_info: '准备阶段可弃杀标记其他角色，本回合代其承伤',
    bts_st_piji_info: `锁；每局一次濒死时恢复至仅失1体力并得${get.poptip('bts_glossary_st_piji_faq')}`,
};

export const pinyins = { bts_fuxuan: 'fuxuan' };
