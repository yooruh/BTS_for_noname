// 阮梅（源 animal.lua L3074-3163）—— 摇缎必杀技残梅贯通、分型令失手牌者绽放、慢捻准备阶段弦外音。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'heitakongjianzhan';
export const title = '冰·同谐·疏影三迭'; // 属性·命途
export const intro =
    `${B('阮梅')}是${get.poptip('bts_glossary_bless_faq')}辅助：${get.poptip('bts_glossary_bisha_faq')}${B('摇缎')}给自己和队友叠${get.poptip('bts_glossary_bless_canmei_faq')}与${get.poptip('bts_glossary_guantong_faq')}，${B('分型')}令失去手牌的角色${get.poptip('bts_glossary_abnormal_zhanfang_faq')}（跳过摸牌），${B('慢捻')}在准备阶段弃【杀】叠加${get.poptip('bts_glossary_bless_xianwaiyin_faq')}。` +
    `<li>${get.poptip('bts_glossary_bless_canmei_faq')}让拥有${get.poptip('bts_glossary_guantong_faq')}的角色摸牌+1，${get.poptip('bts_glossary_abnormal_zhanfang_faq')}跳过摸牌阶段`;

export const character = {
    bts_ch_ruanmei: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 4,
        skills: ['bts_sk_yaoduan', 'bts_sk_fenxing', 'bts_sk_mannian'],
    },
};

