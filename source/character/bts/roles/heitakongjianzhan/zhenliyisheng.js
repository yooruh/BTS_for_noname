// 真理医生（源 animal.lua L3164-3250）—— 悖论必杀技短见、推理锁定追击、助产结束阶段判定。
import { lib, game, ui, get, ai,  _status, X, Y, Z, styleText, B } from '../../shared.js';

export const sort = 'heitakongjianzhan';
export const title = '虚数·巡猎·万物皆流'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('真理医生')}是追击控制：${get.poptip('bts_glossary_bisha_faq')}${B('悖论')}令目标附加${get.poptip('bts_glossary_abnormal_duanjian_faq')}并造成伤害，${B('推理')}锁定追击受伤的${get.poptip('bts_glossary_abnormal_duanjian_faq')}目标，${B('助产')}在结束阶段弃【杀】判定追击。` +
    `<li>${get.poptip('bts_glossary_abnormal_duanjian_faq')}角色被他人伤害时你会自动对其使用【杀】`;

export const character = {
    bts_zhenliyisheng: {
        sex: 'male',
        group: 'heitakongjianzhan',
        hp: 4,
        skills: ['bts_st_beilun', 'bts_st_tuili', 'bts_st_zhuchan'],
    },
};

export const skill = {
    // ── 必杀技·悖论（源 st_beilun = ZeroCardViewAsSkill，L3165-3187）──
    bts_st_beilun: {
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
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_beilun');
            const target = event.targets[0];
            if (!target) return;
            lib.bts.api.loseAngry(player, 5); // 源 L3171
            lib.bts.api.addAbnormal(
                target,
                'duanjian',
                lib.bts.api.god(player) ? 3 : 2,
                player,
            ); // 源 AddAbnormal(duanjian)
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_st_beilun';
            await damage;
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_beilun')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: -2 },
        },
    },

    // ── 锁定技·推理（源 st_tuili = TriggerSkill DamageInflicted，L3188-3215）──
    bts_st_tuili: {
        trigger: { global: 'damageBegin2' },
        forced: true,
        logTarget: 'player',
        filter(event, player) {
            if (!event.player || !event.source) return false;
            if (!lib.bts.api.getAbnor(event.player, 'duanjian')) return false;
            if (event.source === player) return false; // 不为你造成的伤害
            return true;
        },
        async content(event, trigger, player) {
            lib.bts.api.removeAbnormal(trigger.player, 'duanjian', 1); // 源 RemoveAbnormal（trigger=damageBegin2 事件）
            const use = player.useCard(
                { name: 'sha', isCard: true },
                trigger.player,
            ); // 视为【杀】
            await use;
        },
        ai: { noe: true },
    },

    // ── 助产（源 st_zhuchan = TriggerSkill EventPhaseStart + 判定，L3216-3250）──
    bts_st_zhuchan: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 askForUseCard(Slash) 无【杀】自动取消；收紧为手牌有【杀】可弃（与其他弃杀技能同款）
            return player
                .getCards('h')
                .some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            const r = await player
                .chooseBool('助产：是否弃置一张【杀】并选择一名其他角色？')
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
                    '助产：选择一名其他角色',
                    [1, 1],
                    // 源 Card filter（L3193-3196）只 #targets==0 且 to_select~=Self，未限手牌；
                    // 空手目标可被选中（跳过弃牌仍判定），按源放开（原实现要求目标有手牌，已改）
                    (c, p, t) => t !== p,
                )
                .forResult();
            if (!target.bool) {
                event.result = { bool: false };
                return;
            }
            event.result = target;
            event.result.cost_data = { cards: cards.cards };
        },
        async content(event, t, player) {
            await player.discard(event.cost_data.cards); // 源：弃【杀】移入 content 结算
            const x = event.targets[0]; // event=技能事件（自选弃牌/目标经 cost 拷入）
            // 源 askForCardChosen + throwCard（目标侧强制弃牌，保留在 content）；
            // 目标无手牌则跳过弃牌仅判定（源 on_use 空手可判定，L3197-3200）
            if (x.countCards('h'))
                await x.chooseToDiscard('助产：弃置一张手牌', 'h', 1, true);
            // 判定：点数不大于其异常种类数的3倍
            const layers = lib.bts.api.abnormalCount(x);
            const judge = await player.judge((card) => true);
            const num = get.number(judge.judging?.[0] ?? 0);
            if (num <= layers * 3) {
                // 源 judge.pattern "0~layers*3"
                const use = player.useCard({ name: 'sha', isCard: true }, x); // 视为【杀】
                await use;
            }
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const translate = {
    bts_zhenliyisheng: '真理医生',
    bts_st_beilun: '悖论',
    bts_st_beilun_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名其他角色，令其附加2层${get.poptip('bts_glossary_abnormal_duanjian_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为3层），对其造成1点伤害。`,
    bts_st_tuili: '推理',
    bts_st_tuili_info: `锁定技，当处于${get.poptip('bts_glossary_abnormal_duanjian_faq')}的角色受到不为你造成的伤害时，移除其1层${get.poptip('bts_glossary_abnormal_duanjian_faq')}，你视为对其使用【杀】。`,
    bts_st_zhuchan: '助产',
    bts_st_zhuchan_info: '结束阶段开始时，你可以弃置一张【杀】并选择一名其他角色，弃置其一张手牌，判定，若结果不大于其的异常种类数的3倍，视为对其使用【杀】。',

    '$bts_st_beilun1': "存在即被感知——",
    '$bts_st_beilun2': "知识既为万物尺度，定将穷尽真理、根除谬误",
    '$bts_st_tuili1': "零分，下一个！",
    '$bts_st_tuili2': "负分，给我滚！",
    '$bts_st_zhuchan1': "让我来考考你",
    '$bts_st_zhuchan2': "不能停止思考",
    '~bts_zhenliyisheng': "「庸人」么…呵……",
};

export const simpleTranslate = {
    bts_st_beilun_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}令1名其他角色+2层${get.poptip('bts_glossary_abnormal_duanjian_faq')}并造成1点伤害（${get.poptip('bts_glossary_xingqi_faq')}改3）`,
    bts_st_tuili_info: `锁；${get.poptip('bts_glossary_abnormal_duanjian_faq')}角色受到非你的伤害时，移除1层${get.poptip('bts_glossary_abnormal_duanjian_faq')}并视为对其用杀`,
    bts_st_zhuchan_info:
        '结束阶段，弃1杀选1名其他角色弃其1手牌，判定点数≤其异常种类数×3则视为对其用杀',
};

export const pinyins = { bts_zhenliyisheng: 'zhenliyisheng' };
