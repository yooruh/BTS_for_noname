// 翡翠（源 animal.lua L4797-4899）—— BOSS/高数值示例
// 狱契必杀技消耗怒气打量子属性通常伤害并积累狱契；肆保给无契约者附加契约祝福；
// 烁牙在你或契约者造成伤害后累计烁牙，攒满8枚对全部受害者挥出暗【杀】。
import {
    lib,
    game,
    ui,
    get,
    ai,
    _status,
    X,
    Y,
    Z,
    styleText,
    B,

} from '../../shared.js';
import { extensionPath } from '../../../../tool/utils/paths.js';

export const sort = 'pinuokangni';
export const title = '量子·智识·慈玉女士'; // 属性·命途
export const intro =
    `${B('翡翠')}是${get.poptip('bts_glossary_hudun_faq')}/${get.poptip('bts_glossary_bless_yingzi_faq')}流BOSS：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_yuqi'))}以${get.poptip('bts_glossary_nuqi_faq')}换取群体${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害并积攒${get.poptip('bts_sk_yuqi')}标记，` +
    `${B(get.poptip('bts_sk_sibao'))}为无${get.poptip('bts_glossary_bless_yingzi_faq')}角色附加${get.poptip('bts_glossary_bless_yingzi_faq')}，${B(get.poptip('bts_sk_shuoya'))}随伤害积累层数，攒满后对全体受害者挥出暗【杀】。` +
    `<li>适合作为单机BOSS局主公开局（配合 customScenes 起始${get.poptip('bts_glossary_hudun_faq')}/${get.poptip('bts_glossary_nuqi_faq')}）`;

export const character = {
    bts_ch_feicui: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_yuqi', 'bts_sk_sibao', 'bts_sk_shuoya'],
    },
};

export const skill = {
    // ── 必杀技·狱契（源 st_yuqi，L4799-4818）──
    bts_sk_yuqi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // enabled_at_play：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yuqi');
            lib.bts.api.loseAngry(player, 5); // 源 L4806
            lib.bts.api.addMark(player, 'bts_sk_yuqi', 2); // 获得2枚狱契标记（源 L4807）
            for (const t of event.targets || []) {
                // 1点量子属性通常伤害：reason 带 _common（普通伤害不可被强化）+ 元素暗。
                // player.damage() 不读取任意对象字段，需先创建事件再附加扩展元数据。
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_yuqi_bts_reason_common_dark';
                lib.bts.api.setDamageNature(damage, 'dark');
                await damage;
            }
        },
        ai: {
            // AI 口径：怒气≥5（filter 同门）；失5怒对每名敌人1点暗伤（星启：全局必杀基数+1→2点；
            // 元素相克再+1）并自得2枚狱契（烁牙满8时弃1枚令暗杀不可响应）；怒≥7（留一发余量）时更积极
            //（源 animal.lua L4799-4818；可选链守卫写法保留）
            order(item, player) {
                if (lib.bts?.aiGuard?.blocked(player, 'bts_sk_yuqi'))
                    return -1;
                return lib.bts.api.getAngry(player) >= 7 ? 6 : 3;
            },
            threaten: 3,
            result: {
                player: 1, // 得2枚狱契
                // 对敌：1点暗伤（星启2点）＋相克+1；击杀加分
                target: (player, target) => {
                    const d = lib.bts.api.god(player) ? 2 : 1;
                    let v = d * 1.5;
                    const nat = lib.bts.api.getNature(null, target);
                    if (nat && nat !== 'dark') v += 1.5;
                    if (target.hp <= d) v += 2.5;
                    return -v;
                },
            },
        },
    },

    // ── 肆保（源 st_sibao，L4820-4852；对应源 Play 阶段开始时强制发动）──
    bts_sk_sibao: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            // 若没有角色拥有契约祝福；且手牌有【杀】可弃（源 askForUseCard 的 Slash 限定——
            // 无杀时不可发动，否则空跑一轮询问后取消）
            return (
                !game.hasPlayer(
                    (p) => p.isAlive() && lib.bts.api.getBless(p, 'yingzi'),
                ) &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseTarget(
                    '肆保：选择一名其他角色，弃置一张【杀】令其附加3层契约祝福',
                    [1, 1],
                    (card, p, target) => target !== p,
                )
                // AI 口径：契约祝福=额定摸牌+1（3层≈3回合）且其造成伤害助烁牙累积 → 只给友军，
                // 属性型盟友更优；敌方/中立不给分（全员非友军→整体取消发动）（源 animal.lua L4820-4852）
                .set('ai', (target) => {
                    const attitude = get.attitude(player, target);
                    if (attitude <= 0) return -1;
                    let v = 2 + attitude / 2;
                    if (lib.bts.api.naturePlayer(target)) v += 1;
                    return v;
                })
                .forResult();
            if (!r.bool) return;
            const cards = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '弃置一张【杀】',
                )
                // AI 口径：代价=献出价值最低的【杀】；分值≤0（杀太珍贵）则整体取消发动
                .set('ai', (card) => 6 - get.value(card))
                .forResult();
            if (!cards.bool) return;
            event.result = {
                bool: true,
                targets: r.targets,
                cards: cards.cards,
            };
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_sibao');
            // cost 所选【杀】在技能事件 event.cards，结算弃置（源 L4826）
            await player.discard(event.cards);
            lib.bts.api.addBless(event.targets[0], 'yingzi', 3, player); // 源 L4827
        },
        ai: {
            // 触发技+cost：此 order 与 content 首行 record 为 aiGuard 既有接线（按批次要求保留）；
            // 发动与否的实际决策在 cost 内联 ai（cost 型触发技无默认 chooseBool 读取点）
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_sibao') ? -1 : 5;
            },
        },
    },

    // ── 锁定技·烁牙（源 st_shuoya，L4854-4899）──
    bts_sk_shuoya: {
        trigger: { global: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 你 或 拥有契约祝福的角色 造成伤害
            if (!event.source || !event.player) return false;
            if (event.source === player) return true;
            return lib.bts.api.getBless(event.source, 'yingzi');
        },
        async content(event, trigger, player) {
            // 记录所有受到过由你造成的伤害的角色（trigger=damageEnd 事件）
            player.storage.bts_damagedBy ??= [];
            if (!player.storage.bts_damagedBy.includes(trigger.player)) {
                player.storage.bts_damagedBy.push(trigger.player);
            }
            player.addMark('bts_sk_shuoya', 1); // 获得1枚烁牙标记（源 L4869）
            if (player.countMark('bts_sk_shuoya') < 8) return;
            // 攒满8枚：弃8枚烁牙，视为对所有受到过由你造成的伤害的角色使用暗【杀】
            player.removeMark('bts_sk_shuoya', 8);
            // 源 L5406：暗【杀】目标须在你的攻击范围内（canSlash 范围判定）
            const targets = (player.storage.bts_damagedBy || []).filter(
                (p) => p.isAlive() && player.inRange(p),
            );
            if (!targets.length) return;
            const use = player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'dark' } },
                targets,
            );
            // 有狱契时，本体 directHit 集合会让此次【杀】无法被目标响应。
            if (player.countMark('bts_sk_yuqi') > 0) {
                player.removeMark('bts_sk_yuqi', 1);
                // 事件刚创建、未开始结算：本体还没在 useCard 内容里把 directHit 转成数组，
                // 此刻不能 addArray；直接以数组赋值——本体的初始化只对“非数组”补空数组，
                // 该值会被保留并在此【杀】的逐目标结算中生效。slice 断开与事件 targets 的引用。
                use.directHit = targets.slice();
                game.log(player, '弃1枚狱契标记，令此【杀】不能被响应');
            }
            await use;
        },
        // 攒标进度在头像可见（真技能 mark:true 范式，素材文件名即技能 ID）
        mark: true,
        intro: {
            name: '烁牙',
            content: (storage) =>
                `当前有${storage}枚烁牙；达到8枚时弃8枚，视为对所有受到过由你造成的伤害的角色使用暗【杀】。`,
        },
        markimage: `${extensionPath}/image/mark/bts_sk_shuoya.png`,
    },
};

