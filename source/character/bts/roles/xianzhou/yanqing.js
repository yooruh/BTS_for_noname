// 彦卿（源 animal.lua L6288-6349）—— 护盾暴击、冻结追击与三尺。
// 技能：快雨（必杀技·暴击伤害，有护盾则额外致命）、呼剑（护盾暴击致命+杀追击转冻结+免疫他人黑杀）、三尺（出牌结束弃杀+护盾）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '冰·巡猎·云骑骁卫'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('彦卿')}靠${get.poptip('bts_glossary_hudun_faq')}打架：快雨${get.poptip('bts_glossary_bless_fatal_faq')}、呼剑${get.poptip('bts_glossary_abnormal_freeze_faq')}追击、三尺续盾。`;

export const character = {
    bts_yanqing: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_kuaiyu', 'bts_st_hujian', 'bts_st_sanchi'],
    },
};

export const skill = {
    // ── 必杀技·快雨（源 st_kuaiyu = SkillCard + ZeroCardViewAsSkill，L6289-6312）──
    // 出牌阶段，失4怒气，对一名其他角色造成1点暴击伤害；若你拥有护盾，此伤害额外视为致命伤害。
    bts_st_kuaiyu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6310）：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6292）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_kuaiyu');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 4); // 源 L6295：LoseAngry(player, 4)
            // 源 L6296-6300：reason 含 "_critical"，有护盾追加 "_fatal"
            const damage = target.damage(player, 1, 'nocard');
            damage.reason =
                'bts_st_kuaiyu_critical' + (lib.bts.api.getShield(player) ? '_fatal' : '');
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_kuaiyu') ? -1 : 7;
            },
            result: { target: -2 },
        },
    },

    // ── 锁定技·呼剑（源 st_hujian = TriggerSkill Compulsory DamageCaused/Damage，L6314-6336）──
    // 若你拥有护盾，你不是其他角色使用黑色【杀】的合法目标；
    // 你使用【杀】造成的伤害视为暴击+致命伤害，伤害后视为对目标使用【杀】，
    // 此【杀】造成伤害时改为令其附加1层冻结。
    bts_st_hujian: {
        mod: {
            targetEnabled(card, player, target) {
                // 无名杀补充：有护盾时免疫其他角色黑色【杀】（源版经 QSanguosha 目标判定，
                // 迁移记录注明为适配补充）
                if (
                    target.hasSkill('bts_st_hujian') &&
                    lib.bts.api.getShield(target) &&
                    card.name === 'sha' &&
                    get.color(card, player) === 'black'
                )
                    return false;
            },
        },
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            // 源 L6321：使用【杀】造成伤害且你有护盾
            return lib.bts.api.getShield(player) && event.card?.name === 'sha';
        },
        content(event, trigger, player) {
            // 源 L6323-6324：AddNew "_critical" + "_fatal"
            lib.bts.api.markDamage(trigger, '_critical');
            lib.bts.api.markDamage(trigger, '_fatal');
        },
        // 子技能经 group 挂载（引擎 expandSkills 只展开 group、不自动展开 subSkill；
        // freeze 未挂载则追击杀不会改附加冻结 —— 已修正，参照黄泉·残梦 bts_st_canmeng_finisher 既有范式）
        group: ['bts_st_hujian_follow', 'bts_st_hujian_freeze'],
        subSkill: {
            follow: {
                // 源 L6331-6333：Damage 后 ViewAsCardOnly —— 视为对受伤者使用【杀】
                trigger: { source: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        lib.bts.api.getShield(player) &&
                        event.player?.isAlive() &&
                        event.source === player
                    );
                },
                async content(event, trigger, player) {
                    const target = trigger.player;
                    const use = player.useCard(
                        {
                            name: 'sha',
                            isCard: true,
                            storage: { bts_st_hujian: true },
                        },
                        target,
                    );
                    await use;
                },
                ai: { noe: true },
            },
            freeze: {
                // 源 L6326-6328：呼剑追击【杀】造成伤害时改为附加冻结
                trigger: { source: 'damageBegin1' },
                filter(event) {
                    return !!event.card?.storage?.bts_st_hujian;
                },
                content(event, trigger) {
                    trigger.cancel();
                    lib.bts.api.addAbnormal(trigger.player, 'freeze', 1, trigger.source);
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 锁定技·三尺（源 st_sanchi = TriggerSkill EventPhaseEnd Play，L6338-6348）──
    // 出牌阶段结束时，可弃置一张【杀】，获得1点护盾。
    bts_st_sanchi: {
        trigger: { player: 'phaseUseEnd' },
        filter(event, player) {
            // 源 L6343：出牌阶段结束且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6343：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '三尺：是否弃置一张【杀】获得1点护盾？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6345：AddShield(player)
            lib.bts.api.addShield(player, 1, player);
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_yanqing: '彦卿',
    bts_st_kuaiyu: '快雨',
    bts_st_kuaiyu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点${get.poptip('bts_glossary_bless_critical_faq')}伤害；若你拥有${get.poptip('bts_glossary_hudun_faq')}，此伤害额外视为${get.poptip('bts_glossary_bless_fatal_faq')}伤害。`,
    bts_st_hujian: '呼剑',
    bts_st_hujian_info: `锁定技，若你拥有${get.poptip('bts_glossary_hudun_faq')}，你不是其他角色使用黑色【杀】的合法目标；你使用【杀】造成的伤害视为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}伤害，伤害后视为对目标使用【杀】，此【杀】造成伤害时改为令其附加1层${get.poptip('bts_glossary_abnormal_freeze_faq')}。`,
    bts_st_sanchi: '三尺',
    bts_st_sanchi_info: `出牌阶段结束时，你可以弃置一张【杀】，获得1点${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_st_kuaiyu1': "试探就到此为止了",
    '$bts_st_kuaiyu2': "万剑，天来！",
    '$bts_st_hujian1': "略施小计",
    '$bts_st_hujian2': "剑形如水，不可久驻啊",
    '$bts_st_sanchi1': "剑，如燕跃",
    '$bts_st_sanchi2': "剑，随我心",
    '~bts_yanqing': "辜负了…手中三尺……",
};

export const simpleTranslate = {
    bts_st_kuaiyu_info: `${get.poptip('bts_glossary_bisha_faq')}；失4${get.poptip('bts_glossary_nuqi_faq')}对1名其他角色造成${get.poptip('bts_glossary_bless_critical_faq')}伤害，有${get.poptip('bts_glossary_hudun_faq')}时额外${get.poptip('bts_glossary_bless_fatal_faq')}`,
    bts_st_hujian_info: `锁；有${get.poptip('bts_glossary_hudun_faq')}时免疫他人黑杀，自己的杀为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}并${get.poptip('bts_glossary_abnormal_freeze_faq')}追击`,
    bts_st_sanchi_info: `出牌阶段结束可弃杀+1${get.poptip('bts_glossary_hudun_faq')}`,
};

export const pinyins = { bts_yanqing: 'yanqing' };
