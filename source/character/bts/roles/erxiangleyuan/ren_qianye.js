// 千冶·刃（源 animal.lua L9572-9750）—— 薪肉切换、煞火与刃葬。
// 技能：薪肉（必杀技·变身为千冶形态）、千冶（必杀技·群体通常伤害）、忿怒（暴击+致命+濒死还原）、
//       尽偿（伤害附加煞火）、刃葬（吸收煞火群杀 / 附加地狱群决斗）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'erxiangleyuan';
export const title = '火·虚无·千冶成刃'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('千冶·刃')}用薪肉换出${get.poptip('bts_glossary_abnormal_shahuo_faq')}形态，濒死后再把薪肉拿回来。`;

export const character = {
    bts_ren_qianye: {
        sex: 'male',
        group: 'erxiangleyuan',
        hp: 4,
        skills: ['bts_st_xinrou'],
    },
};

export const skill = {
    // ── 必杀技·薪肉（源 st_xinrou = SkillCard + ZeroCardViewAsSkill，L9573-9594）──
    // 出牌阶段，失5怒气和1点体力，移除薪肉并取得千冶/忿怒/尽偿/刃葬，所有其他角色各附加2层煞火。
    bts_st_xinrou: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9592）：怒气≥5 且体力>0
            return lib.bts.api.getAngry(player, 5) && player.hp > 0;
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xinrou');
            lib.bts.api.loseAngry(player, 5); // 源 L9577：LoseAngry(player, 5)
            await player.loseHp(); // 源 L9578：room:loseHp(player)
            // 源 L9579：handleAcquireDetachSkills "-st_xinrou|st_qianye|st_fennu|st_renzang|st_jinchang"
            //（移除薪肉，取得千冶形态四技）
            await player.removeSkill('bts_st_xinrou');
            await player.addSkill('bts_st_qianye');
            await player.addSkill('bts_st_fennu');
            await player.addSkill('bts_st_jinchang');
            await player.addSkill('bts_st_renzang');
            // 源 L9580-9582：所有其他角色各附加2层煞火
            for (const target of game.filterPlayer((target) => target !== player))
                lib.bts.api.addAbnormal(target, 'shahuo', 2, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xinrou')
                    ? -1
                    : 9;
            },
            result: { player: 2 },
        },
    },

    // ── 必杀技·千冶（源 st_qianye = SkillCard + ZeroCardViewAsSkill，L9596-9617）──
    // 出牌阶段，失5怒气，对任意名其他角色各造成1点通常伤害。
    bts_st_qianye: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        charlotte: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9615）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9599）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_qianye');
            lib.bts.api.loseAngry(player, 5); // 源 L9602：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L9604：reason 含 "_normal"（通常伤害，_common 等价标记使 reason 不触发特殊伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_qianye_common';
                await damage;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_qianye')
                    ? -1
                    : 8;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·忿怒（源 st_fennu = TriggerSkill Compulsory EnterDying/ConfirmDamage，L9620-9643）──
    // 你造成的伤害视为暴击+致命伤害；进入濒死时回复至3点，移除本形态技能并重获薪肉。
    bts_st_fennu: {
        charlotte: true,
        trigger: { source: 'damageBegin1', player: 'dying' },
        forced: true,
        filter(event, player, triggername) {
            // 源 L9625-9641：EnterDying（自己濒死）或 ConfirmDamage（自己造成伤害）
            // triggername 判变体（event.name 为基名 'damage'/'dying'）
            return triggername === 'damageBegin1' || (event.player === player && player.hp < 1);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'damageBegin1') {
                // 源 L9639：AddNew(damage, "_critical_fatal") —— 视为暴击+致命伤害（改触发事件 damage）
                lib.bts.api.markDamage(trigger, '_critical');
                lib.bts.api.markDamage(trigger, '_fatal');
                return;
            }
            // 源 L9630：恢复至3点体力
            await player.recover(player, 3 - player.hp);
            // 源 L9631-9634：移除全部可见技能并重获薪肉（还原为原始形态）
            for (const skill of [
                'bts_st_qianye',
                'bts_st_fennu',
                'bts_st_jinchang',
                'bts_st_renzang',
            ])
                if (player.hasSkill(skill)) await player.removeSkill(skill);
            await player.addSkill('bts_st_xinrou');
        },
        ai: { noe: true },
    },

    // ── 锁定技·尽偿（源 st_jinchang = TriggerSkill Compulsory Damage，L9646-9676）──
    // 当你对其他角色造成伤害后，令其附加1层煞火。
    bts_st_jinchang: {
        charlotte: true,
        trigger: { source: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 源 L9653-9654：伤害目标 ≠ 自己（且存活）
            return event.player !== player && event.num > 0;
        },
        content(event, trigger, player) {
            // 源 L9668：AddAbnormal(damage.to, "@abnormal_shahuo", 1, player)（trigger=伤害事件）
            lib.bts.api.addAbnormal(trigger.player, 'shahuo', 1, player);
        },
        ai: { noe: true },
    },

    // ── 主动技·刃葬（源 st_renzang = SkillCard + ZeroCardViewAsSkill，L9679-9748）──
    // 出牌阶段，煞火总数≥9时可吸收全场煞火视为使用【杀】；体力>1时可附加地狱并视为使用【决斗】。
    bts_st_renzang: {
        charlotte: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9742-9746）：体力>1 或全场煞火≥9
            const total = game
                .filterPlayer()
                .reduce(
                    (num, target) =>
                        num + lib.bts.api.getAbnor(target, 'shahuo', -1),
                    0,
                );
            return player.hp > 1 || total >= 9;
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L9696）：(体力>1 且可决斗) 或 (煞火≥9 且可用【杀】)
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            const total = game
                .filterPlayer()
                .reduce(
                    (num, target) =>
                        num + lib.bts.api.getAbnor(target, 'shahuo', -1),
                    0,
                );
            // 源 L9703-9710：选择「吸收煞火后【杀】」或「地狱决斗」
            const choice = await player
                .chooseControl(
                    [
                        ['duel', '地狱决斗'],
                        ['slash', '吸收煞火后【杀】'],
                    ],
                    '刃葬：选择效果',
                )
                .forResult();
            if (choice.control === 'slash' && total >= 9) {
                // 源 L9711-9718：移除其他角色全部煞火，自身保留 (n-9) 层后视为使用【杀】
                for (const target of game.filterPlayer())
                    lib.bts.api.removeAbnormal(target, 'shahuo', -1);
                lib.bts.api.addAbnormal(
                    player,
                    'shahuo',
                    Math.max(0, total - 9),
                    player,
                );
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { bts_st_renzang: true },
                    },
                    event.targets,
                );
                return;
            }
            // 源 L9720：附加1层地狱；L9730-9732：对目标视为使用【决斗】
            if (player.hp <= 1) return;
            lib.bts.api.addAbnormal(player, 'diyu', 1, player);
            for (const target of event.targets)
                await player.useCard(
                    {
                        name: 'juedou',
                        isCard: true,
                        storage: { bts_st_renzang: true },
                    },
                    target,
                );
        },
        ai: { order: 7, result: { target: -1 } },
    },
};

export const translate = {
    bts_ren_qianye: '千冶·刃',
    bts_st_xinrou: '薪肉',
    bts_st_xinrou_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}和1点体力，失去薪肉，获得千冶、忿怒、尽偿、刃葬，所有其他角色各附加2层${get.poptip('bts_glossary_abnormal_shahuo_faq')}。`,
    bts_st_qianye: '千冶',
    bts_st_qianye_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对这些角色各造成1点通常伤害。`,
    bts_st_fennu: '忿怒',
    bts_st_fennu_info: `锁定技，你造成的伤害视为${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}伤害；进入濒死时回复至3点，失去本形态技能并重获薪肉。`,
    bts_st_jinchang: '尽偿',
    bts_st_jinchang_info: `锁定技，当你对其他角色造成伤害后，令其附加1层${get.poptip('bts_glossary_abnormal_shahuo_faq')}。`,
    bts_st_renzang: '刃葬',
    bts_st_renzang_info: `出牌阶段，你可以在${get.poptip('bts_glossary_abnormal_shahuo_faq')}总数达到9时吸收${get.poptip('bts_glossary_abnormal_shahuo_faq')}视为使用【杀】，或体力大于1时附加${get.poptip('bts_glossary_abnormal_diyu_faq')}并视为使用【决斗】。`,
    bts_abnormal_shahuo: '煞火',

    '$bts_st_xinrou1': "支离血肉，千冶成刃",
    '$bts_st_qianye1': "于万死中归来……",
    '$bts_st_fennu1': "为你送葬",
    '$bts_st_renzang1': "炼狱…加身！",
    '$bts_st_qianye2': "焚此残躯，以尔等淬火！",
    '$bts_st_fennu2': "剑若出鞘，不死不休",
    '$bts_st_renzang2': "剑冢…无间！",
    '~bts_ren_qianye': "倏忽…还不能……",
};

export const simpleTranslate = {
    bts_st_xinrou_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}和1体力变身，并令所有其他角色各+2${get.poptip('bts_glossary_abnormal_shahuo_faq')}`,
    bts_st_qianye_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}群体通常伤害`,
    bts_st_fennu_info: `锁；伤害${get.poptip('bts_glossary_bless_critical_faq')}${get.poptip('bts_glossary_bless_fatal_faq')}，濒死回复并还原`,
    bts_st_jinchang_info: `锁；造成伤害后目标+${get.poptip('bts_glossary_abnormal_shahuo_faq')}`,
    bts_st_renzang_info: `${get.poptip('bts_glossary_abnormal_shahuo_faq')}≥9时吸收后群杀，或体力>1时附加${get.poptip('bts_glossary_abnormal_diyu_faq')}群决斗`,
};

export const pinyins = { bts_ren_qianye: 'renqianye' };
