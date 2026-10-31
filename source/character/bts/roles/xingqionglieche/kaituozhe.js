// 开拓者·穹（源 animal.lua L1540-1675）—— 变形/星启体系示例
// 星尘必杀技进入星启并二选一爆发，斗志积攒护盾，安息以杀换伤。
import {
    lib,
    game,
    ui,
    get,
    ai,
    _status,
    X,
    Y,
    Z,
    styleText,
    B,
    
} from '../../shared.js';

export const sort = 'xingqionglieche';
export const title = '物理·毁灭·穹'; // 属性·命途
export const intro =
    `${B('开拓者')}是星核宿主：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_xingchen'))}花${get.poptip('bts_glossary_nuqi_faq')}进入${B(get.poptip('bts_glossary_xingqi_faq'))}并可选单体爆发或AOE，` +
    `${B(get.poptip('bts_sk_douzhi'))}在自己回合清空别人手牌就攒${get.poptip('bts_glossary_hudun_faq')}，${B(get.poptip('bts_sk_anxi'))}以杀换伤。` +
    `<li>${get.poptip('bts_glossary_xingqi_faq')}后${get.poptip('bts_sk_dongtian')}/${get.poptip('bts_sk_xingchen')}类${get.poptip('bts_glossary_xingqi_faq')}技收益更高，注意${get.poptip('bts_glossary_nuqi_faq')}管理`;

// 形态变形示例：穹↔星。星为替代形态，不单独进入选将池；
// lib.bts.api.changeHero() 基于 Noname player.reinit 实现实际的头像/性别/技能/血量切换。
export const character = {
    bts_ch_kaituozhe: {
        sex: 'male',
        group: 'xingqionglieche',
        hp: 4,
        skills: [
            'bts_sk_xingchen',
            'bts_sk_douzhi',
            'bts_sk_anxi',
            // 'bts_sk_huanxing', // 焕星为扩展自有模板（源无此技能），定夺：保留代码但停用
        ],
    },
};

// 替代形态随主角色模块导出，由角色包入口合并；不作为独立 roles 文件，
// 保持"一文件一可选角色"的构建校验。
export const transformCharacter = {
    bts_ch_xing: {
        isUnseen: true,
        sex: 'female',
        group: 'xingqionglieche',
        hp: 4,
        skills: [
            'bts_sk_xingchen',
            'bts_sk_douzhi',
            'bts_sk_anxi',
            // 'bts_sk_huanxing', // 同主形态：焕星停用
        ],
    },
};

// 替代形态注册：让引擎识别「星」为开拓者的 substitute/换形。
export const characterSubstitute = {
    bts_ch_kaituozhe: [['bts_ch_xing', []]],
};

