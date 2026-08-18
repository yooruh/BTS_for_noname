// 遐蝶（源 animal.lua L7701-7860）—— 新蕊召唤死龙的忆灵组合模板。
// 技能：亡哮（必杀技·弃7新蕊召唤死龙）、荒芜（他人扣血得新蕊）、幽蝶（用杀后群自损）、
//       死龙：焰息（自伤2+暗伤）、晦翼（死龙承伤等量失生命）、荫蔽（代受致死伤害）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '量子·记忆·死荫的侍女'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('遐蝶')}用${get.poptip('bts_glossary_xinrui_faq')}召死龙，组合形态里替自己扛伤，再甩${get.poptip('bts_glossary_nature_dark_faq')}暗伤。`;

export const character = {
    bts_xiadie: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_wangxiao', 'bts_st_huangwu', 'bts_st_youdie'],
    },
};

export const transformCharacter = {
    // 死龙（源 silong，L7798 起）：遐蝶的忆灵，7体力。
    bts_silong: {
        isUnseen: true,
        sex: 'male',
        group: 'huangjinyi',
        hp: 7,
        skills: ['bts_st_yanxi', 'bts_st_huiyi', 'bts_st_yinbi'],
    },
    // 组合形态（源 xiadie_and_silong，L7854-7860）：11体力，技能并集。
    bts_xiadie_and_silong: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 11,
        skills: [
            'bts_st_wangxiao',
            'bts_st_huangwu',
            'bts_st_youdie',
            'bts_st_yanxi',
            'bts_st_huiyi',
            'bts_st_yinbi',
        ],
    },
};

// 替代形态注册：遐蝶召唤死龙进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_xiadie: [['bts_xiadie_and_silong', []]],
};

