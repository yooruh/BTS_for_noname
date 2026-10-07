// 青雀（源 animal.lua L5642-5721）—— 暗刻、琼玉与捞月。
// 技能：暗刻（必杀技·摸4）、琼玉（准备阶段摸1+混乱）、捞月（弃杀摸2 / 四同花视为杀并清混乱）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '量子·智识·太卜司卜者'; // 属性·命途
export const intro =
    `${B('青雀')}在${get.poptip('bts_glossary_abnormal_confuse_faq')}里抓同花色牌，凑够四张用${get.poptip('bts_sk_laoyue')}当【杀】打出去。`;

export const character = {
    bts_ch_qingque: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_sk_anke', 'bts_sk_qiongyu', 'bts_sk_laoyue'],
    },
};

export const skill = {
    // ── 必杀技·暗刻（源 st_anke = SkillCard + ZeroCardViewAsSkill，L5643-5660）──
    // 出牌阶段，失3怒气并摸四张牌。
    bts_sk_anke: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5658）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_anke');
            lib.bts.api.loseAngry(player, 3); // 源 L5647：LoseAngry(player, 3)
            await player.draw(player, 4); // 源 L5648：player:drawCards(4)
        },
        ai: {
            // AI 口径：怒气≥3（filter 同门）即接——摸4≈两张【无中生有】（源 AI max_anke 估值
            // ExNihilo+1、无手牌条件，StarRail-ai.lua L2150-2165）；空手时摸4更能翻盘，
            // 手牌将溢出（≥6）时降档
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_anke')) return -1;
                let v = 6;
                if (player.countCards('h') <= 2) v += 1;
                else if (player.countCards('h') >= 6) v -= 1;
                return v;
            },
            // 摸4折算2点摸牌收益（跨技能估值）
            result: { player: 2 },
        },
    },

    // ── 锁定技·琼玉（源 st_qiongyu = TriggerSkill Compulsory EventPhaseStart/CardUsed，L5662-5680）──
    // 准备阶段开始时，你摸一张牌并附加1层混乱；使用捞月虚拟【杀】后移除混乱并结束出牌阶段（后者并入捞月）。
    bts_sk_qiongyu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L5667-5670：准备阶段开始时 drawCards(1) + AddAbnormal(@abnormal_confuse)
            await player.draw(player);
            lib.bts.api.addAbnormal(player, 'confuse', 1, player);
        },
    },

    // ── 主动技·捞月（源 st_laoyue = ViewAsSkill n=4 + SkillCard，L5682-5720）──
    // 出牌阶段，你可以弃置一张【杀】摸两张牌；或将四张同花色手牌视为使用【杀】，
    // 移除你的混乱并结束出牌阶段。
    bts_sk_laoyue: {
        enable: 'phaseUse',
        filterCard(card, player) {
            // 源 view_filter（L5693-5699）：首张任意（可单张【杀】），后续须与首张同花色、至多4张。
            // 同花约束须经 ui.selected.cards 读当前选中牌判定（参照叁岛 zhangshengjie9 同款"四同花"写法）。
            const selected = ui.selected?.cards || [];
            if (!selected.length) return true;
            if (selected.length >= 4) return false;
            return get.suit(card) === get.suit(selected[0]);
        },
        position: 'h',
        selectCard: [1, 4], // 源 n=4（L5692）
        complexCard: true,
        filter(event, player) {
            // 源 enabled_at_play（L5718）：可弃手牌或手牌≥4
            return player.countCards('h') > 0;
        },
        filterTarget(card, player, target) {
            // 四同花视为【杀】的目标（源 L5708：clone slash）：距离仍按正常【杀】判定（canSlash），
            // 仅放宽目标数——须校验 player.inRange（对照灵砂·浮元同款判定）。
            return target !== player && player.inRange(target);
        },
        selectTarget: [0, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_laoyue');
            const cards = event.cards || [];
            // 源 L5702-5706：单张【杀】→ 摸2（st_laoyueCard）
            if (cards.length === 1 && get.name(cards[0]) === 'sha') {
                await player.discard(cards);
                await player.draw(player, 2); // 源 L5686：player:drawCards(2)
                return;
            }
            // 源 L5707-5713：四张同花色 → 视为使用【杀】
            if (cards.length !== 4) return;
            const suit = get.suit(cards[0]);
            if (cards.some((card) => get.suit(card) !== suit)) return;
            await player.discard(cards);
            // 源 L5676：RemoveAbnormal 默认移除1层（L622-626）——勿传 -1（会清空全部层）。
            lib.bts.api.removeAbnormal(player, 'confuse', 1);
            // 源 L5674：Global_PlayPhaseTerminated 结束出牌阶段
            lib.bts.api.endPlayPhase(player);
            await player.useCard({ name: 'sha', isCard: true }, event.targets || []);
        },
        // 捞月选牌决策（顶层 check、非 ai.check——引擎读取点 ai/basic.js chooseCard：非 viewAs 技能
        // 取 info.check || get.unuseful2）：只对合法牌集计正分，避免默认填满4张导致 content 空转；
        // 模式判定与 ai.order 同源（参照源 AI st_laoyue，StarRail-ai.lua L2168-2217）
        check(card) {
            if (!card || typeof card !== 'object') return 0; // 技能按钮等非牌候选不计分
            const player = get.player();
            if (!player) return -1;
            const groupSuit = laoyueGroupSuit(player);
            const canB = laoyueCanGroup(player);
            if (canB && lib.bts.api.getAbnor(player, 'confuse'))
                return get.suit(card) === groupSuit ? 4 : -1; // 模式 B：同花组填满4张
            const firstSha = player.getCards('h').find((c) => get.name(c) === 'sha');
            if (firstSha) return card === firstSha ? 4 : -1; // 模式 A：仅取一张【杀】
            if (canB) return get.suit(card) === groupSuit ? 4 : -1; // 模式 B 兜底
            return -1;
        },
        ai: {
            // AI 口径：参照源 AI st_laoyue（StarRail-ai.lua L2168-2217）——有【杀】优先模式 A
            //（弃1【杀】摸2）；否则凑齐同花四张时走模式 B（视为【杀】）；自身带混乱（造成的伤害
            // 无效）且可走模式 B 时最积极——本技是唯一清混乱手段
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_laoyue')) return -1;
                const canA = player.getCards('h').some((card) => get.name(card) === 'sha');
                const canB = laoyueCanGroup(player);
                if (!canA && !canB) return -1; // 两种模式均不成立：否决（防空转）
                if (canB && lib.bts.api.getAbnor(player, 'confuse')) return 6; // 清混乱+当【杀】
                return 5; // 弃杀摸2 / 四同花当【杀】（源估值 ExNihilo+1 档）
            },
            result: {
                player: 1, // 模式 A 摸2 / 模式 B 清1层混乱折算
                // 模式 B 视为【杀】：1点伤害，可击杀加权
                target: (player, target) => (target.hp <= 1 ? -4 : -1.5),
            },
        },
    },
};

