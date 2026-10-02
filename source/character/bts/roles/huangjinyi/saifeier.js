// 赛飞儿（源 animal.lua L8111-8222）—— 主顾、欺诈与顺手牵羊追击。
// 技能：敬上（必杀技·顺手+诅咒）、热情（顺手标主顾/主顾受伤积欺诈+追杀）、套银（结束阶段顺手+混乱）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '量子·虚无·捷足的羁客'; // 属性·命途
export const intro =
    `${B('赛飞儿')}用【顺手牵羊】盯住${get.poptip('bts_glossary_zhugu_faq')}，攒够${get.poptip('bts_glossary_qizha_faq')}就给对手挂诅咒追着打。`;

export const character = {
    bts_ch_saifeier: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_jingshang', 'bts_sk_reqing', 'bts_sk_taoyin'],
    },
};

export const skill = {
    // ── 必杀技·敬上（源 st_jingshang = SkillCard + ZeroCardViewAsSkill，L8112-8139）──
    // 出牌阶段，失5怒气，对攻击范围内一名区域有牌的角色视为使用【顺手牵羊】；
    // 弃置全部欺诈标记，其附加 欺诈数/4（星启为3） 层诅咒。
    bts_sk_jingshang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L8137）：怒气≥5（无名杀把选目标条件并入 filter 可行性）
            return (
                lib.bts.api.getAngry(player, 5) &&
                game.hasPlayer(
                    (target) =>
                        target !== player &&
                        player.distanceTo(target) <= player.getAttackRange() &&
                        target.countCards('hej') > 0,
                )
            );
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L8118）：目标 ≠ 自己、不空区域、在攻击范围内
            return (
                target !== player &&
                player.distanceTo(target) <= player.getAttackRange() &&
                target.countCards('hej') > 0
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_jingshang');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L8121：LoseAngry(player, 5)
            // 源 L8122：ViewAsCardOnly "snatch" —— 视为使用【顺手牵羊】
            const fraud = player.countMark('bts_mk_qizha');
            player.removeMark('bts_mk_qizha', fraud); // 源 L8126：loseAllMarks(@qizha)
            await player.useCard(
                {
                    name: 'shunshou',
                    isCard: true,
                    storage: { bts_sk_jingshang: true },
                },
                target,
            );
            // 源 L8123-8127：n = 欺诈数/4（星启为3），AddCurse(targets[1], nil, n, player)
            const divisor = lib.bts.api.god(player) ? 3 : 4;
            const curse = Math.floor(fraud / divisor);
            if (curse > 0) lib.bts.api.addCurse(target, curse);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_jingshang')
                    ? -1
                    : 8;
            },
            result: { target: -2 },
        },
    },

    // ── 锁定技·热情（源 st_reqing = TriggerSkill Compulsory TargetSpecified/Damaged，L8141-8173）──
    // 当你使用【顺手牵羊】指定唯一目标后，其获得1枚主顾标记，其他角色失去全部主顾标记；
    // 当拥有主顾标记的角色受到伤害时，你获得等同伤害值的欺诈标记，
    // 然后若伤害来源不为你，你可以视为对其使用【杀】（每回合限一次）。
    bts_sk_reqing: {
        trigger: { player: 'useCard', global: 'damageEnd' },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'useCard')
                // 源 L8148：使用【顺手牵羊】且仅指定一个目标
                return (
                    event.card?.name === 'shunshou' &&
                    event.targets?.length === 1
                );
            // 源 L8157：拥有主顾标记的角色受到伤害
            return event.player?.countMark('bts_mk_zhugu') > 0 && event.num > 0;
        },
        async content(event, trigger, player) {
            if (event.triggername === 'useCard') {
                // 源 L8150-8153：全场清空主顾标记，目标获得1枚
                const target = trigger.targets[0];
                for (const current of lib.bts.api.seatOrder(
                    game.filterPlayer(
                        (current) => current.countMark('bts_mk_zhugu') > 0,
                    ),
                )) {
                    current.removeMark('bts_mk_zhugu', current.countMark('bts_mk_zhugu'));
                }
                target.addMark('bts_mk_zhugu', 1);
                return;
            }
            // 源 L8159：p:gainMark("@qizha", damage.damage)（trigger=damageEnd 事件）
            const target = trigger.player;
            player.addMark('bts_mk_qizha', trigger.num);
            // 源 L8160-8164：伤害来源不为你且每回合未用过 → 视为对受伤者使用【杀】
            if (
                !trigger.source ||
                trigger.source === player ||
                player.getStorage('bts_mk_reqing-clear', 0) > 0
            )
                return;
            const choice = await player
                .chooseBool(
                    `热情：是否视为对${get.translation(target)}使用【杀】？`,
                )
                .set('ai', () => get.attitude(player, target) < 0)
                .forResult();
            if (!choice.bool) return;
            // 源 L8162-8164：非组合形态时标记本回合已用（组合形态不限次）
            if (!player.hasSkill('bts_sk_aishi'))
                player.setStorage('bts_mk_reqing-clear', 1, true);
            await player.useCard(
                { name: 'sha', isCard: true, storage: { bts_sk_reqing: true } },
                target,
            );
        },
        ai: { noe: true },
    },

    // ── 触发技·套银（源 st_taoyin = TriggerSkill EventPhaseStart Finish + OneCardViewAsSkill，L8175-8221）──
    // 结束阶段开始时，可弃置一张【杀】并选择距离1以内一名区域有牌的其他角色，
    // 视为对其使用【顺手牵羊】，其附加1层混乱异常。
    bts_sk_taoyin: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L8210-8216：结束阶段且存在距离1内不空区域的角色
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer(
                    (target) =>
                        target !== player &&
                        player.distanceTo(target) <= 1 &&
                        target.countCards('hej') > 0,
                )
            );
        },
        async cost(event, trigger, player) {
            // 源 L8217：askForUseCard("@@st_taoyin") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '套银：弃置一张【杀】并选择距离1以内有牌的一名其他角色',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) =>
                        target !== source &&
                        source.distanceTo(target) <= 1 &&
                        target.countCards('hej') > 0,
                    selectTarget: 1,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            const target = event.targets[0];
            // 源 L8186：room:useCard snatch —— 视为使用【顺手牵羊】
            await player.useCard(
                {
                    name: 'shunshou',
                    isCard: true,
                    storage: { bts_sk_taoyin: true },
                },
                target,
            );
            // 源 L8187：AddAbnormal(targets[1], "@abnormal_confuse", 1, player)
            lib.bts.api.addAbnormal(target, 'confuse', 1, player);
        },
        ai: { result: { target: -1 } },
    },
};

