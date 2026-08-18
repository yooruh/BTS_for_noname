// 佩拉（源 animal.lua L3649-3721）—— 压制必杀技诅咒、采集锁定回怒、秘策弃杀移除祝福护盾。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '冰·虚无·完全剖析'; // 属性·命途
export const intro =
    `${B('佩拉')}是干扰控制：${get.poptip('bts_glossary_bisha_faq')}${B('压制')}附加诅咒，${B('采集')}对异常/诅咒目标回怒，${B('秘策')}弃【杀】移除目标的${get.poptip('bts_glossary_bless_faq')}${get.poptip('bts_glossary_hudun_faq')}。` +
    `<li>对异常或诅咒目标用杀能回复${get.poptip('bts_glossary_nuqi_faq')}`;

export const character = {
    bts_ch_peila: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_yazhi', 'bts_sk_caiji', 'bts_sk_mice'],
    },
};

export const skill = {
    // ── 必杀技·压制（源 st_yazhi = SkillCard + ZeroCardViewAsSkill，L3502-3523）──
    // 出牌阶段，失3怒气并选择至少一名其他角色，这些角色各附加1层诅咒。
    bts_sk_yazhi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L3521）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L3505）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yazhi');
            lib.bts.api.loseAngry(player, 3); // 源 L3508：LoseAngry(player, 3)
            // 源 L3509-3511：AddACurse(p, player)
            for (const target of event.targets || [])
                lib.bts.api.addCurse(target, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_yazhi') ? -1 : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·采集（源 st_caiji = TriggerSkill Compulsory TargetSpecified，L3680-3695）──
    // 当你使用【杀】指定处于异常或拥有诅咒的目标后，你回复1点怒气。
    bts_sk_caiji: {
        trigger: { player: 'useCard' },
        forced: true,
        filter(event, player) {
            // 源 L3686：使用【杀】指定目标含异常或诅咒者
            return (
                event.card?.name === 'sha' &&
                event.targets?.length &&
                event.targets.some(
                    (target) =>
                        lib.bts.api.getAbnor(target) || lib.bts.api.getCurse(target),
                )
            );
        },
        async content(event, trigger, player) {
            // 源 L3687-3691：逐目标判定，每个异常/诅咒目标各 AddAngry(player)
            const n = (trigger.targets || []).filter(
                (t) => lib.bts.api.getAbnor(t) || lib.bts.api.getCurse(t),
            ).length;
            if (n) lib.bts.api.addAngry(player, n);
        },
        ai: { noe: true },
    },

    // ── 触发技·秘策（源 st_mice = TriggerSkill EventPhaseStart NotActive，L3697-3720）──
    // 当一名其他角色的回合结束后，若其拥有祝福或护盾，你可以弃置一张【杀】，移除其1层祝福或护盾。
    bts_sk_mice: {
        trigger: { global: 'phaseAfter' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L3704-3709：其他角色回合结束且拥有祝福/护盾，且手牌有【杀】可弃
            return (
                event.player !== player &&
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                Object.keys(event.player.storage || {}).some(
                    (key) =>
                        (key.startsWith('bts_bless_') || key === 'bts_shield') &&
                        event.player.countMark(key) > 0,
                )
            );
        },
        async cost(event, trigger, player) {
            // 源 L3555：askForCard(p, "Slash")
            const result = await player
                .chooseBool(
                    '秘策：是否弃置一张【杀】移除' +
                    get.translation(trigger.player) +
                    '的1层祝福/护盾？',
                )
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = { bool: true };
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, trigger, player) {
            // trigger=触发事件（phaseAfter）；trigger.player = 回合结束的角色
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const target = trigger.player;
            // 源 L607-628 RemoveBlessOrShield：收集祝福/护盾，由本角色 askForChoice 选移除哪种
            const buffs = Object.keys(target.storage || {}).filter(
                (key) =>
                    (key.startsWith('bts_bless_') || key === 'bts_shield') &&
                    target.countMark(key) > 0,
            );
            if (!buffs.length) return;
            // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
            const pick =
                buffs.length === 1
                    ? { control: buffs[0] }
                    : await player
                        .chooseControl(buffs)
                        .set('prompt', '秘策：选择移除1层祝福/护盾')
                        .set('ai', () => 0)
                        .forResult();
            if (pick.control === 'bts_shield')
                lib.bts.api.removeShield(target, 1);
            else if (pick.control)
                lib.bts.api.removeBless(
                    target,
                    pick.control.slice('bts_bless_'.length),
                    1,
                    player,
                );
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    bts_ch_peila: '佩拉',
    bts_sk_yazhi: '压制',
    bts_sk_yazhi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层诅咒。`,
    bts_sk_caiji: '采集',
    bts_sk_caiji_info: `锁定技，当你使用【杀】指定处于异常或拥有诅咒的目标后，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,
    bts_sk_mice: '秘策',
    bts_sk_mice_info: `当一名其他角色的回合结束后，若其拥有${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}，你可以弃置一张【杀】，移除其1层${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}。`,

    '$bts_sk_yazhi1': "敌方数据收集完毕",
    '$bts_sk_yazhi2': "网标记激活，接下来就是愉快的反击时间了",
    '$bts_sk_caiji1': "闭上嘴吧",
    '$bts_sk_caiji2': "还要再来一下？",
    '$bts_sk_mice1': "这样…然后这样……",
    '$bts_sk_mice2': "输入指令……",
    '~bts_ch_peila': "失算了……",
};

export const simpleTranslate = {
    bts_sk_yazhi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1诅咒`,
    bts_sk_caiji_info: `锁；用杀指定异常/诅咒目标后，+1${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_mice_info: `其他角色回合结束后若其有${get.poptip('bts_glossary_bless_faq')}/${get.poptip('bts_glossary_hudun_faq')}，可弃1杀移除1层`,
};

export const pinyins = { bts_ch_peila: 'peila' };
