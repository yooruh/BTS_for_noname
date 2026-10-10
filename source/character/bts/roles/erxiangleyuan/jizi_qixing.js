// 姬子·启行（源 animal.lua L9803-9908）—— 逐星操控拓星者、领航、远征。
// 拓星者（源 tuoxingzhe，隐藏不可选）为逐星期间的替代形态：源用 ChangeHero 切换后同步额外出牌，
// 无名杀版沿用「临时技能 + 额外回合」约定（同镜流转魄），逐星回合结束时授予光束，额外回合结束移除。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'erxiangleyuan';
export const title = '火·智识·逐星领航'; // 属性·命途
export const intro =
    `${B('姬子·启行')}${get.poptip('bts_sk_zhuxing')}多带一个出牌阶段，弃杀攒${get.poptip('bts_glossary_bless_qiyu_faq')}给${get.poptip('bts_glossary_nature_flame_faq')}${get.poptip('bts_sk_yuanzheng')}铺路；变「${get.poptip('bts_ch_tuoxingzhe')}」后${get.poptip('bts_sk_guangshu')}拆牌，拆到第六下炸开。`;

export const character = {
    bts_ch_jizi_qixing: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: [
            'bts_sk_zhuxing',
            'bts_sk_linghang',
            'bts_sk_yuanzheng',
        ],
    },
};
// 拓星者：逐星期间的替代形态，仅获得光束（源注册于星穹列车阵营）。
export const transformCharacter = {
    bts_ch_tuoxingzhe: {
        isUnseen: true,
        sex: 'male',
        group: 'xingqionglieche',
        hp: 4,
        skills: ['bts_sk_guangshu'],
    },
};

// 替代形态注册：让引擎识别「拓星者」为姬子·启行的 substitute/换形。
export const characterSubstitute = {
    bts_ch_jizi_qixing: [['bts_ch_tuoxingzhe', []]],
};

