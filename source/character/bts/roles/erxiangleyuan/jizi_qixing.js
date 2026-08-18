// 姬子·启行（源 animal.lua L9803-9908）—— 逐星操控拓星者、领航、远征。
// 拓星者（源 tuoxingzhe，隐藏不可选）为逐星期间的替代形态：源用 ChangeHero 切换后同步额外出牌，
// 无名杀版沿用「临时技能 + 额外回合」约定（同镜流转魄），逐星回合结束时授予光束，额外回合结束移除。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '火·智识·逐星领航'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('姬子·启行')}逐星多带一个出牌阶段，弃杀攒${get.poptip('bts_glossary_bless_qiyu_faq')}给${get.poptip('bts_glossary_nature_yan_faq')}远征铺路；变「拓星者」后光束拆牌，拆到第六下炸开。`;

export const character = {
    bts_jizi_qixing: {
        sex: 'female',
        group: 'erxiangleyuan',
        hp: 4,
        skills: [
            'bts_st_zhuxing',
            'bts_st_linghang',
            'bts_st_yuanzheng',
        ],
    },
};
// 拓星者：逐星期间的替代形态，仅获得光束（源注册于星穹列车阵营）。
export const transformCharacter = {
    bts_tuoxingzhe: {
        isUnseen: true,
        sex: 'male',
        group: 'xingqionglieche',
        hp: 4,
        skills: ['bts_st_guangshu'],
    },
};

// 替代形态注册：让引擎识别「拓星者」为姬子·启行的 substitute/换形。
export const characterSubstitute = {
    bts_jizi_qixing: [['bts_tuoxingzhe', []]],
};

