// 寒鸦（源 animal.lua L5924-5995）—— 补牌支援与系缚。
// 技能：遵行（必杀技·令目标补牌至与你相同）、系缚（准备阶段将一张【杀】交给其他角色）、罚恶（发动遵行/系缚后摸牌）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '物理·同谐·十王司判官'; // 属性·命途
export const intro =
    `${B('寒鸦')}以遵行为手牌不足的同伴补牌，并用系缚传递【杀】。`;

export const character = {
    bts_ch_hanya: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_sk_zunxing', 'bts_sk_xifu', 'bts_sk_fae'],
    },
};

export const skill = {
    // ── 必杀技·遵行（源 st_zunxing = SkillCard + ZeroCardViewAsSkill，L5925-5947）──
    // 出牌阶段，失3怒气并选择一名其他角色，其将手牌补至与你相同。
    bts_sk_zunxing: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5945）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5928）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zunxing');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L5931：LoseAngry(player, 3)
            // 源 L5932-5935：n = 你的手牌数 - 目标手牌数，>0 时目标摸 n 张
            const count = player.countCards('h') - target.countCards('h');
            if (count > 0) await target.draw(player, count);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zunxing') ? -1 : 6;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·系缚（源 st_xifu = TriggerSkill EventPhaseStart Start + OneCardViewAsSkill，L5949-5981）──
    // 准备阶段开始时，你可以将一张【杀】交给一名其他角色。
    bts_sk_xifu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L5977：准备阶段且手牌非空（有【杀】可交）
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer((target) => target !== player)
            );
        },
        async cost(event, trigger, player) {
            // 源 L5978：askForUseCard("@@st_xifu") —— 仅选【杀】与目标（移交由 content 结算）
            event.result = await player
                .chooseCardTarget({
                    prompt: '系缚：将一张【杀】交给一名其他角色',
                    position: 'h',
                    filterCard: (card) => get.name(card) === 'sha',
                    selectCard: 1,
                    filterTarget: (card, source, target) => target !== source,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L5956：obtainCard 交给牌 —— 结算移入 content（自选数据在 event.cards/targets）
            if (event.cards?.length && event.targets?.length)
                await player.give(event.cards, event.targets[0]);
            // 源 L6333（罚恶）：系缚后摸一张牌。系缚为触发技不产生 useSkill/useCard 事件，
            // 罚恶的 useSkillAfter 监听不到 → 此处显式结算（遵行仍走罚恶，避免双触发）。
            await player.draw(player);
        },
        ai: { result: { target: 1 } },
    },

    // ── 锁定技·罚恶（源 st_fae = TriggerSkill Compulsory CardUsed，L5983-5994）──
    // 你发动必杀技（遵行）或系缚后，摸一张牌。
    bts_sk_fae: {
        // 源为锁定触发技（Skill_Compulsory），非必杀技本体 → 勿标 bts_bisha（S-B/寒鸦/缇宝忙碌先例）
        trigger: { player: 'useSkillAfter' },
        forced: true,
        filter(event) {
            // 源 L6331：遵行/系缚的技能牌使用后摸1。无名杀 useSkillAfter 仅对主动技触发，
            // 系缚为触发技（phaseZhunbeiBegin）不产生 useSkill 事件 → 其摸牌在系缚 content
            // 内显式结算（见 bts_sk_xifu content），此处仅剩遵行一条路径。
            return event.skill === 'bts_sk_zunxing';
        },
        async content(event, trigger, player) {
            // 源 L6333：player:drawCards(1)
            await player.draw(player);
        },
        ai: { noe: true },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_hanya_skin1': '皮肤1',
    'bts_ch_hanya_skin2': '皮肤2',
    bts_ch_hanya: '寒鸦',
    bts_sk_zunxing: '遵行',
    bts_sk_zunxing_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，其将手牌补至与你相同。`,
    bts_sk_xifu: '系缚',
    bts_sk_xifu_info: '准备阶段开始时，你可以将一张【杀】交给一名其他角色。',
    bts_sk_fae: '罚恶',
    bts_sk_fae_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}或系缚后，摸一张牌。`,

    '$bts_sk_zunxing1': "幽府判罚，命尔臂助……",
    '$bts_sk_zunxing2': "十王敕令，在此成书",
    '$bts_sk_xifu1': "我代十王判罚",
    '$bts_sk_xifu2': "细思你的罪业",
    '~bts_ch_hanya': "姐姐，我……",
};

export const simpleTranslate = {
    bts_sk_zunxing_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色补牌至与你手牌相同`,
    bts_sk_xifu_info: '准备阶段可将1杀交给1名其他角色',
    bts_sk_fae_info: `锁；发动${get.poptip('bts_glossary_bisha_faq')}或系缚后摸1`,
};

export const pinyins = { bts_ch_hanya: 'hanya' };