export const skill = {
    // 逐星（源 st_zhuxing，L9804-9824）：必杀技，失5怒气；回合结束时由「逐星·续」授予光束并额外回合。
    // 源实现为 ChangeHero 切换成拓星者并插入额外出牌阶段后再切回；无名杀以「临时光束技能+额外回合」近似。
    bts_sk_zhuxing: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L9822）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zhuxing');
            // 源 L9808 LoseAngry(player, 5)
            lib.bts.api.loseAngry(player, 5);
            // 源 L9810-9812：ChangeHero 切拓星者（光束自然生效）+ ExtraPhase(Play) + 切回。
            // 无名杀无法内联挂起，故真实切换后插入额外出牌阶段，由 bts_sk_guangshu(back)
            // 于该阶段结束后 ChangeHero 切回姬子·启行。
            player.addMark('bts_mk_zhuxing_active', 1);
            lib.bts.api.changeHero(player, 'bts_ch_tuoxingzhe');
            lib.bts.api.extraPhase(player, 'phaseUse');
        },
        ai: {
            // AI 口径：5怒气换「变身拓星者+额外出牌阶段（光束）」——额外阶段≈多一整轮行动，恒为高位必发
            //（源 st_zhuxing，L9804-9824）
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zhuxing') ? -1 : 9;
            },
            // 收益=额外阶段的行动机会+光束技能
            result: { player: 2 },
        },
    },

    // 领航（源 st_linghang = TriggerSkill EventPhaseStart，L9826-9836）：
    // 出牌阶段开始时，可弃置一张【杀】，若没有旗语祝福，附加3层。
    bts_sk_linghang: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            // 源 L9830：出牌阶段开始，且无旗语祝福，有【杀】可弃
            return (
                !lib.bts.api.getBless(player, 'qiyu') &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L9830 askForCard("Slash")：选择一张【杀】（结算移入 content）
            event.result = await player
                .chooseCard(
                    '领航：是否弃置一张【杀】获得3层旗语祝福？',
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                )
                // AI 口径：旗语=准备阶段令「远征」视为未发动（重置限定技）——远征已用则优先换；
                // 未用则收益需未来兑现，仅【杀】富余（≥3）时换
                //（源 st_linghang，L9826-9836）
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    const used = player.getStorage('bts_mk_yuanzheng_used', false);
                    const sha = player.countCards('h', (c) => get.name(c) === 'sha');
                    if (!used && sha < 3) return -1;
                    return 10 - get.useful(card);
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L9830：结算 cost 所选【杀】（自选数据在 event.cards）
            if (event.cards?.length) await player.discard(event.cards);
            // 源 L9832：AddBless(player, "@bless_qiyu", 3)
            await lib.bts.api.addBless(player, 'qiyu', 3, player);
        },
        ai: { result: { player: 1 } },
    },

    // 远征（源 st_yuanzheng = SkillCard + ZeroCardViewAsSkill + TriggerSkill Limited，L9837-9873）：
    // 限定技，出牌阶段，可结束此阶段并对一名角色造成1点炎属性致命贯通伤害。
    bts_sk_yuanzheng: {
        enable: 'phaseUse',
        limited: true,
        filter(event, player) {
            // 源 enabled_at_play（L9855）：@st_yuanzheng 标记为 0（限定技未发动）
            return !player.getStorage('bts_mk_yuanzheng_used', false);
        },
        // 源 Card filter（L10198）：#targets == 0（自选一名角色，自指允许，无 ~=Self）
        selectTarget: 1,
        // 显式全通过（自选一名角色、自指允许，同上源语义）：缺省会让引擎技能态目标选择
        // 短路为「无目标放行」——content 随后直取 targets[0] 即崩
        filterTarget: true,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yuanzheng');
            const target = event.targets[0];
            player.setStorage('bts_mk_yuanzheng_used', true, true); // 源 L9844：addPlayerMark @st_yuanzheng（限定标记）
            // 源 L9846：reason 含 "_flame_fatal_through"（炎属性 + 致命 + 贯通）
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_yuanzheng_flame_bts_reason_fatal_bts_reason_through';
            lib.bts.api.setDamageNature(damage, 'flame');
            await damage;
            lib.bts.api.endPlayPhase(player); // 源 L9843：setPlayerFlag "Global_PlayPhaseTerminated"（结束出牌阶段）
        },
        // 源 st_yuanzheng（L9850-9866）：同盟——星穹列车势力角色进入出牌阶段时给其挂 st_yuanzheng_friend（代发条款）
        group: ['bts_sk_yuanzheng_attach'],
        subSkill: {
            attach: {
                trigger: { global: 'phaseUseBegin' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player !== player &&
                        event.player.group === 'xingqionglieche' &&
                        !event.player.hasSkill('bts_sk_yuanzheng_friend')
                    );
                },
                async content(event, trigger, player) {
                    trigger.player.addSkill('bts_sk_yuanzheng_friend');
                },
            },
            // ── 同盟·远征代发（源 st_yuanzheng_friend，L9868-9908）：星穹列车势力角色可代姬子·启行发动远征；
            //    姬子未用过远征且同意时：盟友结束出牌阶段、记为姬子已用、对目标炎属性致命贯通伤害、盟友回1怒气。
            friend: {
                audio: 'bts_sk_yuanzheng',
                sub: true,
                sourceSkill: 'bts_sk_yuanzheng',
                enable: 'phaseUse',
                usable: 1,
                filter(event, player) {
                    // 源 enabled_at_play（L9898-9907）：盟友为星穹列车、有未用远征的姬子·启行、且本回合未用过
                    if (player.group !== 'xingqionglieche') return false;
                    return game.hasPlayer(
                        (p) =>
                            p.hasSkill('bts_sk_yuanzheng') &&
                            !p.getStorage('bts_mk_yuanzheng_used', false),
                    );
                },
                // 源 friendCard filter（L10235）：#targets == 0（自选一名角色，自指允许，无 ~=Self）
                selectTarget: 1,
                // 显式全通过（自选一名角色、自指允许，同上源语义）：缺省会让引擎技能态目标选择
                // 短路为「无目标放行」——content 随后直取 targets[0] 即崩
                filterTarget: true,
                async content(event, trigger, player) {
                    lib.bts.aiGuard.record(player, 'bts_sk_yuanzheng_friend');
                    const target = event.targets[0];
                    // 源 L10239-10247：逐姬子征询——每个同意的姬子各记已用并各结算一次
                    //（定夺（B-07）：由 findPlayer 取第一个改为逐姬子征询）
                    for (const jizi of lib.bts.api.seatOrder(
                        game.filterPlayer(
                            (p) =>
                                p.hasSkill('bts_sk_yuanzheng') &&
                                !p.getStorage('bts_mk_yuanzheng_used', false),
                        ),
                    )) {
                        // 源 L10242：askForSkillInvoke(p=姬子, "st_yuanzheng", player)——姬子须同意
                        const consent = await jizi
                            .chooseBool(
                                `远征·同盟：是否同意${get.translation(player)}代你发动远征并结束其出牌阶段？`,
                            )
                            .set('ai', () => get.attitude(jizi, player) >= 0)
                            .forResult();
                        if (!consent.bool) continue;
                        lib.bts.api.endPlayPhase(player); // 源 L10243：setPlayerFlag 结束盟友出牌阶段
                        jizi.setStorage('bts_mk_yuanzheng_used', true, true); // 源 L10244：addPlayerMark(姬子, @st_yuanzheng)
                        // 源 L10246：以盟友 player 造成 "_fire_fatal_through" 炎属性致命贯通伤害
                        const damage = target.damage(player, 1, 'nocard');
                        damage.reason = 'bts_sk_yuanzheng_flame_bts_reason_fatal_bts_reason_through';
                        lib.bts.api.setDamageNature(damage, 'flame');
                        await damage;
                        lib.bts.api.addAngry(player, 1); // 源 L10247：AddAngry(盟友)——盟友回1怒气
                    }
                },
                ai: {
                    // AI 口径：代姬子·启行发动远征——对敌1点炎致命贯通+自回1怒气；代价=结束自己出牌阶段，
                    // 故手牌将尽时再发；无可用姬子/无敌人不发动（源 st_yuanzheng_friend，L9868-9908）
                    order(item, player) {
                        if (lib.bts.aiGuard.blocked(player, 'bts_sk_yuanzheng_friend'))
                            return -1;
                        if (
                            !game.hasPlayer(
                                (p) =>
                                    p.isAlive() &&
                                    p.hasSkill('bts_sk_yuanzheng') &&
                                    !p.getStorage('bts_mk_yuanzheng_used', false),
                            )
                        )
                            return -1;
                        if (
                            !game.hasPlayer(
                                (t) =>
                                    t.isAlive() &&
                                    t !== player &&
                                    get.attitude(player, t) < 0,
                            )
                        )
                            return -1;
                        const hand = player.countCards('h');
                        return hand <= 1 ? 7 : hand <= 3 ? 4 : 2;
                    },
                    result: {
                        // 自方：回1怒气（仅拥有怒气必杀者实收，addAngry 门控）；目标：1点炎致命贯通
                        player: (player) =>
                            lib.bts.api.hasAngryBisha(player) ? 1 : 0,
                        target: (player, target) => {
                            if (target === player || get.attitude(player, target) >= 0)
                                return -1;
                            return lib.bts.api.getShield(target) > 0 ? -2.5 : -2;
                        },
                    },
                },
            },
        },
        ai: {
            // AI 口径：限定技——对一名角色1点炎致命贯通（封受伤回怒、穿盾）；代价=结束出牌阶段，
            // 故留到阶段尾声（手牌将尽）再发；无敌人不发动（源 st_yuanzheng，L9837-9873）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_yuanzheng')) return -1;
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0,
                    )
                )
                    return -1;
                const hand = player.countCards('h');
                return hand <= 1 ? 8 : hand <= 3 ? 5 : 3;
            },
            result: {
                // 1点炎致命贯通：致命（封怒）+贯通（穿盾）——带盾目标额外值
                target: (player, target) => {
                    if (target === player || get.attitude(player, target) >= 0)
                        return -1;
                    return lib.bts.api.getShield(target) > 0 ? -2.5 : -2;
                },
            },
        },
    },

    // 光束（源 st_guangshu，L9761-9801）：出牌阶段限六次，弃目标一牌其摸一牌；第六次引爆随机目标并结束阶段
    // 源代码伤害无元素，但描述为「炎属性伤害」，此处按描述补炎属性（见 RULE_TRANSLATE 炎）。
    bts_sk_guangshu: {
        // 子技能经 group 挂载（expandSkills 只展开 group、不自动展开 subSkill；back 漏挂则逐星切回
        // 永不生效；参照黄泉·残梦 bts_sk_canmeng_finisher 范式）
        group: ['bts_sk_guangshu_back'],
        enable: 'phaseUse',
        usable: 6, // 源 enabled_at_play（L9799）：usedTimes("#st_guangshu") < 6
        filterTarget(card, player, target) {
            // 源 Card filter（L9764）：目标 ≠ 自己且可弃其 "he" 牌
            return target !== player && target.countCards('he') > 0;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_guangshu');
            const target = event.targets[0];
            // 源 L9768-9770：弃目标一张牌，目标摸一张
            await player.discardPlayerCard(target, 'he', true);
            await target.draw(player, 1);
            target.addMark('bts_mk_guangshu-play', 1); // 源 L9771：被光束弃牌过的标记
            player.addMark('bts_mk_guangshu_count-play', 1); // 无名杀计数标记（替代 usedTimes）
            if (player.countMark('bts_mk_guangshu_count-play') >= 6) {
                // 源 L9773-9782：第六次使用时，随机对一名被弃牌过的角色造成1点伤害
                const marked = game.filterPlayer(
                    (candidate) => candidate.countMark('bts_mk_guangshu-play') > 0,
                );
                if (marked.length) {
                    const target =
                        marked[Math.floor(Math.random() * marked.length)];
                    const damage = target.damage(player, 1, 'nocard');
                    damage.reason = 'bts_sk_guangshu';
                    lib.bts.api.setDamageNature(damage, 'flame');
                    await damage;
                }
                lib.bts.api.endPlayPhase(player); // 源 L9789：setPlayerFlag 结束出牌阶段
            }
        },
        ai: {
            // AI 口径：前五次=拆敌1牌+其摸1（骚扰/消耗）；第六次（计数≥5）=引爆1伤并结束出牌阶段，
            // 故第六次压低到手牌将尽再发（源 st_guangshu，L9761-9801）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_guangshu')) return -1;
                if (
                    !game.hasPlayer(
                        (t) =>
                            t.isAlive() && t !== player && t.countCards('he') > 0,
                    )
                )
                    return -1;
                const count = player.countMark('bts_mk_guangshu_count-play');
                if (count >= 5) return player.countCards('h') <= 2 ? 8 : 2;
                return 6;
            },
            result: {
                // 拆1张+目标摸1（补偿）；已标记者优先——引爆池集中，第六击命中可控
                player: 1,
                target: (player, target) => {
                    if (target === player) return -1;
                    let v = -1;
                    if (target.countMark('bts_mk_guangshu-play') > 0) v -= 0.5;
                    return v;
                },
            },
        },
        subSkill: {
            // 逐星·还原（隐藏）：额外出牌阶段结束后 ChangeHero 切回姬子·启行（源 L9812）。
            back: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player, triggername) {
                    if (!player.countMark('bts_mk_zhuxing_active')) return false;
                    if (triggername === 'death') return true;
                    const pl = event.phaseList;
                    return (
                        Array.isArray(pl) &&
                        pl.length === 1 &&
                        pl[0] === 'phaseUse'
                    );
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_mk_zhuxing_active', player.countMark('bts_mk_zhuxing_active'));
                    player.removeMark('bts_mk_guangshu_count-play', player.countMark('bts_mk_guangshu_count-play'));
                    if (event.triggername !== 'death' && player.isAlive())
                        lib.bts.api.changeHero(player, 'bts_ch_jizi_qixing');
                },
            },
        },
    },
};

