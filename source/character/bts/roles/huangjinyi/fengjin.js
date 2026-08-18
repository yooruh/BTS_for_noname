// 风堇（源 animal.lua L7960-8110）—— 小伊卡忆灵组合模板。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '风·记忆·天空的医师'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('风堇')}用${get.poptip('bts_glossary_bless_yuguotianqing_faq')}召小伊卡，边奶队友边用${get.poptip('bts_glossary_nature_feng_faq')}追着收残。`;
export const character = {
    bts_fengjin: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_chenhun', 'bts_st_yushi', 'bts_st_hongguang'],
    },
};
export const transformCharacter = {
    bts_xiaoyika: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 2,
        skills: ['bts_st_qingkong', 'bts_st_zoukai', 'bts_st_zhanluo'],
    },
    bts_fengjin_and_xiaoyika: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 6,
        skills: [
            'bts_st_chenhun',
            'bts_st_yushi',
            'bts_st_hongguang',
            'bts_st_qingkong',
            'bts_st_zoukai',
            'bts_st_zhanluo',
        ],
    },
};

// 替代形态注册：风堇召唤小伊卡进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_fengjin: [['bts_fengjin_and_xiaoyika', []]],
};

export const skill = {
    // ── 必杀技·晨昏（源 st_chenhun = SkillCard + ZeroCardViewAsSkill，L7961-7995）──
    // 出牌阶段，失5怒气并选择至少一名其他角色，你附加3层雨过天晴祝福并召唤小伊卡；
    // 若你为星启，你与这些角色各附加2层体力上限祝福。然后你与这些角色各回复1点体力。
    bts_st_chenhun: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02：防被复制/随技能检索异常）
        unique: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L7993）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            // 源 Card filter（L7964）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_chenhun');
            lib.bts.api.loseAngry(player, 5); // 源 L7967：LoseAngry(player, 5)
            // 源 L7968-7969：AddBless(@bless_yuguotianqing, 3) + AddPet("xiaoyika")
            await lib.bts.api.addBless(player, 'yuguotianqing', 3, player);
            lib.bts.api.addPet(player, 'xiaoyika');
            // 源 L7970-7975：星启时自己与目标各+2体力上限祝福
            if (lib.bts.api.god(player)) {
                await lib.bts.api.addBless(player, 'maxhp', 2, player);
                for (const target of event.targets)
                    await lib.bts.api.addBless(target, 'maxhp', 2, player);
            }
            // 源 L7976-7983：n=1，组合形态时+1，自己与目标各回复 n 点
            const amount = player.hasSkill('bts_st_aishi') ? 2 : 1;
            await player.recover(player, amount);
            for (const target of event.targets.filter((target) =>
                target.isAlive(),
            ))
                await target.recover(player, amount);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_chenhun')
                    ? -1
                    : 9;
            },
            result: { player: 2, target: 2 },
        },
    },

    // ── 锁定技·愈世（源 st_yushi = TriggerSkill Compulsory PreHpRecover，L7997-8008）──
    // 当你回复体力前，你附加1层体力上限祝福；若你不处于恐惧，附加1层恐惧。
    bts_st_yushi: {
        trigger: { player: 'recoverBegin' },
        forced: true,
        filter(event) {
            return event.num > 0; // 源 L8000-8001：PreHpRecover
        },
        async content(event, trigger, player) {
            // 源 L8003：AddBless(player, "@bless_maxhp")
            await lib.bts.api.addBless(player, 'maxhp', 1, player);
            // 源 L8004-8006：未处于恐惧则附加1层恐惧
            if (!lib.bts.api.getAbnor(player, 'scary'))
                lib.bts.api.addAbnormal(player, 'scary', 1, player);
        },
        ai: { noe: true },
    },

    // ── 触发技·虹光（源 st_hongguang = TriggerSkill EventPhaseStart Start + OneCardViewAsSkill，L8010-8055）──
    // 准备阶段开始时，可弃置一张【杀】并选择受伤的其他角色，召唤小伊卡并令其回复1点体力；
    // 若你的体力值为场上最低，你可以选择任意名角色。
    bts_st_hongguang: {
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L8046-8053：准备阶段、存在受伤其他角色、且手牌有【杀】可弃
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer(
                    (target) => target !== player && target.isDamaged(),
                )
            );
        },
        async cost(event, trigger, player) {
            // 源 L8013-8019：你的体力为场上最低时目标数无上限（n=999），否则1名
            const maximum = !game.hasPlayer(
                (target) => target.hp < player.hp,
            )
                ? Infinity
                : 1;
            event.result = await player
                .chooseCardTarget({
                    prompt: `虹光：弃置一张【杀】并选择至多${maximum === Infinity ? '任意名' : '一名'}受伤其他角色回复1点体力`,
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) =>
                        target !== source && target.isDamaged(),
                    selectTarget: [1, maximum],
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            // 源 L8022-8025：AddPet("xiaoyika") + 目标各回复1点
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            lib.bts.api.addPet(player, 'xiaoyika');
            for (const target of event.targets.filter((target) =>
                target.isAlive(),
            ))
                await target.recover(player);
        },
        ai: { result: { player: 1, target: 2 } },
    },

    // ── 触发技·晴空（源 st_qingkong = TriggerSkill HpChanged，L8058 起）──
    // 当其他角色扣减体力后，若你的诅咒层数少于2，你可以获得1层诅咒并令其回复1点体力。
    bts_st_qingkong: {
        trigger: { global: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 其他角色扣减体力、存活、且你的诅咒<2
            return (
                event.player &&
                event.player !== player &&
                event.player.isAlive() &&
                lib.bts.api.lostHp(event) > 0 &&
                lib.bts.api.getCurse(player) < 2
            );
        },
        async content(event, trigger, player) {
            const target = trigger.player; // trigger=伤害/失血事件
            // 询问是否获得1层诅咒并治疗目标
            const choice = await player
                .chooseBool(
                    `晴空：是否获得1层诅咒并令${get.translation(target)}回复1点体力？`,
                )
                .set(
                    'ai',
                    () => get.attitude(player, target) > 0 && player.hp > 1,
                )
                .forResult();
            if (!choice.bool) return;
            lib.bts.api.addCurse(player, 1);
            await target.recover(player);
        },
        ai: { noe: true },
    },

    // ── 锁定技·走开（源 st_zoukai，L8082-8094）──
    // 结束阶段开始时，若你拥有雨过天晴祝福，对上个对你造成伤害的角色造成1点风属性伤害。
    bts_st_zoukai: {
        trigger: { player: 'phaseJieshuBegin' },
        forced: true,
        filter(event, player) {
            return (
                lib.bts.api.getBless(player, 'yuguotianqing') &&
                // 源 LastDamagedLink 记在被伤者（风堇）身上、键=来源 → 「伤过风堇的人」；
                // 无名杀以 getAllHistory('damage')（风堇受到的伤害）的 source 近似
                // （ren.js 同款范式；勿用 sourceDamage=打出，方向相反 —— 已修正）
                player
                    .getAllHistory('damage')
                    .some((ev) => ev.source?.isAlive())
            );
        },
        async content(event, trigger, player) {
            // 源 L8088-8093：LastDamagedLink 每次伤害重置、只记最近一次来源 → 单目标「上个伤害者」
            const hist = player.getAllHistory('damage');
            const target = hist[hist.length - 1]?.source;
            if (!target || !target.isAlive()) return;
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_zoukai_wind';
            lib.bts.api.setDamageNature(damage, 'wind');
            await damage;
        },
        ai: { noe: true },
    },

    // ── 占位技·展落（源 st_zhanluo，L8104 起）──
    // 源实现为空技能，无名杀以永不触发的过滤占位。
    bts_st_zhanluo: {
        charlotte: true,
        forced: true,
        trigger: { player: 'damageEnd' },
        filter() {
            return false;
        },
        content() {},
        ai: { noe: true },
    },
};

