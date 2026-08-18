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
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_yidao') ? -1 : 7;
            },
            result: { target: 1 },
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
        ai: { noe: true },
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
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '和韵：是否弃置一张【杀】令受伤角色获得3层赐福？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L5775：AddBless(player=受伤者, "@bless_cifu", 3, p)
            await lib.bts.api.addBless(trigger.player, 'cifu', 3, player);
        },
        ai: { result: { player: 1 } },
    },
};

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

export const pinyins = { bts_ch_tingyun: 'tingyun' };
