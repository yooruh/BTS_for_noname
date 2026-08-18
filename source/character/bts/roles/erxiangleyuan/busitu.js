// 不死途（源 animal.lua L9488-9571）—— 光伤、麻痹与婪酣追击。
// 技能：飨宴（必杀技·光伤+虚拟【杀】）、鞭哨（无属性伤害转虚数）、宿怨（光/麻痹受伤后追击）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '雷·巡猎·折足之狼'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B(get.poptip('bts_glossary_bless_busi_faq'))}把伤害染成光；麻痹或光属目标受伤时，补一记追击。`;

export const character = {
    bts_busitu: {
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_xiangyan', 'bts_st_bianshao', 'bts_st_suyuan'],
    },
};

export const skill = {
    // ── 必杀技·飨宴（源 st_xiangyan = SkillCard + ZeroCardViewAsSkill，L9489-9510）──
    // 出牌阶段，失5怒气，对一名其他角色造成1点虚数伤害，视为对其使用【杀】，然后弃置全部婪酣。
    bts_st_xiangyan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9508）：怒气≥5 才可发动
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9492）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xiangyan');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L9495：LoseAngry(player, 5)
            // 源 L9496：造成 reason 含 "_light" 的伤害（虚数属性，reason 后缀供 damageEnd 判属性）
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_xiangyan_light';
            lib.bts.api.setDamageNature(damage, 'light');
            await damage;
            // 源 L9497：ViewAsCardOnly —— 视为对目标使用一张【杀】
            await player.useCard(
                {
                    name: 'sha',
                    isCard: true,
                    storage: { bts_st_xiangyan: true },
                },
                target,
            );
            // 源 L9498：弃置全部婪酣（loseAllMarks "@lanhan"）
            player.removeMark('bts_lanhan', player.countMark('bts_lanhan'));
        },
        // 追击：其他角色因此技能死亡时，你可视为使用【杀】（源 max_xiangyan Death 触发 L9511-9524，
        // 描述 L13793「当其他角色因此技能而死亡时，你可以视为使用【杀】」；原实现漏掉此机制）
        group: ['bts_st_xiangyan_chase'],
        subSkill: {
            chase: {
                trigger: { global: 'dieAfter' },
                filter(event, player) {
                    // 源 L9511-9524：致死伤害 reason 或致死牌 skillName 含 max_xiangyan，
                    // 且致死来源=不死途（飨宴光伤 reason=bts_st_xiangyan_light / 虚拟【杀】storage=bts_st_xiangyan）
                    const reason = event.reason?.reason;
                    return (
                        event.source === player &&
                        (reason?.includes('bts_st_xiangyan') ||
                            event.reason?.card?.storage?.bts_st_xiangyan)
                    );
                },
                async cost(event, trigger, player) {
                    // 源 askForUseCard（可取消）——选目标（可取消=不追击）；追击【杀】按普通【杀】距离
                    event.result = await player
                        .chooseTarget(
                            '飨宴：是否视为使用一张【杀】？',
                            [0, 1],
                            (card, source, target) =>
                                target !== source && player.inRange(target),
                        )
                        .forResult();
                },
                async content(event, trigger, player) {
                    if (!event.targets?.length) return;
                    // 源 max_xiangyan_slash（L9526-9534）：克隆【杀】、skillName 置 max_xiangyan
                    // （storage bts_st_xiangyan 供再击杀时本追击链继续判定）
                    await player.useCard(
                        {
                            name: 'sha',
                            isCard: true,
                            storage: { bts_st_xiangyan: true },
                        },
                        event.targets[0],
                    );
                },
                ai: { result: { player: 1 } },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xiangyan')
                    ? -1
                    : 9;
            },
            result: { target: -2 },
        },
    },

    // ── 触发技·鞭哨（源 st_bianshao = TriggerSkill DamageCaused，L9539-9551）──
    // 你造成无属性伤害时，可令此伤害视为虚数属性；若目标不为虚数角色且不处于麻痹，须弃一张【杀】。
    bts_st_bianshao: {
        trigger: { source: 'damageBegin1' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L9546 条件之一：伤害无属性（GetNature(damage) == nil），且目标 ≠ 自己
            return event.player !== player && !lib.bts.api.getNature(event);
        },
        async cost(event, trigger, player) {
            // 源 L9546：目标处于麻痹或为虚数角色 → askForSkillInvoke（免费）；
            // 否则 → askForCard("Slash")（须弃【杀】）。无名杀版把选择拆为 chooseBool + 选择牌。
            const free =
                lib.bts.api.getAbnor(trigger.player, 'numb') ||
                lib.bts.api.getNature(null, trigger.player) === 'light';
            if (
                !free &&
                !player
                    .getCards('h')
                    .some((card) => get.name(card) === 'sha')
            ) {
                event.result = { bool: false }; // 无【杀】可弃 → 不能发动
                return;
            }
            const result = await player
                .chooseBool('鞭哨：是否将此伤害转为虚数属性？')
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            if (free) {
                event.result = { bool: true };
                return;
            }
            // 源 askForCard("Slash")：选择一张【杀】作为代价（结算移入 content）
            const choice = await player
                .chooseCard(
                    '鞭哨：选择一张【杀】',
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                )
                .forResult();
            if (!choice.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = { bool: true, cost_data: { slashes: choice.cards } };
        },
        async content(event, trigger, player) {
            // 源 askForCard("Slash")：结算 cost 所选【杀】作为代价（自选数据在 event.cost_data）
            if (event.cost_data?.slashes?.length)
                await player.discard(event.cost_data.slashes);
            // 源 L9547：AddNew(damage, "_light") —— 令伤害获得虚数属性（改触发事件 damageBegin1）
            lib.bts.api.setDamageNature(trigger, 'light');
        },
        ai: { noe: true },
    },

    // ── 锁定技·宿怨（源 st_suyuan = TriggerSkill Compulsory Damaged，L9553-9570）──
    // 当处于麻痹或为虚数角色的其他角色受到不为你造成的伤害后，
    // 若你的婪酣少于3枚，你获得1枚婪酣、回复1点怒气并视为对其使用【杀】。
    bts_st_suyuan: {
        trigger: { global: 'damageEnd' },
        forced: true,
        logTarget: 'player',
        filter(event, player) {
            return (
                event.player &&
                event.player !== player &&
                event.source !== player &&
                event.num > 0 &&
                (lib.bts.api.getAbnor(event.player, 'numb') ||
                    lib.bts.api.getNature(null, event.player) === 'light') &&
                player.countMark('bts_lanhan') < 3 // 源 L9560：p:getMark("@lanhan") < 3
            );
        },
        async content(event, trigger, player) {
            player.addMark('bts_lanhan', 1); // 源 L9561：p:gainMark("@lanhan")
            lib.bts.api.addAngry(player); // 源 L9562：AddAngry(p)
            // 源 L9563：ViewAsCardOnly(p, damage.to, "_st_suyuan") —— 视为对受伤者使用【杀】
            await player.useCard(
                { name: 'sha', isCard: true, storage: { bts_st_suyuan: true } },
                trigger.player,
            );
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_busitu: '不死途',
    bts_st_xiangyan: '飨宴',
    bts_st_xiangyan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点${get.poptip('bts_glossary_nature_guang_dmg_faq')}伤害，视为对其使用【杀】，然后弃置全部${get.poptip('bts_glossary_lanhan_faq')}标记。当其他角色因此技能而死亡时，你可以视为使用【杀】。`,
    bts_st_bianshao: '鞭哨',
    bts_st_bianshao_info: `当你对其他角色造成无属性伤害时，你可以令此伤害视为${get.poptip('bts_glossary_nature_guang_dmg_faq')}伤害；若其不为${get.poptip('bts_glossary_nature_guang_faq')}角色且不处于${get.poptip('bts_glossary_mabi_faq')}，你须弃置一张【杀】。`,
    bts_st_suyuan: '宿怨',
    bts_st_suyuan_info: `锁定技，当${get.poptip('bts_glossary_nature_guang_faq')}或处于${get.poptip('bts_glossary_mabi_faq')}的其他角色受到不为你造成的伤害后，若你的${get.poptip('bts_glossary_lanhan_faq')}少于3枚，你获得1枚${get.poptip('bts_glossary_lanhan_faq')}、回复1点${get.poptip('bts_glossary_nuqi_faq')}并视为对其使用【杀】。`,
    bts_lanhan: '婪酣',




};

export const simpleTranslate = {
    bts_st_xiangyan_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}光伤+虚拟杀并清${get.poptip('bts_glossary_lanhan_faq')}；以此击杀可追击`,
    bts_st_bianshao_info: '无属性伤害可转光，条件不足弃杀',
    bts_st_suyuan_info: `锁；光/${get.poptip('bts_glossary_mabi_faq')}他人受非你伤害时，${get.poptip('bts_glossary_lanhan_faq')}<3则+${get.poptip('bts_glossary_lanhan_faq')}回怒并追杀`,
};

export const pinyins = { bts_busitu: 'busitu' };