export const marks = {
    bts_mk_zhugu: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_zhugu_faq',
    },
    bts_mk_qizha: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_qizha_faq',
    },
    'bts_mk_reqing-clear': {
        markKind: 'record',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_saifeier_skin1': '皮肤1',
    'bts_ch_saifeier_skin2': '皮肤2',
    'bts_ch_saifeier_skin3': '皮肤3',
    'bts_ch_saifeier_skin4': '皮肤4',
    'bts_ch_saifeier_skin5': '皮肤5',
    'bts_ch_saifeier_skin6': '皮肤6',
    'bts_ch_saifeier_skin7': '皮肤7',
    'bts_ch_saifeier_skin8': '皮肤8',
    'bts_ch_saifeier_skin9': '皮肤9',
    'bts_ch_saifeier_skin1': '皮肤1',
    'bts_ch_saifeier_skin2': '皮肤2',
    'bts_ch_saifeier_skin3': '皮肤3',
    'bts_ch_saifeier_skin4': '皮肤4',
    'bts_ch_saifeier_skin5': '皮肤5',
    'bts_ch_saifeier_skin6': '皮肤6',
    'bts_ch_saifeier_skin7': '皮肤7',
    'bts_ch_saifeier_skin8': '皮肤8',
    'bts_ch_saifeier_skin9': '皮肤9',
    bts_ch_saifeier: '赛飞儿',
    bts_sk_jingshang: '敬上',
    bts_sk_jingshang_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择攻击范围内一名区域里有牌的角色，视为对其使用【顺手牵羊】。你弃置全部${get.poptip('bts_glossary_qizha_faq')}标记，其附加弃置数量/4层诅咒（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为3）。`,
    bts_sk_reqing: '热情',
    bts_sk_reqing_info: `锁定技，当你使用【顺手牵羊】指定唯一目标后，其获得1枚${get.poptip('bts_glossary_zhugu_faq')}标记，其他角色失去全部${get.poptip('bts_glossary_zhugu_faq')}标记；当拥有${get.poptip('bts_glossary_zhugu_faq')}标记的角色受到伤害时，你获得等同于伤害值的${get.poptip('bts_glossary_qizha_faq')}标记，然后若伤害来源不为你，你可以视为对其使用【杀】（每回合限一次）。`,
    'bts_mk_reqing-clear': '热情追击已用',
    bts_sk_taoyin: '套银',
    bts_sk_taoyin_info: `结束阶段开始时，你可以弃置一张【杀】并选择距离1以内一名区域里有牌的其他角色，视为对其使用【顺手牵羊】，其附加1层${get.poptip('bts_glossary_abnormal_confuse_faq')}。`,
    bts_mk_zhugu: '主顾',
    bts_mk_qizha: '欺诈',

    '$bts_sk_jingshang1': "随便玩玩的把戏结束了",
    '$bts_sk_jingshang2': "一人传虚，万人传实。骗到你咯~",
    '$bts_sk_reqing1': "轻轻挠一下就受不了了？",
    '$bts_sk_reqing2': "猫鼠游戏，开始！",
    '$bts_sk_taoyin1': "财宝…让我吸吸！",
    '$bts_sk_taoyin2': "猫咪…大开口！",
    '~bts_ch_saifeier': "这就是…逐火……",
    bts_mk_zhugu_info: `来源：${get.poptip('bts_sk_xunjue')}、${get.poptip('bts_sk_binguo')}赋予；${get.poptip('bts_sk_binguo')}：满7发动群杀`,
};

export const simpleTranslate = {
    bts_sk_jingshang_info: `${get.poptip('bts_glossary_bisha_faq')}；-5${get.poptip('bts_glossary_nuqi_faq')}，顺手牵羊1个范围内有牌目标，清${get.poptip('bts_glossary_qizha_faq')}并按层数/4加诅咒`,
    bts_sk_reqing_info: `锁；单目标顺手标${get.poptip('bts_glossary_zhugu_faq')}；${get.poptip('bts_glossary_zhugu_faq')}受伤+${get.poptip('bts_glossary_qizha_faq')}，非你来源时可追击杀（每回合一次）`,
    bts_sk_taoyin_info: `结束阶段可弃杀对距离1有牌目标用顺手并+1${get.poptip('bts_glossary_abnormal_confuse_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_zhugu_faq',
        name: '|主顾|',
        info: `赛飞儿专属：${get.poptip('bts_sk_reqing')}以【顺手牵羊】指定目标；${get.poptip('bts_glossary_zhugu_faq')}角色受伤后赛飞儿获得等量${get.poptip('bts_glossary_qizha_faq')}。`,
    },
    {
        id: 'bts_glossary_qizha_faq',
        name: '|欺诈|',
        info: `赛飞儿专属：${get.poptip('bts_glossary_zhugu_faq')}角色受伤后获得等量；${get.poptip('bts_sk_jingshang')}消耗全部，按数量令目标获得诅咒。`,
    },
];
