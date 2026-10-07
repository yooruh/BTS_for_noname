// 黑天鹅（源 animal.lua L4588-4651）—— 揭露与中毒扩散。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'pinuokangni';
export const title = '风·虚无·流光忆庭的忆者'; // 属性·命途
export const intro = `${B('黑天鹅')}给目标挂${get.poptip('bts_glossary_abnormal_jielu_faq')}，靠异常伤害不断叠${get.poptip('bts_glossary_zhongdu_faq')}。`;
export const character = {
    bts_ch_heitiane: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_sk_biwan', 'bts_sk_jizhu', 'bts_sk_shizhui'],
    },
};
export const skill = {
    // ── 必杀技·臂湾（源 st_biwan = SkillCard + ZeroCardViewAsSkill，L4589-4610）──
    // 出牌阶段，失5怒气并令至少一名其他角色各附加2层揭露异常。
    bts_sk_biwan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L4608）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(event, player, target) {
            // 源 Card filter（L4592）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_biwan');
            lib.bts.api.loseAngry(player, 5); // 源 L4595：LoseAngry(player, 5)
            // 源 L4596-4598：AddAbnormal(p, "@abnormal_jielu", 2, player)
            for (const target of event.targets)
                lib.bts.api.addAbnormal(target, 'jielu', 2, player);
        },
        ai: {
            // AI 口径：失5怒为敌方各挂2层揭露（源 L4589-4610）；揭露与中毒/烧伤/麻痹组合才产生
            // 实质损耗（见下方 bts_abnormal_jielu），敌方已有其它异常时加权；无敌方目标不发动
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_biwan')) return -1;
                let val = 0;
                for (const t of game.players) {
                    if (!t.isAlive() || t === player || get.attitude(player, t) >= 0)
                        continue;
                    val += 1;
                    if (
                        lib.bts.api.getAbnor(t, 'poison') ||
                        lib.bts.api.getAbnor(t, 'burn') ||
                        lib.bts.api.getAbnor(t, 'numb')
                    )
                        val += 1;
                }
                if (!val) return -1;
                return val >= 3 ? 8 : 6;
            },
            result: {
                // 目标受损=2层揭露；与毒/烧/麻组合时≈2.5、单独≈1（仅铺垫，靠后续异常兑现）
                target: (player, target) =>
                    lib.bts.api.getAbnor(target, 'poison') ||
                    lib.bts.api.getAbnor(target, 'burn') ||
                    lib.bts.api.getAbnor(target, 'numb')
                        ? -2.5
                        : -1,
            },
        },
    },

    // ── 触发技·机杼（源 st_jizhu = TriggerSkill Damaged，L4612-4629）──
    // 其他角色于其回合内受到异常伤害后，你可以令其附加1层中毒。
    bts_sk_jizhu: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L4620：受伤者 ≠ 你、reason 含 "abnormal_"（异常伤害）、且处于其回合内
            return (
                event.player !== player &&
                event.reason?.includes('bts_abnormal_') &&
                _status.currentPhase === event.player
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            // 源 L4620：askForSkillInvoke（trigger=damageEnd 事件）
            event.result = await player
                .chooseBool(
                    `机杼：是否令${get.translation(trigger.player)}附加1层中毒？`,
                )
                // AI 口径：只对敌方追加中毒（中毒=弃牌阶段失去1体力+手牌上限-1，源 gamerule_ex L1577-1587）；
                // 友方不加深（源 L4612-4629）
                .set('ai', () =>
                    trigger.player !== player &&
                    trigger.player.isAlive() &&
                    get.attitude(player, trigger.player) < 0,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L4622：AddAbnormal(player=受伤者, "@abnormal_poison", 1, p)
            lib.bts.api.addAbnormal(trigger.player, 'poison', 1, player);
        },
    },

    // ── 触发技·失坠（源 st_shizhui = TriggerSkill EventPhaseStart Finish，L4631-4650）──
    // 结束阶段开始时，可弃置一张【杀】，令所有中毒角色各附加1层中毒。
    bts_sk_shizhui: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L4636-4641：结束阶段、存在中毒角色、且手牌有【杀】可弃
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer((target) => lib.bts.api.getAbnor(target, 'poison'))
            );
        },
        async cost(event, trigger, player) {
            // 源 L4641：askForCard(player, "Slash") —— 只用 chooseCard 选择，弃置在 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '失坠：选择弃置一张【杀】令所有中毒角色各附加1层中毒？',
                )
                // AI 口径：结算为所有中毒角色各+1层——敌方中毒者每名≈+1.2、友方≈-1.2；
                // 合计≤0（含“仅自己/友方中毒”）时返回负值令 AI 取消（chooseCard：最高分≤0 不选，源 L4631-4650）
                .set('ai', (card) => {
                    let gain = 0;
                    for (const t of game.filterPlayer((target) =>
                        lib.bts.api.getAbnor(target, 'poison'),
                    )) {
                        if (t === player) continue;
                        gain += get.attitude(player, t) < 0 ? 1.2 : -1.2;
                    }
                    if (gain <= 0) return gain;
                    return gain + 6 - get.value(card);
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L4641：弃【杀】；cost 所选牌在技能事件 event.cards
            await player.discard(event.cards);
            // 源 L4643-4647：所有中毒角色各附加1层中毒
            for (const target of lib.bts.api.seatOrder(
                game.filterPlayer((target) => lib.bts.api.getAbnor(target, 'poison')),
            ))
                lib.bts.api.addAbnormal(target, 'poison', 1, player);
        },
        ai: { result: { player: 1 } },
    },
};
export const translate = {
    bts_ch_heitiane: '黑天鹅',
    bts_sk_biwan: '臂湾',
    bts_sk_biwan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并令至少一名其他角色各附加2层${get.poptip('bts_glossary_abnormal_jielu_faq')}。`,
    bts_sk_jizhu: '机杼',
    bts_sk_jizhu_info: `当其他角色于其回合内受到异常伤害后，你可以令其附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,
    bts_sk_shizhui: '失坠',
    bts_sk_shizhui_info: `结束阶段开始时，你可以弃置一张【杀】，令所有${get.poptip('bts_glossary_zhongdu_faq')}角色各附加1层${get.poptip('bts_glossary_zhongdu_faq')}。`,

    '$bts_sk_biwan1': "记忆是常变的泡沫",
    '$bts_sk_biwan2': "静默的水面下…便是无尽深渊",
    '$bts_sk_jizhu1': "喏，拿好了",
    '$bts_sk_jizhu2': "来许愿吧",
    '$bts_sk_shizhui1': "不祥之征，重现",
    '$bts_sk_shizhui2': "厄运之誓，降临",
    '~bts_ch_heitiane': "流年…不利……",
    bts_abnormal_jielu: '揭露',
};
export const simpleTranslate = {
    bts_sk_biwan_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色+2${get.poptip('bts_glossary_abnormal_jielu_faq')}`,
    bts_sk_jizhu_info: `他人回合内受异常伤害后可令其+1${get.poptip('bts_glossary_zhongdu_faq')}`,
    bts_sk_shizhui_info: `结束阶段可弃杀令全部${get.poptip('bts_glossary_zhongdu_faq')}角色各+1${get.poptip('bts_glossary_zhongdu_faq')}`,
};
export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_jielu: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_jielu_faq',
        mod: {
            attackRange(player, range) {
                if (
                    !lib.bts.api.getAbnor(player, 'burn') &&
                    lib.bts.api.getAbnor(player, 'jielu') &&
                    lib.bts.api.getAbnor(player, 'poison')
                )
                    range -= 1;
                return range;
            },
            maxHandcard(player, num) {
                if (
                    !lib.bts.api.getAbnor(player, 'poison') &&
                    lib.bts.api.getAbnor(player, 'jielu') &&
                    (lib.bts.api.getAbnor(player, 'burn') ||
                        lib.bts.api.getAbnor(player, 'numb'))
                )
                    num -= 1;
                return num;
            },
        },
        trigger: { player: ['phaseDrawBegin2', 'phaseDiscardBegin'] },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (event.player !== player) return false;
            if (triggername === 'phaseDrawBegin2') {
                return (
                    event.num > 0 &&
                    !lib.bts.api.getAbnor(player, 'numb') &&
                    lib.bts.api.getAbnor(player, 'jielu') &&
                    lib.bts.api.getAbnor(player, 'poison')
                );
            }
            return (
                !lib.bts.api.getAbnor(player, 'poison') &&
                lib.bts.api.getAbnor(player, 'jielu') &&
                (lib.bts.api.getAbnor(player, 'burn') ||
                    lib.bts.api.getAbnor(player, 'numb'))
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'phaseDrawBegin2') {
                trigger.num = Math.max(0, trigger.num - 1);
                return;
            }
            let n = 1;
            if (player.countMark('bts_sk_jingxi') > 0) {
                n = 2; // 惊喜标记：改为失去2点并移除（源 L1581-1584）
                player.removeMark('bts_sk_jingxi', player.countMark('bts_sk_jingxi'));
            }
            player.loseHp(n);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_jielu_faq',
        name: '|揭露|',
        // jielu 异常由黑天鹅「臂湾」赋予（与那刻夏的同名技能「揭露」区分，二者曾混淆）；
        // 组合分支按源 animal_fix L1508/1613/1794/1820 实现：
        // 「弃牌失去体力」仅在烧伤/麻痹同存路线；中毒路线只含摸牌/攻击范围修正。
        info: `异常状态：由${get.poptip('bts_sk_biwan')}赋予（黑天鹅）；与其他异常组合结算——与${get.poptip('bts_glossary_zhongdu_faq')}同存：摸牌数-1（无${get.poptip('bts_glossary_mabi_faq')}时）、攻击范围-1（无${get.poptip('bts_glossary_abnormal_burn_faq')}时）；与${get.poptip('bts_glossary_abnormal_burn_faq')}/${get.poptip('bts_glossary_mabi_faq')}同存且无${get.poptip('bts_glossary_zhongdu_faq')}：手牌上限-1，且弃牌阶段开始时失去1点体力。`,
    },
];
