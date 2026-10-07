// 停云（源 animal.lua L5722-5783）—— 怒气支援与赐福光伤。
// 技能：仪祷（必杀技·目标回复怒气）、紫电（有赐福时无属性伤害转光伤）、和韵（他人受伤弃杀+赐福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '雷·同谐·天舶司接渡使'; // 属性·命途
export const intro =
    `${B('停云')}给队友送${get.poptip('bts_glossary_nuqi_faq')}，挂上${get.poptip('bts_glossary_bless_cifu_faq')}后全队无属性伤害都变光伤。`;

export const character = {
    bts_ch_tingyun: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_sk_yidao', 'bts_sk_zidian', 'bts_sk_heyun'],
    },
};

export const skill = {
    // ── 必杀技·仪祷（源 st_yidao = SkillCard + ZeroCardViewAsSkill，L5723-5746）──
    // 出牌阶段，失3怒气，令一名其他角色回复1点怒气（星启时为2点）。
    bts_sk_yidao: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5744）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget() {
            // 源 Card filter（L5726）：仅限单目标（#targets==0），无 ~=Self —— 可目标自己（按原版放开）
            return true;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yidao');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L5729：LoseAngry(player, 3)
            // 源 L5730-5734：n=1，星启时 n=2，AddAngry(targets[1], n)
            lib.bts.api.addAngry(target, lib.bts.api.god(player) ? 2 : 1, player);
        },
        ai: {
            // AI 口径：怒气≥3（filter 同门）；失3怒为1名友方补1怒（星启2）——仅对拥有怒气必杀者
            // 有效（addAngry 门控 hasAngryBisha），且须使其越过常见门槛 3/4/5（立即兑现必杀）才值；
            // 自指仅返还1-2怒、净亏，AI 不选自指（源 AI max_yidao→Friends_Angry_AI 取怒气最高友方、
            // 无友方不发，StarRail-ai.lua L2274-2287）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_yidao')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1; // 与 filter 同门
                const n = lib.bts.api.god(player) ? 2 : 1;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) <= 0) continue; // 只给友方供怒
                    if (!lib.bts.api.hasAngryBisha(target)) continue; // 怒气对其无用
                    if (yidaoCross(lib.bts.api.getAngry(target), n)) return 7; // 补满即可发必杀
                }
                return -1; // 未促成门槛则蓄怒等待
            },
            result: {
                // 目标+1怒（星启2）；补满门槛更值；自指/无怒气必杀者记0
                target: (player, target) => {
                    if (target === player) return 0;
                    if (!lib.bts.api.hasAngryBisha(target)) return 0;
                    const n = lib.bts.api.god(player) ? 2 : 1;
                    return yidaoCross(lib.bts.api.getAngry(target), n) ? 1.5 : 1;
                },
            },
        },
    },

    // ── 锁定技·紫电（源 st_zidian = TriggerSkill Compulsory DamageCaused，L5748-5764）──
    // 场上有角色拥有赐福祝福时，无属性伤害视为虚数伤害。
    bts_sk_zidian: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event) {
            // 源 L5754-5755：场上有角色拥有赐福且伤害无属性
            return (
                !lib.bts.api.getNature(event) &&
                game.hasPlayer((target) => lib.bts.api.getBless(target, 'cifu'))
            );
        },
        async content(event, trigger) {
            // 源 L5757：AddNew(damage, "_light")
            lib.bts.api.setDamageNature(trigger, 'light');
        },
    },

    // ── 触发技·和韵（源 st_heyun = TriggerSkill Damaged，L5766-5782）──
    // 其他角色受到伤害后，可弃置一张【杀】，令其附加3层赐福祝福。
    bts_sk_heyun: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L5774：受伤者 ≠ 你、存活，且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                event.player !== player &&
                event.player?.isAlive() &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L5774：askForCard(p, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            // AI 口径：只助友方（源 AI @st_heyun→ThrowSlash_AI 第二型：非友方返回不发，
            // StarRail-ai.lua L2289-2294）；已有赐福者续层优先；分值随【杀】价值递减，
            // 最高分≤0 由引擎取消=不发动
            const target = trigger.player;
            const helpful = get.attitude(player, target) > 0;
            const keeping = lib.bts.api.getBless(target, 'cifu');
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '和韵：是否弃置一张【杀】令受伤角色获得3层赐福？',
                )
                .set('ai', (card) => (helpful ? 6 - get.value(card) + (keeping ? 1 : 0) : -1))
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L5775：AddBless(player=受伤者, "@bless_cifu", 3, p)
            await lib.bts.api.addBless(trigger.player, 'cifu', 3, player);
        },
        // AI 口径：result 供跨技能估值——3层赐福=目标无属性【杀】转光伤（异元素相克+1），
        // 同时点亮紫电（场上有赐福即本方无属性伤害转光）；发动决策在 cost 内联 AI
        ai: { result: { player: 1, target: 1 } },
    },
};

// 仪祷补怒是否助目标越过常见必杀门槛（3/4/5）——越过才按「立即兑现必杀」计价（order/result 共用）
export function yidaoCross(angry, n) {
    return [3, 4, 5].some((x) => angry < x && angry + n >= x);
}

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_tingyun_skin1': '皮肤1',
    'bts_ch_tingyun_skin2': '皮肤2',
    'bts_ch_tingyun_skin3': '皮肤3',
    bts_ch_tingyun: '停云',
    bts_sk_yidao: '仪祷',
    bts_sk_yidao_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，令一名角色回复1点${get.poptip('bts_glossary_nuqi_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，改为回复2点。`,
    bts_sk_zidian: '紫电',
    bts_sk_zidian_info: `锁定技，场上有角色拥有${get.poptip('bts_glossary_bless_cifu_faq')}时，无属性伤害视为${get.poptip('bts_glossary_nature_light_dmg_faq')}伤害。`,
    bts_sk_heyun: '和韵',
    bts_sk_heyun_info: `其他角色受到伤害后，你可以弃置一张【杀】，令其附加3层${get.poptip('bts_glossary_bless_cifu_faq')}。`,

    '$bts_sk_yidao1': "就以奇珍万千，给各位鼓劲啦~",
    '$bts_sk_yidao2': "百事贞吉，一心同归",
    '$bts_sk_zidian1': "凉快凉快~",
    '$bts_sk_zidian2': "欸~消消火气",
    '$bts_sk_heyun1': "诸邪回避~",
    '$bts_sk_heyun2': "万事顺意~",
    '~bts_ch_tingyun': "时运…不济啊…",
};

export const simpleTranslate = {
    bts_sk_yidao_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}令1名角色+1${get.poptip('bts_glossary_nuqi_faq')}（${get.poptip('bts_glossary_xingqi_faq')}+2）`,
    bts_sk_zidian_info: `锁；有${get.poptip('bts_glossary_bless_cifu_faq')}时无属性伤害视为光伤`,
    bts_sk_heyun_info: `他人受伤后可弃杀令其+3${get.poptip('bts_glossary_bless_cifu_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
