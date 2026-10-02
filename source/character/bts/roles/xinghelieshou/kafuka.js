// 卡芙卡（源 animal.lua L2328-2444）—— 颤音必杀技麻痹+异常引爆、残酷锁定反击、摩挲点引爆。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';// 异常引爆（源 Kafuka，animal.lua L894）：结算并移除麻痹/烧伤/中毒。
// num 缺省则引爆全部；num 指定则各引爆至多 num 层。麻痹/烧伤各造成1点无来源伤害，中毒各失去1点体力。
// 卡芙卡角色技能特化方法（原在 rules/utils.js 全局 API，按 TODO 移入本技能 util，经 bts_sk_mosuo.util 挂载；
// 跨文件以 lib.skill['bts_sk_mosuo'].util.kafuka 访问，如 resolver.js 绝海祝福清全场）。
export async function kafuka(target, from, num) {
    if (!target) return;
    const layers = {
        numb: target.countMark('bts_abnormal_numb'),
        burn: target.countMark('bts_abnormal_burn'),
        poison: target.countMark('bts_abnormal_poison'),
    };
    const take = (name) =>
        num == null ? layers[name] : Math.min(num, layers[name]);
    const rm = {
        numb: take('numb'),
        burn: take('burn'),
        poison: take('poison'),
    };
    if (rm.numb) lib.bts.api.removeAbnormal(target, 'numb', rm.numb);
    if (rm.burn) lib.bts.api.removeAbnormal(target, 'burn', rm.burn);
    if (rm.poison) lib.bts.api.removeAbnormal(target, 'poison', rm.poison);
    for (let i = 0; i < rm.numb; i++) {
        const damage = target.damage(1, 'nosource');
        damage.reason = 'bts_abnormal_numb';
        await damage;
    }
    for (let i = 0; i < rm.burn; i++) {
        const damage = target.damage(1, 'nosource');
        damage.reason = 'bts_abnormal_burn';
        await damage;
    }
    for (let i = 0; i < rm.poison; i++) await target.loseHp(); // 与上方 numb/burn 一致地 await，避免结算滞后
}

export const sort = 'xinghelieshou';
export const title = '雷·虚无·夜将不眠'; // 属性·命途
export const intro =
    `${B('卡芙卡')}是异常爆破手：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_chanyin'))}令多名角色${get.poptip('bts_glossary_mabi_faq')}并引爆全部${get.poptip('bts_glossary_mabi_faq')}/${get.poptip('bts_glossary_abnormal_burn_faq')}/${get.poptip('bts_glossary_zhongdu_faq')}，${B(get.poptip('bts_sk_mosuo'))}弃【杀】点引爆单名角色，${B(get.poptip('bts_sk_canku'))}在他人的【杀】指定目标后反击。` +
    `<li>${get.poptip('bts_glossary_mabi_faq')}/${get.poptip('bts_glossary_abnormal_burn_faq')}引爆为无来源伤害，${get.poptip('bts_glossary_zhongdu_faq')}引爆为失去体力`;

export const character = {
    bts_ch_kafuka: {
        sex: 'female',
        group: 'xinghelieshou',
        hp: 4,
        skills: ['bts_sk_chanyin', 'bts_sk_canku', 'bts_sk_mosuo'],
    },
};

