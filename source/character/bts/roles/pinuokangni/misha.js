// 米沙（源 animal.lua L4316-4409）—— 传冲随机冻结/伤害与充能。
import { lib, game, get, B } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '冰·毁灭·逐梦的门童'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('米沙')}捡别人弃的【杀】、自己也弃【杀】攒${get.poptip('bts_glossary_st_mengchong_faq')}；传冲多了，对范围内的人多砸几发${get.poptip('bts_glossary_abnormal_freeze_faq')}或伤害。`;
export const character = {
    bts_misha: {
        sex: 'male',
        group: 'pinuokangni',
        hp: 3,
        skills: ['bts_st_mengchong', 'bts_st_jizong', 'bts_st_fuwu'],
    },
};
export const skill = {
    // ── 必杀技·传冲（源 st_mengchong = SkillCard + ZeroCardViewAsSkill，L4317-4376）──
    // 出牌阶段，失3怒气并选择至多三名攻击范围内的其他角色，随机进行 3+传冲数 次冲击
    //（星启额外+4）：每次随机目标有30%概率附加冻结，否则受到1点伤害。
    bts_st_mengchong: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L4374）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            // 源 Card filter（L4325）：目标数≤3、目标 ≠ 自己、在攻击范围内
            return target !== player && player.inRange(target);
        },
        selectTarget: [1, 3],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_mengchong');
            lib.bts.api.loseAngry(player, 3); // 源 L4328：LoseAngry(player, 3)
            // 源 L4329-4331：n = 3 + 传冲数（星启+4），然后清空传冲标记
            const times = 3 + player.countMark('bts_st_mengchong');
            player.removeMark(
                'bts_st_mengchong',
                player.countMark('bts_st_mengchong'),
            );
            // 源 L4332-4364：随机 n 次冲击（目标附加冻结或受1伤）
            for (let index = 0; index < times; index++) {
                const targets = event.targets.filter((target) =>
                    target.isAlive(),
                );
                if (!targets.length) break;
                // 源 L4334-4347：随机选目标（略偏向体力最高者，无名杀简化为最高者随机）
                const highest = Math.max(...targets.map((target) => target.hp));
                const target =
                    targets.filter((item) => item.hp === highest).randomGet() ||
                    targets.randomGet();
                // 源 L4354-4359：30% 附加冻结（标记防连续冻结），否则受1伤
                if (
                    Math.random() < 0.3 ||
                    !target.countMark('bts_misha_frozen-turn')
                ) {
                    lib.bts.api.addAbnormal(target, 'freeze', 1, player);
                    target.addMark('bts_misha_frozen-turn', 1, false);
                } else await target.damage(player, 1, 'nocard');
            }
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_mengchong') ? -1 : 7,
            result: { target: -1 },
        },
    },

    // ── 锁定技·机纵（源 st_jizong = TriggerSkill Compulsory CardsMoveOneTime，L4378-4394）──
    // 当角色弃置【杀】后，你获得1枚传冲标记。
    bts_st_jizong: {
        trigger: { global: 'loseAfter' },
        forced: true,
        filter(event, player) {
            // 源 L4385：角色从手牌弃置【杀】
            return (
                event.type === 'discard' &&
                event.cards?.some((card) => get.name(card) === 'sha') &&
                event.player?.isAlive()
            );
        },
        content(event, trigger, player) {
            // 源 L4388：room:addPlayerMark(p, "@st_mengchong")
            player.addMark('bts_st_mengchong', 1);
        },
        ai: { noe: true },
    },

    // ── 锁定技·服务（源 st_fuwu = TriggerSkill Compulsory CardsMoveOneTime，L4396-4408）──
    // 当你获得牌后，可弃置一张【杀】，获得1枚传冲标记。
    bts_st_fuwu: {
        trigger: { player: 'gainAfter' },
        filter(event, player) {
            // 源 L4402：获得牌到手牌，且手牌有【杀】可弃
            return (
                event.cards?.length &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L4402：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '服务：选择弃置一张【杀】获得1枚传冲？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L4402：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L4404：room:addPlayerMark(player, "@st_mengchong")
            player.addMark('bts_st_mengchong', 1);
        },
        ai: { noe: true },
    },
};
export const translate = {
    bts_misha: '米沙',
    bts_st_mengchong: '传冲',
    bts_st_mengchong_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择至多三名攻击范围内的其他角色，随机进行3次（每枚${get.poptip('bts_glossary_st_mengchong_faq')}标记额外1次）冲击：目标附加${get.poptip('bts_glossary_abnormal_freeze_faq')}，或受到1点伤害。`,
    bts_st_jizong: '机纵',
    bts_st_jizong_info: `锁定技，当角色弃置【杀】后，你获得1枚${get.poptip('bts_glossary_st_mengchong_faq')}标记。`,
    bts_st_fuwu: '服务',
    bts_st_fuwu_info: `锁定技，当你获得牌后，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_st_mengchong_faq')}标记。`,

    '$bts_st_mengchong1': "不知道时间还剩多少…",
    '$bts_st_mengchong2': "又、又要来不及了呜啊啊啊——！对不起…",
    '$bts_st_jizong1': "请等一等…！",
    '$bts_st_jizong2': "请…请让一下！",
    '$bts_st_fuwu1': "我这就收拾干净！",
    '$bts_st_fuwu2': "要随时保持整洁！",
    '~bts_misha': "招待…不周……",
};
export const simpleTranslate = {
    bts_st_mengchong_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}，砸范围内至多3人3+${get.poptip('bts_glossary_st_mengchong_faq')}次${get.poptip('bts_glossary_abnormal_freeze_faq')}或伤害`,
    bts_st_jizong_info: `锁；有人弃【杀】就+1${get.poptip('bts_glossary_st_mengchong_faq')}`,
    bts_st_fuwu_info: `锁；拿到牌后可弃杀换+1${get.poptip('bts_glossary_st_mengchong_faq')}`,
};
export const pinyins = { bts_misha: 'misha' };
