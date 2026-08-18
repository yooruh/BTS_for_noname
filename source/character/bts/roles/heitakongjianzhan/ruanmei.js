// 阮梅（源 animal.lua L3074-3163）—— 摇缎必杀技残梅贯通、分型令失手牌者绽放、慢捻准备阶段弦外音。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'heitakongjianzhan';
export const title = '冰·同谐·疏影三迭'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('阮梅')}是${get.poptip('bts_glossary_bless_faq')}辅助：${get.poptip('bts_glossary_bisha_faq')}${B('摇缎')}给自己和队友叠${get.poptip('bts_glossary_bless_canmei_faq')}与${get.poptip('bts_glossary_guantong_faq')}，${B('分型')}令失去手牌的角色${get.poptip('bts_glossary_abnormal_zhanfang_faq')}（跳过摸牌），${B('慢捻')}在准备阶段弃【杀】叠加${get.poptip('bts_glossary_bless_xianwaiyin_faq')}。` +
    `<li>${get.poptip('bts_glossary_bless_canmei_faq')}让拥有${get.poptip('bts_glossary_guantong_faq')}的角色摸牌+1，${get.poptip('bts_glossary_abnormal_zhanfang_faq')}跳过摸牌阶段`;

export const character = {
    bts_ruanmei: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 4,
        skills: ['bts_st_yaoduan', 'bts_st_fenxing', 'bts_st_mannian'],
    },
};

export const skill = {
    // ── 必杀技·摇缎（源 st_yaoduan = ZeroCardViewAsSkill，L3075-3098）──
    bts_st_yaoduan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_yaoduan');
            lib.bts.api.loseAngry(player, 5); // 源 L3082
            const n = lib.bts.api.god(player) ? 3 : 2;
            await lib.bts.api.addBless(player, 'canmei', n); // 源 AddBless(canmei)
            await lib.bts.api.addBless(player, 'through', n); // 源 AddBless(through)
            for (const t of event.targets || [])
                await lib.bts.api.addBless(t, 'through', n, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_yaoduan')
                    ? -1
                    : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 分型（源 st_fenxing = TriggerSkill CardsMoveOneTime，L3099-3133）──
    bts_st_fenxing: {
        trigger: { global: 'loseAfter' },
        logTarget: 'player',
        filter(event, player) {
            if (!event.player || event.player === player) return false;
            if (event.player.countCards('h') > 0) return false; // 失去所有手牌
            if (!lib.bts.api.getBless(player, 'canmei')) return false; // 你有残梅
            if (lib.bts.api.getAbnor(event.player, 'zhanfang')) return false; // 不处于绽放
            return true;
        },
        async content(event, trigger, player) {
            const r = await player
                .chooseBool(
                    '分型：是否令' +
                        get.translation(trigger.player) +
                        '附加1层绽放？',
                )
                .forResult();
            if (!r.bool) return;
            lib.bts.api.addAbnormal(trigger.player, 'zhanfang', 1, player); // 源 AddAbnormal(@abnormal_zhanfang)（trigger=loseAfter 事件）
        },
        ai: { result: { player: 1, target: -1 } },
    },

    // ── 慢捻（源 st_mannian = TriggerSkill EventPhaseStart，L3134-3163）──
    bts_st_mannian: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            return player.countCards('h') > 0;
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseBool('慢捻：是否弃置一张【杀】并选择至少一名其他角色？')
                .forResult();
            if (!r.bool) {
                event.result = { bool: false };
                return;
            }
            const cards = await player
                .chooseCard(
                    'h',
                    (card) => get.name(card) === 'sha',
                    '弃置一张【杀】',
                )
                .forResult();
            if (!cards.bool) {
                event.result = { bool: false };
                return;
            }
            const targets = await player
                .chooseTarget(
                    '慢捻：选择至少一名其他角色',
                    [1, Infinity],
                    (c, p, t) => t !== p,
                )
                .forResult();
            if (!targets.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = targets;
            event.result.cost_data = { cards: cards.cards };
        },
        async content(event, t, player) {
            await player.discard(event.cost_data.cards); // 源：弃【杀】移入 content 结算
            await lib.bts.api.addBless(player, 'xianwaiyin', 3); // 源 AddBless(xianwaiyin)
            for (const x of event.targets || []) // event=技能事件，cost 结果目标
                await lib.bts.api.addBless(x, 'xianwaiyin', 3, player);
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    bts_ruanmei: '阮梅',
    bts_st_yaoduan: '摇缎',
    bts_st_yaoduan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你附加2层${get.poptip('bts_glossary_bless_canmei_faq')}，和这些角色各附加2层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}。（若你为${get.poptip('bts_glossary_xingqi_faq')}则上述改为3层）`,

    bts_st_fenxing: '分型',
    bts_st_fenxing_info: `当其他角色失去所有手牌后，若你拥有${get.poptip('bts_glossary_bless_canmei_faq')}且其不处于${get.poptip('bts_glossary_abnormal_zhanfang_faq')}，你可以令其附加1层${get.poptip('bts_glossary_abnormal_zhanfang_faq')}。`,

    bts_st_mannian: '慢捻',
    bts_st_mannian_info: `准备阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，你与这些角色各附加3层${get.poptip('bts_glossary_bless_xianwaiyin_faq')}。`,

    '$bts_st_yaoduan1': "生命里的每一片花瓣……",
    '$bts_st_yaoduan2': "无论何时盛放，都会有被风吹落的…那一天",
    '$bts_st_fenxing1': "余音不绝",
    '$bts_st_fenxing2': "生命，不仅存在于呼吸之间",
    '$bts_st_mannian1': "琴音周而复始",
    '$bts_st_mannian2': "万物本质如一",
    '~bts_ruanmei': "还没有…答案……",
};

export const simpleTranslate = {
    bts_st_yaoduan_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_bless_canmei_faq')}+2${get.poptip('bts_glossary_guantong_faq')}并令至少1名其他角色各+2${get.poptip('bts_glossary_guantong_faq')}（${get.poptip('bts_glossary_xingqi_faq')}改3）`,
    bts_st_fenxing_info: `其他角色失去所有手牌后，若你有${get.poptip('bts_glossary_bless_canmei_faq')}且其未${get.poptip('bts_glossary_abnormal_zhanfang_faq')}，可令其+1层${get.poptip('bts_glossary_abnormal_zhanfang_faq')}`,
    bts_st_mannian_info: `准备阶段，弃1张【杀】令至少1名其他角色与你各+3${get.poptip('bts_glossary_bless_xianwaiyin_faq')}`,
};

export const pinyins = { bts_ruanmei: 'ruanmei' };
