// 遐蝶（源 animal.lua L7701-7860）—— 新蕊召唤死龙的忆灵组合模板。
// 技能：亡哮（必杀技·弃7新蕊召唤死龙）、荒芜（他人扣血得新蕊）、幽蝶（用杀后群自损）、
//       死龙：焰息（自伤2+暗伤）、晦翼（死龙承伤等量失生命）、荫蔽（代受致死伤害）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '量子·记忆·死荫的侍女'; // 属性·命途
export const intro =
    `${B('遐蝶')}用${get.poptip('bts_glossary_xinrui_faq')}召${get.poptip('bts_ch_silong')}，组合形态里替自己扛伤，再甩${get.poptip('bts_glossary_nature_dark_faq')}暗伤。`;

export const character = {
    bts_ch_xiadie: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_wangxiao', 'bts_sk_huangwu', 'bts_sk_youdie'],
    },
};

export const transformCharacter = {
    // 死龙（源 silong，L7798 起）：遐蝶的忆灵，7体力。
    bts_ch_silong: {
        isUnseen: true,
        sex: 'male',
        group: 'huangjinyi',
        hp: 7,
        skills: ['bts_sk_yanxi', 'bts_sk_huiyi', 'bts_sk_yinbi'],
    },
    // 组合形态（源 xiadie_and_silong，L7854-7860）：11体力，技能并集。
    bts_ch_xiadie_and_silong: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 11,
        skills: [
            'bts_sk_wangxiao',
            'bts_sk_huangwu',
            'bts_sk_youdie',
            'bts_sk_yanxi',
            'bts_sk_huiyi',
            'bts_sk_yinbi',
        ],
    },
};

// 替代形态注册：遐蝶召唤死龙进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_ch_xiadie: [['bts_ch_xiadie_and_silong', []]],
};