export const translate = {
    bts_ch_feicui: '翡翠',
    bts_sk_yuqi: '狱契',
    bts_sk_yuqi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并对至少一名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害，获得2枚${get.poptip('bts_sk_yuqi')}标记。`,

    bts_sk_sibao: '肆保',
    bts_sk_sibao_info: `出牌阶段开始时，若没有角色拥有${get.poptip('bts_glossary_bless_yingzi_faq')}，你可以弃置一张【杀】并选择一名其他角色，令其附加3层${get.poptip('bts_glossary_bless_yingzi_faq')}。`,

    bts_sk_shuoya: '烁牙',
    bts_sk_shuoya_info: `锁定技，当你或拥有${get.poptip('bts_glossary_bless_yingzi_faq')}的角色造成伤害后，你获得1枚${get.poptip('bts_sk_shuoya')}标记，若你拥有至少8枚${get.poptip('bts_sk_shuoya')}标记，你弃8枚${get.poptip('bts_sk_shuoya')}标记，视为对所有受到过由你造成的伤害的角色使用暗【杀】，若你拥有${get.poptip('bts_sk_yuqi')}标记，你弃1枚${get.poptip('bts_sk_yuqi')}标记，令此【杀】不能被响应。`,

    '$bts_sk_yuqi1': "协定已成",
    '$bts_sk_yuqi2': "以此为据，也就再无反悔的余地…你我都是",
    '$bts_sk_sibao1': "嗯。可别让我失望",
    '$bts_sk_sibao2': "哼，要说到做到哦~",
    '$bts_sk_shuoya1': "我看看，谁是食言的坏孩子？",
    '$bts_sk_shuoya2': "怎么了，还想继续自讨苦吃？",
    '~bts_ch_feicui': "是我失算了…",
};

export const simpleTranslate = {
    bts_sk_yuqi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害，获得2枚${get.poptip('bts_sk_yuqi')}`,
    bts_sk_sibao_info: `出牌阶段开始时，若无人拥有${get.poptip('bts_glossary_bless_yingzi_faq')}，可弃1张【杀】令1名其他角色+3层${get.poptip('bts_glossary_bless_yingzi_faq')}`,
    bts_sk_shuoya_info: `锁；你或拥有${get.poptip('bts_glossary_bless_yingzi_faq')}的角色造成伤害后，你+1枚${get.poptip('bts_sk_shuoya')}；≥8枚时弃8枚，对所有受到过你伤害的角色使用暗杀；有${get.poptip('bts_sk_yuqi')}则弃1枚使其不可响应`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
