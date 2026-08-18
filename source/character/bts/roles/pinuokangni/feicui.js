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

export const sort = 'pinuokangni';
export const title = '量子·智识·慈玉女士'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('翡翠')}是${get.poptip('bts_glossary_hudun_faq')}/${get.poptip('bts_glossary_bless_yingzi_faq')}流BOSS：${get.poptip('bts_glossary_bisha_faq')}${B('狱契')}以${get.poptip('bts_glossary_nuqi_faq')}换取群体${get.poptip('bts_glossary_nature_dark_dmg_faq')}伤害并积攒狱契标记，` +
    `${B('肆保')}为无${get.poptip('bts_glossary_bless_yingzi_faq')}角色附加${get.poptip('bts_glossary_bless_yingzi_faq')}，${B('烁牙')}随伤害积累层数，攒满后对全体受害者挥出暗【杀】。` +
    `<li>适合作为单机BOSS局主公开局（配合 customScenes 起始${get.poptip('bts_glossary_hudun_faq')}/${get.poptip('bts_glossary_nuqi_faq')}）`;

export const character = {
    bts_feicui: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_yuqi', 'bts_st_sibao', 'bts_st_shuoya'],
    },
};

export const skill = {
    // ── 必杀技·狱契（源 st_yuqi，L4799-4818）──
    bts_st_yuqi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // enabled_at_play：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yuqi');
            lib.bts.api.loseAngry(player, 5); // 源 L4806
            lib.bts.api.addMark(player, 'bts_st_yuqi', 2); // 获得2枚狱契标记（源 L4807）
            for (const t of event.targets || []) {
                // 1点量子属性通常伤害：reason 带 _common（普通伤害不可被强化）+ 元素暗。
                // player.damage() 不读取任意对象字段，需先创建事件再附加扩展元数据。
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = 'bts_st_yuqi_common_dark';
                lib.bts.api.setDamageNature(damage, 'dark');
                await damage;
            }
        },
        ai: {
            order(item, player) {
                if (lib.bts?.aiGuard?.blocked(player, 'bts_st_yuqi'))
                    return -1;
                return lib.bts.api.getAngry(player) >= 7 ? 6 : 3;
            },
            threaten: 3,
            result: { player: 1 },
        },
    },

    // ── 肆保（源 st_sibao，L4820-4852；对应源 Play 阶段开始时强制发动）──
    bts_st_sibao: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            // 若没有角色拥有契约祝福
            return !game.hasPlayer(
                (p) => p.isAlive() && lib.bts.api.getBless(p, 'yingzi'),
            );
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseTarget(
                    '肆保：选择一名其他角色，弃置一张【杀】令其附加3层契约祝福',
                    [1, 1],
                    (card, p, target) => target !== p,
                )
                .set('ai', (target) =>
                    get.attitude(player, target) > 0 ? 2 : -1,
                )
                .forResult();
            if (!r.bool) return;
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) return;
            event.result = {
                bool: true,
                targets: r.targets,
                cards: cards.cards,
            };
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_sibao');
            // cost 所选【杀】在技能事件 event.cards，结算弃置（源 L4826）
            await player.discard(event.cards);
            lib.bts.api.addBless(event.targets[0], 'yingzi', 3, player); // 源 L4827
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_sibao') ? -1 : 5;
            },
            noe: true,
        },
    },

    // ── 锁定技·烁牙（源 st_shuoya，L4854-4899）──
    bts_st_shuoya: {
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
            player.addMark('bts_st_shuoya', 1); // 获得1枚烁牙标记（源 L4869）
            if (player.countMark('bts_st_shuoya') < 8) return;
            // 攒满8枚：弃8枚烁牙，视为对所有受到过由你造成的伤害的角色使用暗【杀】
            player.removeMark('bts_st_shuoya', 8);
            const targets = (player.storage.bts_damagedBy || []).filter((p) =>
                p.isAlive(),
            );
            if (!targets.length) return;
            const use = player.useCard(
                { name: 'sha', isCard: true, storage: { _btsNature: 'dark' } },
                targets,
            );
            // 有狱契时，本体 directHit 集合会让此次【杀】无法被目标响应。
            if (player.countMark('bts_st_yuqi') > 0) {
                player.removeMark('bts_st_yuqi', 1);
                use.directHit ??= [];
                use.directHit.addArray(targets);
                game.log(player, '弃1枚狱契标记，令此【杀】不能被响应');
            }
            await use;
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_feicui: '翡翠',
    st_yuqi: '狱契',
    st_shuoya: '烁牙',
    bts_st_yuqi: '狱契',
    bts_st_yuqi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并对至少一名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害，获得2枚狱契标记。`,

    bts_st_sibao: '肆保',
    bts_st_sibao_info: `出牌阶段开始时，若没有角色拥有${get.poptip('bts_glossary_bless_yingzi_faq')}，你可以弃置一张【杀】并选择一名其他角色，令其附加3层${get.poptip('bts_glossary_bless_yingzi_faq')}。`,

    bts_st_shuoya: '烁牙',
    bts_st_shuoya_info: `锁定技，当你或拥有${get.poptip('bts_glossary_bless_yingzi_faq')}的角色造成伤害后，你获得1枚烁牙标记，若你拥有至少8枚烁牙标记，你弃8枚烁牙标记，视为对所有受到过由你造成的伤害的角色使用暗【杀】，若你拥有狱契标记，你弃1枚狱契标记，令此【杀】不能被响应。`,

    '$bts_st_yuqi1': "协定已成",
    '$bts_st_yuqi2': "以此为据，也就再无反悔的余地…你我都是",
    '$bts_st_sibao1': "嗯。可别让我失望",
    '$bts_st_sibao2': "哼，要说到做到哦~",
    '$bts_st_shuoya1': "我看看，谁是食言的坏孩子？",
    '$bts_st_shuoya2': "怎么了，还想继续自讨苦吃？",
    '~bts_feicui': "是我失算了…",
};

export const simpleTranslate = {
    bts_st_yuqi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}对至少1名其他角色造成1点${get.poptip('bts_glossary_nature_dark_dmg_faq')}通常伤害，获得2枚狱契`,
    bts_st_sibao_info: `出牌阶段开始时，若无人拥有${get.poptip('bts_glossary_bless_yingzi_faq')}，可弃1张【杀】令1名其他角色+3层${get.poptip('bts_glossary_bless_yingzi_faq')}`,
    bts_st_shuoya_info: `锁；你或拥有${get.poptip('bts_glossary_bless_yingzi_faq')}的角色造成伤害后，你+1枚烁牙；≥8枚时弃8枚，对所有受到过你伤害的角色使用暗杀；有狱契则弃1枚使其不可响应`,
};

export const pinyins = { bts_feicui: 'feicui' };
