// 瓦尔特（源 animal.lua L2117-2222）—— 拟洞必杀技令目标跳过回合、扭曲强弃牌、断界拼点翻面+仪式摸牌。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '虚数·虚无·名的传承'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('瓦尔特')}是控制型：${get.poptip('bts_glossary_bisha_faq')}${B('拟洞')}令一名角色跳过下个回合，你回复${get.poptip('bts_glossary_nuqi_faq')}，${B('扭曲')}在造成伤害后强制对方弃牌，${B('断界')}拼点翻面并叠仪式摸牌。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}时拟洞附加「仪式瞬发」，令下次断界直接摸牌`;

export const character = {
    bts_welt: {
        sex: 'male',
        group: 'xingqionglieche',
        hp: 4,
        skills: ['bts_st_nidong', 'bts_st_niuqu', 'bts_st_duanjie'],
    },
};

export const skill = {
    // ── 必杀技·拟洞（源 st_nidong = ZeroCardViewAsSkill，L2118-2132）──
    bts_st_nidong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_nidong');
            const target = event.targets[0];
            if (!target) return;
            lib.bts.api.loseAngry(player, 4); // 源 L2122
            target.addMark('bts_skip_turn', 1); // 源 L2123：跳过下个回合（由 resolver 结算）
            player.addMark('bts_st_skill-clear', 1); // 源 gamerule_ex L1016：本回合发动过必杀技（st_niuqu 用）
            lib.bts.api.addAngry(player, 1); // 源 L2124
            if (lib.bts.api.god(player)) player.addMark('bts_skill_moment', 1); // 源 L2126：仪式瞬发
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_nidong')
                    ? -1
                    : 6;
            },
            threaten: 2,
            result: { player: 1, target: -2 },
        },
    },

    // ── 锁定技·扭曲（源 st_niuqu = TriggerSkill Compulsory，L2133-2151）──
    bts_st_niuqu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        trigger: { source: 'damageEnd' }, // 源 events={sgs.Damage}，瓦尔特为伤害来源
        forced: true,
        logTarget: 'player',
        filter(event, player) {
            if (event.player === player) return false; // 仅对其他角色
            if (event.player.countCards('h') === 0) return false; // 目标非空手（源 isKongcheng）
            // 你与其武将牌朝向不同，或你于此阶段内发动过必杀技（st_skill-clear）
            return (
                player.isTurnedOver() !== event.player.isTurnedOver() ||
                player.countMark('bts_st_skill-clear') > 0
            );
        },
        logTarget: 'player',
        async content(event, trigger, player) {
            await trigger.player.chooseToDiscard(
                '扭曲：弃置一张手牌',
                'h',
                1,
                true,
            ); // 源 askForDiscard(damage.to, 1, 1)
        },
        ai: { noe: true },
    },

    // ── 断界（源 st_duanjie = ViewAsSkill n=2 + TriggerSkill Pindian/TurnOver，L2152-2217）──
    bts_st_duanjie: {
        enable: 'phaseUse',
        filter(event, player) {
            return player.countCards('h') > 1;
        }, // 源 enabled_at_play: 手牌>1
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，与一名角色拼点，没赢的角色翻面',
        filterTarget(event, player, target) {
            return target !== player && target.countCards('h') > 0;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_duanjie');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards); // 源 throwCard(subcards.first())：弃置【杀】
            const result = await player.chooseToCompare(target).forResult();
            if (result.cancelled) return;
            // 没赢的角色翻面（源 L2222-2225：from_number<=to_number → from 翻、>= → to 翻；
            // 平局两条件同时成立 → 双方翻。无名杀 chooseToCompare 平局 result.tie=true、bool=false，
            // 故平局须显式双方翻，勿只翻瓦尔特自己）
            if (result.tie) {
                await player.turnOver();
                await target.turnOver();
            } else if (result.bool) {
                await target.turnOver();
            } else {
                await player.turnOver();
            }
            // 仪式：技时瞬发则摸1并移除；否则叠1层仪式标记，翻面时一并摸牌
            if (player.countMark('bts_skill_moment') > 0) {
                player.removeMark('bts_skill_moment', 1);
                await player.draw(player, 1);
            } else {
                player.addMark('bts_st_duanjie', 1);
            }
        },
        group: ['bts_st_duanjie_ritual'],
        subSkill: {
            ritual: {
                trigger: { player: 'turnOverAfter' },
                filter(event, player) {
                    return player.countMark('bts_st_duanjie') > 0;
                },
                async content(event, trigger, player) {
                    const n = player.countMark('bts_st_duanjie');
                    player.removeMark('bts_st_duanjie', n);
                    await player.draw(player, n); // 源 L2170：翻面后摸仪式层数张牌
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_duanjie')
                    ? -1
                    : 4;
            },
            useful: 2,
            value: 4,
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_welt: '瓦尔特',
    bts_st_nidong: '拟洞',
    bts_st_nidong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，其跳过下个回合，你回复1点${get.poptip('bts_glossary_nuqi_faq')}，若你为${get.poptip('bts_glossary_xingqi_faq')}，你下次仪式瞬发。`,

    bts_st_niuqu: '扭曲',
    bts_st_niuqu_info: `锁定技，当你对其他角色造成伤害后，若你与其武将牌朝向不同或你于此阶段内发动过${get.poptip('bts_glossary_bisha_faq')}，其弃置一张手牌。`,

    bts_st_duanjie: '断界',
    bts_st_duanjie_info:
        '出牌阶段，你可以弃置一张【杀】并与一名角色拼点，没赢的角色翻面。仪式：当你翻面后，摸仪式层数张牌。',

    '$bts_st_nidong1': "这份力量的沉重，你一无所知",
    '$bts_st_nidong2': "见识一下星辰粉碎的样子吧…生存还是毁灭，你别无选择",
    '$bts_st_niuqu1': "退下吧",
    '$bts_st_niuqu2': "留下来吧",
    '$bts_st_duanjie1': "让身体和头脑都冷静一下吧",
    '$bts_st_duanjie2': "我不会手下留情",
    '~bts_welt': "交给…你们了……",
};

export const simpleTranslate = {
    bts_st_nidong_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色跳过下个回合，回复1点${get.poptip('bts_glossary_nuqi_faq')}；若${get.poptip('bts_glossary_xingqi_faq')}则下次仪式瞬发`,
    bts_st_niuqu_info: `锁；你造成伤害后，若与目标朝向不同或本阶段用过${get.poptip('bts_glossary_bisha_faq')}，其弃1张手牌`,
    bts_st_duanjie_info:
        '出牌阶段，弃1张【杀】与1名角色拼点，没赢者翻面；翻面后摸仪式层数张牌',
};

export const pinyins = { bts_welt: 'waerte' };