export const skill = {
    // 逐星（源 st_zhuxing，L9804-9824）：必杀技，失5怒气；回合结束时由「逐星·续」授予光束并额外回合。
    // 源实现为 ChangeHero 切换成拓星者并插入额外出牌阶段后再切回；无名杀以「临时光束技能+额外回合」近似。
    bts_st_zhuxing: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9822）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_zhuxing');
            // 源 L9808 LoseAngry(player, 5)
            lib.bts.api.loseAngry(player, 5);
            // 源 L9810-9812：ChangeHero 切拓星者（光束自然生效）+ ExtraPhase(Play) + 切回。
            // 无名杀无法内联挂起，故真实切换后插入额外出牌阶段，由 bts_st_guangshu(back)
            // 于该阶段结束后 ChangeHero 切回姬子·启行。
            player.addMark('bts_zhuxing_active', 1);
            lib.bts.api.changeHero(player, 'bts_tuoxingzhe');
            lib.bts.api.extraPhase(player, 'phaseUse');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_zhuxing')
                    ? -1
                    : 9;
            },
            result: { player: 2 },
        },
    },

    // 领航（源 st_linghang = TriggerSkill EventPhaseStart，L9826-9836）：
    // 出牌阶段开始时，可弃置一张【杀】，若没有旗语祝福，附加3层。
    bts_st_linghang: {
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
    bts_st_yuanzheng: {
        enable: 'phaseUse',
        limited: true,
        filter(event, player) {
            // 源 enabled_at_play（L9855）：@st_yuanzheng 标记为 0（限定技未发动）
            return !player.countMark('bts_st_yuanzheng_used');
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9840）：目标数0个时可选（实际选择1名其他角色）
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yuanzheng');
            const target = event.targets[0];
            player.addMark('bts_st_yuanzheng_used', 1); // 源 L9844：addPlayerMark @st_yuanzheng（限定标记）
            // 源 L9846：reason 含 "_flame_fatal_through"（炎属性 + 致命 + 贯通）
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_yuanzheng_flame_fatal_through';
            lib.bts.api.setDamageNature(damage, 'flame');
            await damage;
            player.skip('phaseUse'); // 源 L9843：setPlayerFlag "Global_PlayPhaseTerminated"（结束出牌阶段）
        },
        // 源 st_yuanzheng（L9850-9866）：同盟——星穹列车势力角色进入出牌阶段时给其挂 st_yuanzheng_friend（代发条款）
        group: ['bts_st_yuanzheng_attach'],
        subSkill: {
            attach: {
                trigger: { global: 'phaseUseBegin' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player !== player &&
                        event.player.group === 'xingqionglieche' &&
                        !event.player.hasSkill('bts_st_yuanzheng_friend')
                    );
                },
                content(event, trigger, player) {
                    trigger.player.addSkill('bts_st_yuanzheng_friend');
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yuanzheng')
                    ? -1
                    : 8;
            },
            result: { target: -2 },
        },
    },

    // ── 同盟·远征代发（源 st_yuanzheng_friend，L9868-9908）：星穹列车势力角色可代姬子·启行发动远征；
    //    姬子未用过远征且同意时：盟友结束出牌阶段、记为姬子已用、对目标炎属性致命贯通伤害、盟友回1怒气。
    bts_st_yuanzheng_friend: {
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9898-9907）：盟友为星穹列车、有未用远征的姬子·启行、且本回合未用过
            if (player.group !== 'xingqionglieche') return false;
            return game.hasPlayer(
                (p) =>
                    p.hasSkill('bts_st_yuanzheng') &&
                    !p.countMark('bts_st_yuanzheng_used'),
            );
        },
        filterTarget(card, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yuanzheng_friend');
            const target = event.targets[0];
            const ownJizi = game.findPlayer(
                (p) =>
                    p.hasSkill('bts_st_yuanzheng') &&
                    !p.countMark('bts_st_yuanzheng_used'),
            );
            if (!ownJizi) return;
            // 源 L9872-9873：askForSkillInvoke(p=姬子, "st_yuanzheng", player)——姬子须同意
            const consent = await ownJizi
                .chooseBool(
                    `远征·同盟：是否同意${get.translation(player)}代你发动远征并结束其出牌阶段？`,
                )
                .set('ai', () => get.attitude(ownJizi, player) >= 0)
                .forResult();
            if (!consent.bool) return;
            ownJizi.addMark('bts_st_yuanzheng_used', 1); // 源 L9874：addPlayerMark(姬子, @st_yuanzheng)
            // 源 L9875：以盟友 player 造成 "_fire_fatal_through" 炎属性致命贯通伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_yuanzheng_flame_fatal_through';
            lib.bts.api.setDamageNature(damage, 'flame');
            await damage;
            player.skip('phaseUse'); // 源 L9873：setPlayerFlag 结束盟友出牌阶段
            lib.bts.api.addAngry(player, 1); // 源 L9876：AddAngry(盟友)——盟友回1怒气
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yuanzheng_friend')
                    ? -1
                    : 7;
            },
            result: { target: -2 },
        },
    },

    // 光束（源 st_guangshu，L9761-9801）：出牌阶段限六次，弃目标一牌其摸一牌；第六次引爆随机目标并结束阶段
    // 源代码伤害无元素，但描述为「炎属性伤害」，此处按描述补炎属性（见 RULE_TRANSLATE 炎）。
    bts_st_guangshu: {
        // 子技能经 group 挂载（引擎 expandSkills 只展开 group、不自动展开 subSkill；
        // back 未挂载则逐星切回永不生效 —— 已修正，参照黄泉·残梦 bts_st_canmeng_finisher 既有范式）
        group: ['bts_st_guangshu_back'],
        enable: 'phaseUse',
        usable: 6, // 源 enabled_at_play（L9799）：usedTimes("#st_guangshu") < 6
        filterTarget(card, player, target) {
            // 源 Card filter（L9764）：目标 ≠ 自己且可弃其 "he" 牌
            return target !== player && target.countCards('he') > 0;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_guangshu');
            const target = event.targets[0];
            // 源 L9768-9770：弃目标一张牌，目标摸一张
            await player.discardPlayerCard(target, 'he', true);
            await target.draw(player, 1);
            target.addMark('bts_st_guangshu-play', 1); // 源 L9771：被光束弃牌过的标记
            player.addMark('bts_st_guangshu_count-play', 1); // 无名杀计数标记（替代 usedTimes）
            if (player.countMark('bts_st_guangshu_count-play') >= 6) {
                // 源 L9773-9782：第六次使用时，随机对一名被弃牌过的角色造成1点伤害
                const marked = game.filterPlayer(
                    (candidate) => candidate.countMark('bts_st_guangshu-play') > 0,
                );
                if (marked.length) {
                    const target =
                        marked[Math.floor(Math.random() * marked.length)];
                    const damage = target.damage(player, 1, 'nocard');
                    damage.reason = 'bts_st_guangshu';
                    lib.bts.api.setDamageNature(damage, 'flame');
                    await damage;
                }
                player.skip('phaseUse'); // 源 L9789：setPlayerFlag 结束出牌阶段
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_guangshu')
                    ? -1
                    : 7;
            },
            result: { player: 1, target: -1 },
        },
        subSkill: {
            // 逐星·还原（隐藏）：额外出牌阶段结束后 ChangeHero 切回姬子·启行（源 L9812）。
            back: {
                trigger: { player: ['phaseAfter', 'death'] },
                forced: true,
                filter(event, player, triggername) {
                    if (!player.countMark('bts_zhuxing_active')) return false;
                    if (triggername === 'death') return true;
                    const pl = event.phaseList;
                    return (
                        Array.isArray(pl) &&
                        pl.length === 1 &&
                        pl[0] === 'phaseUse'
                    );
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_zhuxing_active', player.countMark('bts_zhuxing_active'));
                    player.removeMark('bts_st_guangshu_count-play', player.countMark('bts_st_guangshu_count-play'));
                    if (event.triggername !== 'death' && player.isAlive())
                        lib.bts.api.changeHero(player, 'bts_jizi_qixing');
                },
            },
        },
    },
};

