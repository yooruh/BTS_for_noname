// 缇宝（源 animal.lua L7812-7907）—— 诅咒、贯通礼物与忙碌追击。
// 技能：猜猜（必杀技·诅咒+星启用杀）、礼物（准备阶段弃杀分发贯通/暴击祝福）、忙碌（他人必杀后追击）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '量子·同谐·黄金裔的半神'; // 属性·命途
export const intro =
    `${B('缇宝')}给人挂诅咒、发${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}，${get.poptip('bts_glossary_bisha_faq')}触发后再补刀。`;

export const character = {
    bts_ch_tibao: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_caicai', 'bts_sk_liwu', 'bts_sk_manglu'],
    },
};

export const skill = {
    // ── 必杀技·猜猜（源 st_caicai = SkillCard + ZeroCardViewAsSkill，L7812-7837）──
    // 出牌阶段，失5怒气，令任意名其他角色各附加1层诅咒；若你为星启，视为对这些角色使用【杀】。
    bts_sk_caicai: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7484）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7814-7816）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_caicai');
            lib.bts.api.loseAngry(player, 5); // 源 L7818：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L7820：AddACurse(p, player) —— 附加1层诅咒
                lib.bts.api.addCurse(target, 1);
            }
            // 源 L7822-7824：星启时 ViewAsCardSkill(player, targets, "_max_caicai") ——
            // 一次性视为对全部所选角色使用【杀】（非逐个）
            if (lib.bts.api.god(player) && event.targets.length)
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        skill: 'bts_sk_caicai',
                        storage: { bts_sk_caicai: true },
                    },
                    event.targets,
                );
        },
        // 源 max_caicai（L7823）：ViewAsCardSkill 以 "_max_caicai" 为 skillName 含 "max_"，
        // 源 ConfirmDamage L1117/L1124 据此给星启必杀+1 与增幅祝福+1。无名杀须于
        // damageBegin1 显式设 reason（飞霄 bts_sk_zaohuang 范式）。
        group: ['bts_sk_caicai_damage'],
        subSkill: {
            damage: {
                trigger: { source: 'damageBegin1' },
                forced: true,
                priority: 10,
                filter(event, player) {
                    return event.card?.storage?.bts_sk_caicai;
                },
                async content(event, trigger, player) {
                    trigger.reason = 'bts_sk_caicai_bts_reason_fatal';
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_caicai')
                    ? -1
                    : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·礼物（源 st_liwu = TriggerSkill EventPhaseStart Start + OneCardViewAsSkill，L7838-7879）──
    // 准备阶段开始时，可弃置一张【杀】，令你与一名其他角色各附加3层贯通祝福；若你为星启，额外各附加1层暴击祝福。
    bts_sk_liwu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L7524：准备阶段开始且手牌非空（有【杀】可弃）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L7525：askForUseCard("@@st_liwu") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '礼物：弃置一张【杀】令你与一名其他角色各获得3层贯通祝福',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    // 源 st_liwuCard filter（L7839-7841）仅 to_select~=self 无上限、翻译 L14053
                    // 「至少一名其他角色」——原 selectTarget:1 误收窄为一名，第十二批改回任意多名
                    selectTarget: [1, Infinity],
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            // 源 L7839-7851：自己+3贯通；目标循环内各+3贯通（星启暴击分支源代码不存在——
            // 曾误把飞霄 max_zaohuang 的 God 分支搬来，第十二批已删）
            await lib.bts.api.addBless(player, 'through', 3, player);
            for (const target of event.targets)
                await lib.bts.api.addBless(target, 'through', 3, player);
            // 源 L7845-7851：拥有爱诗（『门径』诗）时自己与每个目标各额外+1暴击
            if (player.hasSkill('bts_sk_aishi')) {
                await lib.bts.api.addBless(player, 'critical', 1, player);
                for (const target of event.targets)
                    await lib.bts.api.addBless(target, 'critical', 1, player);
            }
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·忙碌（源 st_manglu = TriggerSkill CardFinished，L7880-7907）──
    // 其他角色发动必杀技后，若其拥有贯通祝福，你可以视为对一名其他角色使用【杀】。
    bts_sk_manglu: {
        // 源 st_manglu 是 TriggerSkill（必杀技消费端，非必杀技本身），源无 max_ 前缀技能对象
        // 对应它——bts_bisha 曾误标（浮元/悦王先例），第十二批去标；filter 仍按 event.skill 的
        // bts_bisha 标签识别他人必杀技，不受影响。
        trigger: { global: 'useSkillAfter' },
        filter(event, player) {
            // 源 L7886：其他角色使用 SkillCard 且技能名含 "max_"（必杀技），且其有贯通祝福。
            // 无名杀以 bts_bisha 标签判定（勿用子串匹配如 includes('st_')）
            return (
                event.player !== player &&
                lib.skill[event.skill]?.bts_bisha === true &&
                lib.bts.api.getBless(event.player, 'through')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7890-7895：canSlash 限定攻击范围内目标（可取消）
            event.result = await player
                .chooseTarget(
                    '忙碌：是否视为对一名其他角色使用【杀】？',
                    [1, 1],
                    (card, source, target) =>
                        target !== source && source.inRange(target),
                    (target) => -get.attitude(player, target),
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L7897：ViewAsCardOnly —— 视为对目标使用【杀】
            await player.useCard({ name: 'sha', isCard: true }, event.targets);
        },
        ai: { noe: true },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_tibao_skin1': '皮肤1',
    'bts_ch_tibao_skin2': '皮肤2',
    'bts_ch_tibao_skin3': '皮肤3',
    'bts_ch_tibao_skin4': '皮肤4',
    'bts_ch_tibao_skin5': '皮肤5',
    'bts_ch_tibao_skin6': '皮肤6',
    'bts_ch_tibao_skin7': '皮肤7',
    'bts_ch_tibao_skin8': '皮肤8',
    bts_ch_tibao: '缇宝',
    bts_sk_caicai: '猜猜',
    bts_sk_caicai_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令至少一名其他角色各附加1层诅咒；若你为${get.poptip('bts_glossary_xingqi_faq')}，视为对这些角色使用【杀】。`,
    bts_sk_liwu: '礼物',
    bts_sk_liwu_info: `准备阶段开始时，你可以弃置一张【杀】，令你与任意名其他角色各附加3层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}；若你拥有${get.poptip('bts_sk_aishi')}，你与这些角色额外各获得1层${get.poptip('bts_glossary_bless_critical_faq')}。`,
    bts_sk_manglu: '忙碌',
    bts_sk_manglu_info: `锁定技，其他角色发动${get.poptip('bts_glossary_bisha_faq')}后，若其拥有${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}，你可以视为对一名其他角色使用【杀】。`,

    '$bts_sk_caicai1': "要来了么？嘿嘿",
    '$bts_sk_caicai2': "预备，起——乘着西风，出发咯~",
    '$bts_sk_liwu1': "特大喜讯~",
    '$bts_sk_liwu2': "送温暖~",
    '$bts_sk_manglu1': "给我冲呀——！BANG！",
    '$bts_sk_manglu2': "走——起飞咯！BANG！",
    '~bts_ch_tibao': "明天…见……",
};

export const simpleTranslate = {
    bts_sk_caicai_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1诅咒，${get.poptip('bts_glossary_xingqi_faq')}时对其用杀`,
    bts_sk_liwu_info: `准备阶段可弃杀令自己和任意名其他角色各+3${get.poptip('bts_glossary_guantong_faq')}，拥有${get.poptip('bts_sk_aishi')}时你与这些角色额外各+1${get.poptip('bts_glossary_bless_critical_faq')}`,
    bts_sk_manglu_info: `锁；他人发动${get.poptip('bts_glossary_bisha_faq')}且有${get.poptip('bts_glossary_guantong_faq')}后可对1名其他角色用杀`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
