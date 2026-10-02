// 丹恒·腾荒（源 animal.lua L9320-9441）—— 护盾与连续【杀】。
// 技能：辟世（必杀技·护盾+连续虚拟杀）、八荒（扣血弃杀加护盾）、生德（角色获护盾后移除异常）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '物理·存护·腾飞的荒龙'; // 属性·命途
export const intro =
    `${B('丹恒·腾荒')}用${get.poptip('bts_glossary_hudun_faq')}起手连【杀】，顺手给受伤的角色罩上盾。`;

export const character = {
    bts_ch_danheng_tenghuang: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_pishi', 'bts_sk_bahuang', 'bts_sk_shengde'],
    },
};

export const skill = {
    // ── 必杀技·辟世（源 st_pishi = SkillCard + ZeroCardViewAsSkill，L8962-9027）──
    // 出牌阶段，失5怒气，令一名角色获得1点护盾（星启2点），然后连续2×n次视为使用【杀】；
    // 若你为星启，所有拥有护盾的角色各附加1层贯通祝福。
    bts_sk_pishi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 连续虚拟【杀】的每个目标在 content 循环内另选（依赖先加的护盾/本轮），无法上提；每次 chooseTarget 下限1不可取消
        enable: 'phaseUse',
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
            lib.bts.aiGuard.record(player, 'bts_sk_pishi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 5); // 源 L8973：LoseAngry(player, 5)
            // 源 L8974-8982：n=1（星启时 n=2；爱诗『大地』诗额外+1，源 L8978）
            const shield =
                (lib.bts.api.god(player) ? 2 : 1) +
                (player.hasSkill('bts_sk_aishi') ? 1 : 0);
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
                        skill: 'bts_sk_pishi',
                        storage: { bts_sk_pishi: true },
                    },
                    result.targets,
                );
            }
            // 源 L8997-9003：星启时对所有拥有护盾的角色 AddBless(@bless_through)
            // 平衡改动（2026-09-28 用户定夺）：出牌阶段叠 1 层会被当回合结束阶段自然衰减抹掉 → 改 2 层（源为 1）。
            if (lib.bts.api.god(player))
                for (const target of lib.bts.api.seatOrder(
                    game.filterPlayer((target) => lib.bts.api.getShield(target)),
                ))
                    await lib.bts.api.addBless(target, 'through', 2, player);
        },
        // 源 L9383-9390：max_pishi_slash 设 setSkillName("max_pishi") —— 每刀 reason 含必杀技名，
        // 源 ConfirmDamage L1117/L1124 据此给星启必杀+1 与增幅祝福+1。无名杀 damage() 不自动设
        // reason，须于 damageBegin1 显式设（飞霄 bts_sk_zaohuang 范式）。
        group: ['bts_sk_pishi_damage'],
        subSkill: {
            damage: {
                trigger: { source: 'damageBegin1' },
                forced: true,
                priority: 10,
                filter(event, player) {
                    return event.card?.storage?.bts_sk_pishi;
                },
                async content(event, trigger, player) {
                    trigger.reason = 'bts_sk_pishi_bts_reason_fatal';
                },
                ai: { noe: true },
            },
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_pishi')
                    ? -1
                    : 9;
            },
            result: { target: 1 },
        },
    },

    // ── 触发技·八荒（源 st_bahuang = TriggerSkill HpChanged + OneCardViewAsSkill，L9030-9066）──
    // 你扣减体力后，可弃置一张【杀】，令一名角色获得1点护盾。
    bts_sk_bahuang: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        filter(event, player) {
            // 源 L9062：扣减量>0，且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                lib.bts.api.getLostHp(event) > 0 &&
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
    // 当一名角色失去护盾后，若其拥有异常，你可以移除其一种异常。
    bts_sk_shengde: {
        // 源 st_shengde（animal.lua L9068-9083）：MarkChanged；源代码作 mark.gain>0（附加）、
        // 翻译写「失去护盾后」——同族 7 处 gain 方向与描述相反的系统性笔误，
        // 2026-10-02 用户定夺按描述方向实现：护盾被移除时（bts_mark_remove）触发。
        // 范围按源描述「一名角色」取 global（源缺 can_trigger 属引擎层限制，作者原意以
        // 描述＋函数体〔findPlayers loop + mark.who〕为准；原 self 限制随本次定夺解除）。
        trigger: { global: 'bts_mark_remove' },
        filter(event, player) {
            // 源 L9076：mark 名为 @shield、被移除、该角色拥有异常
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
            // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
            const pick = await player
                .chooseControl(choices)
                .set('prompt', '生德：选择移除的异常')
                .forResult();
            event.result = { bool: true, cost_data: { control: pick.control } };
        },
        async content(event, trigger, player) {
            // cost 选择结果在技能事件 event.cost_data（标准约定）；trigger=removeMark 事件
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
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_danheng_tenghuang_skin1': '皮肤1',
    'bts_ch_danheng_tenghuang_skin2': '皮肤2',
    'bts_ch_danheng_tenghuang_skin3': '皮肤3',
    'bts_ch_danheng_tenghuang_skin4': '皮肤4',
    'bts_ch_danheng_tenghuang_skin5': '皮肤5',
    'bts_ch_danheng_tenghuang_skin6': '皮肤6',
    'bts_ch_danheng_tenghuang_skin7': '皮肤7',
    'bts_ch_danheng_tenghuang_skin8': '皮肤8',
    'bts_ch_danheng_tenghuang_skin1': '皮肤1',
    'bts_ch_danheng_tenghuang_skin2': '皮肤2',
    'bts_ch_danheng_tenghuang_skin3': '皮肤3',
    'bts_ch_danheng_tenghuang_skin4': '皮肤4',
    'bts_ch_danheng_tenghuang_skin5': '皮肤5',
    'bts_ch_danheng_tenghuang_skin6': '皮肤6',
    'bts_ch_danheng_tenghuang_skin7': '皮肤7',
    'bts_ch_danheng_tenghuang_skin8': '皮肤8',
    bts_ch_danheng_tenghuang: '丹恒·腾荒',
    bts_sk_pishi: '辟世',
    bts_sk_pishi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择一名角色，令其获得1点${get.poptip('bts_glossary_hudun_faq')}，然后你可连续两次视为使用【杀】；若你为${get.poptip('bts_glossary_xingqi_faq')}，上述${get.poptip('bts_glossary_hudun_faq')}和【杀】次数翻倍，所有拥有${get.poptip('bts_glossary_hudun_faq')}的角色各附加2层${get.poptip('bts_glossary_guantong_faq')}${get.poptip('bts_glossary_bless_faq')}；若你拥有${get.poptip('bts_sk_aishi')}，${get.poptip('bts_glossary_hudun_faq')}额外+1。`,
    bts_sk_bahuang: '八荒',
    bts_sk_bahuang_info: `扣减体力后，你可以弃置一张【杀】，令一名角色获得1点${get.poptip('bts_glossary_hudun_faq')}。`,
    bts_sk_shengde: '生德',
    bts_sk_shengde_info: `当一名角色失去${get.poptip('bts_glossary_hudun_faq')}后，若其拥有异常，你可以移除其一种异常。`,

    '$bts_sk_pishi1': "群龙，依此号令",
    '$bts_sk_pishi2': "烈腾八荒，荡除凶灾，不灭不朽！",
    '$bts_sk_bahuang1': "山鸣，龙啸！",
    '$bts_sk_bahuang2': "掣地，擎天！",
    '$bts_sk_shengde1': "金石之志",
    '$bts_sk_shengde2': "小心了！",
    '~bts_ch_danheng_tenghuang': "使命…仍未完成……",
};

export const simpleTranslate = {
    bts_sk_pishi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}加${get.poptip('bts_glossary_hudun_faq')}并连续虚拟杀，${get.poptip('bts_glossary_xingqi_faq')}翻倍且有盾者各+2${get.poptip('bts_glossary_guantong_faq')}`,
    bts_sk_bahuang_info: `扣血后可弃杀令1名角色+1${get.poptip('bts_glossary_hudun_faq')}`,
    bts_sk_shengde_info: `角色失${get.poptip('bts_glossary_hudun_faq')}后可移除其一种异常`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
