// 开拓者·穹（源 animal.lua L1540-1675）—— 变形/星启体系示例
// 星尘必杀技进入星启并二选一爆发，斗志积攒护盾，安息以杀换伤。
import {
    lib,
    game,
    ui,
    get,
    ai,
    _status,
    X,
    Y,
    Z,
    styleText,
    B,
    
} from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '物理·毁灭·穹'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('开拓者')}是星核宿主：${get.poptip('bts_glossary_bisha_faq')}${B('星尘')}花${get.poptip('bts_glossary_nuqi_faq')}进入${B(get.poptip('bts_glossary_xingqi_faq'))}并可选单体爆发或AOE，` +
    `${B('斗志')}在自己回合清空别人手牌就攒${get.poptip('bts_glossary_hudun_faq')}，${B('安息')}以杀换伤。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}后洞天/星尘类${get.poptip('bts_glossary_xingqi_faq')}技收益更高，注意${get.poptip('bts_glossary_nuqi_faq')}管理`;

// 形态变形示例：穹↔星。星为替代形态，不单独进入选将池；
// lib.bts.api.changeHero() 基于 Noname player.reinit 实现实际的头像/性别/技能/血量切换。
export const character = {
    bts_kaituozhe: {
        sex: 'male',
        group: 'xingqionglieche',
        hp: 4,
        skills: [
            'bts_st_xingchen',
            'bts_st_douzhi',
            'bts_st_anxi',
            'bts_st_huanxing',
        ],
    },
};

// 替代形态随主角色模块导出，由角色包入口合并；不作为独立 roles 文件，
// 保持"一文件一可选角色"的构建校验。
export const transformCharacter = {
    bts_xing: {
        isUnseen: true,
        sex: 'female',
        group: 'xingqionglieche',
        hp: 4,
        skills: [
            'bts_st_xingchen',
            'bts_st_douzhi',
            'bts_st_anxi',
            'bts_st_huanxing',
        ],
    },
};

// 替代形态注册：让引擎识别「星」为开拓者的 substitute/换形。
export const characterSubstitute = {
    bts_kaituozhe: [['bts_xing', []]],
};

export const skill = {
    // ── 形态切换·焕星（基础架构示例）──
    // 原 Lua ChangeHero 由多名双形态角色调用；这里提供穹↔星的可验证模板，
    // 后续可供阿格莱雅&衣匠、遐蝶&死龙、白厄&卡厄斯兰那等角色复用。
    bts_st_huanxing: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return (
                player.name === 'bts_kaituozhe' || player.name === 'bts_xing'
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_huanxing');
            const to =
                player.name === 'bts_kaituozhe' ? 'bts_xing' : 'bts_kaituozhe';
            lib.bts.api.changeHero(player, to);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_huanxing')
                    ? -1
                    : 0.1;
            },
            result: { player: 1 },
        },
    },

    // ── 必杀技·星尘（源 st_xingchen，L1541-1654）──
    bts_st_xingchen: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 目标数/范围由 content 内先选的「星落(单) vs 安息(多)」效果分支决定，无法以单一技能级 selectTarget 表达；每次下限1不可取消
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xingchen');
            lib.bts.api.loseAngry(player, 4); // 源 L1642
            lib.bts.api.addBless(player, 'god'); // 星启祝福（源 L1643）
            // 选择一项：1.星落（对一名角色造成1点伤害） 2.安息强化（无需弃牌且无目标上限）
            const choice = await player
                .chooseControl(
                    [
                        ['anda', '对一名角色造成1点伤害'],
                        [
                            'anxi',
                            '发动"安息"：无需弃牌，对任意名角色各造成1点伤害',
                        ],
                    ],
                    '星尘：选择一项',
                )
                .forResult();
            if (!choice || !choice.control) return;
            let targets = [];
            if (choice.control === 'anda') {
                const r = await player
                    .chooseTarget(
                        '星尘·星落：选择一名角色',
                        [1, 1],
                        (card, p, target) => target !== p,
                    )
                    .forResult();
                if (!r.bool) return;
                targets = r.targets;
            } else {
                const r = await player
                    .chooseTarget(
                        '星尘·安息：选择任意名角色',
                        [1, Infinity],
                        (card, p, target) => target !== p,
                    )
                    .forResult();
                if (!r.bool) return;
                targets = r.targets;
            }
            let killed = false;
            for (const t of targets) {
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_xingchen';
                await damage;
                if (t.isDead()) killed = true;
            }
            // 选项结算完毕，若有目标死亡 → 回复1点怒气（源 L1550-1556）
            if (killed) {
                lib.bts.api.addAngry(player, 1);
                game.log(player, '因击杀回复了1点怒气');
            }
        },
        ai: {
            order(item, player) {
                if (lib.bts?.aiGuard?.blocked(player, 'bts_st_xingchen'))
                    return -1;
                return lib.bts.api.getAngry(player) >= 6 ? 6 : 3;
            },
            threaten: 2.5,
            result: { player: 1 },
        },
    },

    // ── 锁定技·斗志（源 st_douzhi，L1657-1670）──
    bts_st_douzhi: {
        trigger: { global: 'loseEnd' },
        forced: true,
        filter(event, player) {
            // 一名角色于你的回合内失去所有手牌 → 你附加1层护盾
            if (_status.currentPhase !== player) return false;
            if (event.player === player || !event.cards?.length) return false;
            const lose = event.getl ? event.getl(event.player) : null;
            if (lose?.hs?.length && event.player.countCards('h') === 0)
                return true;
            return false;
        },
        async content(event, trigger, player) {
            lib.bts.api.addShield(player); // 源 L1665（发动由引擎自动记录）
        },
        ai: { noe: true },
    },

    // ── 转化技·安息（源 st_anxi，L1671-1680；出牌阶段限一次）──
    bts_st_anxi: {
        enable: 'phaseUse',
        usable: 1,
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对一名角色造成1点伤害',
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_anxi');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards);
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_anxi';
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_anxi') ? -1 : 4;
            },
            useful: 2,
            value: 4,
            result: { player: 1 },
        },
    },
};

export const translate = {
    bts_kaituozhe: '开拓者',
    bts_xing: '开拓者·星',
    bts_st_huanxing: '焕星',
    bts_st_huanxing_info:
        '出牌阶段限一次，你可以在开拓者·穹与开拓者·星之间切换形态。',
    bts_st_xingchen: '星尘',
    bts_st_xingchen_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，附加1层${get.poptip('bts_glossary_bless_god_faq')}，然后你于此回合内的出牌阶段限一次，可以选择一项：1.对一名角色造成1点伤害；2.发动“安息”无需弃牌且无目标上限。选项结算完毕时，若有目标角色死亡，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_st_douzhi: '斗志',
    bts_st_douzhi_info: `锁定技，当一名角色于你的回合内失去所有手牌后，你附加1层${get.poptip('bts_glossary_hudun_faq')}。`,

    bts_st_anxi: '安息',
    bts_st_anxi_info:
        '出牌阶段限一次，你可以弃置一张【杀】并选择一名角色，对其造成1点伤害。',

    '$bts_st_xingchen1': "规则，就是用来打破的",
    '$bts_st_xingchen2': "你出局了！",
    '$bts_st_xingchen3': "我来送你上路",
    '$bts_st_xingchen4': "致胜一击！",
    '$bts_st_douzhi1': "再坚持一下",
    '$bts_st_douzhi2': "机不可失",
    '$bts_st_anxi1': "尝尝这个！",
    '$bts_st_anxi2': "轮到你了",
    '~bts_kaituozhe': "是我…输了……",
    '~bts_xing': "是我…输了……",
};

export const simpleTranslate = {
    bts_st_xingchen_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}附加${get.poptip('bts_glossary_xingqi_faq')}，出牌阶段限一次选择一项：1.对1名角色造成1点伤害；2.发动安息（无需弃牌且无目标上限）；选项结算完毕时若有目标死亡，回复1点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_st_douzhi_info: `锁；你的回合内，一名角色失去所有手牌后，你+1层${get.poptip('bts_glossary_hudun_faq')}`,
    bts_st_anxi_info: '出牌阶段限一次，弃1张【杀】对1名角色造成1点伤害',
};

export const pinyins = { bts_kaituozhe: 'kaituozhe' };