export const translate = {
    bts_jizi_qixing: '姬子·启行',
    bts_tuoxingzhe: '拓星者',
    bts_st_zhuxing: '逐星',
    bts_st_zhuxing_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，变形为拓星者并进入一个额外的出牌阶段（拥有「光束」技能）：出牌阶段结束后变回姬子·启行。`,
    bts_st_zhuxing_xu: '逐星·续',
    bts_st_linghang: '领航',
    bts_st_linghang_info: `出牌阶段开始时，你可以弃置一张【杀】，若你没有${get.poptip('bts_glossary_bless_qiyu_faq')}，附加3层${get.poptip('bts_glossary_bless_qiyu_faq')}。`,
    bts_st_yuanzheng: '远征',
    bts_st_yuanzheng_info: `限定技，出牌阶段，你可以结束此阶段并对一名角色造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害。`,
    bts_st_yuanzheng_friend: '远征',
    bts_st_yuanzheng_friend_info: `星穹列车势力角色获得：出牌阶段，若存在未发动「远征」的姬子·启行，你可以结束此阶段，经其同意后代其发动「远征」对一名角色造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害，然后你回复1点怒气。`,
    bts_st_guangshu: '光束',
    bts_st_guangshu_info: `出牌阶段限六次，你可以弃置一名其他角色一张牌，其摸一张牌；第六次发动时，对以此法选择过的随机一名角色造成1点${get.poptip('bts_glossary_nature_yan_dmg_faq')}伤害并结束此阶段。`,
    bts_bless_qiyu: '旗语祝福',

    '$bts_st_zhuxing1': "薪火相继，我们…即是开拓！",
    '$bts_st_zhuxing2': "拓星者，启行",
    '$bts_st_zhuxing3': "（姬子）化作星辰，照亮银河的长夜！",
    '$bts_st_zhuxing4': "（瓦尔特）化作星辰，照亮银河的长夜！",
    '$bts_st_zhuxing5': "（男开拓者）化作星辰，照亮银河的长夜！",
    '$bts_st_zhuxing6': "（三月七）化作星辰，照亮银河的长夜！",
    '$bts_st_zhuxing7': "（丹恒）化作星辰，照亮银河的长夜！",
    '$bts_st_linghang1': "此行，终抵群星！",
    '$bts_st_linghang2': "征途，为你护航！",
    '$bts_st_yuanzheng1': "向着更远的远方",
    '$bts_st_yuanzheng2': "驶向崭新的黎明！",
    '$bts_st_yuanzheng3': "为了最初的愿望",
    '$bts_st_yuanzheng4': "去联结更多的世界",
    '$bts_st_yuanzheng5': "以我们的意志，抵达结局！",
    '$bts_st_yuanzheng6': "敢挡路？揍他！",
    '$bts_st_yuanzheng7': "希望，不会熄灭！",
    '$bts_st_yuanzheng8': "前路，始于足下",
    '$bts_st_guangshu1': "拓星审判，执行！",
    '$bts_st_guangshu2': "拓星者启动。航路障碍，开始清除",
    '~bts_jizi_qixing': "就…交给你们了……",
    '~bts_tuoxingzhe': "就…交给你们了……",
};

export const simpleTranslate = {
    bts_st_zhuxing_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}，变拓星者+额外出牌阶段后切回`,
    bts_st_linghang_info: `出牌开始可弃杀+3${get.poptip('bts_glossary_bless_qiyu_faq')}`,
    bts_st_yuanzheng_info: `限定；对1名角色炎${get.poptip('bts_glossary_bless_fatal_faq')}${get.poptip('bts_glossary_guantong_faq')}伤害并结束出牌`,
    bts_st_guangshu_info:
        '出牌限六次；弃一名其他角色一牌其摸一牌，第六次炸随机目标并结束阶段',
};

export const pinyins = {
    bts_jizi_qixing: 'jiziqixing',
    bts_tuoxingzhe: 'tuoxingzhe',
};
