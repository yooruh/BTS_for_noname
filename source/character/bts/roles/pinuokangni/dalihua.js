// 大丽花（源 animal.lua L5735-5825）—— 败谢与共舞。
// 技能：沉溺（必杀技·败谢异常）、拨弄（共舞持牌最多者伤害令目标空城后炎杀补刀）、舔舐（结束阶段弃杀赠共舞祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '火·虚无·流梦礁的舞者'; // 属性·命途
export const intro =
    `${B('大丽花')}用${get.poptip('bts_glossary_abnormal_baixie_faq')}压属性伤害，靠${get.poptip('bts_glossary_bless_gongwu_faq')}接炎杀补刀。`;

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
            // AI 口径：怒气≥5（filter 同门）；失5怒为每名敌人附加1层败谢（受到属性伤害时弃1手牌）；
            // 敌方越多收益越大；无敌方时不发动（源 animal.lua L5736-5765）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_chenni')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // filter 同门
                let foes = 0;
                for (const t of game.players)
                    if (t.isAlive() && t !== player && get.attitude(player, t) < 0)
                        foes++;
                if (!foes) return -1;
                return Math.min(9, 4 + foes * 1.5); // 每名敌人1层败谢：敌多线性放大
            },
            result: {
                player: 0.5, // 施加败谢的攒标价值
                // 对敌：1层败谢（受属性伤害时弃1手牌）；已有层数者边际低、无可弃牌者损失小
                target: (player, target) => {
                    if (lib.bts.api.getAbnor(target, 'baixie')) return -0.5;
                    return target.countCards('h') > 0 ? -1 : -0.6;
                },
            },
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
        ai: {
            // 本技为 cost 型触发技：引擎不走默认 chooseBool、无顶层 check 读取点，发动与否全由 cost 内
            // ai1/ai2 决定（对齐试点·虹光范式）；此 result 供跨技能估值查询——目标获益=1层共舞祝福
            //（属性伤害触发弃牌/置牌强化，属性型盟友价值更高）（源 animal.lua L5493-5527）
            result: {
                player: 1,
                target: (player, target) => (lib.bts.api.naturePlayer(target) ? 2 : 1),
            },
        },
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
    bts_bless_gongwu_info: `来源：${get.poptip('bts_sk_tianshi')}赋予；属性伤弃敌牌、置牌；回合结束自然减少1层`,
    bts_abnormal_baixie: '败谢',

    '$bts_sk_chenni1': "记忆的坟茔，已然敞开——",
    '$bts_sk_chenni2': "曲终人亡的时刻…美不胜收",
    '$bts_sk_bonong1': "迫不及待了？",
    '$bts_sk_bonong2': "想…背叛我？",
    '$bts_sk_tianshi1': "为我，焚身起舞吧",
    '$bts_sk_tianshi2': "将我，铭心蚀骨吧",

    '~bts_ch_dalihua': "陪我…一起吧……",
};

export const simpleTranslate = {
    bts_sk_chenni_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+1${get.poptip('bts_glossary_abnormal_baixie_faq')}`,
    bts_sk_bonong_info: `锁；${get.poptip('bts_glossary_bless_gongwu_faq')}角色伤害令目标空城后可对其炎杀`,
    bts_sk_tianshi_info: `结束阶段可弃杀令自己和1名其他角色各+1${get.poptip('bts_glossary_bless_gongwu_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

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
                // 按描述「对其他角色」补门控（源描述参照本 L14120；无名杀存在自伤带来源路径
                //〔xiadie.js:179 player.damage(player,…)〕→ 不门控会自触发，定夺补）。
                event.player !== player &&
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

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_gongwu_faq',
        name: '共舞祝福',
        info: `当你对其他角色造成属性伤害时，其弃置一张手牌，并将其余手牌置于其武将牌上。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_abnormal_baixie_faq',
        name: '|败谢|',
        info: `异常状态：由技能效果赋予；受到属性伤害或附加元素时弃置一张手牌。`,
    },
];
