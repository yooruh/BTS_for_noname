// 彦卿（源 animal.lua L6288-6349）—— 护盾暴击、冻结追击与三尺。
// 技能：快雨（必杀技·暴击伤害，有护盾则额外致命）、呼剑（护盾暴击致命+杀追击转冻结+免疫他人黑杀）、三尺（出牌结束弃杀+护盾）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '冰·巡猎·云骑骁卫'; // 属性·命途
export const intro =
    `${B('彦卿')}靠${get.poptip('bts_glossary_hudun_faq')}打架：${get.poptip('bts_sk_kuaiyu')}${get.poptip('bts_glossary_bless_fatal_faq')}、${get.poptip('bts_sk_hujian')}${get.poptip('bts_glossary_abnormal_freeze_faq')}追击、${get.poptip('bts_sk_sanchi')}续盾。`;

export const character = {
    bts_ch_yanqing: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_kuaiyu', 'bts_sk_hujian', 'bts_sk_sanchi'],
    },
};

export const skill = {
    // ── 必杀技·快雨（源 st_kuaiyu = SkillCard + ZeroCardViewAsSkill，L6289-6312）──
    // 出牌阶段，失4怒气，对一名其他角色造成1点暴击伤害；若你拥有护盾，此伤害额外视为致命伤害。
    bts_sk_kuaiyu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_kuaiyu');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 4); // 源 L6295：LoseAngry(player, 4)
            // 源 L6296-6300：reason 含 "_critical"，有护盾追加 "_fatal"
            const damage = target.damage(player, 1, 'nocard');
            damage.reason =
                'bts_sk_kuaiyu_critical' + (lib.bts.api.getShield(player) ? '_fatal' : '');
            await damage;
        },
        ai: {
            // AI 口径：4怒大招=1点暴击伤（命中回1怒）+有护盾追加致命（目标不回怒）；
            // 护盾在手时升档（源 AI max_kuaiyu：CanMaxSkillDamage(4)，StarRail-ai L2359-2368）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_kuaiyu'))
                    return -1;
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0,
                    )
                )
                    return -1; // 无敌不发动
                return lib.bts.api.getShield(player) ? 7 : 6;
            },
            result: {
                // 1伤(≈1.5)+暴击回怒(≈0.5)；有护盾致命再压其怒气回复
                target: (player, target) =>
                    lib.bts.api.getShield(player) ? -2.5 : -2,
            },
        },
    },

    // ── 锁定技·呼剑（源 st_hujian = TriggerSkill Compulsory DamageCaused/Damage，L6314-6336）──
    // 有护盾时：你不是其他角色使用黑色【杀】的合法目标；你使用【杀】造成的伤害视为暴击+致命，
    // 伤害后视为对目标使用【杀】，此【杀】造成伤害时改为令其附加1层冻结。
    bts_sk_hujian: {
        mod: {
            targetEnabled(card, player, target) {
                // 无名杀补充（适配）：有护盾时免疫其他角色黑色【杀】（源版经 QSanguosha 目标判定）。
                if (
                    target.hasSkill('bts_sk_hujian') &&
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
        async content(event, trigger, player) {
            // 源 L6323-6324：AddNew "_critical" + "_fatal"
            lib.bts.api.markDamage(trigger, '_critical');
            lib.bts.api.markDamage(trigger, '_fatal');
        },
        // 子技能须经 group 挂载（引擎 expandSkills 只展开 group、不自动展开 subSkill；freeze 未挂载
        // 则追击杀不会改附加冻结；参照黄泉·残梦 bts_sk_canmeng_finisher 范式）
        group: ['bts_sk_hujian_follow', 'bts_sk_hujian_freeze'],
        subSkill: {
            follow: {
                // 源 L6331-6333：Damage 后 ViewAsCardOnly —— 视为对受伤者使用【杀】
                audio: 'bts_sk_hujian',
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
                            storage: { bts_sk_hujian: true },
                        },
                        target,
                    );
                    await use;
                },
            },
            freeze: {
                // 源 L6326-6328：呼剑追击【杀】造成伤害时改为附加冻结（呼剑为锁定技、转换无询问）→ forced。
                audio: 'bts_sk_hujian',
                trigger: { source: 'damageBegin1' },
                forced: true,
                filter(event) {
                    return !!event.card?.storage?.bts_sk_hujian;
                },
                async content(event, trigger) {
                    trigger.cancel();
                    lib.bts.api.addAbnormal(trigger.player, 'freeze', 1, trigger.source);
                },
            },
        },
    },

    // ── 锁定技·三尺（源 st_sanchi = TriggerSkill EventPhaseEnd Play，L6338-6348）──
    // 出牌阶段结束时，可弃置一张【杀】，获得1点护盾。
    bts_sk_sanchi: {
        trigger: { player: 'phaseUseEnd' },
        filter(event, player) {
            // 源 L6343：出牌阶段结束且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6343：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）。
            // 发动 AI 在本内联选择（cost 型触发技引擎不询顶层 check）：1护盾≈1点减伤且驱动呼剑
            //（暴击致命/黑杀免疫）；已有护盾降档、独牌不留空手；弃最低值【杀】。
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '三尺：是否弃置一张【杀】获得1点护盾？',
                    (card) => {
                        if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                        if (player.countCards('h') <= 1) return -1; // 独牌不留空手
                        let v = lib.bts.api.getShield(player) ? 4 : 6;
                        if (player.isDamaged()) v += 1; // 血线低时护盾更急
                        return v - get.value(card);
                    },
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
    bts_ch_yanqing: '彦卿',
    bts_sk_kuaiyu: '快雨',
    bts_sk_kuaiyu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，对一名其他角色造成1点${get.poptip('bts_glossary_bless_critical_faq')}伤害；若你拥有${get.poptip('bts_glossary_hudun_faq')}，此伤害额外视为${get.poptip('bts_glossary_bless_fatal_faq')}伤害。`,
    bts_sk_hujian: '呼剑',
    bts_sk_hujian_info: `锁定技，若你拥有${get.poptip('bts_glossary_hudun_faq')}，你不是其他角色使用黑色【杀】的合法目标；你使用【杀】造成的伤害视为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}伤害，伤害后视为对目标使用【杀】，此【杀】造成伤害时改为令其附加1层${get.poptip('bts_glossary_abnormal_freeze_faq')}。`,
    bts_sk_sanchi: '三尺',
    bts_sk_sanchi_info: `出牌阶段结束时，你可以弃置一张【杀】，获得1点${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_sk_kuaiyu1': "试探就到此为止了",
    '$bts_sk_kuaiyu2': "万剑，天来！",
    '$bts_sk_hujian1': "略施小计",
    '$bts_sk_hujian2': "剑形如水，不可久驻啊",
    '$bts_sk_sanchi1': "剑，如燕跃",
    '$bts_sk_sanchi2': "剑，随我心",
    '~bts_ch_yanqing': "辜负了…手中三尺……",
};

export const simpleTranslate = {
    bts_sk_kuaiyu_info: `${get.poptip('bts_glossary_bisha_faq')}；失4${get.poptip('bts_glossary_nuqi_faq')}对1名其他角色造成${get.poptip('bts_glossary_bless_critical_faq')}伤害，有${get.poptip('bts_glossary_hudun_faq')}时额外${get.poptip('bts_glossary_bless_fatal_faq')}`,
    bts_sk_hujian_info: `锁；有${get.poptip('bts_glossary_hudun_faq')}时免疫他人黑杀，自己的杀为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}并${get.poptip('bts_glossary_abnormal_freeze_faq')}追击`,
    bts_sk_sanchi_info: `出牌阶段结束可弃杀+1${get.poptip('bts_glossary_hudun_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