export const skill = {
    // ── 必杀技·颤音（源 st_chanyin = ZeroCardViewAsSkill，L2329-2348）──
    bts_sk_chanyin: {
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
            lib.bts.aiGuard.record(player, 'bts_sk_chanyin');
            lib.bts.api.loseAngry(player, 5); // 源 L2336
            for (const t of event.targets || [])
                lib.bts.api.addAbnormal(t, 'numb', 1, player);
            for (const t of event.targets || [])
                await lib.skill['bts_sk_mosuo'].util.kafuka(t, player); // 源 Kafuka：引爆并移除
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_chanyin')
                    ? -1
                    : 6;
            },
            threaten: 2.5,
            result: { player: 1, target: -2 },
        },
    },

    // ── 锁定技·残酷（源 st_canku = TriggerSkill Compulsory TargetSpecified/DamageCaused，L2349-2408）──
    bts_sk_canku: {
        trigger: { global: 'useCard' },
        forced: true,
        filter(event, player) {
            if (event.card?.name !== 'sha') return false; // 其他角色使用【杀】
            if (event.player === player) return false;
            if (!event.targets?.length || event.targets.includes(player))
                return false; // 目标没有你
            return !game.hasPlayer(
                (p) => p.isAlive() && p.countMark('bts_mk_canku-start') > 0,
            );
        },
        async content(event, trigger, player) {
            // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
            const choice = await player
                .chooseControl(
                    '视为对相同目标使用【杀】',
                    '令一名角色获得你一张牌',
                )
                .set('prompt', '残酷：选择一项')
                .forResult();
            if (choice.index === 1) {
                if (player.countCards('he') > 0) {
                    const r = await player
                        .chooseTarget(
                            '残酷：选择一名角色获得你一张牌',
                            [1, 1],
                            // 源 L2449 全场任意；自指无意义（he 内自取自还即空转），排除之
                            (card, p, t) => t !== p,
                        )
                        .forResult();
                    if (r.bool) {
                        // 源 L2452-2453：askForCardChosen(target, p, "he") + obtainCard
                        // —— 目标从你的手牌/装备牌中自选一张拿走
                        const pick = await r.targets[0]
                            .choosePlayerCard(player, 'he', true)
                            .forResult();
                        if (pick.cards?.length) {
                            await player.give(pick.cards, r.targets[0]);
                            r.targets[0].addMark('bts_mk_canku-start', 1); // 此技能于其回合开始前无效
                            return;
                        }
                    }
                }
                // 未能交牌，退回选项1
            }
            // 选项1：视为对相同目标使用【杀】，令技能于你下回合开始前无效
            player.addMark('bts_mk_canku-start', 1);
            const targets = (trigger.targets || []).filter((t) => t.isAlive());
            if (targets.length) {
                const use = player.useCard(
                    {
                        name: 'sha',
                        isCard: true,
                        storage: { bts_sk_canku: true },
                    },
                    targets,
                );
                await use;
            }
        },
        group: ['bts_sk_canku_numb'],
        subSkill: {
            numb: {
                trigger: { source: 'damageBegin1' },
                filter(event, player) {
                    return (
                        !!event.card?.storage?.bts_sk_canku && !!event.player
                    );
                },
                async content(event, trigger, player) {
                    trigger.cancel(); // 防止此伤害
                    lib.bts.api.addAbnormal(trigger.player, 'numb', 1, player); // 源 DamageCaused → 附加1层麻痹
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 摩挲（源 st_mosuo = OneCardViewAsSkill + EventPhaseStart 询问，L2409-2444）──
    bts_sk_mosuo: {
        // 角色技能特化方法（叁岛 util 字段范式）：异常引爆 kafuka，见文件上方导出。
        util: { kafuka },
        enable: 'phaseUse',
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，令一名处于麻痹/烧伤/中毒的角色各引爆并移除1层',
        filterTarget(event, player, target) {
            return (
                target !== player &&
                (lib.bts.api.getAbnor(target, 'numb') ||
                    lib.bts.api.getAbnor(target, 'burn') ||
                    lib.bts.api.getAbnor(target, 'poison'))
            );
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_mosuo');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards);
            await lib.skill['bts_sk_mosuo'].util.kafuka(target, player, 1); // 源 Kafuka(p, player, 1)
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_mosuo') ? -1 : 5;
            },
            useful: 2,
            value: 4,
            result: { player: 1, target: -2 },
        },
    },
};

export const marks = {
    'bts_mk_canku-start': { markKind: 'record' },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_kafuka_skin1': '皮肤1',
    'bts_ch_kafuka_skin2': '皮肤2',
    'bts_ch_kafuka_skin3': '皮肤3',
    'bts_ch_kafuka_skin4': '皮肤4',
    'bts_ch_kafuka_skin5': '皮肤5',
    'bts_ch_kafuka_skin6': '皮肤6',
    'bts_ch_kafuka_skin7': '皮肤7',
    'bts_ch_kafuka_skin8': '皮肤8',
    'bts_ch_kafuka_skin9': '皮肤9',
    'bts_mk_canku-start': '残酷已发动',
    'bts_ch_kafuka_skin1': '皮肤1',
    'bts_ch_kafuka_skin2': '皮肤2',
    'bts_ch_kafuka_skin3': '皮肤3',
    'bts_ch_kafuka_skin4': '皮肤4',
    'bts_ch_kafuka_skin5': '皮肤5',
    'bts_ch_kafuka_skin6': '皮肤6',
    'bts_ch_kafuka_skin7': '皮肤7',
    'bts_ch_kafuka_skin8': '皮肤8',
    'bts_ch_kafuka_skin9': '皮肤9',
    bts_ch_kafuka: '卡芙卡',
    bts_sk_chanyin: '颤音',
    bts_sk_chanyin_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，这些角色各附加1层${get.poptip('bts_glossary_mabi_faq')}，然后令这些角色各结算并移除全部${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}。`,

    bts_sk_canku: '残酷',
    bts_sk_canku_info: `锁定技，当其他角色使用【杀】指定目标后，若目标没有你，你选择一项：1.视为对相同目标使用【杀】且令此技能于你下回合开始前无效，若如此做，当你以此法对目标角色造成伤害时，防止此伤害，令其附加1层${get.poptip('bts_glossary_mabi_faq')}；2.令一名角色获得你一张牌，此技能于其回合开始前无效。`,

    bts_sk_mosuo: '摩挲',
    bts_sk_mosuo_info: `出牌阶段，你可以弃置一张【杀】并选择一名处于${get.poptip('bts_glossary_mabi_faq')}/${get.poptip('bts_glossary_abnormal_burn_faq')}/${get.poptip('bts_glossary_zhongdu_faq')}的其他角色，令其结算并移除${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}各1层。`,

    '$bts_sk_chanyin1': "美妙的时光总有尽头",
    '$bts_sk_chanyin2': "该说再见了…BONG",
    '$bts_sk_canku1': "放轻松",
    '$bts_sk_canku2': "站好了",
    '$bts_sk_mosuo1': "很快就好",
    '$bts_sk_mosuo2': "这样会痛么？",
    '~bts_ch_kafuka': "这还…不是结局",
};

export const simpleTranslate = {
    bts_sk_chanyin_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+1层${get.poptip('bts_glossary_mabi_faq')}，然后各引爆并移除全部${get.poptip('bts_glossary_mabi_faq')}/${get.poptip('bts_glossary_abnormal_burn_faq')}/${get.poptip('bts_glossary_zhongdu_faq')}`,
    bts_sk_canku_info: `锁；他人用杀指定目标且目标无你时，选一项：1.视为对相同目标用杀（伤改+1${get.poptip('bts_glossary_mabi_faq')}），用后本回合不再发动；2.令1名角色获得你1张牌`,
    bts_sk_mosuo_info: `出牌阶段，弃1张【杀】令1名${get.poptip('bts_glossary_mabi_faq')}/${get.poptip('bts_glossary_abnormal_burn_faq')}/${get.poptip('bts_glossary_zhongdu_faq')}角色各引爆并移除1层`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
