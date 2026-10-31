// 桑博（源 animal.lua L3567-3673）—— 惊喜必杀技中毒、撕风锁定判定加风、横跳弃杀顺手牵羊+中毒。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '风·虚无·百搭鬼牌'; // 属性·命途
export const intro =
    `${B('桑博')}是${get.poptip('bts_glossary_zhongdu_faq')}干扰：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_jingxi'))}附加${get.poptip('bts_glossary_zhongdu_faq')}，${B(get.poptip('bts_sk_sifeng'))}给无属性伤害判定加风，${B(get.poptip('bts_sk_hengtiao'))}弃【杀】顺手牵羊并追加${get.poptip('bts_glossary_zhongdu_faq')}。` +
    `<li>${get.poptip('bts_glossary_zhongdu_faq')}会在弃牌阶段令目标失去体力`;

export const character = {
    bts_ch_sangbo: {
        sex: 'male',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_jingxi', 'bts_sk_sifeng', 'bts_sk_hengtiao'],
    },
};

export const skill = {
    // ── 必杀技·惊喜（源 st_jingxi = ZeroCardViewAsSkill，L3568-3586）──
    bts_sk_jingxi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_jingxi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3);
            lib.bts.api.addAbnormal(target, 'poison', 1, player);
            if (lib.bts.api.god(player)) target.addMark('bts_sk_jingxi', 1);
        },
        ai: {
            // AI 口径：怒气≥3 且有敌方时发动；目标+1层中毒（弃牌阶段失去1体力+手牌上限-1，回复体力会移除异常）；
            // 星启另获惊喜标记（该次失去改为2点并消耗）；残血可逼濒死
            //（源 animal.lua L3568-3586；中毒见 rules/globalBuffs.js bts_abnormal_poison）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_jingxi')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1;
                const god = lib.bts.api.god(player);
                let best = 0;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    let v = 1.3; // 中毒1层：弃牌阶段失去1体力+手牌上限-1
                    if (god) v += 0.6; // 星启：惊喜标记令该次失去改为2点
                    if (target.hp <= (god ? 2 : 1)) v += 1.5; // 残血：弃牌阶段失血可逼濒死
                    if (lib.bts.api.getAbnor(target, 'poison')) v -= 0.3; // 已中毒：叠加收益递减
                    best = Math.max(best, v);
                }
                if (!best) return -1;
                return best >= 4 ? 7 : best >= 3 ? 5 : 3;
            },
            result: {
                // 受动方：+1层中毒（弃牌阶段失1体力+手牌上限-1）；星启与残血加压
                target: (player, target) => {
                    let v = 1.3;
                    if (lib.bts.api.god(player)) v += 0.6;
                    if (target.hp <= 2) v += 0.5;
                    return -v;
                },
            },
        },
    },

    // ── 锁定技·撕风（源 st_sifeng = TriggerSkill Compulsory DamageCaused，L3587-3604）──
    bts_sk_sifeng: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            return !lib.bts.api.getNature(event);
        }, // 无属性伤害
        async content(event, trigger, player) {
            const judge = await player.judge((card) => true).forResult();
            // 判定「无结果」契约：死亡/离场除名/被移除时事件被引擎逐步骤拦截
            //（ContentCompilerBase.isPrevented）→ undefined = 判定未发生，不改伤害属性。
            if (!judge) return;
            if (judge.color === 'black')
                lib.bts.api.setDamageNature(trigger, 'wind'); // 判定黑色加风
        },
    },

    // ── 横跳（源 st_hengtiao = OneCardViewAsSkill + SkillCard，L3776-3835）：顺手牵羊后目标及所有中毒角色判定，黑桃各+1中毒 ──
    bts_sk_hengtiao: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对距离1内一名角色视为使用【顺手牵羊】，再令其与中毒角色判定',
        filterTarget(event, player, target) {
            // 定夺（F-03）：直接用 canUse 判断顺手牵羊是否可用——
            // 源顺手牵羊原生 targetFilter 为「距离≤1」，无名杀引擎经 targetInRange/targetEnabled
            // 校验；此处交由引擎判定，不再手写攻击范围（原攻击范围比源宽，含武器距离加成）。
            // 保留「目标有牌」显式检查（顺手牵羊对空目标无效，防 targetEnabled 未含该规则时误选）。
            return (
                target !== player &&
                target.countCards('he') > 0 &&
                player.canUse({ name: 'shunshou', isCard: true }, target)
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_hengtiao');
            const target = event.targets[0];
            await player.discard(event.cards);
            // 源 L3796-3800：ViewAsCard(player, targets, ..., "snatch") 视为对目标使用【顺手牵羊】
            await player.useCard({ name: 'shunshou', isCard: true }, target);
            // 源 L3801-3818：目标及所有中毒角色各判定，结果为黑桃者各附加1层中毒（翻译 L12971）
            for (const p of lib.bts.api.seatOrder(
                game.filterPlayer(
                    (q) => q === target || lib.bts.api.getAbnor(q, 'poison'),
                ),
            )) {
                const judge = await p.judge((card) => true).forResult(); // 源 judge.who = p（各被判定者）
                // 无结果契约：该角色已死亡/离场除名/被移除 → 其判定未发生，跳过（不中断其余角色）。
                if (!judge) continue;
                if (judge.suit === 'spade')
                    lib.bts.api.addAbnormal(p, 'poison', 1, player);
            }
        },
        ai: {
            // AI 口径：需手牌有【杀】（filterCard 同门）且有可指定的有牌敌方（距离等由 canUse 同门判定）才发动；
            // 收益=夺1牌+判定链：目标与所有中毒角色各判定，黑桃(1/4)各+1层中毒——中毒敌方为增益、友方为代价
            //（源 animal.lua L3776-3835；中毒见 rules/globalBuffs.js bts_abnormal_poison）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_hengtiao')) return -1;
                if (!player.getCards('h').some((card) => get.name(card) === 'sha'))
                    return -1; // 无【杀】不可发
                let best = 0;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    if (target.countCards('he') === 0) continue; // 顺手牵羊需目标有牌
                    if (!player.canUse({ name: 'shunshou', isCard: true }, target))
                        continue; // 距离/可用性同 filterTarget
                    best = Math.max(best, 1.5); // 夺1牌
                }
                if (!best) return -1;
                let value = best + 0.35; // 目标自身黑桃判定+1层中毒的期望（1/4×1.3）
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (!lib.bts.api.getAbnor(target, 'poison')) continue;
                    value += get.attitude(player, target) < 0 ? 0.35 : -0.35; // 判定链波及全体中毒角色
                }
                if (value < 1.2) return -1; // 中毒友方过多致链式期望反转：不弃【杀】
                return value >= 2.8 ? 6 : value >= 2.2 ? 5 : 3;
            },
            result: {
                // 施动方：夺得目标1张牌
                player: 1.2,
                // 受动方：失去1张牌+黑桃判定再+1层中毒的期望（filterTarget 已限定有牌目标）
                target: -1.55,
            },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_sangbo_skin1': '皮肤1',
    'bts_ch_sangbo_skin2': '皮肤2',
    bts_ch_sangbo: '桑博',
    bts_sk_jingxi: '惊喜',
    bts_sk_jingxi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加1层${get.poptip('bts_glossary_zhongdu_faq')}，若你为${get.poptip('bts_glossary_xingqi_faq')}，其获得1枚${get.poptip('bts_sk_jingxi')}标记。`,

    bts_sk_sifeng: '撕风',
    bts_sk_sifeng_info: `锁定技，当你造成无属性伤害时，判定，若结果为黑色，此伤害视为${get.poptip('bts_glossary_nature_wind_dmg_faq')}伤害。`,

    bts_sk_hengtiao: '横跳',
    bts_sk_hengtiao_info: `出牌阶段，你可以弃置一张【杀】并选择一名其他角色，视为对其使用【顺手牵羊】，然后其与所有处于${get.poptip('bts_glossary_zhongdu_faq')}的角色各判定，结果为黑桃的角色各附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,

    '$bts_sk_jingxi1': "你在期待些什么？",
    '$bts_sk_jingxi2': "顾客就是上帝，想要我背叛上帝，除非…你加钱~",
    '$bts_sk_sifeng1': "我桑博一向关照朋友",
    '$bts_sk_sifeng2': "又有生意上门了",
    '$bts_sk_hengtiao1': "要不然，来试试这个？",
    '$bts_sk_hengtiao2': "嘿嘿",
    '~bts_ch_sangbo': "这下赔大了……",
};

export const simpleTranslate = {
    bts_sk_jingxi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+1${get.poptip('bts_glossary_zhongdu_faq')}（${get.poptip('bts_glossary_xingqi_faq')}+1${get.poptip('bts_sk_jingxi')}标记）`,
    bts_sk_sifeng_info: `锁；造成无属性伤害时判定，黑色则视为${get.poptip('bts_glossary_nature_wind_dmg_faq')}伤害`,
    bts_sk_hengtiao_info: `出牌阶段，弃1杀对1名其他角色顺手牵羊，其与所有${get.poptip('bts_glossary_zhongdu_faq')}角色判定黑桃则各+1${get.poptip('bts_glossary_zhongdu_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