export const skill = {
    // ── 必杀技·亡哮（源 st_wangxiao = SkillCard + ZeroCardViewAsSkill，L7702-7722）──
    // 出牌阶段，若新蕊≥7且无死龙，弃7枚新蕊召唤死龙；若你为星启，此回合结束执行额外回合。
    bts_sk_wangxiao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        bts_bisha_angry: false, // 资源型必杀（新蕊发动、不消耗怒气）→ 拥有者不获得怒气（utils.hasAngryBisha 门控）
        // 召唤忆灵的技能均为 unique:true（定夺）
        unique: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7720）：新蕊≥7 且未召唤死龙
            return (
                player.countMark('bts_mk_xinrui') >= 7 &&
                !lib.bts.api.getPet(player, 'silong')
            );
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wangxiao');
            player.removeMark('bts_mk_xinrui', 7); // 源 L7706：LoseOther(player, "@xinrui", 7)
            await lib.bts.api.addPet(player, 'silong'); // 源 L7707：AddPet(player, "silong")
            // 源 L7708-7710：星启时 addPlayerMark "extra_turn" —— 额外回合
            if (lib.bts.api.god(player)) lib.bts.api.extraTurn(player, 'bts_extra_turn');
        },
        ai: {
            // AI 口径：新蕊满7且无死龙→弃7召唤（+7体力池、解锁焰息/荫蔽/晦翼）；合体按体力
            // 取小后补回，残血时回复量更大；星启另加回合（源 max_wangxiao StarRail-ai.lua L814-830 估值9）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_wangxiao')) return -1;
                if (
                    player.countMark('bts_mk_xinrui') < 7 ||
                    lib.bts.api.getPet(player, 'silong')
                )
                    return -1; // filter 同门：未满7或已有死龙不可用
                let value = 8; // 基础：死龙长线战力（体力池+技能组）
                if (player.hp < player.maxHp) value += 1; // 残血合体：回复量≈+7
                if (lib.bts.api.god(player)) value += 1; // 星启：回合结束额外回合
                return Math.min(9, value);
            },
            result: {
                // 施动方：召唤死龙（体力池/技能组/星启额外回合），长线收益按3计
                player: 3,
            },
        },
    },

    // ── 触发技·荒芜（源 st_huangwu = TriggerSkill HpChanged，L7724-7755）──
    // 当一名角色扣减体力后，若你没有死龙，其可以令你获得等量新蕊（至多7枚）。
    bts_sk_huangwu: {
        trigger: { global: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 源 L7735-7741：扣减量>0、无死龙、新蕊未满（源 n=7，爱诗『生死』诗时 n=14）
            const n = player.hasSkill('bts_sk_aishi') ? 14 : 7;
            return (
                !lib.bts.api.getPet(player, 'silong') &&
                player.countMark('bts_mk_xinrui') < n &&
                lib.bts.api.getLostHp(event) > 0 &&
                event.player?.isAlive()
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            // amount 为 content 同款纯计算（源 L7740-7742，prompt 需要）
            const n = player.hasSkill('bts_sk_aishi') ? 14 : 7;
            const amount = Math.min(
                lib.bts.api.getLostHp(trigger),
                n - player.countMark('bts_mk_xinrui'),
            );
            const owner = trigger.player;
            // 源 L7741：askForSkillInvoke(player=扣血者) —— 由扣血者决定是否发动
            event.result = await owner
                .chooseBool(
                    `荒芜：是否令${get.translation(player)}获得${amount}枚新蕊？`,
                )
                .set('ai', () => get.attitude(owner, player) > 0)
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L7740-7742：n=7（GetXiLian 爱诗时 n=14）；p:gainMark("@xinrui", min(x, n-当前))
            const n = player.hasSkill('bts_sk_aishi') ? 14 : 7;
            const amount = Math.min(
                lib.bts.api.getLostHp(trigger),
                n - player.countMark('bts_mk_xinrui'),
            );
            player.addMark('bts_mk_xinrui', amount);
        },
    },

    // ── 触发技·幽蝶（源 st_youdie = TriggerSkill CardUsed Slash + SkillCard，L7757-7796）──
    // 你使用【杀】时，可选择任意名其他角色；你失去1点体力，这些角色依次可以失去1点体力。
    bts_sk_youdie: {
        trigger: { player: 'useCard' },
        filter(event, player) {
            // 源 L7792：使用【杀】时询问（源 askForUseCard("@@st_youdie")）
            return (
                event.card?.name === 'sha' &&
                game.hasPlayer((target) => target !== player)
            );
        },
        async cost(event, trigger, player) {
            // 目标选择（源 st_youdieCard）。定夺 C-05：维持 [1, Infinity]——源允许 0 目标（仅自损1），
            // 本引擎 chooseTarget 取消即同效，无需放宽。
            event.result = await player
                .chooseTarget(
                    '幽蝶：是否选择任意名其他角色？',
                    [1, Infinity],
                    (card, source, target) => target !== source,
                    // 源 AI（@@st_youdie）：仅本体（无死龙）且自身不虚弱、新蕊未满时发动，目标
                    // 取全体友方——友方失血经「荒芜」转成新蕊；无收益（有死龙/已满/自身将死）
                    // 则不给分（cost 型：最高分≤0 引擎取消）
                    (target) => {
                        const att = get.attitude(player, target);
                        if (att <= 0) return att; // 敌方/中立不给分
                        if (target.hp <= 1) return 0; // 目标不会失最后1点体力（内层 ai 同门）
                        if (
                            lib.bts.api.getPet(player, 'silong') ||
                            player.countMark('bts_mk_xinrui') >=
                                (player.hasSkill('bts_sk_aishi') ? 14 : 7)
                        )
                            return 0; // 荒芜无法再吸新蕊：白扣目标体力，放弃
                        if (player.hp <= 2) return 0; // 自伤1后可能濒死（源 not isWeak）
                        return att;
                    },
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
                        // AI 口径：与 cost 的 ai2 同源——遐蝶方能受益（无死龙且新蕊未满，
                        // 爱诗上限14）才值得友方失血；自身>1体力（源 AI asFriend+not isWeak）
                        () =>
                            get.attitude(target, player) > 0 &&
                            target.hp > 1 &&
                            !lib.bts.api.getPet(player, 'silong') &&
                            player.countMark('bts_mk_xinrui') <
                                (player.hasSkill('bts_sk_aishi') ? 14 : 7),
                    )
                    .forResult();
                if (choice.bool) await target.loseHp();
            }
        },
    },

    // ── 主动技·焰息（源 st_yanxi = SkillCard + ZeroCardViewAsSkill，L7799-7818）──
    // 出牌阶段，对自己造成2点伤害并选择一名其他角色，对其造成1点量子伤害。
    // 定夺 C-06：去 usable 对齐源（无次数限制，靠自伤 2 自缚）。
    bts_sk_yanxi: {
        enable: 'phaseUse',
        filterTarget(card, player, target) {
            // 源 Card filter（L7802）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yanxi');
            const target = event.targets[0];
            // 源 L7805：对自己造成2点伤害（reason 无元素）
            const selfDamage = player.damage(player, 2, 'nocard');
            selfDamage.reason = 'bts_sk_yanxi';
            await selfDamage;
            if (!target.isAlive()) return;
            // 源 L7806：对目标造成 "_dark" 量子伤害
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_yanxi_dark';
            lib.bts.api.setDamageNature(damage, 'dark');
            await damage;
        },
        ai: {
            // AI 口径：自伤2（本体+死龙生命池同扣）换1点暗伤——源 AI 只在可收残时发动
            //（StarRail-ai.lua st_yanxi L853-880：敌可伤且 (hp>4∧敌≤2) 或 (敌<2∧hp>2)）；
            // 无残敌时2换1亏损，按0拒发（本技能仅死龙/合体形态持有，自伤不再产新蕊）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_yanxi')) return -1;
                if (player.hp <= 2) return -1; // 自伤2可能自毙（源 not weak 门）
                const finishable = game.hasPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0 &&
                        t.hp <= 1,
                );
                if (finishable) return 9; // 1点击杀残血敌人
                const wounded = game.hasPlayer(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0 &&
                        t.hp <= 2,
                );
                if (wounded && player.hp > 4) return 7; // 收2血残敌且自身充裕（源首选分支）
                return 0; // 满血敌：收益<代价，不用
            },
            result: {
                player: -2, // 自伤2（合并形态=本体体力-2、死龙生命池同步-2）
                // 目标受损：1点暗伤；可击杀时更优（态度加权负责排除友方）
                target: (player, target) => -1 - (target.hp <= 1 ? 1 : 0),
            },
        },
    },

    // ── 锁定技·晦翼（源 st_huiyi = TriggerSkill Compulsory Damaged，L7820-7826）──
    // 源壳为空（events 声明的 Damaged 无逻辑）；死龙承伤由全局忆灵生命池结算（utils.petLifeDelta，
    // 定夺统一）；死龙移除后回复 1 体力由本技能监听 bts_pet_remove 结算。
    bts_sk_huiyi: {
        charlotte: true,
        trigger: { player: 'bts_pet_remove' },
        forced: true,
        filter(event, player) {
            return event.pet === 'silong' && player.isAlive();
        },
        async content(event, trigger, player) {
            await player.recover(player, 1);
        },
    },

    // ── 触发技·荫蔽（源 st_yinbi = TriggerSkill DamageInflicted，L7828-7852）──
    // 其他角色受到不小于其体力值的伤害时，若死龙存在，你可以代为承受此伤害（伤害转移）。
    bts_sk_yinbi: {
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
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            // 源 L7836：askForSkillInvoke —— 是否代受
            const target = trigger.player; // trigger=damageBegin2 事件
            event.result = await player
                .chooseBool(
                    `荫蔽：是否代替${get.translation(target)}承受${trigger.num}点伤害？`,
                )
                .set(
                    'ai',
                    // AI 口径：救友方（源 AI asFriend）且代受后自身不致死（hp>num）；承伤同时扣
                    // 死龙生命池，生命耗尽则死龙离场——救急优先（源未设更严门槛）
                    () =>
                        get.attitude(player, target) > 0 &&
                        player.hp > trigger.num,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            trigger._btsYinbi = true; // 防重入
            // 源 L7841-7843：damage.to = p 并重新结算 —— 转移给死龙（player）
            const damage = player.damage(trigger.source, trigger.num, 'nocard');
            damage.reason = trigger.reason || 'bts_sk_yinbi';
            damage._btsYinbi = true;
            if (trigger._btsNature)
                lib.bts.api.setDamageNature(damage, trigger._btsNature);
            await damage;
            trigger.cancel(); // 源 L7845：return true 阻止原伤害
        },
    },
};