export const skill = {
    // ── 形态切换·焕星（基础架构示例，定夺：保留代码但停用）──
    // 源开拓者无此技能（源 L1830-1972 仅 3 技能；翻译表只预留 kaituozhe_1/kaituozhe_2）。
    // 原 Lua ChangeHero 由多名双形态角色调用；此处保留穹↔星模板供阿格莱雅&衣匠、
    // 遐蝶&死龙、白厄&卡厄斯兰那等角色复用（如需启用，取消注释并重新加入 character.skills）。
    // bts_sk_huanxing: {
    //     enable: 'phaseUse',
    //     usable: 1,
    //     filter(event, player) {
    //         return (
    //             player.name === 'bts_ch_kaituozhe' || player.name === 'bts_ch_xing'
    //         );
    //     },
    //     async content(event, trigger, player) {
    //         lib.bts.aiGuard.record(player, 'bts_sk_huanxing');
    //         const to =
    //             player.name === 'bts_ch_kaituozhe' ? 'bts_ch_xing' : 'bts_ch_kaituozhe';
    //         lib.bts.api.changeHero(player, to);
    //     },
    //     ai: {
    //         order(item, player) {
    //             return lib.bts.aiGuard.blocked(player, 'bts_sk_huanxing')
    //                 ? -1
    //                 : 0.1;
    //         },
    //         result: { player: 1 },
    //     },
    // },

    // ── 必杀技·星尘（源 st_xingchen，L1541-1654）──
    bts_sk_xingchen: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // audit-choosetarget: skip  —— 目标数/范围由 content 内先选的「星落(单) vs 安息(多)」效果分支决定，无法以单一技能级 selectTarget 表达；每次下限1不可取消
        enable: 'phaseUse',
        filter(event, player) {
            // enabled_at_play：怒气≥4
            return lib.bts.api.getAngry(player, 4);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_xingchen');
            lib.bts.api.loseAngry(player, 4); // 源 L1642
            // 平衡改动（定夺）：出牌阶段叠1层会被当回合结束阶段自然衰减抹掉 → 改2层（源为1）。
            lib.bts.api.addBless(player, 'god', 2, player); // 星启祝福（源 L1643）
            // 选择一项：1.星落（对一名角色造成1点伤害） 2.安息强化（无需弃牌且无目标上限）
            // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
            const choice = await player
                .chooseControl(
                    '对一名角色造成1点伤害',
                    '发动"安息"：无需弃牌，对任意名角色各造成1点伤害',
                )
                .set('prompt', '星尘：选择一项')
                // AI 口径：上方已附加星启 → 星落吃「必杀+1」实为 2 伤；安息群伤每目标 1 点。
                // 有 2 个可击杀(≤1)敌人→安息多杀（每杀回 1 怒）；有(≤2)→星落点杀；否则多敌群伤、单敌点杀
                .set('ai', () => {
                    const foes = game.players.filter(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0,
                    );
                    if (foes.filter((t) => t.hp <= 1).length >= 2) return 1;
                    if (foes.some((t) => t.hp <= 2)) return 0;
                    return foes.length >= 2 ? 1 : 0;
                })
                .forResult();
            if (!choice || !choice.control) return;
            let targets = [];
            if (choice.index === 0) {
                const r = await player
                    .chooseTarget(
                        '星尘·星落：选择一名角色',
                        [1, 1],
                        () => true, // 源 filter 仅 #targets==0（L1833-1835），允许自选（自伤可回怒气）
                    )
                    // AI 口径：只打敌方，2 伤可击杀者优先（回 1 怒）；自伤/友伤排除
                    .set('ai', (target) => {
                        if (
                            target === player ||
                            get.attitude(player, target) >= 0
                        )
                            return -1;
                        let v = -get.attitude(player, target);
                        if (target.hp <= 2) v += 2;
                        return v;
                    })
                    .forResult();
                if (!r.bool) return;
                targets = r.targets;
            } else {
                const r = await player
                    .chooseTarget(
                        '星尘·安息：选择任意名角色',
                        [1, Infinity],
                        () => true, // 源 filter return true（L1871-1873），允许自选
                    )
                    // AI 口径：群伤每目标 1 点，只打敌方；可击杀(≤1)者优先（回 1 怒）
                    .set('ai', (target) => {
                        if (
                            target === player ||
                            get.attitude(player, target) >= 0
                        )
                            return -1;
                        let v = -get.attitude(player, target) + 0.5;
                        if (target.hp <= 1) v += 2;
                        return v;
                    })
                    .forResult();
                if (!r.bool) return;
                targets = r.targets;
            }
            // 伤害 reason：源单攻 = max_xingchen（吃星启必杀+1），群攻 = st_anxi（不吃，L1840/L1881）。
            // 无名杀以 reason 命中 bts_bisha 标签判星启+1，故群攻分支须用非 bisha 的安息 reason。
            const damageReason =
                choice.index === 0 ? 'bts_sk_xingchen' : 'bts_sk_anxi';
            let killed = false;
            for (const t of targets) {
                const damage = t.damage(player, 1, 'nocard');
                damage.reason = damageReason;
                await damage;
                if (t.isDead()) killed = true;
            }
            // 选项结算完毕，若有目标死亡 → 回复1点怒气（源 L1550-1556）
            if (killed) {
                lib.bts.api.addAngry(player, 1);
                game.log(player, '因击杀回复了1点怒气');
            }
        },
        ai: {
            // AI 口径：4 怒必杀（施放即附加 2 层星启，本回合内必杀+1 生效）；星落=2 伤点杀、安息=每目标 1 伤群伤；
            // 击杀回 1 怒（源 L1550-1556）。怒气≥6 施放后有余量、乐观；<6 保守。分支选择见 content 内联 ai。
            // （源 animal.lua L1541-1654）
            order(item, player) {
                if (lib.bts?.aiGuard?.blocked(player, 'bts_sk_xingchen'))
                    return -1;
                const foes = game.players.filter(
                    (t) =>
                        t.isAlive() &&
                        t !== player &&
                        get.attitude(player, t) < 0,
                );
                if (!foes.length) return -1; // 无敌人可打，避免误伤友方
                let val = lib.bts.api.getAngry(player) >= 6 ? 6 : 3;
                if (foes.some((t) => t.hp <= 2))
                    val += 1; // 星落 2 伤可击杀（回怒）
                else if (foes.length >= 2) val += 0.5; // 安息群伤
                return val;
            },
            threaten: 2.5,
            result: {
                player: 1,
                // 目标受损：星落 2 伤（星启必杀+1）/安息 1 伤；可击杀者更低
                target: (player, target) => (target.hp <= 2 ? -4 : -1.5),
            },
        },
    },

    // ── 锁定技·斗志（源 st_douzhi，L1657-1670）──
    bts_sk_douzhi: {
        trigger: { global: 'loseEnd' },
        forced: true,
        filter(event, player) {
            // 一名角色于你的回合内失去所有手牌 → 你附加1层护盾。
            // 源 L1939-1945 未排除「持技者自己丢光手牌」（回合内弃/用尽手牌也套盾），按原版放开。
            if (_status.currentPhase !== player) return false;
            if (!event.cards?.length) return false;
            const lose = event.getl ? event.getl(event.player) : null;
            if (lose?.hs?.length && event.player.countCards('h') === 0)
                return true;
            return false;
        },
        async content(event, trigger, player) {
            lib.bts.api.addShield(player); // 源 L1665（发动由引擎自动记录）
        },
    },

    // ── 转化技·安息（源 st_anxi，L1671-1680；出牌阶段限一次）──
    bts_sk_anxi: {
        enable: 'phaseUse',
        usable: 1,
        filterCard(card, player) {
            return get.name(card) === 'sha';
        },
        selectCard: 1,
        position: 'h',
        prompt: '弃置一张【杀】，对一名角色造成1点伤害',
        filterTarget() {
            // 源 Card filter 仅 #targets==0（L1953-1955），允许自选（自伤可回怒气）
            return true;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_anxi');
            const target = event.targets[0];
            if (!target) return;
            await player.discard(event.cards);
            const damage = target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_anxi';
            await damage;
        },
        ai: {
            // AI 口径：出牌阶段限一次，弃 1 张【杀】换 1 点直伤（可自伤回怒，源 L1953-1955 允许自选）；
            // 敌方残血可击杀时提高；无【杀】时 filterCard 不放行。（源 animal.lua L1671-1680）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_anxi')) return -1;
                let val = 4;
                if (
                    game.hasPlayer(
                        (t) =>
                            t.isAlive() &&
                            t !== player &&
                            get.attitude(player, t) < 0 &&
                            t.hp <= 1,
                    )
                )
                    val += 1; // 击杀窗口
                return val;
            },
            useful: 2,
            value: 4,
            result: {
                player: 1,
                // 目标受损：1 点直伤（自伤换回怒，轻负）；可击杀者更低
                target: (player, target) => {
                    if (target === player) return -0.5; // 自伤换回怒：轻负（源允许自选）
                    return target.hp <= 1 ? -2.5 : -1.5;
                },
            },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_kaituozhe_skin1': '皮肤1',
    'bts_ch_kaituozhe_skin10': '皮肤10',
    'bts_ch_kaituozhe_skin14': '皮肤14',
    'bts_ch_kaituozhe_skin15': '皮肤15',
    'bts_ch_kaituozhe_skin16': '皮肤16',
    'bts_ch_kaituozhe_skin17': '皮肤17',
    'bts_ch_kaituozhe_skin3': '皮肤3',
    'bts_ch_kaituozhe_skin6': '皮肤6',
    'bts_ch_kaituozhe_skin8': '皮肤8',
    'bts_ch_kaituozhe_skin9': '皮肤9',
    bts_ch_kaituozhe: '开拓者',
    bts_ch_xing: '开拓者·星',
    // bts_sk_huanxing: '焕星', // 停用（见技能对象注释）
    // bts_sk_huanxing_info:
    //     '出牌阶段限一次，你可以在开拓者·穹与开拓者·星之间切换形态。',
    bts_sk_xingchen: '星尘',
    bts_sk_xingchen_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去4点${get.poptip('bts_glossary_nuqi_faq')}，附加2层${get.poptip('bts_glossary_bless_god_faq')}，然后你于此回合内的出牌阶段限一次，可以选择一项：1.对一名角色造成1点伤害；2.发动“${get.poptip('bts_sk_anxi')}”无需弃牌且无目标上限。选项结算完毕时，若有目标角色死亡，你回复1点${get.poptip('bts_glossary_nuqi_faq')}。`,

    bts_sk_douzhi: '斗志',
    bts_sk_douzhi_info: `锁定技，当一名角色于你的回合内失去所有手牌后，你附加1层${get.poptip('bts_glossary_hudun_faq')}。`,

    bts_sk_anxi: '安息',
    bts_sk_anxi_info:
        '出牌阶段限一次，你可以弃置一张【杀】并选择一名角色，对其造成1点伤害。',

    '$bts_sk_xingchen1': "规则，就是用来打破的",
    '$bts_sk_xingchen2': "你出局了！",
    '$bts_sk_xingchen3': "我来送你上路",
    '$bts_sk_xingchen4': "致胜一击！",
    '$bts_sk_douzhi1': "再坚持一下",
    '$bts_sk_douzhi2': "机不可失",
    '$bts_sk_anxi1': "尝尝这个！",
    '$bts_sk_anxi2': "轮到你了",
    '~bts_ch_kaituozhe': "是我…输了……",
    '~bts_ch_xing': "是我…输了……",
};

export const simpleTranslate = {
    bts_sk_xingchen_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失4${get.poptip('bts_glossary_nuqi_faq')}附加2层${get.poptip('bts_glossary_xingqi_faq')}，出牌阶段限一次选择一项：1.对1名角色造成1点伤害；2.发动${get.poptip('bts_sk_anxi')}（无需弃牌且无目标上限）；选项结算完毕时若有目标死亡，回复1点${get.poptip('bts_glossary_nuqi_faq')}`,
    bts_sk_douzhi_info: `锁；你的回合内，一名角色失去所有手牌后，你+1层${get.poptip('bts_glossary_hudun_faq')}`,
    bts_sk_anxi_info: '出牌阶段限一次，弃1张【杀】对1名角色造成1点伤害',
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
