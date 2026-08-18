// 银狼（源 animal.lua L2445-2558）—— 封号必杀技诅咒+异常、程序锁定随机异常、更改链接技转移属性。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'xinghelieshou';
export const title = '量子·虚无·封禁玩家'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('银狼')}是异常干扰：${get.poptip('bts_glossary_bisha_faq')}${B('封号')}用${get.poptip('bts_glossary_nuqi_faq')}附加诅咒，${B('程序')}在指定目标后随机附加基础异常，${B('更改')}弃【杀】把一名角色的属性复制给另一名角色。` +
    `<li>目标异常种类越多，封号回${get.poptip('bts_glossary_nuqi_faq')}越强`;

export const character = {
    bts_yinlang: {
        sex: 'female',
        group: 'xinghelieshou',
        hp: 4,
        skills: ['bts_st_fenghao', 'bts_st_chengxu', 'bts_st_genggai'],
    },
};

export const skill = {
    // ── 必杀技·封号（源 st_fenghao = ZeroCardViewAsSkill，L2446-2470）──
    bts_st_fenghao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_fenghao');
            const target = event.targets[0];
            if (!target) return;
            lib.bts.api.loseAngry(player, 5); // 源 L2452
            // st_chengxu 联动（源 TargetSpecified 先于 on_use）；随机基础异常内联
            lib.bts.api.addAbnormal(
                target,
                ['numb', 'burn', 'poison', 'sleep', 'freeze', 'fossilize'][
                    Math.floor(Math.random() * 6)
                ],
                1,
                player,
            );
            lib.bts.api.addCurse(target, lib.bts.api.god(player) ? 3 : 2, player); // 源 L2454-2455
            // 源 L2461-2462：AddAngry(targets[1], …) 误把怒气给【目标】；按源描述「你回复」与用户定夺改给银狼。
            // 阈值 >=5/>=3 对应描述「大于2/4」（5层+→2、3-4层→1），未随源码的 >3/>5。
            const types = lib.bts.api.abnormalCount(target);
            if (types >= 5)
                lib.bts.api.addAngry(player, 2, player);
            else if (types >= 3) lib.bts.api.addAngry(player, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_fenghao')
                    ? -1
                    : 6;
            },
            threaten: 2,
            result: { player: 1, target: -2 },
        },
    },

    // ── 锁定技·程序（源 st_chengxu = TriggerSkill Compulsory TargetSpecified/MarkChanged，L2471-2525）──
    bts_st_chengxu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        trigger: { player: 'useCard' },
        forced: true,
        filter(event, player) {
            return event.card?.name === 'sha' && event.targets?.length; // 使用【杀】指定目标后
        },
        async content(event, trigger, player) {
            const pick = ['numb', 'burn', 'poison', 'sleep', 'freeze', 'fossilize'][
                Math.floor(Math.random() * 6)
            ];
            for (const t of trigger.targets || [])
                lib.bts.api.addAbnormal(t, pick, 1, player);
        },
        group: ['bts_st_chengxu_nature'],
        subSkill: {
            nature: {
                trigger: { global: 'addMark' },
                filter(event, player) {
                    // 其他角色于你的回合内获得属性（源 MarkChanged + gain>0 + getCurrent==p）
                    return (
                        _status.currentPhase === player &&
                        typeof event.markName === 'string' &&
                        event.markName.startsWith('bts_n_')
                    );
                },
                async content(event, trigger, player) {
                    lib.bts.api.addAbnormal(
                        trigger.player,
                        ['numb', 'burn', 'poison', 'sleep', 'freeze', 'fossilize'][
                            Math.floor(Math.random() * 6)
                        ],
                        1,
                        player,
                    );
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 链接技·更改（源 st_genggai = OneCardViewAsSkill + SkillCard，L2526-2558）──
    bts_st_genggai: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，选择一名有附加的角色和另一名其他角色，后者获得前者的附加',
        filterTarget(event, player, target) {
            if (ui.selected.targets.length === 0)
                return lib.bts.api.getNature(null, target) !== null; // 第一个：有附加
            return target !== player && target !== ui.selected.targets[0]; // 第二个：其他角色
        },
        selectTarget: 2,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_genggai');
            const [source, dest] = event.targets;
            if (!source || !dest) return;
            await player.discard(event.cards);
            const nature = lib.bts.api.getNature(null, source);
            if (nature) await lib.bts.api.addNature(dest, nature); // 源 AddNature(use.to:last(), GetNature(first))
            // st_chengxu 联动
            const pick = ['numb', 'burn', 'poison', 'sleep', 'freeze', 'fossilize'][
                Math.floor(Math.random() * 6)
            ];
            for (const t of event.targets || [])
                lib.bts.api.addAbnormal(t, pick, 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_genggai')
                    ? -1
                    : 3;
            },
            useful: 2,
            value: 3,
            result: { player: 1 },
        },
    },
};

export const translate = {
    bts_yinlang: '银狼',
    bts_st_fenghao: '封号',
    bts_st_fenghao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加2层诅咒，若你为${get.poptip('bts_glossary_xingqi_faq')}，额外附加1层，若其拥有的异常种类数大于2/4，你回复1/2点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_st_chengxu: '程序',
    bts_st_chengxu_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}、链接技、使用【杀】指定一个目标后，或当其他角色于你的回合内获得附加后，令其附加一种随机基础异常。`,

    bts_st_genggai: '更改',
    bts_st_genggai_info:
        '链接技，出牌阶段，你可以弃置一张【杀】并选择一名有附加的角色和另一名其他角色，后者获得前者的附加。',

    '$bts_st_fenghao1': "战斗体验该优化了",
    '$bts_st_fenghao2': "哼，就这速度？太慢了！",
    '$bts_st_chengxu1': "这么快就上钩了",
    '$bts_st_chengxu2': "这次能让我玩得开心点么？",
    '$bts_st_genggai1': "来点刺激的",
    '$bts_st_genggai2': "百分百弱点击破",
    '~bts_yinlang': "我…",
};

export const simpleTranslate = {
    bts_st_fenghao_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+2层诅咒（${get.poptip('bts_glossary_xingqi_faq')}+3），其异常种类>2/4则你回1/2${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_st_chengxu_info: `锁；你发动${get.poptip('bts_glossary_bisha_faq')}/链接/用杀指定目标后，或他人于你回合内获得附加后，令其+1种随机基础异常`,
    bts_st_genggai_info:
        '链接；出牌阶段，弃1张【杀】选1名有附加角色和1名其他角色，后者获得前者的附加',
};

export const pinyins = { bts_yinlang: 'yinlang' };