export const marks = {
    bts_mk_zhuxing_active: { markKind: 'record' },
    'bts_mk_guangshu-play': { markKind: 'record' },
    'bts_mk_guangshu_count-play': { markKind: 'record' },
    bts_mk_yuanzheng_used: {
        markKind: 'record',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_jizi_qixing_skin1': '皮肤1',
    'bts_ch_jizi_qixing_skin2': '皮肤2',
    'bts_ch_jizi_qixing_skin3': '皮肤3',
    bts_mk_zhuxing_active: '逐星状态',
    'bts_mk_guangshu-play': '光束目标',
    'bts_mk_guangshu_count-play': '光束计数',
    bts_ch_jizi_qixing: '姬子·启行',
    bts_ch_tuoxingzhe: '拓星者',
    bts_sk_zhuxing: '逐星',
    bts_sk_zhuxing_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，变形为${get.poptip('bts_ch_tuoxingzhe')}并进入一个额外的出牌阶段（拥有「${get.poptip('bts_sk_guangshu')}」技能）：出牌阶段结束后变回姬子·启行。`,
    bts_sk_zhuxing_xu: '逐星·续',
    bts_sk_linghang: '领航',
    bts_sk_linghang_info: `出牌阶段开始时，你可以弃置一张【杀】，若你没有${get.poptip('bts_glossary_bless_qiyu_faq')}，附加3层${get.poptip('bts_glossary_bless_qiyu_faq')}。`,
    bts_sk_yuanzheng: '远征',
    bts_sk_yuanzheng_info: `限定技，出牌阶段，你可以结束此阶段并对一名角色造成1点${get.poptip('bts_glossary_nature_flame_dmg_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害。`,
    bts_sk_yuanzheng_friend: '远征',
    bts_sk_yuanzheng_friend_info: `星穹列车势力角色获得：出牌阶段，若存在未发动「${get.poptip('bts_sk_yuanzheng')}」的姬子·启行，你可以结束此阶段，经其同意后代其发动「${get.poptip('bts_sk_yuanzheng')}」对一名角色造成1点${get.poptip('bts_glossary_nature_flame_dmg_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害，然后你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,
    bts_sk_guangshu: '光束',
    bts_sk_guangshu_info: `出牌阶段限六次，你可以弃置一名其他角色一张牌，其摸一张牌；第六次发动时，对以此法选择过的随机一名角色造成1点${get.poptip('bts_glossary_nature_flame_dmg_faq')}伤害并结束此阶段。`,
    bts_bless_qiyu: '旗语祝福',

    '$bts_sk_zhuxing1': "薪火相继，我们…即是开拓！",
    '$bts_sk_zhuxing2': "拓星者，启行",
    '$bts_sk_zhuxing3': "（姬子）化作星辰，照亮银河的长夜！",
    '$bts_sk_zhuxing4': "（瓦尔特）化作星辰，照亮银河的长夜！",
    '$bts_sk_zhuxing5': "（男开拓者）化作星辰，照亮银河的长夜！",
    '$bts_sk_zhuxing6': "（三月七）化作星辰，照亮银河的长夜！",
    '$bts_sk_zhuxing7': "（丹恒）化作星辰，照亮银河的长夜！",
    '$bts_sk_linghang1': "此行，终抵群星！",
    '$bts_sk_linghang2': "征途，为你护航！",
    '$bts_sk_yuanzheng1': "向着更远的远方",
    '$bts_sk_yuanzheng2': "驶向崭新的黎明！",
    '$bts_sk_yuanzheng3': "为了最初的愿望",
    '$bts_sk_yuanzheng4': "去联结更多的世界",
    '$bts_sk_yuanzheng5': "以我们的意志，抵达结局！",
    '$bts_sk_yuanzheng6': "敢挡路？揍他！",
    '$bts_sk_yuanzheng7': "希望，不会熄灭！",
    '$bts_sk_yuanzheng8': "前路，始于足下",
    '$bts_sk_guangshu1': "拓星审判，执行！",
    '$bts_sk_guangshu2': "拓星者启动。航路障碍，开始清除",
    '~bts_ch_jizi_qixing': "就…交给你们了……",
    '~bts_ch_tuoxingzhe': "就…交给你们了……",
    bts_bless_qiyu_info: `来源：${get.poptip('bts_sk_linghang')}赋予；清除${get.poptip('bts_sk_yuanzheng')}标记；回合结束自然减少1层`,
    bts_mk_yuanzheng_used: '远征已用',
};

export const simpleTranslate = {
    bts_sk_zhuxing_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}，变${get.poptip('bts_ch_tuoxingzhe')}+额外出牌阶段后切回`,
    bts_sk_linghang_info: `出牌开始可弃杀+3${get.poptip('bts_glossary_bless_qiyu_faq')}`,
    bts_sk_yuanzheng_info: `限定；对1名角色炎${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害并结束出牌`,
    bts_sk_guangshu_info:
        '出牌限六次；弃一名其他角色一牌其摸一牌，第六次炸随机目标并结束阶段',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_qiyu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_qiyu_faq',
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        silent: true,
        filter(event, player) {
            return event.player === player;
        },
        async content(event, trigger, player) {
            player.setStorage('bts_mk_yuanzheng_used', false, true);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_qiyu_faq',
        name: '旗语祝福',
        info: `准备阶段开始时，你令「${get.poptip('bts_sk_yuanzheng')}」视为未发动过。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
