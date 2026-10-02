// 玲可（源 animal.lua L3815-3907）—— 方案必杀技群体回复、经验锁定治愈、罐头弃杀摸牌回复。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'yaliluo';
export const title = '量子·丰饶·雪原探险家'; // 属性·命途
export const intro =
    `${B('玲可')}是后勤回复：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_fangan'))}群体回复，${B(get.poptip('bts_sk_jingyan'))}回复他人时附加${get.poptip('bts_glossary_bless_zhiyu_faq')}，${B(get.poptip('bts_sk_guantou'))}受伤时弃【杀】补给队友并让其代为承伤。` +
    `<li>${get.poptip('bts_glossary_bless_zhiyu_faq')}在受伤时能提供额外回复`;

export const character = {
    bts_ch_lingke: {
        sex: 'female',
        group: 'yaliluo',
        hp: 3,
        skills: ['bts_sk_fangan', 'bts_sk_jingyan', 'bts_sk_guantou'],
    },
};

export const skill = {
    // ── 必杀技·方案（源 max_fangan = SkillCard + ZeroCardViewAsSkill，L3992-4021）──
    bts_sk_fangan: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        // 源 Card filter（L3993）：仅 #targets < 2（一至两名），无 ~=Self → 自指允许（S5）
        selectTarget: [1, 2],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_fangan');
            lib.bts.api.loseAngry(player, 3);
            for (const t of event.targets || []) {
                await t.recover(player, 1);
                // 定夺 2026-09-12（F-05）：源 L4002-4004 RemoveAbnormal(p,"choice",1,player)
                // 由玲可选择移除哪种异常（技能选择界面，见 api.removeAbnormalChoice/chooseAbnormal），
                // 不再自动取首键。
                await lib.bts.api.removeAbnormalChoice(t, player);
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_fangan')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: 1 },
        },
    },

    // ── 锁定技·经验（源 st_jingyan = TriggerSkill Compulsory PreHpRecover，L4023-4040）──
    bts_sk_jingyan: {
        // 源 L4027：PreHpRecover —— 回复结算前，防止回复并令被回复者附加等量治愈祝福。
        // recoverBefore 取消 → 事件走 recoverOmitted，不触发 recoverEnd（避免被误判为已回复，
        // 与源「return true 完全阻止恢复链」语义一致；recoverBegin 取消会误走 recoverEnd）。
        trigger: { source: 'recoverBefore' },
        forced: true,
        filter(event, player) {
            // 源 L4029：被回复者≠你、且其 hp>0（不处于濒死，濒死救回不转化）
            return (
                event.player !== player &&
                event.player.hp > 0 &&
                event.num > 0
            );
        },
        async content(event, trigger, player) {
            // 源 L4029-4034：AddBless(被回复者, 治愈, recover.recover, 你) + return true 取消本次回复
            await lib.bts.api.addBless(trigger.player, 'zhiyu', trigger.num, player);
            trigger.cancel();
        },
        ai: { noe: true },
    },

    // ── 罐头（源 st_guantou = TriggerSkill DamageInflicted + OneCardViewAsSkill，L4041-4090）：
    // 受伤时弃一张【杀】选一名受伤/护盾角色，其摸1回1并被标记（至其下回合结束前），
    // 之后你任一次受伤，任一有标记的存活角色都可代受（源 L4050 setPlayerFlag + L4073-4086 转移循环）。 ──
    bts_sk_guantou: {
        trigger: { player: 'damageBegin2' },
        filter(event, player) {
            return (
                event.num > 0 &&
                player.getCards('h').some((c) => get.name(c) === 'sha') &&
                game.hasPlayer(
                    (t) => t !== player && (t.isDamaged() || lib.bts.api.getShield(t)),
                )
            );
        },
        async cost(event, trigger, player) {
            event.result = await player
                .chooseCardTarget({
                    prompt: '罐头：弃置一张【杀】，令一名受伤或拥有护盾的角色摸1张牌并回复1点体力，其于下回合结束前可为你承受伤害',
                    position: 'h',
                    filterCard: (c) => get.name(c) === 'sha',
                    selectCard: 1,
                    filterTarget: (c, s, x) =>
                        x !== s && (x.isDamaged() || lib.bts.api.getShield(x)),
                    selectTarget: 1,
                    ai1: (c) => 6 - get.value(c),
                    ai2: (x) => get.attitude(player, x),
                })
                .forResult();
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_guantou');
            if (event.cards) await player.discard(event.cards); // cost 的弃牌移入结算
            const target = event.targets[0]; // event=技能事件，cost 结果目标
            // 源 L4048-4049：targets[1]:drawCards(1) + room:recover(targets[1], 玲可)
            await target.draw(player, 1);
            await target.recover(player, 1);
            // 源 L4050：room:setPlayerFlag(target, "st_guantou"..玲可id) —— 持久标记
            //（无名杀以 mark + 子技能清除模拟；窗口至目标「下回合结束」前，见 bts_sk_guantou_clear）
            // 动态键（含来源 playerid）运行时注册：引擎 addMark/removeMark 在 log!==false 时
            // 会 get.info(key)，未注册即告警「孩子，你的技能…」（2026-09-26 实机警告修复，
            // 含下文 clear 子技的移除路径）。
            const guardMark = `bts_guantou_${player.playerid}`;
            lib.skill[guardMark] ??= { markKind: 'record' };
            lib.translate[guardMark] ??= '罐头庇护';
            target.addMark(guardMark, 1);
            target.storage[`bts_guantou_set_${player.playerid}`] =
                game.getGlobalHistory('everything', (e) => e.name === 'phaseAfter').length;
            // 源 L4073-4086：遍历全场存活且有标记者，依次询问是否代受本次伤害
            for (const p of lib.bts.api.seatOrder(game.players)) {
                if (
                    p !== player &&
                    p.isAlive() &&
                    p.countMark(`bts_guantou_${player.playerid}`) > 0
                ) {
                    const agree = await p
                        .chooseBool(
                            `罐头：是否为${get.translation(player)}承受本次伤害？`,
                        )
                        .set(
                            'ai',
                            () =>
                                get.attitude(p, player) > 0 &&
                                p.hp > trigger.num,
                        )
                        .forResult();
                    if (!agree.bool) continue;
                    // 源 L4082-4084：damage.to = p、transfer=true、重发伤害并取消原伤害
                    //（保留来源/数值/reason/属性，省略卡牌）
                    const d = p.damage(trigger.source, trigger.num, 'nocard');
                    d.reason = trigger.reason || 'bts_sk_guantou';
                    if (trigger._btsNature)
                        lib.bts.api.setDamageNature(d, trigger._btsNature);
                    await d;
                    trigger.cancel();
                    break;
                }
            }
        },
        group: ['bts_sk_guantou_clear'],
        subSkill: {
            clear: {
                // 定夺 2026-09-12（F-04）：按无名杀，窗口到目标下回合结束即清——
                // 源代码为永久 flag（无清除），源描述「下回合结束前」与代码矛盾；维持描述化窗口，
                // 不跟随源永久标记。
                // 源翻译「于其下回合结束前」：标记持续至目标下一次回合结束时清除。
                // 若标记设在其当回合内（该角色回合中受伤被标记），窗口延续至其下一回合结束。
                trigger: { global: 'phaseAfter' },
                forced: true,
                filter(event, player) {
                    const mark = `bts_guantou_${player.playerid}`;
                    return event.player && event.player.countMark(mark) > 0;
                },
                async content(event, trigger, player) {
                    const mark = `bts_guantou_${player.playerid}`;
                    const setAt =
                        trigger.player.storage[`bts_guantou_set_${player.playerid}`];
                    const turnCount = game.getGlobalHistory(
                        'everything',
                        (e) => e.name === 'phaseAfter',
                    ).length;
                    if (typeof setAt !== 'number' || turnCount < setAt + 2) return;
                    trigger.player.removeMark(
                        mark,
                        trigger.player.countMark(mark),
                    );
                    delete trigger.player.storage[
                        `bts_guantou_set_${player.playerid}`
                    ];
                },
                ai: { noe: true },
            },
        },
        ai: { result: { player: 1 } },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_lingke_skin1': '皮肤1',
    'bts_ch_lingke_skin1': '皮肤1',
    bts_ch_lingke: '玲可',
    bts_sk_fangan: '方案',
    bts_sk_fangan_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一至两名角色，这些角色各回复1点体力并移除1层异常（由你选择移除哪种）。`,

    bts_sk_jingyan: '经验',
    bts_sk_jingyan_info: `锁定技，当你令一名不处于濒死的其他角色回复体力时，防止之，其改为附加等同于回复量的${get.poptip('bts_glossary_bless_zhiyu_faq')}。`,

    bts_sk_guantou: '罐头',
    bts_sk_guantou_info: `当你受到伤害时，你可以弃置一张【杀】并选择一名受伤或拥有${get.poptip('bts_glossary_hudun_faq')}的其他角色，其摸1张牌并回复1点体力；于其下回合结束前，当你受到伤害时，其可以为你承受。`,

    '$bts_sk_fangan1': "为了去往远方…",
    '$bts_sk_fangan2': "不管什么手段，通通拿出来吧！",
    '$bts_sk_jingyan1': "劳驾，让一让",
    '$bts_sk_jingyan2': "很好很好，看准机会…",
    '$bts_sk_guantou1': "放松，深呼吸",
    '$bts_sk_guantou2': "补充点盐分",
    '~bts_ch_lingke': "哥…姐……",
};

export const simpleTranslate = {
    bts_sk_fangan_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}令1-2名角色各回复1体力并移除1层异常（由你选）`,
    bts_sk_jingyan_info: `锁；你令不濒死的其他角色回复时防止之，其改+等量${get.poptip('bts_glossary_bless_zhiyu_faq')}`,
    bts_sk_guantou_info: `受伤时弃1杀补给1名受伤/有${get.poptip('bts_glossary_hudun_faq')}角色；其下回合结束前可代你承伤`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