// 捞月模式判定（AI order 与选牌 check 共用口径）：手牌中是否凑得齐同花四张（模式 B 前置）。
// 模式 B 当【杀】须有攻击范围内敌方目标（本库 selectTarget 允许 0 目标，AI 仍要求有目标）。
export function laoyueCanGroup(player) {
    if (!laoyueGroupSuit(player)) return false;
    return game.hasPlayer(
        (t) =>
            t.isAlive() &&
            t !== player &&
            get.attitude(player, t) < 0 &&
            player.inRange(t),
    );
}
// 返回手牌中张数≥4的花色（取张数最多者）；无则 null
export function laoyueGroupSuit(player) {
    const counts = {};
    for (const card of player.getCards('h')) {
        const suit = get.suit(card);
        counts[suit] = (counts[suit] || 0) + 1;
    }
    let suit = null,
        num = 0;
    for (const s in counts) {
        if (counts[s] >= 4 && counts[s] > num) {
            suit = s;
            num = counts[s];
        }
    }
    return suit;
}

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_qingque_skin1': '皮肤1',
    'bts_ch_qingque_skin2': '皮肤2',
    bts_ch_qingque: '青雀',
    bts_sk_anke: '暗刻',
    bts_sk_anke_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并摸四张牌。`,
    bts_sk_qiongyu: '琼玉',
    bts_sk_qiongyu_info: `锁定技，准备阶段开始时，你摸一张牌并附加1层${get.poptip('bts_glossary_abnormal_confuse_faq')}。`,
    bts_sk_laoyue: '捞月',
    bts_sk_laoyue_info: `出牌阶段，你可以弃置一张【杀】摸两张牌；或将四张同花色手牌视为使用【杀】，移除1层你的${get.poptip('bts_glossary_abnormal_confuse_faq')}并结束出牌阶段。`,

    '$bts_sk_anke1': "让我摸个「鱼」吧！",
    '$bts_sk_anke2': "拜托拜托拜托…哎呀，这不就…和了！",
    '$bts_sk_qiongyu1': "好牌不嫌晚！",
    '$bts_sk_qiongyu2': "自摸加杠开！",
    '$bts_sk_laoyue1': "有了！",
    '$bts_sk_laoyue2': "不慌~",
    '$bts_sk_laoyue3': "来吧~",
    '$bts_sk_laoyue4': "嚯哟~",
    '$bts_sk_laoyue5': "哇哦~",
    '$bts_sk_laoyue6': "怎么还没摸到…",
    '$bts_sk_laoyue7': "来点手气~",
    '$bts_sk_laoyue8': "算总账咯",
    '~bts_ch_qingque': "不想…回去工作……",
};

export const simpleTranslate = {
    bts_sk_anke_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}摸4`,
    bts_sk_qiongyu_info: `锁；准备阶段摸1并+1${get.poptip('bts_glossary_abnormal_confuse_faq')}`,
    bts_sk_laoyue_info: `出牌阶段可弃杀摸2，或四同花视为杀并移1层${get.poptip('bts_glossary_abnormal_confuse_faq')}、结束出牌`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
