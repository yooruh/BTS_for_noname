// 景元（源 animal.lua L6350-6441）—— 神君祝福与斩勘追击。
// 技能：吾身（必杀技·神君祝福+光伤）、斩勘（觉醒·攻击范围覆盖全场后+怒气+神君）、震曜（伤害后弃杀+神君）、
//       神君（出牌结束≥5神君连发光杀）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '雷·智识·神策将军'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('景元')}靠${get.poptip('bts_glossary_bless_shenjun_faq')}越叠越能打；${get.poptip('bts_glossary_st_zhankan_faq')}觉醒后攻击范围罩得住全场，出牌阶段把${get.poptip('bts_glossary_bless_shenjun_faq')}【杀】连着拍到伤害关联的角色身上。`;

export const character = {
    bts_jingyuan: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_wushen', 'bts_st_zhankan', 'bts_st_zhenyao'],
    },
};

export const skill = {
    // ── 必杀技·吾身（源 st_wushen = SkillCard + ZeroCardViewAsSkill，L6351-6375）──
    // 出牌阶段，失5怒气，获得3层神君祝福，并对至少一名攻击范围内的其他角色各造成1点虚数通常伤害
    // （星启时无距离限制）。
    bts_st_wushen: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6373）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 L6360：目标在攻击范围内或星启
            return target !== player && (player.inRange(target) || lib.bts.api.god(player));
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_wushen');
            lib.bts.api.loseAngry(player, 5); // 源 L6357：LoseAngry(player, 5)
            // 源 L6358：AddBless(player, "@bless_shenjun", 3)
            await lib.bts.api.addBless(player, 'shenjun', 3, player);
            for (const target of event.targets) {
                // 源 L6361：reason 含 "_light_common"（虚数属性 + 通常伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_wushen_common_light';
                lib.bts.api.setDamageNature(damage, 'light');
                await damage;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_wushen') ? -1 : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 觉醒技·斩勘（源 st_zhankan = TriggerSkill Wake MarkChanged/CardFinished/Death，L6377-6399）──
    // 当你的攻击范围覆盖所有其他角色后，你获得3点怒气并获得神君。
    bts_st_zhankan: {
        trigger: { global: ['useCardAfter', 'dieAfter'] },
        forced: true,
        filter(event, player) {
            // 源 L6384-6389：所有其他角色都在你攻击范围内，且未觉醒
            return (
                !player.countMark('bts_st_zhankan') &&
                game.filterPlayer((target) => target !== player).every((target) => player.inRange(target))
            );
        },
        async content(event, trigger, player) {
            // 源 L6391-6394：+怒气 + acquireSkill("st_shenjun")
            player.addMark('bts_st_zhankan', 1);
            lib.bts.api.addAngry(player, 3); // 源 L6393：AddAngry(p, 3)
            await player.addSkill('bts_st_shenjun'); // 源 L6394：acquireSkill
        },
        ai: { noe: true },
    },

    // ── 触发技·震曜（源 st_zhenyao = TriggerSkill Damage，L6401-6410）──
    // 造成伤害后，可弃置一张【杀】，获得2层神君祝福。
    bts_st_zhenyao: {
        // 源 st_zhenyao events={sgs.Damage}，Damage 在太阳神以 damage.from（伤害来源）触发，
        // 描述"造成伤害后" ⇒ 应 source: 造成侧，player: 会误在受伤时触发。
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            // 源 L6405：造成伤害且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6405：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '震曜：是否弃置一张【杀】获得2层神君祝福？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6407：AddBless(player, "@bless_shenjun", 2)
            await lib.bts.api.addBless(player, 'shenjun', 2, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·神君（源 st_shenjun = TriggerSkill EventPhaseEnd Play，L6412-6439）──
    // 出牌阶段结束时，若你拥有至少5层神君祝福，可以移除5层，对"上一个受到你伤害的角色"用
    // 第一张光【杀】，再随机对"本回合内受到你伤害"的其他角色至多3次光【杀】。
    bts_st_shenjun: {
        charlotte: true,
        trigger: { player: 'phaseUseEnd' },
        // 源 L6418：askForSkillInvoke（可选，描述"你可以"）——用户定夺「神君可选」，
        // 原 forced:true 强制扣 5 层会把想留作攻击范围/手牌上限 buff 的祝福强行打掉。
        filter(event, player) {
            // 源 L6416：出牌阶段结束且神君祝福≥5
            return lib.bts.api.getBless(player, 'shenjun', 5);
        },
        async content(event, trigger, player) {
            // 源 L6418-6420：第一张神君【杀】指向"上一个受到由你造成的伤害的角色"
            // （LastDamageLink，L1266-1269 每次伤害重置、只记最近一次目标）。
            // 已修正：原用 sourceDamage 全历史的第一个（游戏顺序），应为最近一次。
            const allDamage = player
                .getAllHistory('sourceDamage')
                .filter((evt) => evt.num > 0 && !!evt.player);
            const last = allDamage.at(-1)?.player;
            if (!last || last === player || !last.isAlive()) return;
            // 源 L6419：RemoveBless(@bless_shenjun, 5)
            await lib.bts.api.removeBless(player, 'shenjun', 5, player);
            // 源 L6420：对上一个受伤目标使用神君【杀】（源直接 ViewAsCardOnly，无距离校验）
            await player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'light' } },
                last,
            );
            // 源 L6421-6432：再随机对"本回合内受到过你伤害"的其他角色（DamageLink-clear，
            // -clear 标记回合结束清理 L1603）发动至多3次神君【杀】；源还要求可【杀】距离判定
            // （canSlash L6424）。已修正：原用全游戏伤害关联（窗口过宽）。
            const thisTurn = player
                .getHistory('sourceDamage')
                .map((evt) => evt.player)
                .filter(
                    (target) =>
                        target &&
                        target.isAlive() &&
                        target !== player &&
                        player.inRange(target),
                );
            for (let i = 0; i < 3 && thisTurn.length; i++) {
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { _btsNature: 'light' },
                    },
                    thisTurn.randomGet(),
                );
            }
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_jingyuan: '景元',
    bts_st_wushen: '吾身',
    bts_st_wushen_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得3层${get.poptip('bts_glossary_bless_shenjun_faq')}并对至少一名攻击范围内的其他角色各造成1点${get.poptip('bts_glossary_nature_guang_dmg_faq')}通常伤害（${get.poptip('bts_glossary_xingqi_faq')}时无距离限制）。`,
    bts_st_zhankan: '斩勘',
    bts_st_zhankan_info: `觉醒技，当你的攻击范围覆盖所有其他角色后，你获得3点${get.poptip('bts_glossary_nuqi_faq')}并获得${get.poptip('bts_glossary_bless_shenjun_faq')}。`,
    bts_st_zhenyao: '震曜',
    bts_st_zhenyao_info: `造成伤害后，你可以弃置一张【杀】，获得2层${get.poptip('bts_glossary_bless_shenjun_faq')}。`,
    bts_st_shenjun: '神君',
    bts_st_shenjun_info: `出牌阶段结束时，若你拥有至少5层${get.poptip('bts_glossary_bless_shenjun_faq')}，你可以移除5层，视为对上一个受到由你造成的伤害的角色使用【杀】，然后三次视为对受到过由你造成的伤害的随机其他角色使用【杀】。`,

    '$bts_st_wushen1': "该出奇兵了",
    '$bts_st_wushen2': "煌煌威灵，遵吾敕命。斩无赦！",
    '$bts_st_zhankan1': "随我冲阵",
    '$bts_st_zhankan2': "时不我待",
    '$bts_st_zhenyao1': "兵戈，无情！",
    '$bts_st_zhenyao2': "雷霆，在此！",
    '$bts_st_shenjun1': "急如律令",
    '$bts_st_shenjun2': "哼，破绽百出",
    '~bts_jingyuan': "久疏战阵了…",
};

export const simpleTranslate = {
    bts_st_wushen_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_shenjun_faq')}，给范围内至少1名其他角色各来一下${get.poptip('bts_glossary_nature_guang_dmg_faq')}通常伤害`,
    bts_st_zhankan_info: `觉醒；攻击范围够到所有人后+3${get.poptip('bts_glossary_nuqi_faq')}并拿${get.poptip('bts_glossary_bless_shenjun_faq')}`,
    bts_st_zhenyao_info: `伤害后可弃杀+2${get.poptip('bts_glossary_bless_shenjun_faq')}`,
    bts_st_shenjun_info: `出牌结束时${get.poptip('bts_glossary_bless_shenjun_faq')}≥5可扣5层：先对上一个被你伤过的角色用光杀，再随机对本回合伤过的角色至多3次`,
};

export const pinyins = { bts_jingyuan: 'jingyuan' };
