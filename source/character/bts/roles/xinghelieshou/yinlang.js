// 银狼（源 animal.lua L2445-2558）—— 封号必杀技诅咒+异常、程序锁定随机异常、更改链接技转移属性。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'xinghelieshou';
export const title = '量子·虚无·封禁玩家'; // 属性·命途
export const intro =
    `${B('银狼')}是异常干扰：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_fenghao'))}用${get.poptip('bts_glossary_nuqi_faq')}附加诅咒，${B(get.poptip('bts_sk_chengxu'))}在指定目标后随机附加基础异常，${B(get.poptip('bts_sk_genggai'))}弃【杀】把一名角色的属性复制给另一名角色。` +
    `<li>目标异常种类越多，${get.poptip('bts_sk_fenghao')}回${get.poptip('bts_glossary_nuqi_faq')}越强`;

export const character = {
    bts_ch_yinlang: {
        sex: 'female',
        group: 'xinghelieshou',
        hp: 4,
        skills: ['bts_sk_fenghao', 'bts_sk_chengxu', 'bts_sk_genggai'],
    },
};

export const skill = {
    // ── 必杀技·封号（源 st_fenghao = ZeroCardViewAsSkill，L2446-2470）──
    bts_sk_fenghao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_fenghao');
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
            // 源 L2461-2462 把怒气给【目标】（笔误）；按描述「你回复」定夺为回复银狼。
            // 阈值 ≥5→2、≥3→1 按描述「大于2/4」，不随源码 >3/>5。
            const types = lib.bts.api.abnormalCount(target);
            if (types >= 5)
                lib.bts.api.addAngry(player, 2, player);
            else if (types >= 3) lib.bts.api.addAngry(player, 1, player);
        },
        ai: {
            // AI 口径：5怒气换敌方2/3层诅咒（下次受伤放大等量）+1种随机基础异常；
            // 异常种类≥3/5 时回1/2怒气，优先异常已堆积的敌人（源 animal.lua L2446-2470）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_fenghao'))
                    return -1;
                let best = 0; // 最佳敌方收益（诅咒≈0.9/层 + 随机异常，返还怒气加分）
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue;
                    let v = (lib.bts.api.god(player) ? 3 : 2) * 0.9 + 1;
                    const types = lib.bts.api.abnormalCount(t);
                    if (types >= 5) v += 1; // 回2怒气（接近抵消大招成本）
                    else if (types >= 3) v += 0.5; // 回1怒气
                    if (v > best) best = v;
                }
                if (!best) return -1;
                return best >= 3.5 ? 7 : best >= 2.5 ? 5 : 3;
            },
            threaten: 2,
            result: {
                player: 1,
                // 目标受损=诅咒放大器+随机异常；异常种类≥3者额外优先（怒气返还驱动）
                target: (player, target) => {
                    const curse = lib.bts.api.god(player) ? 3 : 2;
                    return -(
                        curse * 0.9 +
                        0.8 +
                        (lib.bts.api.abnormalCount(target) >= 3 ? 0.4 : 0)
                    );
                },
            },
        },
    },

    // ── 锁定技·程序（源 st_chengxu = TriggerSkill Compulsory TargetSpecified/MarkChanged，L2471-2525）──
    bts_sk_chengxu: {
        // 源为锁定触发技（Skill_Compulsory）、非必杀技本体 → 勿标 bts_bisha（S-B/缇宝忙碌先例）；
        // 描述中「发动必杀技/链接技后」指被封号/更改，它是被监听对象、程序自身是监听者。
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
        group: ['bts_sk_chengxu_nature'],
        subSkill: {
            nature: {
                // 源 st_chengxu MarkChanged 分支（Skill_Compulsory，无询问）→ forced。
                trigger: { global: 'bts_mark_add' },
                forced: true,
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
            },
        },
    },

    // ── 链接技·更改（源 st_genggai = OneCardViewAsSkill + SkillCard，L2526-2558）──
    bts_sk_genggai: {
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
            lib.bts.aiGuard.record(player, 'bts_sk_genggai');
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
            // AI 口径：弃1杀把「有属性者」的属性复制给另一名角色——两目标各+1随机异常，
            // 接收方另经程序·属性监听再+1种；来源与接收方都选敌方最优（源 animal.lua L2526-2558）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_genggai'))
                    return -1;
                const enemy = (t) =>
                    t.isAlive() && t !== player && get.attitude(player, t) < 0;
                // 最优：来源与接收方均为敌方（各吃异常，接收方再获属性）
                if (
                    game.hasPlayer(
                        (s) =>
                            enemy(s) &&
                            lib.bts.api.getNature(null, s) &&
                            game.hasPlayer((t) => enemy(t) && t !== s),
                    )
                )
                    return 5;
                // 次优：牺牲友方属性源、接收方为敌方（仍净赚1层异常）
                if (
                    game.hasPlayer(
                        (t) =>
                            enemy(t) &&
                            game.hasPlayer(
                                (s) =>
                                    s.isAlive() &&
                                    s !== player &&
                                    s !== t &&
                                    lib.bts.api.getNature(null, s),
                            ),
                    )
                )
                    return 3;
                return -1; // 无敌方接收方：纯友方向复制（双方各吃1层异常）不划算
            },
            useful: 2,
            value: 3,
            result: {
                player: 1,
                // 两段目标共用估值：接收方=属性+随机异常、来源=随机异常；敌方优先，友方仅作凑数项
                target: (player, target) =>
                    get.attitude(player, target) < 0 ? -1.2 : -0.3,
            },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_yinlang_skin1': '皮肤1',
    'bts_ch_yinlang_skin2': '皮肤2',
    'bts_ch_yinlang_skin3': '皮肤3',
    bts_ch_yinlang: '银狼',
    bts_sk_fenghao: '封号',
    bts_sk_fenghao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加2层诅咒，若你为${get.poptip('bts_glossary_xingqi_faq')}，额外附加1层，若其拥有的异常种类数大于2/4，你回复1/2点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_sk_chengxu: '程序',
    bts_sk_chengxu_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}、链接技、使用【杀】指定一个目标后，或当其他角色于你的回合内获得附加后，令其附加一种随机基础异常。`,

    bts_sk_genggai: '更改',
    bts_sk_genggai_info:
        '链接技，出牌阶段，你可以弃置一张【杀】并选择一名有附加的角色和另一名其他角色，后者获得前者的附加。',

    '$bts_sk_fenghao1': "战斗体验该优化了",
    '$bts_sk_fenghao2': "哼，就这速度？太慢了！",
    '$bts_sk_chengxu1': "这么快就上钩了",
    '$bts_sk_chengxu2': "这次能让我玩得开心点么？",
    '$bts_sk_genggai1': "来点刺激的",
    '$bts_sk_genggai2': "百分百弱点击破",
    '~bts_ch_yinlang': "我…",
};

export const simpleTranslate = {
    bts_sk_fenghao_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+2层诅咒（${get.poptip('bts_glossary_xingqi_faq')}+3），其异常种类>2/4则你回1/2${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_chengxu_info: `锁；你发动${get.poptip('bts_glossary_bisha_faq')}/链接/用杀指定目标后，或他人于你回合内获得附加后，令其+1种随机基础异常`,
    bts_sk_genggai_info:
        '链接；出牌阶段，弃1张【杀】选1名有附加角色和1名其他角色，后者获得前者的附加',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
