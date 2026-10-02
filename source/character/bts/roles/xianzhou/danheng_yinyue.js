// 丹恒·饮月（源 animal.lua L6883-6984，V2.2 重做亢心）—— 濯世、龙力与亢心。
// 技能：濯世（必杀技·摸牌+星启额外回合）、龙力（弃至多3张非装备牌多目标致命决斗）、亢心（获得诅咒摸牌）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '虚数·毁灭·苍龙尊裔'; // 属性·命途
export const intro =
    `${B('丹恒·饮月')}用${get.poptip('bts_sk_longli')}同时挑多名角色的${get.poptip('bts_glossary_bless_fatal_faq')}决斗，非【杀】弃牌附上的诅咒还能靠${get.poptip('bts_sk_kangxin')}补牌。`;

export const character = {
    bts_ch_danheng_yinyue: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_zhuoshi', 'bts_sk_longli', 'bts_sk_kangxin'],
    },
};

export const skill = {
    // ── 必杀技·濯世（源 st_zhuoshi = SkillCard + ZeroCardViewAsSkill，L6522-6545）──
    // 出牌阶段，失5怒气并摸三张牌；若你为星启，执行一个额外回合。
    bts_sk_zhuoshi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6543）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zhuoshi');
            lib.bts.api.loseAngry(player, 5); // 源 L6526：LoseAngry(player, 5)
            // 源 L6530-6532：摸两张；星启多摸一张（=3）。源 drawCards(3) 恒摸3 的 n=2/3 为死变量
            //（L6531 赋值未用），按源描述「摸两张、星启多摸一张」实现（用户定夺 2026-09-02）
            await player.draw(player, lib.bts.api.god(player) ? 3 : 2);
            // 源 L6528-6531：星启时 addPlayerMark "extra_turn" —— 额外回合
            if (lib.bts.api.god(player)) lib.bts.api.extraTurn(player, 'bts_extra_turn');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zhuoshi')
                    ? -1
                    : 7;
            },
            result: { player: 2 },
        },
    },

    // ── 主动技·龙力（源 st_longli = ViewAsSkill n=3 + SkillCard，L6547-6612）──
    // 出牌阶段，弃置至多三张非装备牌，视为对至多等量其他角色使用致命【决斗】；
    // 每弃置一张非【杀】，你附加1层诅咒并结束出牌阶段。
    bts_sk_longli: {
        enable: 'phaseUse',
        usable: 1, // 源 enabled_at_play（L6610）：not hasUsed("#st_longli")
        filterCard(card) {
            // 源 view_filter（L6596）：非装备牌
            return get.type(card) !== 'equip';
        },
        position: 'he',
        selectCard: [1, 3], // 源 n=3（L6594）
        complexCard: true,
        filterTarget(card, player, target) {
            // 源 Card filter（L6563）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget(card, player) {
            // 源 L6562：subcardsLength>=2 → n=3，否则 n=1（目标数随弃牌数；用户定夺按原版 2026-09-02）
            const count = ui?.selected?.cards?.length || 1;
            return [1, count >= 2 ? 3 : 1];
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_longli');
            const cards = event.cards || [],
                targets = (event.targets || []).slice(0, cards.length >= 2 ? 3 : 1);
            if (!cards.length || !targets.length) return;
            await player.discard(cards);
            lib.bts.api.endPlayPhase(player); // 源 L6566：Global_PlayPhaseTerminated
            // 源 L6575-6577 + L6586-6588：非【杀】牌数量 → AddCurse(player, n)
            const nonSlash = cards.filter((card) => get.name(card) !== 'sha').length;
            if (nonSlash) lib.bts.api.addCurse(player, nonSlash);
            // 源 L6570-6571 + L6585：决斗 reason 含 "_fatal"（≥2张牌追加 "_light"）
            for (const target of targets) {
                const use = player.useCard(
                    {
                        name: 'juedou',
                        isCard: true,
                        storage: { bts_sk_longli: true },
                    },
                    target,
                );
                use.reason =
                    'bts_sk_longli_fatal' + (cards.length >= 2 ? '_light' : '');
                await use;
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_longli') ? -1 : 6;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·亢心（源 st_kangxin = TriggerSkill Compulsory MarkChanged，L6972-6984）──
    // V2.2 由旧的「方片当红桃【杀】」整体重做为：当你移除诅咒后，摸等同于移除层数的牌。
    //（用户定夺 2026-09-07：按源翻译「移除诅咒」实现，而非代码的 mark.gain>0 附加语义。）
    bts_sk_kangxin: {
        trigger: { player: 'bts_mark_remove' },
        forced: true,
        filter(event) {
            // 源 L6978：mark 名含 @curse，移除时（removeMark num=移除量）触发
            return event.markName === 'bts_curse' && event.num > 0;
        },
        async content(event, trigger, player) {
            // 源 L6979-6980：drawCards(mark.gain)（摸等同于本次移除的诅咒层数）。
            // trigger=派发的 bts_mark_remove 事件（含 num/markName）；技能事件 event 无 num
            await player.draw(player, trigger.num);
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_ch_danheng_yinyue: '丹恒·饮月',
    bts_sk_zhuoshi: '濯世',
    bts_sk_zhuoshi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并摸两张牌；若你为${get.poptip('bts_glossary_xingqi_faq')}，改为摸三张牌并执行一个额外回合。`,
    bts_sk_longli: '龙力',
    bts_sk_longli_info: `出牌阶段，你可以弃置一至三张非装备牌，视为对至多一名其他角色使用${get.poptip('bts_glossary_bless_fatal_faq')}【决斗】；若弃置两张及以上，改为对至多三名其他角色使用${get.poptip('bts_glossary_bless_fatal_faq')}光属性【决斗】。每弃置一张非【杀】，你附加1层诅咒并结束出牌阶段。`,
    bts_sk_kangxin: '亢心',
    bts_sk_kangxin_info: '锁定技，当你移除诅咒后，摸等同于移除层数的牌。',

    '$bts_sk_zhuoshi1': "潜鳞，已现",
    '$bts_sk_zhuoshi2': "洞天隐月，苍龙濯世！",
    '$bts_sk_longli1': "天洪奔涌…",
    '$bts_sk_longli2': "霄龙现影，破！",
    '$bts_sk_longli3': "神蛟腾云，起！",
    '$bts_sk_kangxin1': "云吟御水",
    '$bts_sk_kangxin2': "破绽百出",
};

export const simpleTranslate = {
    bts_sk_zhuoshi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}摸2（${get.poptip('bts_glossary_xingqi_faq')}3），${get.poptip('bts_glossary_xingqi_faq')}额外回合`,
    bts_sk_longli_info: `出牌阶段弃至多3张非装备牌，对1名（≥2张3名）角色使用${get.poptip('bts_glossary_bless_fatal_faq')}光属性决斗；非杀牌转诅咒`,
    bts_sk_kangxin_info: '移除诅咒时摸等量牌',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
