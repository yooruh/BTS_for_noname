// 丹恒·腾荒（源 animal.lua L8961-9083）—— 护盾与连续【杀】。
// 技能：辟世（必杀技·护盾+连续虚拟杀）、八荒（扣血弃杀加护盾）、生德（角色获护盾后移除异常）。
import { lib, game, get, B } from '../../shared.js';

export const sort = 'huangjinyi';
export const title = '物理·存护·腾飞的荒龙'; // 属性·命途（数据源：崩坏星穹铁道_命途角色表.md；三月七为表缺补全：冰·存护）
export const intro =
    `${B('丹恒·腾荒')}用${get.poptip('bts_glossary_hudun_faq')}起手连【杀】，顺手给受伤的角色罩上盾。`;

export const character = {
    bts_danheng_tenghuang: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_st_pishi', 'bts_st_bahuang', 'bts_st_shengde'],
    },
};

export const skill = {
    // ── 必杀技·辟世（源 st_pishi = SkillCard + ZeroCardViewAsSkill，L8962-9027）──
    // 出牌阶段，失5怒气，令一名角色获得1点护盾（星启2点），然后连续2×n次视为使用【杀】；
    // 若你为星启，所有拥有护盾的角色各附加1层贯通祝福。
    bts_st_pishi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 连续虚拟【杀】的每个目标在 content 循环内另选（依赖先加的护盾/本轮），无法上提；每次 chooseTarget 下限1不可取消
        enable: 'phaseUse',
        usable: 1,
        filter(event, player) {
            // 源 enabled_at_play（L9013）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget() {
            // 源 Card filter（L8970）：目标数 ≤ n（含自己，可护盾任意角色）
            return true;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_st_pishi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L8973：LoseAngry(player, 5)
            // 源 L8974-8982：n=1（星启时 n=2；爱诗『大地』诗额外+1，源 L8978）
            const shield =
                (lib.bts.api.god(player) ? 2 : 1) +
                (player.hasSkill('bts_st_aishi') ? 1 : 0);
            lib.bts.api.addShield(target, shield, player);
            // 源 L8983-8996：for i=1..2n askForUseCard("@@st_pishi_slash!") —— 连续虚拟【杀】
            for (let index = 0; index < shield * 2; index++) {
                const result = await player
                    .chooseTarget(
                        '辟世：选择一名角色视为使用【杀】',
                        [1, 1],
                        (card, source, target) =>
                            target !== source && source.inRange(target),
                        (target) => -get.attitude(player, target),
                    )
                    .forResult();
                if (!result.bool) break;
                await player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { bts_st_pishi: true },
                    },
                    result.targets,
                );
            }
            // 源 L8997-9003：星启时对所有拥有护盾的角色 AddBless(@bless_through)
            if (lib.bts.api.god(player))
                for (const target of game.filterPlayer((target) =>
                    lib.bts.api.getShield(target),
                ))
                    await lib.bts.api.addBless(target, 'through', 1, player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_st_pishi')
                    ? -1
                    : 9;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·八荒（源 st_bahuang = TriggerSkill HpChanged + OneCardViewAsSkill，L9030-9066）──
    // 你扣减体力后，可弃置一张【杀】，令一名角色获得1点护盾。
    bts_st_bahuang: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 源 L9062：扣减量>0，且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                lib.bts.api.lostHp(event) > 0 &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L9063：askForUseCard("@@st_bahuang") —— 仅选择弃【杀】与目标，弃牌移入 content 结算
            event.result = await player
                .chooseCardTarget({
                    prompt: '八荒：弃置一张【杀】令一名角色获得1点护盾',
                    position: 'h',
                    filterCard: (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    selectCard: 1,
                    filterTarget: () => true,
                    ai1: (card) => 6 - get.value(card),
                    ai2: (target) => get.attitude(player, target),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            lib.bts.api.addShield(event.targets[0], 1, player); // 源 L9037：AddAShield(p, player)
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·生德（源 st_shengde = TriggerSkill MarkChanged，L9068-9083）──
    // 当一名角色获得护盾后，若其拥有异常，你可以移除其一种异常。
    bts_st_shengde: {
        // 源 st_shengde（animal.lua L9068-9083）：MarkChanged 中 mark.gain>0（room.cpp
        // setPlayerMark：gain=新值-旧值，>0 = 附加），即「当一名角色获得护盾后」触发
        // （源翻译 L13683 写「失去护盾后」，与代码不符，以代码为准）。
        trigger: { global: 'addMark' },
        filter(event, player) {
            // 源 L9076：mark 名为 @shield、gain>0（附加）、目标拥有异常
            return (
                event.markName === 'bts_shield' &&
                event.player &&
                lib.bts.api.getAbnor(event.player)
            );
        },
        // 源 st_shengde（animal.lua L9068-9083）：askForSkillInvoke 可选发动后，
        // RemoveAbnormal("choice") 内部 askForChoice 必选一种异常——可选确认与必选移除项
        // 均在 cost（取消 = 不发动），content 仅执行移除（选择结果经 cost_data 传入）。
        async cost(event, trigger, player) {
            const target = trigger.player;
            const choices = Object.keys(target.storage || {}).filter(
                (key) => key.startsWith('bts_abnormal_') && target.countMark(key),
            );
            if (!choices.length) {
                event.result = { bool: false };
                return;
            }
            const result = await player
                .chooseBool(
                    `生德：是否移除${get.translation(target)}的一种异常？`,
                )
                .set('ai', () => get.attitude(player, target) > 0)
                .forResult();
            if (!result.bool) {
                event.result = { bool: false };
                return;
            }
            const pick = await player
                .chooseControl(
                    choices.map((key) => [key, lib.translate[key] || key]),
                    '生德：选择移除的异常',
                )
                .forResult();
            event.result = { bool: true, cost_data: { control: pick.control } };
        },
        async content(event, trigger, player) {
            // cost 选择结果在技能事件 event.cost_data（标准约定）；trigger=addMark 事件
            const target = trigger.player;
            // 源 L9078：RemoveAbnormal(mark.who, "choice", 1, p) —— 移除所选异常1层
            if (event.cost_data?.control)
                lib.bts.api.removeAbnormal(
                    target,
                    event.cost_data.control.replace('bts_abnormal_', ''),
                    1,
                );
        },
        ai: { noe: true },
    },
};

export const translate = {
    bts_danheng_tenghuang: '丹恒·腾荒',
    bts_st_pishi: '辟世',
    bts_st_pishi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名角色，令其获得1点${get.poptip('bts_glossary_hudun_faq')}，然后你可连续两次视为使用【杀】；若你为${get.poptip('bts_glossary_xingqi_faq')}，上述${get.poptip('bts_glossary_hudun_faq')}和【杀】次数翻倍，所有拥有${get.poptip('bts_glossary_hudun_faq')}的角色各附加1层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}；若你拥有${get.poptip('bts_st_aishi')}，${get.poptip('bts_glossary_hudun_faq')}额外+1。`,
    bts_st_bahuang: '八荒',
    bts_st_bahuang_info: `扣减体力后，你可以弃置一张【杀】，令一名角色获得1点${get.poptip('bts_glossary_hudun_faq')}。`,
    bts_st_shengde: '生德',
    bts_st_shengde_info: `当角色获得${get.poptip('bts_glossary_hudun_faq')}后，若其拥有异常，你可以移除其一种异常。（源翻译写「失去护盾后」，与源码不符，以代码为准）`,

    '$bts_st_pishi1': "群龙，依此号令",
    '$bts_st_pishi2': "烈腾八荒，荡除凶灾，不灭不朽！",
    '$bts_st_bahuang1': "山鸣，龙啸！",
    '$bts_st_bahuang2': "掣地，擎天！",
    '$bts_st_shengde1': "金石之志",
    '$bts_st_shengde2': "小心了！",
    '~bts_danheng_tenghuang': "使命…仍未完成……",
};

export const simpleTranslate = {
    bts_st_pishi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}加${get.poptip('bts_glossary_hudun_faq')}并连续虚拟杀，${get.poptip('bts_glossary_xingqi_faq')}翻倍且有盾者+${get.poptip('bts_glossary_guantong_faq')}`,
    bts_st_bahuang_info: `扣血后可弃杀令1名角色+1${get.poptip('bts_glossary_hudun_faq')}`,
    bts_st_shengde_info: `角色得${get.poptip('bts_glossary_hudun_faq')}后可移除其一种异常`,
};

export const pinyins = { bts_danheng_tenghuang: 'danhengtenghuang' };
