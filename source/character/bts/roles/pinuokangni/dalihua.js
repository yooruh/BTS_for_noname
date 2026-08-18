// 大丽花（源 animal.lua L5735-5825）—— 败谢与共舞。
// 技能：沉溺（必杀技·败谢异常）、拨弄（共舞持牌最多者伤害令目标空城后炎杀补刀）、舔舐（结束阶段弃杀赠共舞祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '火·虚无·流梦礁的舞者'; // 属性·命途
export const intro =
    `${B('大丽花')}用败谢压属性伤害，靠${get.poptip('bts_glossary_bless_gongwu_faq')}接炎杀补刀。`;

export const character = {
    bts_ch_dalihua: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_chenni', 'bts_sk_bonong', 'bts_sk_tianshi'],
    },
};

export const skill = {
    // ── 必杀技·沉溺（源 max_chenni = SkillCard + ZeroCardViewAsSkill，L5736-5765）──
    // 出牌阶段，失5怒气，令任意名其他角色各附加1层败谢异常。
    bts_sk_chenni: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5754-5756）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5449）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_chenni');
            lib.bts.api.loseAngry(player, 5); // 源 L5452：LoseAngry(player, 5)
            // 源 L5453-5455：AddAbnormal(p, "@abnormal_baixie", 1, player)
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'baixie', 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_chenni') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·拨弄（源 st_bonong = TriggerSkill Compulsory Damage，L5469-5491）──
    // 拥有共舞祝福的其他角色（手牌数最多者）造成伤害令目标空城后，大丽花视为对其使用炎【杀】；
    // 每名来源每回合至多一次（-start 标记于准备阶段清除）。
    bts_sk_bonong: {
        // 源 st_bonong（animal.lua L5469-5491）：共舞祝福持有者（手牌数最多者）造成伤害令目标
        // 空城后，大丽花视为对伤害来源使用炎【杀】；每名来源每回合至多一次（-start 标记于
        // 准备阶段清除）。原实现误将 gate 置于 filter 且目标取为受伤者，导致技能永不触发。
        trigger: { global: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 源 L5482：伤害来源存在、非你、本回合未用过、目标空城、来源有共舞祝福且手牌数最多
            if (
                !event.source ||
                event.source === player ||
                event.source.countMark('bts_mk_dalihua-start') ||
                !event.player ||
                event.player.countCards('h') !== 0 ||
                !lib.bts.api.getBless(event.source, 'gongwu')
            )
                return false;
            // 源 L5476-5480：取其他角色中拥有共舞祝福者的最大手牌数
            let max = 0;
            for (const candidate of game.filterPlayer(
                (candidate) =>
                    candidate !== player &&
                    lib.bts.api.getBless(candidate, 'gongwu'),
            ))
                max = Math.max(max, candidate.countCards('h'));
            // 源 L5482：伤害来源手牌数 == 最大（手牌数最多者）
            return event.source.countCards('h') === max;
        },
        async content(event, trigger, player) {
            // 源 L5484：addPlayerMark(player=来源, "@st_bonong-start") —— 本回合限一次（trigger=damageEnd 事件）
            trigger.source.addMark('bts_mk_dalihua-start', 1);
            // 源 L5483：ViewAsCardOnly(p, player=来源, "_st_bonong_fire") —— 对来源使用炎【杀】
            await player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'flame' } },
                trigger.source,
            );
        },
        ai: { noe: true },
    },

    // ── 触发技·舔舐（源 st_tianshi = TriggerSkill EventPhaseStart Finish + OneCardViewAsSkill，L5493-5527）──
    // 结束阶段开始时，可弃置一张【杀】，令你与一名其他角色各附加1层共舞祝福。
    bts_sk_tianshi: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L5523：结束阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L5524：askForUseCard("@@st_tianshi") —— 弃【杀】选目标。
            // AI 选目标（函数式 ai，等价源 StarRail-ai L3226-3235 ai_skill_use["@@st_tianshi"]）：
            // 共舞祝福是属性/元素体系的攻击放大器，只应交给属性型盟友（NaturePlayer 判定）——
            // 属性型盟友估值最高；普通盟友/中立计 0、敌人为负，无可用目标时 ai2 判负 → 引擎整体取消。
            event.result = await player
                .chooseCardTarget({
                    prompt: '舔舐：弃置一张【杀】令你与一名其他角色获得共舞祝福',
                    position: 'h',
                    filterCard: (card) => get.name(card) === 'sha',
                    filterTarget: (card, source, target) => target !== source,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => {
                        const attitude = get.attitude(player, target);
                        if (attitude <= 0) return -1;
                        return lib.bts.api.naturePlayer(target) ? attitude + 5 : 0;
                    },
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选目标/牌在技能事件 event.targets/event.cards（标准约定）
            // 源 L5524：弃【杀】
            await player.discard(event.cards);
            // 源 L5499-5502：自己与目标各附加1层共舞祝福
            await lib.bts.api.addBless(player, 'gongwu', 1, player);
            await lib.bts.api.addBless(event.targets[0], 'gongwu', 1, player);
        },
        ai: { result: { player: 1 } },
    },
};

