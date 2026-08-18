// 灵砂（源 animal.lua L6998-7094）—— 沉醉、浮元与火属性追击。
// 技能：燎霞（必杀技·沉醉异常+星启弃牌）、氛氲（得失技能后治疗受伤角色）、飞彩（受伤弃杀获浮元）、
//       浮元（必杀后/结束阶段视为用杀，防伤弃牌+炎+治疗，3次后失去）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '火·丰饶·丹鼎司司鼎'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('灵砂')}给对手挂${get.poptip('bts_glossary_abnormal_chunzui_faq')}，${get.poptip('bts_glossary_fuyuan_faq')}的追击能改成弃牌、挂${get.poptip('bts_glossary_nature_yan_faq')}和回血。`;

export const character = {
    bts_lingsha: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_st_liaoxia', 'bts_st_fenyun', 'bts_st_feicai'],
    },
};

export const skill = {
    // ── 必杀技·燎霞（源 st_liaoxia = SkillCard + ZeroCardViewAsSkill，L6999-7026）──
    // 出牌阶段，失5怒气，令至少一名其他角色各附加2层沉醉异常；若你为星启，弃置这些角色各一张手牌。
    bts_st_liaoxia: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7024）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7002）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_liaoxia');
            lib.bts.api.loseAngry(player, 5); // 源 L7005：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L7007：AddAbnormal(p, "@abnormal_chunzui", 2)
                lib.bts.api.addAbnormal(target, 'chunzui', 2, player);
                // 源 L7009-7013：星启时弃置目标各一张手牌
                if (lib.bts.api.god(player) && target.countCards('h'))
                    await player.discardPlayerCard(target, 'h', true);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_liaoxia') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·氛氲（源 st_fenyun = TriggerSkill EventAcquireSkill/EventLoseSkill，L7028-7046）──
    // 当你获得或失去技能后，你可以令一名受伤角色回复1点体力。
    bts_st_fenyun: {
        trigger: { player: ['gainSkillAfter', 'loseSkillAfter'] },
        filter(event) {
            // 源 L7033-7037：存在受伤角色
            return game.hasPlayer((target) => target.isDamaged());
        },
        async cost(event, trigger, player) {
            // 源 L7039：askForPlayerChosen 选择一名受伤角色
            event.result = await player
                .chooseTarget(
                    '氛氲：选择一名受伤角色回复1点体力',
                    [1, 1],
                    (card, source, target) => target.isDamaged(),
                    (target) => get.attitude(player, target),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L7042：room:recover(target, RecoverStruct(player))
            await event.targets[0].recover(player);
        },
        ai: { result: { target: 1 } },
    },

    // ── 触发技·飞彩（源 st_feicai = TriggerSkill Damaged，L7048-7057）──
    // 受到伤害后，可弃置一张【杀】，获得浮元。
    bts_st_feicai: {
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            // 源 L7052：未拥有浮元且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                !player.hasSkill('bts_st_fuyuan') &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7052：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '飞彩：是否弃置一张【杀】获得浮元？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7054：acquireSkill(player, "st_fuyuan")
            await player.addSkill('bts_st_fuyuan');
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·浮元（源 st_fuyuan = TriggerSkill CardFinished/EventPhaseStart，L7059-7092）──
    // 发动必杀技后或结束阶段开始时，可视为对攻击范围内一名其他角色使用【杀】；
    // 此【杀】造成伤害时防止伤害、弃牌+炎+治疗（见 resolver damageBegin1 浮元链）；
    // 累计发动3次后失去此技能。
    bts_st_fuyuan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        charlotte: true,
        trigger: { player: ['useSkillAfter', 'phaseJieshuBegin'] },
        filter(event, player, triggername) {
            // 源 L7064-7071：使用必杀技（max_ 技能牌）或结束阶段开始。
            // 无名杀以 bts_bisha 标签判定（勿用 includes('st_')，命中所有 bts_st_* 技能）
            return (
                triggername === 'phaseJieshuBegin' ||
                lib.skill[event.skill]?.bts_bisha === true
            );
        },
        async cost(event, trigger, player) {
            // 源 L7081：askForPlayerChosen 选择一名可【杀】角色
            event.result = await player
                .chooseTarget(
                    '浮元：视为对一名其他角色使用【杀】',
                    [1, 1],
                    (card, source, target) => target !== source && source.inRange(target),
                    (target) => -get.attitude(player, target),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            const target = event.targets[0];
            // 源 L7083：ViewAsCardOnly "st_fuyuan" —— 视为使用【杀】（真实【杀】，可被闪）
            await player.useCard(
                { name: 'sha', isCard: true, storage: { bts_st_fuyuan: true } },
                target,
                'bts_st_fuyuan',
            );
            // 源 L7084：gainMark("@fuyuan") —— 计数
            player.addMark('bts_fuyuan', 1);
            // 源 L7085-7087：累计>2 次后移除浮元
            if (player.countMark('bts_fuyuan') > 2) {
                player.removeMark('bts_fuyuan', player.countMark('bts_fuyuan'));
                await player.removeSkill('bts_st_fuyuan');
            }
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_lingsha: '灵砂',
    bts_st_liaoxia: '燎霞',
    bts_st_liaoxia_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并令至少一名其他角色各附加2层${get.poptip('bts_glossary_abnormal_chunzui_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，弃置这些角色各一张手牌。`,
    bts_st_fenyun: '氛氲',
    bts_st_fenyun_info:
        '当你获得或失去技能后，你可以令一名受伤角色回复1点体力。',
    bts_st_feicai: '飞彩',
    bts_st_feicai_info: `受到伤害后，你可以弃置一张【杀】，获得${get.poptip('bts_glossary_fuyuan_faq')}。`,
    bts_st_fuyuan: '浮元',
    bts_st_fuyuan_info: `发动${get.poptip('bts_glossary_bisha_faq')}后或结束阶段开始时，你可以视为对攻击范围内一名其他角色使用【杀】（有距离限制且可被响应）：此【杀】造成伤害时防止伤害，令其弃置等同于伤害值的手牌并附加${get.poptip('bts_glossary_nature_yan_faq')}，令因你而回复过体力的角色中体力值最少的角色回复1点体力；累计发动3次后失去此技能。`,

    '$bts_st_liaoxia1': "金鳞燃犀，洞若观火",
    '$bts_st_liaoxia2': "世间种种…不过是过眼云烟",
    '$bts_st_fenyun1': "腥膻恶臭快些散去如何？",
    '$bts_st_fenyun2': "还得让妾身来正本清源…",
    '$bts_st_feicai1': "去污除秽，请",
    '$bts_st_feicai2': "身心，需清净",
    '$bts_st_fuyuan1': "炉香袅孤碧，云缕霏数千",
    '$bts_st_fuyuan2': "有破绽哦",
    '~bts_lingsha': "烟消…火灭……",
};

export const simpleTranslate = {
    bts_st_liaoxia_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+2${get.poptip('bts_glossary_abnormal_chunzui_faq')}，${get.poptip('bts_glossary_xingqi_faq')}各弃1手牌`,
    bts_st_fenyun_info: '得失技能后可令1名受伤角色回复1',
    bts_st_feicai_info: `受伤后可弃杀获得${get.poptip('bts_glossary_fuyuan_faq')}`,
    bts_st_fuyuan_info: `${get.poptip('bts_glossary_bisha_faq')}后或结束阶段可用${get.poptip('bts_glossary_fuyuan_faq')}杀：防伤、弃N牌+炎、治疗最低关联者；3次后失去`,
};

export const pinyins = { bts_lingsha: 'lingsha' };