export const marks = {
    bts_mk_xinrui: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_xinrui_faq',
    },
    bts_pet_silong: {
        // 忆灵体力（lib.bts.api 忆灵系统，markKind:'pet' 使体力可见）
        markKind: 'pet',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_xiadie_skin1': '皮肤1',
    'bts_ch_xiadie_skin10': '皮肤10',
    'bts_ch_xiadie_skin11': '皮肤11',
    'bts_ch_xiadie_skin12': '皮肤12',
    'bts_ch_xiadie_skin2': '皮肤2',
    'bts_ch_xiadie_skin3': '皮肤3',
    'bts_ch_xiadie_skin4': '皮肤4',
    'bts_ch_xiadie_skin5': '皮肤5',
    'bts_ch_xiadie_skin6': '皮肤6',
    'bts_ch_xiadie_skin7': '皮肤7',
    'bts_ch_xiadie_skin8': '皮肤8',
    'bts_ch_xiadie_skin9': '皮肤9',
    bts_ch_xiadie: '遐蝶',
    bts_ch_silong: '死龙',
    bts_ch_xiadie_and_silong: '遐蝶&死龙',
    bts_sk_wangxiao: '亡哮',
    bts_sk_wangxiao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，若你拥有至少7枚${get.poptip('bts_glossary_xinrui_faq')}且没有${get.poptip('bts_ch_silong')}，你可以弃7枚${get.poptip('bts_glossary_xinrui_faq')}，召唤${get.poptip('bts_ch_silong')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，此回合结束时，执行一个额外的回合。`,
    bts_sk_huangwu: '荒芜',
    bts_sk_huangwu_info: `当一名角色扣减体力后，若你没有${get.poptip('bts_ch_silong')}，其可以令你获得等量的${get.poptip('bts_glossary_xinrui_faq')}（至多7枚，若你拥有${get.poptip('bts_sk_aishi')}则至多14枚）。`,
    bts_sk_youdie: '幽蝶',
    bts_sk_youdie_info:
        '当你使用【杀】时，你可以选择任意名其他角色。你失去1点体力，这些角色依次可以失去1点体力。',
    bts_sk_yanxi: '焰息',
    bts_sk_yanxi_info: `出牌阶段，你可以对自己造成2点伤害并选择一名其他角色，对其造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害。`,
    bts_sk_huiyi: '晦翼',
    bts_sk_huiyi_info:
        `锁定技，${get.poptip('bts_ch_silong')}承受伤害时等量失去生命；${get.poptip('bts_ch_silong')}生命耗尽被移除后，你回复1点体力。`,
    bts_sk_yinbi: '荫蔽',
    bts_sk_yinbi_info:
        `当其他角色受到不小于其体力值的伤害时，若${get.poptip('bts_ch_silong')}存在，你可以代为承受此伤害。`,
    bts_mk_xinrui: '新蕊',
    bts_pet_silong: '死龙',

    '$bts_sk_wangxiao1': "拥抱「新生」吧，玻吕刻斯",
    '$bts_sk_wangxiao2': "惟愿「死亡」…捍卫你我！",
    '$bts_sk_huangwu1': "我会铭记此刻的温度",
    '$bts_sk_huangwu2': "破茧而生",
    '$bts_sk_youdie1': "请就此凋零",
    '$bts_sk_youdie2': "赐予你所求",
    '$bts_sk_huiyi1': "沉眠吧",
    '$bts_sk_yanxi1': "亡魂，返归尘土",
    '$bts_sk_yinbi1': "生命并非如蝶翼般易折",
    '$bts_sk_huiyi2': "很快，你也要向冥界去了",
    '$bts_sk_yanxi2': "暗幕，随我同行",
    '$bts_sk_yinbi2': "请珍惜灵魂还未枯萎的时光",
    '~bts_ch_silong': "好温暖啊…西风……",
    '~bts_ch_xiadie': "好温暖啊…西风……",
    bts_mk_xinrui_info: `来源：${get.poptip('bts_sk_huangwu')}赋予；${get.poptip('bts_sk_wangxiao')}：满7召唤${get.poptip('bts_ch_silong')}`,

    '~bts_ch_xiadie_and_silong': "好温暖啊…西风……",
};

export const simpleTranslate = {
    bts_sk_wangxiao_info: `${get.poptip('bts_glossary_bisha_faq')}；弃7${get.poptip('bts_glossary_xinrui_faq')}召唤${get.poptip('bts_ch_silong')}，${get.poptip('bts_glossary_xingqi_faq')}时额外回合`,
    bts_sk_huangwu_info: `他人扣血后可令你获得等量${get.poptip('bts_glossary_xinrui_faq')}（至多7，${get.poptip('bts_sk_aishi')}时14）`,
    bts_sk_youdie_info: '用杀后可选其他角色；自身失1体力，目标可各失1体力',
    bts_sk_yanxi_info: '出牌阶段自伤2，对1名其他角色造成1点暗伤',
    bts_sk_huiyi_info: `锁；${get.poptip('bts_ch_silong')}受伤等量失生命，耗尽移除后回复1`,
    bts_sk_yinbi_info: `其他角色受致死伤害时，${get.poptip('bts_ch_silong')}可代为承受`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_xinrui_faq',
        name: '|新蕊|',
        info: `遐蝶专属：${get.poptip('bts_sk_huangwu')}获得；满7由${get.poptip('bts_sk_wangxiao')}召唤${get.poptip('bts_ch_silong')}。`,
    },
];