export const skill = {
    // ── 必杀技·摇缎（源 st_yaoduan = ZeroCardViewAsSkill，L3075-3098）──
    bts_sk_yaoduan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_yaoduan');
            lib.bts.api.loseAngry(player, 5); // 源 L3082
            const n = lib.bts.api.god(player) ? 3 : 2;
            await lib.bts.api.addBless(player, 'canmei', n); // 源 AddBless(canmei)
            await lib.bts.api.addBless(player, 'through', n); // 源 AddBless(through)
            for (const t of event.targets || [])
                await lib.bts.api.addBless(t, 'through', n, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_yaoduan')
                    ? -1
                    : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 分型（源 st_fenxing = TriggerSkill CardsMoveOneTime，L3099-3133）──
    bts_sk_fenxing: {
        trigger: { global: 'loseAfter' },
        logTarget: 'player',
        filter(event, player) {
            if (!event.player || event.player === player) return false;
            // 源 L3265：from_places 含手牌 且 失去的是最后手牌 —— 空手弃装备不触发
            if (!(event.cards || []).some((card) => card.original === 'h'))
                return false;
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
    bts_sk_mannian: {
        trigger: { player: 'phaseZhunbeiBegin' },
        filter(event, player) {
            // 源 L3254：askForUseCard filter_pattern="Slash" 兜底 —— 须有【杀】可弃
            //（否则手牌非空但无【杀】时选牌处无可弃杀卡死）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
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
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_ruanmei_skin1': '皮肤1',
    bts_ch_ruanmei: '阮梅',
    bts_sk_yaoduan: '摇缎',
    bts_sk_yaoduan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你附加2层${get.poptip('bts_glossary_bless_canmei_faq')}，和这些角色各附加2层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}。（若你为${get.poptip('bts_glossary_xingqi_faq')}则上述改为3层）`,

    bts_sk_fenxing: '分型',
    bts_sk_fenxing_info: `当其他角色失去所有手牌后，若你拥有${get.poptip('bts_glossary_bless_canmei_faq')}且其不处于${get.poptip('bts_glossary_abnormal_zhanfang_faq')}，你可以令其附加1层${get.poptip('bts_glossary_abnormal_zhanfang_faq')}。`,

    bts_sk_mannian: '慢捻',
    bts_sk_mannian_info: `准备阶段开始时，你可以弃置一张【杀】并选择至少一名其他角色，你与这些角色各附加3层${get.poptip('bts_glossary_bless_xianwaiyin_faq')}。`,

    '$bts_sk_yaoduan1': "生命里的每一片花瓣……",
    '$bts_sk_yaoduan2': "无论何时盛放，都会有被风吹落的…那一天",
    '$bts_sk_fenxing1': "余音不绝",
    '$bts_sk_fenxing2': "生命，不仅存在于呼吸之间",
    '$bts_sk_mannian1': "琴音周而复始",
    '$bts_sk_mannian2': "万物本质如一",
    '~bts_ch_ruanmei': "还没有…答案……",
    bts_bless_canmei: '残梅祝福',
    bts_bless_canmei_info: '来源：摇缎赋予；有贯通祝福的角色（除你外）摸牌+1；回合结束自然减少1层',
    bts_bless_xianwaiyin: '弦外音祝福',
    bts_bless_xianwaiyin_info: '来源：慢捻赋予；弃他人剩1张时追击弃牌；回合结束自然减少1层',
    bts_abnormal_zhanfang: '绽放',
};

export const simpleTranslate = {
    bts_sk_yaoduan_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_bless_canmei_faq')}+2${get.poptip('bts_glossary_guantong_faq')}并令至少1名其他角色各+2${get.poptip('bts_glossary_guantong_faq')}（${get.poptip('bts_glossary_xingqi_faq')}改3）`,
    bts_sk_fenxing_info: `其他角色失去所有手牌后，若你有${get.poptip('bts_glossary_bless_canmei_faq')}且其未${get.poptip('bts_glossary_abnormal_zhanfang_faq')}，可令其+1层${get.poptip('bts_glossary_abnormal_zhanfang_faq')}`,
    bts_sk_mannian_info: `准备阶段，弃1张【杀】令至少1名其他角色与你各+3${get.poptip('bts_glossary_bless_xianwaiyin_faq')}`,
};

export const pinyins = { bts_ch_ruanmei: 'ruanmei' };

export const buffSkills = {
    bts_bless_canmei: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_canmei_faq',
        trigger: { global: 'phaseDrawBegin2' },
        forced: true,
        silent: true,
        filter(event, player) {
            if (
                event.player === player ||
                event.num <= 0 ||
                !lib.bts.api.getBless(event.player, 'through')
            )
                return false;
            // 防重：仅序号最小的残梅持有者结算（源为布尔判断，多持有者仍只+1）。
            return !game.filterPlayer(
                (q) =>
                    q !== player &&
                    lib.bts.api.getBless(q, 'canmei') &&
                    q.playerid < player.playerid,
            ).length;
        },
        async content(event, trigger, player) {
            trigger.num += 1;
        },
    },
    bts_bless_xianwaiyin: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_xianwaiyin_faq',
        trigger: { global: 'discard' },
        forced: true,
        silent: true,
        filter(event, player) {
            const from = event.discarder;
            return (
                lib.bts.api.getBless(player, 'xianwaiyin') &&
                !!from &&
                from === player &&
                from.isAlive() &&
                event.player !== player &&
                event.cards?.some((card) => card.original === 'h') &&
                event.player.countCards('h') === 1
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了弦外音祝福，', trigger.player, '须弃置一张手牌');
            await trigger.player.chooseToDiscard(
                '弦外音祝福：请弃置一张手牌',
                'h',
                1,
                true,
            );
        },
    },
    bts_abnormal_zhanfang: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_zhanfang_faq',
        trigger: { player: 'phaseChange' },
        forced: true,
        silent: true,
        filter(event, player) {
            const next = String(event.phaseList?.[event.num] || '')
                .split('|')[0]
                .split('-')[0];
            return event.player === player && next === 'phaseDraw';
        },
        async content(event, trigger, player) {
            player.skip('phaseDraw');
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_canmei_faq',
        name: '残梅祝福',
        info: '拥有贯通祝福的其他角色额定摸牌数+1。你的结束阶段开始时，此祝福减少1层。',
    },
    {
        id: 'bts_glossary_bless_xianwaiyin_faq',
        name: '弦外音祝福',
        info: '当你弃置其他角色的手牌后，若其手牌数为1，其须弃置一张手牌。你的结束阶段开始时，此祝福减少1层。',
    },
    {
        id: 'bts_glossary_abnormal_zhanfang_faq',
        name: '|绽放|',
        info: `异常状态：由技能效果赋予；进入摸牌阶段时跳过该阶段。`,
    },
];
