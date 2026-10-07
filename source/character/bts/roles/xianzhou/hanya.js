// 寒鸦（源 animal.lua L5924-5995）—— 补牌支援与系缚。
// 技能：遵行（必杀技·令目标补牌至与你相同）、系缚（准备阶段将一张【杀】交给其他角色）、罚恶（发动遵行/系缚后摸牌）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '物理·同谐·十王司判官'; // 属性·命途
export const intro =
    `${B('寒鸦')}以${get.poptip('bts_sk_zunxing')}为手牌不足的同伴补牌，并用${get.poptip('bts_sk_xifu')}传递【杀】。`;

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
            // AI 口径：友方补牌数=双方手牌差（缺口越大越值）+罚恶自己摸1；无友方缺口则不动
            //（源 max_zunxing，animal.lua L5925-5947；源 AI StarRail-ai.lua L2553-2569）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_zunxing')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1; // 与 filter 同门
                let best = 0;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) <= 0) continue; // 只给友方补牌
                    best = Math.max(
                        best,
                        player.countCards('h') - target.countCards('h'),
                    );
                }
                if (best <= 0) return -1; // 无缺口：3怒气仅换罚恶1张
                return Math.min(9, 4 + best);
            },
            result: {
                player: 1, // 罚恶：发动后自己摸1
                // 目标补牌数=手牌差（友方获益为正；敌方由态度加权排除）
                target: (player, target) => {
                    const gap = player.countCards('h') - target.countCards('h');
                    return gap > 0 ? gap : 0;
                },
            },
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
                    // cost 型触发技：发动与否由内联 ai1/ai2 决定（最高分≤0 → 引擎取消）。
                    // AI 口径：ai1=交分值最低的【杀】；ai2=只交友方（受伤者略优先，源 AI L2571-2572 仅交受伤友军）
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => {
                        const att = get.attitude(player, target);
                        if (att <= 0) return att; // 非友军不交
                        return att + (target.isDamaged() ? 0.5 : 0);
                    },
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L5956：obtainCard 交给牌 —— 结算移入 content（自选数据在 event.cards/targets）
            if (event.cards?.length && event.targets?.length)
                await player.give(event.cards, event.targets[0]);
            // 源 L6333（罚恶）：系缚后摸一张牌。触发技不产生 useSkill/useCard 事件、useSkillAfter
            // 监听不到 → 此处显式结算（遵行仍走罚恶，避免双触发）。
            await player.draw(player);
        },
        ai: {
            // 收益=友方获得1张【杀】；发动同时触发罚恶摸1（content 显式结算）
            result: { player: 1, target: 1 },
        },
    },

    // ── 锁定技·罚恶（源 st_fae = TriggerSkill Compulsory CardUsed，L5983-5994）──
    // 你发动必杀技（遵行）或系缚后，摸一张牌。
    bts_sk_fae: {
        // 源为锁定触发技（Skill_Compulsory），非必杀技本体 → 勿标 bts_bisha（S-B/寒鸦/缇宝忙碌先例）
        trigger: { player: 'useSkillAfter' },
        forced: true,
        filter(event) {
            // 源 L6331：遵行/系缚后摸1。useSkillAfter 仅对主动技触发；系缚的摸牌已在
            // bts_sk_xifu content 显式结算，此处仅剩遵行一条路径。
            return event.skill === 'bts_sk_zunxing';
        },
        async content(event, trigger, player) {
            // 源 L6333：player:drawCards(1)
            await player.draw(player);
        },
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
    bts_sk_fae_info: `锁定技，当你发动${get.poptip('bts_glossary_bisha_faq')}或${get.poptip('bts_sk_xifu')}后，摸一张牌。`,

    '$bts_sk_zunxing1': "幽府判罚，命尔臂助……",
    '$bts_sk_zunxing2': "十王敕令，在此成书",
    '$bts_sk_xifu1': "我代十王判罚",
    '$bts_sk_xifu2': "细思你的罪业",
    '~bts_ch_hanya': "姐姐，我……",

    '$bts_sk_fae1': "束手就缚罢",
    '$bts_sk_fae2': "群邪避让",
};

export const simpleTranslate = {
    bts_sk_zunxing_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色补牌至与你手牌相同`,
    bts_sk_xifu_info: '准备阶段可将1杀交给1名其他角色',
    bts_sk_fae_info: `锁；发动${get.poptip('bts_glossary_bisha_faq')}或${get.poptip('bts_sk_xifu')}后摸1`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
