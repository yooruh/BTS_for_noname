// 青雀（源 animal.lua L5642-5721）—— 暗刻、琼玉与捞月。
// 技能：暗刻（必杀技·摸4）、琼玉（准备阶段摸1+混乱）、捞月（弃杀摸2 / 四同花视为杀并清混乱）。
import { lib, game, ui, get, B } from '../../shared.js';

export const sort = 'xianzhou';
export const title = '量子·智识·太卜司卜者'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('青雀')}在${get.poptip('bts_glossary_abnormal_confuse_faq')}里抓同花色牌，凑够四张用捞月当【杀】打出去。`;

export const character = {
    bts_qingque: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_st_anke', 'bts_st_qiongyu', 'bts_st_laoyue'],
    },
};

export const skill = {
    // ── 必杀技·暗刻（源 st_anke = SkillCard + ZeroCardViewAsSkill，L5643-5660）──
    // 出牌阶段，失3怒气并摸四张牌。
    bts_st_anke: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L5658）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_anke');
            lib.bts.api.loseAngry(player, 3); // 源 L5647：LoseAngry(player, 3)
            await player.draw(player, 4); // 源 L5648：player:drawCards(4)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_anke') ? -1 : 6;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·琼玉（源 st_qiongyu = TriggerSkill Compulsory EventPhaseStart/CardUsed，L5662-5680）──
    // 准备阶段开始时，你摸一张牌并附加1层混乱；使用捞月虚拟【杀】后移除混乱并结束出牌阶段（后者并入捞月）。
    bts_st_qiongyu: {
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L5667-5670：准备阶段开始时 drawCards(1) + AddAbnormal(@abnormal_confuse)
            await player.draw(player);
            lib.bts.api.addAbnormal(player, 'confuse', 1, player);
        },
        ai: { noe: true },
    },

    // ── 主动技·捞月（源 st_laoyue = ViewAsSkill n=4 + SkillCard，L5682-5720）──
    // 出牌阶段，你可以弃置一张【杀】摸两张牌；或将四张同花色手牌视为使用【杀】，
    // 移除你的混乱并结束出牌阶段。
    bts_st_laoyue: {
        enable: 'phaseUse',
        filterCard(card, player) {
            // 源 view_filter（L5693-5699）：首张任意（可单张【杀】），后续须与首张同花色、至多4张。
            // 已修正：原实现 `get.suit(card) === get.suit(card)` 恒真，同花约束失效（手牌≥4 时任意
            // 牌可选、选错花色在 content 空转）；现经 ui.selected.cards 读当前选中牌判同花
            // （参照叁岛 zhangshengjie9 同款"四同花"写法）。
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
            // 四同花视为【杀】的目标（源 L5708：clone slash；目标须在攻击范围内）。
            // 源描述"无目标数限制"只放宽目标数、距离仍按正常【杀】判定（canSlash）。
            // 已修正：补 inRange 距离校验（原实现漏，可隔全场打人，与灵砂·浮元同款判定对照）。
            return target !== player && player.inRange(target);
        },
        selectTarget: [0, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_laoyue');
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
            // 源 L5676：RemoveAbnormal(player, "@abnormal_confuse")（默认移除1层，L622-626）
            // 已修正：原 -1 会移除全部混乱层，源只移除1层。
            lib.bts.api.removeAbnormal(player, 'confuse', 1);
            // 源 L5674：Global_PlayPhaseTerminated 结束出牌阶段
            player.skip('phaseUse');
            await player.useCard({ name: 'sha', isCard: true }, event.targets || []);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_laoyue') ? -1 : 5;
            },
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_qingque: '青雀',
    bts_st_anke: '暗刻',
    bts_st_anke_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并摸四张牌。`,
    bts_st_qiongyu: '琼玉',
    bts_st_qiongyu_info: `锁定技，准备阶段开始时，你摸一张牌并附加1层${get.poptip('bts_glossary_abnormal_confuse_faq')}。`,
    bts_st_laoyue: '捞月',
    bts_st_laoyue_info: `出牌阶段，你可以弃置一张【杀】摸两张牌；或将四张同花色手牌视为使用【杀】，移除1层你的${get.poptip('bts_glossary_abnormal_confuse_faq')}并结束出牌阶段。`,

    '$bts_st_anke1': "让我摸个「鱼」吧！",
    '$bts_st_anke2': "拜托拜托拜托…哎呀，这不就…和了！",
    '$bts_st_qiongyu1': "好牌不嫌晚！",
    '$bts_st_qiongyu2': "自摸加杠开！",
    '$bts_st_laoyue1': "有了！",
    '$bts_st_laoyue2': "不慌~",
    '$bts_st_laoyue3': "来吧~",
    '$bts_st_laoyue4': "嚯哟~",
    '$bts_st_laoyue5': "哇哦~",
    '$bts_st_laoyue6': "怎么还没摸到…",
    '$bts_st_laoyue7': "来点手气~",
    '$bts_st_laoyue8': "算总账咯",
    '~bts_qingque': "不想…回去工作……",
};

export const simpleTranslate = {
    bts_st_anke_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}摸4`,
    bts_st_qiongyu_info: `锁；准备阶段摸1并+1${get.poptip('bts_glossary_abnormal_confuse_faq')}`,
    bts_st_laoyue_info: `出牌阶段可弃杀摸2，或四同花视为杀并移1层${get.poptip('bts_glossary_abnormal_confuse_faq')}、结束出牌`,
};

export const pinyins = { bts_qingque: 'qingque' };
