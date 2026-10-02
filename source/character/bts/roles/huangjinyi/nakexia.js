// 那刻夏（源 animal.lua L7861-7959）—— 升华异常与随机元素伤害。
// 技能：世塑（必杀技·升华异常）、揭露（他人附加异常后附加升华）、驱虚（结束阶段弃杀随机元素伤害）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '风·智识·纷争的魔术师'; // 属性·命途
export const intro =
    `${B('那刻夏')}给人挂${get.poptip('bts_glossary_abnormal_shenghua_faq')}异常，再用${get.poptip('bts_sk_quxu')}的随机元素伤砸开局面。`;

export const character = {
    bts_ch_nakexia: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_shisu', 'bts_sk_jielu', 'bts_sk_quxu'],
    },
};

export const skill = {
    // ── 必杀技·世塑（源 st_shisu = SkillCard + ZeroCardViewAsSkill，L7862-7883）──
    // 出牌阶段，失5怒气，令任意名其他角色各附加1层升华异常。
    bts_sk_shisu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7881）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7865）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shisu');
            lib.bts.api.loseAngry(player, 5); // 源 L7868：LoseAngry(player, 5)
            // 源 L7869-7871：AddAbnormal(p, "@abnormal_shenghua", 1, player)
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'shenghua', 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_shisu')
                    ? -1
                    : 5.3;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·揭露（源 st_jielu = TriggerSkill Compulsory MarkChanged，L7885-7901）──
    // 当其他角色附加异常后，若其拥有至少2种异常且不处于升华，其附加1层升华异常。
    bts_sk_jielu: {
        // 源 st_jielu（animal.lua L7885-7902）：MarkChanged；源代码作 mark.gain<0，翻译写
        // 「当其他角色附加异常后」——同族 7 处 gain 方向与描述相反的系统性笔误，
        // 2026-10-02 用户定夺按描述方向实现（bts_mark_add）。事件在新值写入后派发，
        // 升华自身附加时 guard「不处于升华」即拍住，不会自附加连环。
        trigger: { global: 'bts_mark_add' },
        forced: true,
        filter(event, player) {
            // 源 L7891：@abnormal_ 标记被附加、获得后其仍有≥2种异常、且不处于升华
            return (
                event.player &&
                event.player !== player &&
                typeof event.markName === 'string' &&
                event.markName.startsWith('bts_abnormal_') &&
                lib.bts.api.abnormalCount(event.player) >= 2 &&
                !lib.bts.api.getAbnor(event.player, 'shenghua')
            );
        },
        async content(event, trigger, player) {
            // 源 L7894：AddAbnormal(player, "@abnormal_shenghua", 1, p)（trigger=addMark 事件）
            lib.bts.api.addAbnormal(trigger.player, 'shenghua', 1, player);
        },
        ai: { noe: true },
    },

    // ── 触发技·驱虚（源 st_quxu = TriggerSkill EventPhaseStart Finish + OneCardViewAsSkill，L7903-7958）──
    // 结束阶段开始时，可弃置一张【杀】并选择至少一名其他角色：这些角色各有25%（组合形态40%）
    // 受到1点随机元素通常伤害；失败则下次以双倍概率判定。若有角色处于升华或以此法受到伤害，
    // 所有目标角色重复此流程（最多两轮）。
    bts_sk_quxu: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L7954：结束阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player
                .getCards('h')
                .some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L7955：askForUseCard("@@st_quxu") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '驱虚：是否弃置一张【杀】并选择至少一名其他角色？',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    selectTarget: [1, Infinity],
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => -get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            lib.bts.aiGuard.record(player, 'bts_sk_quxu');
            let repeat = false;
            // 源 L7910：for i=1..2（最多两轮）
            for (let round = 0; round < 2; round++) {
                for (const target of event.targets.filter((target) =>
                    target.isAlive(),
                )) {
                    // 源 L7912-7913：n=25，组合形态（GetXiLian）+15
                    let chance = player.hasSkill('bts_sk_aishi') ? 40 : 25;
                    // 源 L7914-7916：此前失败过的目标（st_quxu 标记）概率翻倍
                    if (target.countMark('bts_sk_quxu') > 0) {
                        target.removeMark(
                            'bts_sk_quxu',
                            target.countMark('bts_sk_quxu'),
                        );
                        chance *= 2;
                    }
                    // 源 L7918-7920：目标处于升华 → 需重复流程
                    if (lib.bts.api.getAbnor(target, 'shenghua')) repeat = true;
                    // 源 L7921-7930：按概率造成随机元素通常伤害，失败则打标记
                    if (Math.random() * 100 <= chance) {
                        // 源 L7922-7924：组合形态时先给无升华目标附加升华
                        if (
                            !lib.bts.api.getAbnor(target, 'shenghua') &&
                            player.hasSkill('bts_sk_aishi')
                        ) {
                            lib.bts.api.addAbnormal(target, 'shenghua', 1, player);
                        }
                        repeat = true;
                        // 源 L7926-7927：随机六元素之一，reason 含 "_common_<nature>"
                        const nature = ['wind', 'flame', 'frost', 'earth', 'light', 'dark'][
                            Math.floor(Math.random() * 6)
                        ];
                        const damage = target.damage(player, 1, 'nocard');
                        damage.reason = `bts_sk_quxu_bts_reason_common_${nature}`;
                        lib.bts.api.setDamageNature(damage, nature);
                        await damage;
                    } else {
                        // 源 L7929：失败 → addPlayerMark(self:objectName()) 记录
                        target.addMark('bts_sk_quxu', 1, false);
                    }
                }
                // 源 L7932：本轮无升华/无命中则不重复
                if (!repeat) break;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_quxu') ? -1 : 4;
            },
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_nakexia_skin1': '皮肤1',
    'bts_ch_nakexia_skin2': '皮肤2',
    'bts_ch_nakexia_skin3': '皮肤3',
    'bts_ch_nakexia_skin4': '皮肤4',
    'bts_ch_nakexia_skin5': '皮肤5',
    'bts_ch_nakexia_skin6': '皮肤6',
    'bts_ch_nakexia_skin7': '皮肤7',
    bts_ch_nakexia: '那刻夏',
    bts_sk_shisu: '世塑',
    bts_sk_shisu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层${get.poptip('bts_glossary_abnormal_shenghua_faq')}。`,
    bts_sk_jielu: '揭露',
    bts_sk_jielu_info: `锁定技，当其他角色附加异常后，若其拥有至少2种异常且不处于${get.poptip('bts_glossary_abnormal_shenghua_faq')}，其附加1层${get.poptip('bts_glossary_abnormal_shenghua_faq')}。`,
    bts_sk_quxu: '驱虚',
    bts_sk_quxu_info: `结束阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，这些角色各有25%受到1点随机元素通常伤害；失败则下次以双倍概率判定。若有角色处于${get.poptip('bts_glossary_abnormal_shenghua_faq')}或以此法受到伤害，所有目标角色重复此流程（每阶段限一次）。`,
    bts_abnormal_shenghua: '升华',

    '$bts_sk_shisu1': "看呐，表演开始了……",
    '$bts_sk_shisu2': "依此神技，萃精于糙，重塑万物！",
    '$bts_sk_jielu1': "等价交换？不，无中生有！",
    '$bts_sk_jielu2': "魔术技巧！",
    '$bts_sk_quxu1': "彻底疯狂吧！",
    '$bts_sk_quxu2': "直击灵魂！",
    '~bts_ch_nakexia': "这点代价而已……",
};

export const simpleTranslate = {
    bts_sk_shisu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1${get.poptip('bts_glossary_abnormal_shenghua_faq')}`,
    bts_sk_jielu_info: `锁；他人附加异常后若其有≥2种异常且未${get.poptip('bts_glossary_abnormal_shenghua_faq')}，令其+1${get.poptip('bts_glossary_abnormal_shenghua_faq')}`,
    bts_sk_quxu_info:
        '结束阶段可弃杀选其他角色，25%随机元素通常伤害，失败下次概率翻倍',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_shenghua: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_shenghua_faq',
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_shenghua_faq',
        name: '|升华|',
        info: `异常状态：由技能效果赋予；附加元素时再次附加该元素。`,
    },
];