export const translate = {
    bts_fengjin: '风堇',
    bts_xiaoyika: '小伊卡',
    bts_fengjin_and_xiaoyika: '风堇&小伊卡',
    bts_st_chenhun: '晨昏',
    bts_st_chenhun_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你附加3层${get.poptip('bts_glossary_bless_yuguotianqing_faq')}并召唤小伊卡。若你为${get.poptip('bts_glossary_xingqi_faq')}，你与这些角色各附加2层${get.poptip('bts_glossary_bless_maxhp_faq')}。然后你与这些角色各回复1点体力。`,
    bts_st_yushi: '愈世',
    bts_st_yushi_info: `锁定技，当你回复体力前，你附加1层${get.poptip('bts_glossary_bless_maxhp_faq')}；若你不处于${get.poptip('bts_glossary_abnormal_scary_faq')}，附加1层${get.poptip('bts_glossary_abnormal_scary_faq')}。`,
    bts_st_hongguang: '虹光',
    bts_st_hongguang_info:
        '准备阶段开始时，你可以弃置一张【杀】并选择一名受伤的其他角色，召唤小伊卡并令其回复1点体力；若你的体力值为场上最低，你可以选择任意名角色。',
    bts_st_qingkong: '晴空',
    bts_st_qingkong_info:
        '当其他角色扣减体力后，若你的诅咒层数少于2，你可以获得1层诅咒并令其回复1点体力。',
    bts_st_zoukai: '走开',
    bts_st_zoukai_info: `锁定技，结束阶段开始时，若你拥有${get.poptip('bts_glossary_bless_yuguotianqing_faq')}，对上个对你造成伤害的角色造成1点${get.poptip('bts_glossary_nature_feng_dmg_faq')}伤害。`,
    bts_st_zhanluo: '展落',
    bts_st_zhanluo_info: '锁定技。',
    bts_bless_yuguotianqing: '雨过天晴祝福',
    bts_pet_xiaoyika: '小伊卡',

    '$bts_st_chenhun1': "愿这一抹微光……",
    '$bts_st_chenhun2': "拨开阴翳与云雾，重见澄澈晴空！",
    '$bts_st_yushi1': "是不同的疗愈方法？我也想学",
    '$bts_st_yushi2': "请为我们照亮前路",
    '$bts_st_hongguang1': "是得好好晒个太阳~",
    '$bts_st_hongguang2': "大家等我们很久啦~",
    '$bts_st_qingkong1': "未来，一定是光明的",
    '$bts_st_zoukai1': "彻底迷失心智了吗…",
    '$bts_st_qingkong2': "天我会以虹桥为指引",
    '$bts_st_zoukai2': "请冷静下来",
    '~bts_fengjin': "先祖，我还没……",
    '~bts_xiaoyika': "先祖，我还没……",
};
export const simpleTranslate = {
    bts_st_chenhun_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_yuguotianqing_faq')}并召唤小伊卡，${get.poptip('bts_glossary_xingqi_faq')}时加${get.poptip('bts_glossary_bless_maxhp_faq')}，治疗自己和目标`,
    bts_st_yushi_info: `锁；回复前+${get.poptip('bts_glossary_bless_maxhp_faq')}，未${get.poptip('bts_glossary_abnormal_scary_faq')}则+${get.poptip('bts_glossary_abnormal_scary_faq')}`,
    bts_st_hongguang_info:
        '准备阶段可弃杀召唤小伊卡并治疗受伤其他角色，最低体力时可多选',
    bts_st_qingkong_info: '他人扣血后可+1诅咒并令其回复1',
    bts_st_zoukai_info: `锁；有${get.poptip('bts_glossary_bless_yuguotianqing_faq')}时结束阶段对上个伤你的角色造成1风伤`,
    bts_st_zhanluo_info: '锁；无额外效果',
};
export const pinyins = {
    bts_fengjin: 'fengjin',
    bts_xiaoyika: 'xiaoyika',
    bts_fengjin_and_xiaoyika: 'fengjinxiaoyika',
};