export const skill = {
    // ── 必杀技·亡哮（源 st_wangxiao = SkillCard + ZeroCardViewAsSkill，L7702-7722）──
    // 出牌阶段，若新蕊≥7且无死龙，弃7枚新蕊召唤死龙；若你为星启，此回合结束执行额外回合。
    bts_st_wangxiao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7720）：新蕊≥7 且未召唤死龙
            return (
                player.countMark('bts_xinrui') >= 7 &&
                !lib.bts.api.getPet(player, 'silong')
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_wangxiao');
            player.removeMark('bts_xinrui', 7); // 源 L7706：LoseOther(player, "@xinrui", 7)
            lib.bts.api.addPet(player, 'silong', { removeRecover: 1 }); // 源 L7707：AddPet(player, "silong")
            // 源 L7708-7710：星启时 addPlayerMark "extra_turn" —— 额外回合
            if (lib.bts.api.god(player)) lib.bts.api.extraTurn(player, 'bts_extra_turn');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_wangxiao')
                    ? -1
                    : 9;
            },
            result: { player: 3 },
        },
    },

    // ── 触发技·荒芜（源 st_huangwu = TriggerSkill HpChanged，L7724-7755）──
    // 当一名角色扣减体力后，若你没有死龙，其可以令你获得等量新蕊（至多7枚）。
    bts_st_huangwu: {
        trigger: { global: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 源 L7735-7741：扣减量>0、无死龙、新蕊未满（源 n=7，爱诗『生死』诗时 n=14）
            const n = player.hasSkill('bts_st_aishi') ? 14 : 7;
            return (
                !lib.bts.api.getPet(player, 'silong') &&
                player.countMark('bts_xinrui') < n &&
                lib.bts.api.lostHp(event) > 0 &&
                event.player?.isAlive()
            );
        },
        async content(event, trigger, player) {
            // 源 L7740-7742：n=7（GetXiLian 爱诗时 n=14）；p:gainMark("@xinrui", min(x, n-当前))
            const n = player.hasSkill('bts_st_aishi') ? 14 : 7;
            const amount = Math.min(
                lib.bts.api.lostHp(trigger),
                n - player.countMark('bts_xinrui'),
            );
            const owner = trigger.player;
            // 源 L7741：askForSkillInvoke(player=扣血者) —— 由扣血者决定是否发动
            const choice = await owner
                .chooseBool(
                    `荒芜：是否令${get.translation(player)}获得${amount}枚新蕊？`,
                )
                .set('ai', () => get.attitude(owner, player) > 0)
                .forResult();
            if (!choice.bool) return;
            player.addMark('bts_xinrui', amount);
        },
        ai: { noe: true },
    },

    // ── 触发技·幽蝶（源 st_youdie = TriggerSkill CardUsed Slash + SkillCard，L7757-7796）──
    // 你使用【杀】时，可选择任意名其他角色；你失去1点体力，这些角色依次可以失去1点体力。
    bts_st_youdie: {
        trigger: { player: 'useCard' },
        filter(event, player) {
            // 源 L7792：使用【杀】时询问（源 askForUseCard("@@st_youdie")）
            return (
                event.card?.name === 'sha' &&
                game.hasPlayer((target) => target !== player)
            );
        },
        async cost(event, trigger, player) {
            // 发动选择：目标选择（源 st_youdieCard 确认目标后进入效果）
            event.result = await player
                .chooseTarget(
                    '幽蝶：是否选择任意名其他角色？',
                    [1, Infinity],
                    (card, source, target) => target !== source,
                    (target) => get.attitude(player, target),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选目标在技能事件 event.targets（标准约定）
            // 源 st_youdieCard on_use（animal.lua L7765-7774）：确认目标后自身失去1点
            // 体力（发动后代价，保留在 content），目标各选择是否失去1点体力。
            await player.loseHp(); // 源 L7766：room:loseHp(player)
            for (const target of event.targets.filter((target) =>
                target.isAlive(),
            )) {
                // 源 L7770-7771：askForSkillInvoke(p) —— 目标可选择失去1点体力
                const choice = await target
                    .chooseBool(`幽蝶：是否失去1点体力？`)
                    .set(
                        'ai',
                        () => get.attitude(target, player) > 0 && target.hp > 1,
                    )
                    .forResult();
                if (choice.bool) await target.loseHp();
            }
        },
        ai: { noe: true },
    },

    // ── 主动技·焰息（源 st_yanxi = SkillCard + ZeroCardViewAsSkill，L7799-7818）──
    // 出牌阶段，对自己造成2点伤害并选择一名其他角色，对其造成1点量子伤害。
    bts_st_yanxi: {
        enable: 'phaseUse',
        usable: 1,
        filterTarget(card, player, target) {
            // 源 Card filter（L7802）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yanxi');
            const target = event.targets[0];
            // 源 L7805：对自己造成2点伤害（reason 无元素）
            const selfDamage = player.damage(player, 2, 'nocard');
            selfDamage.reason = 'bts_st_yanxi';
            await selfDamage;
            if (!target.isAlive()) return;
            // 源 L7806：对目标造成 "_dark" 量子伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_yanxi_dark';
            lib.bts.api.setDamageNature(damage, 'dark');
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yanxi') ? -1 : 9;
            },
            result: { player: -1, target: -2 },
        },
    },

    // ── 锁定技·晦翼（源 st_huiyi = TriggerSkill Compulsory Damaged，L7820-7826）──
    // 源实现为空技能（events 声明的 Damaged 无实际逻辑）；死龙承伤由全局忆灵生命池结算
    //（rules/resolver.js petLifeDelta，用户定夺 2026-09-02 统一实现；
    // 耗尽移除后 removePet 的 removeRecover:1 回复1点体力）。
    bts_st_huiyi: {
        charlotte: true,
        trigger: { player: 'damageEnd' },
        forced: true,
        filter() {
            return false;
        },
        content() {},
        ai: { noe: true },
    },

    // ── 触发技·荫蔽（源 st_yinbi = TriggerSkill DamageInflicted，L7828-7852）──
    // 其他角色受到不小于其体力值的伤害时，若死龙存在，你可以代为承受此伤害（伤害转移）。
    bts_st_yinbi: {
        trigger: { global: 'damageBegin2' },
        filter(event, player) {
            // 源 L7836：伤害目标 ≠ 你、伤害 ≥ 目标体力、且你有死龙（无名杀以 _btsYinbi 防重入）
            return (
                event.player &&
                event.player !== player &&
                event.num > 0 &&
                event.num >= event.player.hp &&
                lib.bts.api.getPet(player, 'silong') &&
                !event._btsYinbi
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player; // trigger=damageBegin2 事件
            // 源 L7836：askForSkillInvoke —— 是否代受
            const choice = await player
                .chooseBool(
                    `荫蔽：是否代替${get.translation(target)}承受${trigger.num}点伤害？`,
                )
                .set(
                    'ai',
                    () =>
                        get.attitude(player, target) > 0 &&
                        player.hp > trigger.num,
                )
                .forResult();
            if (!choice.bool) return;
            trigger._btsYinbi = true; // 防重入
            // 源 L7841-7843：damage.to = p 并重新结算 —— 转移给死龙（player）
            const damage = player.damage(trigger.source, trigger.num, 'nocard');
            damage.reason = trigger.reason || 'bts_st_yinbi';
            damage._btsYinbi = true;
            if (trigger._btsNature)
                lib.bts.api.setDamageNature(damage, trigger._btsNature);
            await damage;
            trigger.cancel(); // 源 L7845：return true 阻止原伤害
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_xiadie: '遐蝶',
    bts_silong: '死龙',
    bts_xiadie_and_silong: '遐蝶&死龙',
    bts_st_wangxiao: '亡哮',
    bts_st_wangxiao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，若你拥有至少7枚${get.poptip('bts_glossary_xinrui_faq')}且没有死龙，你可以弃7枚${get.poptip('bts_glossary_xinrui_faq')}，召唤死龙；若你为${get.poptip('bts_glossary_xingqi_faq')}，此回合结束时，执行一个额外的回合。`,
    bts_st_huangwu: '荒芜',
    bts_st_huangwu_info: `当一名角色扣减体力后，若你没有死龙，其可以令你获得等量的${get.poptip('bts_glossary_xinrui_faq')}（至多7枚，若你拥有${get.poptip('bts_st_aishi')}则至多14枚）。`,
    bts_st_youdie: '幽蝶',
    bts_st_youdie_info:
        '当你使用【杀】时，你可以选择任意名其他角色。你失去1点体力，这些角色依次可以失去1点体力。',
    bts_st_yanxi: '焰息',
    bts_st_yanxi_info: `出牌阶段，你可以对自己造成2点伤害并选择一名其他角色，对其造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害。`,
    bts_st_huiyi: '晦翼',
    bts_st_huiyi_info:
        '锁定技，死龙承受伤害时等量失去生命；死龙生命耗尽被移除后，你回复1点体力。',
    bts_st_yinbi: '荫蔽',
    bts_st_yinbi_info:
        '当其他角色受到不小于其体力值的伤害时，若死龙存在，你可以代为承受此伤害。',
    bts_xinrui: '新蕊',
    bts_pet_silong: '死龙',

    '$bts_st_wangxiao1': "拥抱「新生」吧，玻吕刻斯",
    '$bts_st_wangxiao2': "惟愿「死亡」…捍卫你我！",
    '$bts_st_huangwu1': "我会铭记此刻的温度",
    '$bts_st_huangwu2': "破茧而生",
    '$bts_st_youdie1': "请就此凋零",
    '$bts_st_youdie2': "赐予你所求",
    '$bts_st_huiyi1': "沉眠吧",
    '$bts_st_yanxi1': "亡魂，返归尘土",
    '$bts_st_yinbi1': "生命并非如蝶翼般易折",
    '$bts_st_huiyi2': "很快，你也要向冥界去了",
    '$bts_st_yanxi2': "暗幕，随我同行",
    '$bts_st_yinbi2': "请珍惜灵魂还未枯萎的时光",
    '~bts_silong': "好温暖啊…西风……",
    '~bts_xiadie': "好温暖啊…西风……",
};

export const simpleTranslate = {
    bts_st_wangxiao_info: `${get.poptip('bts_glossary_bisha_faq')}；弃7${get.poptip('bts_glossary_xinrui_faq')}召唤死龙，${get.poptip('bts_glossary_xingqi_faq')}时额外回合`,
    bts_st_huangwu_info: `他人扣血后可令你获得等量${get.poptip('bts_glossary_xinrui_faq')}（至多7，${get.poptip('bts_st_aishi')}时14）`,
    bts_st_youdie_info: '用杀后可选其他角色；自身失1体力，目标可各失1体力',
    bts_st_yanxi_info: '出牌阶段自伤2，对1名其他角色造成1点暗伤',
    bts_st_huiyi_info: '锁；死龙受伤等量失生命，耗尽移除后回复1',
    bts_st_yinbi_info: '其他角色受致死伤害时，死龙可代为承受',
};

export const pinyins = {
    bts_xiadie: 'xiadie',
    bts_silong: 'silong',
    bts_xiadie_and_silong: 'xiadiesilong',
};
