// 布洛妮娅（源 animal.lua L3962-4034）—— 行曲必杀技贯通、部署弃杀跳过出牌阶段、军势额外摸牌。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '风·同谐·大守护者继承人'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('布洛妮娅')}是${get.poptip('bts_glossary_guantong_faq')}支援：${get.poptip('bts_glossary_bisha_faq')}${B('行曲')}叠加${get.poptip('bts_glossary_guantong_faq')}，${B('部署')}弃【杀】调整站位并跳过出牌阶段，${B('军势')}回合结束额外摸牌。` +
    `<li>${get.poptip('bts_glossary_guantong_faq')}伤害无视${get.poptip('bts_glossary_hudun_faq')}`;

export const character = {
    bts_buluoniya: {
        sex: 'female',
        group: 'yaliluo',
        hp: 4,
        skills: ['bts_st_xingqu', 'bts_st_bushu', 'bts_st_junshi'],
    },
};

export const skill = {
    // ── 必杀技·行曲（源 st_xingqu = ZeroCardViewAsSkill，L3963-3982）──
    bts_st_xingqu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 4);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_xingqu');
            lib.bts.api.loseAngry(player, 4);
            await lib.bts.api.addBless(player, 'through', 2);
            for (const t of event.targets || [])
                await lib.bts.api.addBless(t, 'through', 2, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_xingqu')
                    ? -1
                    : 5;
            },
            result: { player: 1 },
        },
    },

    // ── 部署（源 st_bushu = OneCardViewAsSkill + EventPhaseChanging，L3983-4010；简化）──
    bts_st_bushu: {
        trigger: { player: 'phaseUseBegin' },
        filter(event, player) {
            return player.getCards('h').some((c) => get.name(c) === 'sha');
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseBool('部署：是否弃置一张【杀】并跳过出牌阶段？')
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
            const target = await player
                .chooseTarget(
                    '部署：选择一名角色移除1层异常',
                    [1, 1],
                    (c, p, t) => t !== p && lib.bts.api.getAbnor(t),
                )
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cards = cards.cards; // 弃牌留待 content 结算
        },
        async content(event, t, player) {
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const target = event.targets[0]; // event=技能事件，cost 结果目标
            const marks = Object.keys(target.storage || {}).filter(
                (k) => k.startsWith('bts_abnormal_') && target.countMark(k) > 0,
            );
            if (marks.length)
                lib.bts.api.removeAbnormal(
                    target,
                    marks[0].slice('bts_abnormal_'.length),
                    1,
                    player,
                );
            player.skip('phaseUse'); // 源 player:skip(Player_Play)
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·军势（源 st_junshi = TriggerSkill Compulsory EventPhaseStart，L4011-4034）──
    bts_st_junshi: {
        trigger: { player: 'phaseAfter' },
        forced: true,
        filter(event, player) {
            return player
                .getHistory('useCard')
                .some((h) => h.card?.name === 'sha');
        },
        async content(event, trigger, player) {
            // 源 L4030 ExtraPhase(Draw)：真实额外摸牌阶段（触发摸牌技能/异常/祝福）
            lib.bts.api.extraPhase(player, 'phaseDraw');
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_buluoniya: '布洛妮娅',
    bts_st_xingqu: '行曲',
    bts_st_xingqu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，你与这些角色各附加2层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}。`,

    bts_st_bushu: '部署',
    bts_st_bushu_info:
        '出牌阶段开始时，你可以弃置一张【杀】，移除一名角色1层异常，然后跳过出牌阶段。',

    bts_st_junshi: '军势',
    bts_st_junshi_info:
        '锁定技，回合结束时，若你于此回合内使用过【杀】，你摸1张牌。',

    '$bts_st_xingqu1': "我们早已踏入风暴",
    '$bts_st_xingqu2': "为了守护和捍卫，击溃他们！",
    '$bts_st_bushu1': "时不再至，请助我一臂之力！",
    '$bts_st_bushu2': "时不再至，请随我一同出战！",
    '$bts_st_junshi1': "区区恶徒",
    '$bts_st_junshi2': "拿出魄力来",
    '~bts_buluoniya': "绝对…不能失守……",
};

export const simpleTranslate = {
    bts_st_xingqu_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}与至少1名其他角色各+2${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}`,
    bts_st_bushu_info: '出牌阶段开始时，弃1杀移除1名角色1层异常并跳过出牌阶段',
    bts_st_junshi_info: '锁；回合结束时若用过杀，摸1张牌',
};

export const pinyins = { bts_buluoniya: 'buluoniya' };
