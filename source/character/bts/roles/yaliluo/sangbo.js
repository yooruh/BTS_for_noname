// 桑博（源 animal.lua L3567-3673）—— 惊喜必杀技中毒、撕风锁定判定加风、横跳弃杀顺手牵羊+中毒。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'yaliluo';
export const title = '风·虚无·百搭鬼牌'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('桑博')}是${get.poptip('bts_glossary_zhongdu_faq')}干扰：${get.poptip('bts_glossary_bisha_faq')}${B('惊喜')}附加${get.poptip('bts_glossary_zhongdu_faq')}，${B('撕风')}给无属性伤害判定加风，${B('横跳')}弃【杀】顺手牵羊并追加${get.poptip('bts_glossary_zhongdu_faq')}。` +
    `<li>${get.poptip('bts_glossary_zhongdu_faq')}会在弃牌阶段令目标失去体力`;

export const character = {
    bts_sangbo: {
        sex: 'male',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_st_jingxi', 'bts_st_sifeng', 'bts_st_hengtiao'],
    },
};

export const skill = {
    // ── 必杀技·惊喜（源 st_jingxi = ZeroCardViewAsSkill，L3568-3586）──
    bts_st_jingxi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_jingxi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3);
            lib.bts.api.addAbnormal(target, 'poison', 1, player);
            if (lib.bts.api.god(player)) target.addMark('bts_st_jingxi', 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_jingxi')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·撕风（源 st_sifeng = TriggerSkill Compulsory DamageCaused，L3587-3604）──
    bts_st_sifeng: {
        trigger: { source: 'damageBegin1' },
        forced: true,
        filter(event, player) {
            return !lib.bts.api.getNature(event);
        }, // 无属性伤害
        async content(event, trigger, player) {
            const judge = await player.judge((card) => true);
            if (get.color(judge.judging?.[0]) === 'black')
                lib.bts.api.setDamageNature(trigger, 'wind'); // 判定黑色加风
        },
        ai: { noe: true },
    },

    // ── 横跳（源 st_hengtiao = OneCardViewAsSkill + SkillCard，L3605-3673）：顺手牵羊后目标及所有中毒角色判定，黑桃各+1中毒 ──
    bts_st_hengtiao: {
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对一名角色视为使用【顺手牵羊】，再令其中毒角色判定',
        filterTarget(event, player, target) {
            return target !== player && target.countCards('he') > 0;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_hengtiao');
            const target = event.targets[0];
            await player.discard(event.cards);
            await player.gainPlayerCard(target, 'he', 'visible'); // 视为顺手牵羊
            // 源 L3639-3657：目标及所有中毒角色各判定，结果为黑桃者各附加1层中毒（翻译 L12308）
            for (const p of game.filterPlayer(
                (q) => q === target || lib.bts.api.getAbnor(q, 'poison'),
            )) {
                const judge = await player.judge((card) => true);
                if (get.suit(judge.judging?.[0]) === 'spade')
                    lib.bts.api.addAbnormal(p, 'poison', 1, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_hengtiao')
                    ? -1
                    : 4;
            },
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    bts_sangbo: '桑博',
    bts_st_jingxi: '惊喜',
    bts_st_jingxi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加1层${get.poptip('bts_glossary_zhongdu_faq')}，若你为${get.poptip('bts_glossary_xingqi_faq')}，其获得1枚惊喜标记。`,

    bts_st_sifeng: '撕风',
    bts_st_sifeng_info: `锁定技，当你造成无属性伤害时，判定，若结果为黑色，此伤害视为${get.poptip('bts_glossary_nature_feng_dmg_faq')}伤害。`,

    bts_st_hengtiao: '横跳',
    bts_st_hengtiao_info: `出牌阶段，你可以弃置一张【杀】并选择一名其他角色，视为对其使用【顺手牵羊】，然后其与所有处于${get.poptip('bts_glossary_zhongdu_faq')}的角色各判定，结果为黑桃的角色各附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,

    '$bts_st_jingxi1': "你在期待些什么？",
    '$bts_st_jingxi2': "顾客就是上帝，想要我背叛上帝，除非…你加钱~",
    '$bts_st_sifeng1': "我桑博一向关照朋友",
    '$bts_st_sifeng2': "又有生意上门了",
    '$bts_st_hengtiao1': "要不然，来试试这个？",
    '$bts_st_hengtiao2': "嘿嘿",
    '~bts_sangbo': "这下赔大了……",
};

export const simpleTranslate = {
    bts_st_jingxi_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+1${get.poptip('bts_glossary_zhongdu_faq')}（${get.poptip('bts_glossary_xingqi_faq')}+1惊喜标记）`,
    bts_st_sifeng_info: `锁；造成无属性伤害时判定，黑色则视为${get.poptip('bts_glossary_nature_feng_dmg_faq')}伤害`,
    bts_st_hengtiao_info: `出牌阶段，弃1杀对1名其他角色顺手牵羊，其与所有${get.poptip('bts_glossary_zhongdu_faq')}角色判定黑桃则各+1${get.poptip('bts_glossary_zhongdu_faq')}`,
};

export const pinyins = { bts_sangbo: 'sangbo' };