export const marks = {
    'bts_mk_dalihua-start': { markKind: 'record' },
};

export const translate = {
    'bts_mk_dalihua-start': '播弄已用',
    bts_ch_dalihua: '大丽花',
    bts_sk_chenni: '沉溺', // 源 max_chenni（L13929）；避免与星期日·赞颂撞名
    bts_sk_chenni_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，令至少一名其他角色各附加1层${get.poptip('bts_glossary_abnormal_baixie_faq')}`,
    bts_sk_bonong: '拨弄',
    bts_sk_bonong_info: `锁定技，拥有${get.poptip('bts_glossary_bless_gongwu_faq')}的其他角色造成伤害令目标空城后，你可以对其使用炎【杀】`,
    bts_sk_tianshi: '舔舐',
    bts_sk_tianshi_info: `结束阶段开始时，你可以弃置一张【杀】，令你与一名其他角色各附加1层${get.poptip('bts_glossary_bless_gongwu_faq')}`,
    bts_bless_gongwu: '共舞祝福',
    bts_bless_gongwu_info: '来源：舔舐赋予；属性伤弃敌牌、置牌；回合结束自然减少1层',
    bts_abnormal_baixie: '败谢',
};

export const simpleTranslate = {
    bts_sk_chenni_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+1${get.poptip('bts_glossary_abnormal_baixie_faq')}`,
    bts_sk_bonong_info: `锁；${get.poptip('bts_glossary_bless_gongwu_faq')}角色伤害令目标空城后可对其炎杀`,
    bts_sk_tianshi_info: `结束阶段可弃杀令自己和1名其他角色各+1${get.poptip('bts_glossary_bless_gongwu_faq')}`,
};

export const pinyins = { bts_ch_dalihua: 'dalihua' };

export const buffSkills = {
    bts_bless_gongwu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_gongwu_faq',
        // 源 gamerule_ex DamageCaused（L1218-1227）：属性伤害时受伤角色弃1张、其余手牌置于武将牌；
        // 源 DamageComplete（L1351-1360）新增：伤害结算完毕后回收置旁牌（V2.0 缺失回收→牌永置）。
        trigger: { source: 'damageBegin1', global: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (triggername === 'damageEnd') {
                // 源 L1353：被伤者（damage.to）仍有 @bless_gongwu 置旁牌时回收
                return (
                    event.player &&
                    event.player.getExpansions('bts_gongwu').length > 0
                );
            }
            const gongwuHand = event.player?.getCards('h') || [];
            return (
                event.source === player &&
                event.num > 0 &&
                lib.bts.api.getNature(event) &&
                gongwuHand.length &&
                lib.filter.cardDiscardable(gongwuHand[0], event.player)
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'damageEnd') {
                // 源 L1353-1359：回收共舞置旁牌回手牌（obtainCard）
                const cards = trigger.player.getExpansions('bts_gongwu');
                if (cards.length) await trigger.player.gain(cards, 'gain2');
                return;
            }
            game.log(player, '触发了共舞祝福');
            await trigger.player.chooseToDiscard(
                '共舞祝福：弃置一张手牌',
                'h',
                1,
                true,
            );
            // 源 L1221-1226：其余手牌于伤害结算前置旁（addToPile "@bless_gongwu"）
            const rest = trigger.player.getCards('h');
            if (rest.length) {
                const next = trigger.player.addToExpansion(rest, 'give');
                next.gaintag.add('bts_gongwu');
                await next;
            }
        },
    },
    bts_abnormal_baixie: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_baixie_faq',
        trigger: { player: 'damageBegin2' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.num > 0 &&
                lib.bts.api.getNature(event) &&
                player.countCards('h') > 0
            );
        },
        async content(event, trigger, player) {
            await player.chooseToDiscard('败谢：弃置一张手牌', 'h', 1, true);
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_gongwu_faq',
        name: '共舞祝福',
        info: '当你对其他角色造成属性伤害时，其弃置一张手牌，并将其余手牌置于其武将牌上。你的结束阶段开始时，此祝福减少1层。',
    },
    {
        id: 'bts_glossary_abnormal_baixie_faq',
        name: '|败谢|',
        info: `异常状态：由技能效果赋予；受到属性伤害或附加元素时弃置一张手牌。`,
    },
];
