// 花火（源 animal.lua L4652-4759）—— 千役分配与游鱼额外回合。
import { lib, game, get, B } from '../../shared.js';
export const sort = 'pinuokangni';
export const title = '量子·同谐·假面愚者'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro = `${B('花火')}公开分配牌并令其可作【杀】，还能弃两【杀】支援队友的额外回合。`;
export const character = {
    bts_huahuo: {
        sex: 'female',
        group: 'pinuokangni',
        hp: 4,
        skills: ['bts_st_qianyi', 'bts_st_guiji', 'bts_st_youyu'],
    },
};
export const skill = {
    bts_st_qianyi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 每「交给一张摸到的牌」在 content 循环内即时选一个收牌者（依赖本轮摸牌数），无法上提；每次 chooseTarget 下限1不可取消
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_qianyi');
            lib.bts.api.loseAngry(player, 5);
            // 源：摸 x 张牌并展示（星启为 5 张，否则 4 张），再逐张公开分配。
            // 注：源 L4660 `if God(player) then n = 5 end` 为死代码（n 赋值未用、x 恒 4），
            // 按源描述「若你为星启则改为五张」实现摸 5（用户 2026-09-02 定夺保持现状）。
            const num = lib.bts.api.god(player) ? 5 : 4;
            const cards = get.cards(num);
            for (const card of cards) card.addKnower('everyone');
            await player.gain(cards, 'gain2');
            for (const card of cards) {
                const result = await player
                    .chooseTarget(
                        `千役：将${get.translation(card)}交给一名角色`,
                        [1, 1],
                        () => true,
                    )
                    .forResult();
                const target = result.bool ? result.targets[0] : player;
                if (target !== player && get.position(card) === 'h')
                    await player.give(card, target, 'visible');
                // 源 setCardFlag：这些牌在任意角色手牌中视为【杀】。
                card.storage ??= {};
                card.storage.bts_st_qianyi = true;
            }
            // 源：所有存活角色获得过滤技能 #st_qianyi。
            for (const target of game.filterPlayer((target) =>
                target.isAlive(),
            )) {
                if (!target.hasSkill('bts_st_qianyi_slash', true))
                    target.addAdditionalSkill('bts_st_qianyi_slash');
            }
        },
        ai: {
            order: (item, player) =>
                lib.bts.aiGuard.blocked(player, 'bts_st_qianyi') ? -1 : 6,
            result: { player: 2 },
        },
    },
    bts_st_qianyi_slash: {
        charlotte: true,
        audio: false,
        enable: ['chooseToUse', 'chooseToRespond'],
        position: 'h',
        filter(event, player) {
            if (event.respondTo) return event.respondTo[1]?.name === 'sha';
            return player
                .getCards('h')
                .some((card) => card.storage?.bts_st_qianyi);
        },
        filterCard(card) {
            return card.storage?.bts_st_qianyi === true;
        },
        viewAs: { name: 'sha' },
        prompt: '将千役标记牌当【杀】使用',
        ai: { order: 8, result: { target: 1 }, respondSha: true },
    },
    bts_st_guiji: {
        mod: {
            maxHandcard(player, num) {
                return num + 2;
            },
        },
        ai: { noe: true },
    },
    bts_st_youyu: {
        // 源 st_youyu = EventPhaseStart + Player_NotActive（L4749-4757），非 global——
        // 引擎 triggerable 仅事件焦点（进入 NotActive 者=花火自己）持技时触发，即【花火自己的回合结束】。
        // 原实现误用 global:'phaseEnd' + event.player !== player（其他角色回合结束），已按原版修正。
        trigger: { player: 'phaseEnd' },
        filter(event, player) {
            return (
                player.getCards('he').filter((card) => get.name(card) === 'sha')
                    .length >= 2
            );
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCardTarget({
                    prompt: '游鱼：弃置两张【杀】、翻面，令一名其他角色获得致命祝福和额外回合',
                    position: 'he',
                    filterCard: (card) => get.name(card) === 'sha',
                    selectCard: 2,
                    filterTarget: (card, source, target) => target !== source,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选两张【杀】在技能事件 event.cards，结算弃置
            await player.discard(event.cards);
            player.turnOver();
            await lib.bts.api.addBless(event.targets[0], 'fatal', 1, player);
            lib.bts.api.extraTurn(event.targets[0], 'bts_extra_turn');
        },
        ai: { result: { player: 1 } },
    },
};
export const translate = {
    bts_huahuo: '花火',
    bts_st_qianyi: '千役',
    bts_st_qianyi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，摸四张牌并展示之（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为五张），然后将这些牌逐张交给任意角色（可留给自己）；这些牌在任意角色的手牌中均视为【杀】。`,
    bts_st_guiji: '诡计',
    bts_st_guiji_info: '锁定技，你的手牌上限+2。',
    bts_st_youyu: '游鱼',
    bts_st_youyu_info: `回合结束时，你可以弃置两张【杀】并翻面，令一名其他角色附加1层${get.poptip('bts_glossary_bless_fatal_faq')}并执行一个额外回合。`,

    '$bts_st_qianyi1': "来捉迷藏呀",
    '$bts_st_qianyi2': "愚者千面，游戏人间…你，会找到答案么？",
    '$bts_st_youyu1': "不能动摇哦",
    '$bts_st_youyu2': "再加把劲呢？",
    '~bts_huahuo': "玩大了……",
};
export const simpleTranslate = {
    bts_st_qianyi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}摸4牌展示（${get.poptip('bts_glossary_xingqi_faq')}5）并逐张分配，这些牌均视为【杀】`,
    bts_st_guiji_info: '锁；手牌上限+2',
    bts_st_youyu_info: `回合结束可弃2杀翻面，令1名其他角色+1${get.poptip('bts_glossary_bless_fatal_faq')}并额外回合`,
};
export const pinyins = { bts_huahuo: 'huahuo' };
