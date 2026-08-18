// 雪衣（源 animal.lua L5996-6086）—— 天罚、业报和诸恶。
// 技能：天罚（必杀技·有元素则增伤+移除元素）、业报（他人弃手牌/得元素积累，9枚时暗杀）、诸恶（量子角色受伤弃杀补暗伤）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '量子·毁灭·十王司判官'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('雪衣')}专打带元素的目标，${get.poptip('bts_glossary_ebao_faq')}攒到9枚就追一刀${get.poptip('bts_glossary_nature_dark_faq')}暗杀。`;

export const character = {
    bts_xueyi: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_st_tianfa', 'bts_st_yebao', 'bts_st_zhue'],
    },
};

export const skill = {
    // ── 必杀技·天罚（源 st_tianfa = SkillCard + ZeroCardViewAsSkill，L5997-6026）──
    // 出牌阶段，失3怒气，对攻击范围内一名其他角色造成1点伤害；若其拥有元素，改为造成3点伤害并移除其元素。
    bts_st_tianfa: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L6024）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6005）：目标 ≠ 自己在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_tianfa');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L6008：LoseAngry(player, 3)
            // 源 L6009-6014：有元素则 n=3 并 RemoveNature，伤害 reason 无后缀
            const nature = lib.bts.api.getNature(null, target),
                damage = target.damage(player, nature ? 3 : 1, 'nocard');
            damage.reason = 'bts_st_tianfa';
            if (nature) lib.bts.api.removeNature(target); // 源 L6012：RemoveNature(targets[1])
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_tianfa') ? -1 : 7;
            },
            result: { target: -2 },
        },
    },

    // ── 锁定技·业报（源 st_yebao = TriggerSkill Compulsory CardsMoveOneTime/MarkChanged，L6028-6067）──
    // 其他角色弃置手牌（任意张）或获得元素后，你获得1枚业报；
    // 业报达到9枚且你曾伤害该角色时，弃10枚并视为对其使用暗【杀】。
    bts_st_yebao: {
        // 源 st_yebao（animal.lua L6028-6067）：CardsMoveOneTime 任意手牌因「弃置」（DISCARD）
        // 进入弃牌堆即触发（无空城要求，源描述「手牌被弃置后」亦一致），
        // 或 MarkChanged 其他角色获得元素（@n_ 前缀、gain>0）。
        // 无名杀映射：全局 discard 事件（仅真正的「弃置」，对应源 DISCARD reason）+ addMark。
        // 修复①：原 filter 误写 e.markname（应为 e.markName），获得元素分支永不触发；
        // 修复②：原实现用 loseAfter + countCards('h')===0（空城才触发，注释误读源），已按原版改回任意弃手牌。
        // 触发阈值以源码为准（>=9 弃10；源翻译写「至少10枚」与代码不符）。
        trigger: { global: ['discard', 'addMark'] },
        forced: true,
        filter(event, player, triggername) {
            if (event.player === player) return false;
            // 源 L6037/L6043：其他角色弃置手牌（至少1张自手牌）或获得元素（bts_n_ 标记）
            return triggername === 'discard'
                ? event.player?.isAlive() &&
                  event.cards?.some((card) => card.original === 'h')
                : String(event.markName || '').startsWith('bts_n_');
        },
        async content(event, trigger, player) {
            // 源 L6051：p:gainMark("@ebao")
            player.addMark('bts_ebao', 1);
            const target = trigger.player;
            // 源 L6052-6058：业报≥9 且曾伤害该角色 → 弃10并视为使用暗【杀】
            if (
                player.countMark('bts_ebao') >= 9 &&
                target?.isAlive() &&
                player.countMark(`bts_damage_link_${target.playerid}`)
            ) {
                player.removeMark('bts_ebao', 10); // 源 L6054：loseMark("@ebao", 10)
                // 源 L6056：ViewAsCardOnly "_st_yebao_dark" —— 暗【杀】
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { _btsNature: 'dark' },
                    },
                    target,
                );
            }
        },
        ai: { noe: true },
    },

    // ── 触发技·诸恶（源 st_zhue = TriggerSkill Damaged，L6069-6085）──
    // 量子属性角色受到伤害后，你可以弃置一张【杀】，对其造成1点量子属性伤害。
    bts_st_zhue: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L6076：受伤者为量子属性，且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                event.player &&
                event.player !== player &&
                lib.bts.api.getNature(null, event.player) === 'dark' &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6076：askForCard(p, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '诸恶：是否弃置一张【杀】对量子属性受伤角色造成1点量子属性伤害？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6078：reason 含 "_dark" 的量子属性伤害
            const damage = trigger.player.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_zhue_dark';
            lib.bts.api.setDamageNature(damage, 'dark');
            await damage;
        },
        ai: { result: { target: -1 } },
    },
};

export const translate = {
    bts_xueyi: '雪衣',
    bts_st_tianfa: '天罚',
    bts_st_tianfa_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，对攻击范围内一名其他角色造成1点伤害；若其拥有元素，改为造成3点伤害并移除其元素。`,
    bts_st_yebao: '业报',
    bts_st_yebao_info: `锁定技，其他角色弃置手牌或获得元素后，你获得1枚${get.poptip('bts_glossary_ebao_faq')}；达到9枚且你曾伤害该角色时，弃10枚并视为对其使用暗【杀】。（源翻译写「至少10枚」与代码不符，以代码为准）`,
    bts_st_zhue: '诸恶',
    bts_st_zhue_info: `${get.poptip('bts_glossary_nature_dark_faq')}角色受到伤害后，你可以弃置一张【杀】，对其造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害。`,

    '$bts_st_tianfa1': "承十王敕…",
    '$bts_st_tianfa2': "入魔，必诛！",
    '$bts_st_yebao1': "魔阴，不赦",
    '$bts_st_yebao2': "伏诛罢",
    '$bts_st_zhue1': "束手就擒！",
    '$bts_st_zhue2': "邪煞退散",
    '~bts_xueyi': "对不起，姐姐不能……",
};

export const simpleTranslate = {
    bts_st_tianfa_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}对范围内角色造成伤害，有元素则造成3伤并移除元素`,
    bts_st_yebao_info: `锁；他人弃手牌或得元素后+1${get.poptip('bts_glossary_ebao_faq')}，9枚时暗杀伤害关联目标`,
    bts_st_zhue_info: `${get.poptip('bts_glossary_nature_dark_faq')}角色受伤后可弃杀对其造成暗伤`,
};

export const pinyins = { bts_xueyi: 'xueyi' };
