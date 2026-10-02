// 大黑塔（源 animal.lua L3251-3364）—— 魔法必杀技霜伤+灵感+额外回合、视界锁定谜底、格局结束阶段追击。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'heitakongjianzhan';
export const title = '冰·智识·视界来信'; // 属性·命途
export const intro =
    `${B('大黑塔')}是${get.poptip('bts_glossary_midi_faq')}积攒BOSS：${get.poptip('bts_glossary_bisha_faq')}${B(get.poptip('bts_sk_mofa'))}对体力最高目标造成${get.poptip('bts_glossary_nature_frost_dmg_faq')}通常伤害并积攒${get.poptip('bts_glossary_linggan_faq')}与额外回合，${B(get.poptip('bts_sk_shijie'))}持续累积${get.poptip('bts_glossary_midi_faq')}，${B(get.poptip('bts_sk_geju'))}结束阶段弃【杀】追击。` +
    `<li>${get.poptip('bts_glossary_midi_faq')}≥99时${get.poptip('bts_sk_mofa')}无视体力限制；${get.poptip('bts_sk_geju')}在${get.poptip('bts_glossary_midi_faq')}≥41时有概率追加霜伤`;

export const character = {
    bts_ch_daheita: {
        sex: 'female',
        group: 'heitakongjianzhan',
        hp: 4,
        skills: ['bts_sk_mofa', 'bts_sk_shijie', 'bts_sk_geju'],
    },
};

export const skill = {
    // ── 必杀技·魔法（源 st_mofa = ZeroCardViewAsSkill，L3252-3285）──
    bts_sk_mofa: {
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
            lib.bts.aiGuard.record(player, 'bts_sk_mofa');
            lib.bts.api.loseAngry(player, 5); // 源 L3259
            // 源 L3398-3401：n（灵感）= God?2:1；m（伤害）= (God and #targets==1)?2:1 —— 二者判定独立
            const n = lib.bts.api.god(player) ? 2 : 1;
            const m = lib.bts.api.god(player) && event.targets.length === 1 ? 2 : 1;
            const maxHp = Math.max(...event.targets.map((t) => t.hp));
            const players = event.targets.filter(
                (t) => t.hp === maxHp || player.countMark('bts_mk_midi') > 98,
            );
            for (const p of players) {
                const damage = p.damage(player, m, 'nocard');
                damage.reason = 'bts_sk_mofa_bts_reason_common'; // 霜属性通常伤害
                lib.bts.api.setDamageNature(damage, 'frost');
                await damage;
            }
            player.addMark('bts_mk_linggan', n); // 源 gainMark(@linggan, n)
            lib.bts.api.extraTurn(player, 'bts_extra_turn'); // 源 extra_turn
        },
        ai: {
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_mofa')) return -1;
                // 存在敌方目标时才有出手价值（目标估值见 result.target）。
                if (
                    !game.hasPlayer(
                        (t) => t !== player && get.attitude(player, t) < 0,
                    )
                )
                    return -1;
                return 6;
            },
            threaten: 2.5,
            // AI 选目标优化（2026-10-01）：原配置只给了 result.player，无 result.target ——
            // 各候选最终收益相同且恒正，AI 会把全部角色都选进来（含友军被误伤）。
            // 技能只对「选中集内体力值最大者」造成伤害，故只纳入敌方中体力最高组；
            // 其余（低体力敌方/友方）以最终值≤0 排除。get.effect 逐目标
            // final = result.player×态度施动 + result.target×态度目标（敌方态度为负）。
            result: {
                player: 1,
                target(player, target) {
                    if (target === player) return -1;
                    if (get.attitude(player, target) >= 0) return -2;
                    const topEnemyHp = Math.max(
                        ...game
                            .filterPlayer(
                                (t) => t !== player && get.attitude(player, t) < 0,
                            )
                            .map((t) => t.hp),
                    );
                    return target.hp >= topEnemyHp ? -1 : 1;
                },
            },
        },
    },

    // ── 锁定技·视界（源 st_shijie = TriggerSkill EventPhaseStart/Damage，L3286-3311）──
    bts_sk_shijie: {
        trigger: { player: 'phaseZhunbeiBegin' },
        forced: true,
        async content(event, trigger, player) {
            player.addMark(
                'bts_mk_midi',
                game.players.filter((p) => p.isAlive()).length + 25,
            ); // 源 角色数+25
        },
        group: ['bts_sk_shijie_damage'],
        subSkill: {
            damage: {
                trigger: { global: 'damageEnd' },
                filter(event, player) {
                    return event.num > 0;
                },
                async content(event, trigger, player) {
                    let num = trigger.num;
                    if (trigger.reason?.includes('_bts_reason_common')) num = (num * 2) ** 2; // 通常伤害翻倍再平方
                    player.addMark('bts_mk_midi', num);
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 格局（源 st_geju = TriggerSkill EventPhaseStart，L3312-3364）──
    bts_sk_geju: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            return player.countCards('h') > 0;
        },
        async cost(event, trigger, player) {
            // AI 决策优化（2026-10-01）：有【杀】且存在敌方才发动（否则无伤害收益）。
            // 注意 chooseBool 默认 choice=true——不配 ai 时 AI 无条件接手，配合默认目标估值
            // 容易白弃【杀】/对友军砸伤害。
            const hasValue =
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                game.hasPlayer(
                    (t) => t !== player && get.attitude(player, t) < 0,
                );
            const r = await player
                .chooseBool(
                    '格局：是否弃置一张【杀】并选择一名其他角色？',
                    () => hasValue,
                )
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
                    '格局：选择一名其他角色',
                    [1, 1],
                    (c, p, t) => t !== p,
                    // 目标估值：优先敌方（态度为负），其中优先低体力（击杀压力）；友方排斥。
                    (c, p, t) => {
                        if (t === p) return 0;
                        const attitude = get.attitude(p, t);
                        if (attitude >= 0) return -1;
                        return -attitude * 10 - t.hp * 2;
                    },
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
            await player.discard(event.cost_data.cards); // 源：弃置【杀】移入 content 结算
            const x = event.targets[0]; // event=技能事件（自选弃牌/目标经 cost 拷入）
            const damage = x.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_geju';
            lib.bts.api.setDamageNature(damage, 'frost');
            await damage;
            if (player.countMark('bts_mk_linggan') > 0) {
                // 消耗1枚灵感：源描述（L12226"弃1枚灵感标记"）与源代码（L3326 只判有、从不
                // loseMark，源里无任何处消耗灵感）矛盾——用户定夺「按无名杀来」，保留消耗（跟随描述）。
                player.removeMark('bts_mk_linggan', 1);
                // 源 L3328：DamageLink-clear（-clear 后缀标记，每名角色回合结束 NotActive 清理，
                // 源 L1603）→ 只计"本回合内"受到过你伤害的角色。已修正：原用从不清理的
                // bts_damage_link_（全游戏累计，与军功原实现同坑，第三批已修军功、此处漏），
                // 改按当前回合 sourceDamage 历史（本回合任意阶段造成的伤害，故不加 phaseUse 限定）。
                const damagedThisTurn = new Set(
                    player
                        .getHistory('sourceDamage', (evt) => evt.num > 0 && !!evt.player)
                        .map((evt) => evt.player.playerid),
                );
                for (const p of lib.bts.api.seatOrder(
                    game.filterPlayer(
                        (p) =>
                            p.isAlive() &&
                            damagedThisTurn.has(p.playerid) &&
                            p.countCards('h') > 0,
                    ),
                )) {
                    await p.chooseToDiscard(
                        '格局：弃置一张手牌',
                        'h',
                        1,
                        true,
                    );
                }
                const midi = player.countMark('bts_mk_midi');
                if (midi > 40 && Math.random() * 100 <= midi) {
                    // 源 X% 概率
                    player.removeMark('bts_mk_midi', 41);
                    const damage2 = x.damage(player, 1, 'nocard');
                    damage2.reason = 'bts_sk_geju';
                    lib.bts.api.setDamageNature(damage2, 'frost');
                    await damage2;
                }
            }
        },
        ai: { result: { player: 1, target: -1 } },
    },
};

export const marks = {
    bts_mk_midi: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_midi_faq',
    },
    bts_mk_linggan: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_linggan_faq',
    },
};

export const translate = {
    bts_ch_daheita: '大黑塔',
    bts_sk_mofa: '魔法',
    bts_sk_mofa_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，对其中体力值最大的所有角色造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}通常伤害（若你拥有至少99枚${get.poptip('bts_glossary_midi_faq')}标记数则无视体力限制），然后你获得1枚${get.poptip('bts_glossary_linggan_faq')}标记，若如此做，此回合结束时，你执行一个额外的回合。若你为${get.poptip('bts_glossary_xingqi_faq')}，额外获得1枚${get.poptip('bts_glossary_linggan_faq')}标记，然后若以此法选择的目标数为1，伤害值+1。`,
    bts_sk_shijie: '视界',
    bts_sk_shijie_info: `锁定技，准备阶段开始时，你获得等同于角色数+25的${get.poptip('bts_glossary_midi_faq')}标记；锁定技，当一名角色造成伤害后，你获得等同于造成的伤害值的平方的${get.poptip('bts_glossary_midi_faq')}标记，若之为通常伤害，获得的标记值翻倍再平方。`,
    bts_sk_geju: '格局',
    bts_sk_geju_info: `结束阶段开始时，你可以弃置一张【杀】并选择一名其他角色，对其造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害，若你拥有${get.poptip('bts_glossary_linggan_faq')}标记，弃1枚${get.poptip('bts_glossary_linggan_faq')}标记，弃置于此回合内受到过由你造成的伤害的所有角色各一张手牌，然后若你拥有至少41枚${get.poptip('bts_glossary_midi_faq')}标记，X%你弃41枚${get.poptip('bts_glossary_midi_faq')}标记并对其造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害。`,

    '$bts_sk_mofa1': "好奇心，可是很危险的",
    '$bts_sk_mofa2': "谜题千千万万，但谜底却是…乌有之物",
    '$bts_sk_shijie1': "新世界的大门~",
    '$bts_sk_shijie2': "就得打开思路~",
    '$bts_sk_geju1': "洞见未知的瞬间，为它沉迷吧",
    '$bts_sk_geju2': "筑就空域的壁垒，就此塌落吧",
    '~bts_ch_daheita': "我还会回来……",
    bts_mk_midi: '谜底',
    bts_mk_midi_info: `来源：${get.poptip('bts_sk_shijie')}赋予；${get.poptip('bts_sk_mofa')}、${get.poptip('bts_sk_geju')}：${get.poptip('bts_glossary_bisha_faq')}更强`,
    bts_mk_linggan: '灵感',
    bts_mk_linggan_info: `来源：${get.poptip('bts_sk_mofa')}赋予；${get.poptip('bts_sk_geju')}：弃1令受伤者弃牌`,
};

export const simpleTranslate = {
    bts_sk_mofa_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失5${get.poptip('bts_glossary_nuqi_faq')}对体力最大的目标各造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}通常伤害（${get.poptip('bts_glossary_midi_faq')}≥99无视限制），+1${get.poptip('bts_glossary_linggan_faq')}并执行额外回合（${get.poptip('bts_glossary_xingqi_faq')}额外+1${get.poptip('bts_glossary_linggan_faq')}，且单目标时伤害+1）`,
    bts_sk_shijie_info: `锁；准备阶段获得角色数+25${get.poptip('bts_glossary_midi_faq')}；任何角色造成伤害后你获得${get.poptip('bts_glossary_midi_faq')}（通常伤害翻倍再平方）`,
    bts_sk_geju_info: `结束阶段，弃1杀对1名其他角色造成1点霜伤；有${get.poptip('bts_glossary_linggan_faq')}则弃1${get.poptip('bts_glossary_linggan_faq')}弃本回合由你伤过的受伤者各1手牌；${get.poptip('bts_glossary_midi_faq')}≥41时有X%弃41${get.poptip('bts_glossary_midi_faq')}再霜伤`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_midi_faq',
        name: '|谜底|',
        info: `大黑塔专属：${get.poptip('bts_sk_shijie')}获得；${get.poptip('bts_sk_geju')}若拥有至少41枚，有概率弃41枚追加霜属性伤害。`,
    },
    {
        id: 'bts_glossary_linggan_faq',
        name: '|灵感|',
        info: `大黑塔专属：${get.poptip('bts_sk_mofa')}${get.poptip('bts_glossary_bisha_faq')}获得；${get.poptip('bts_sk_geju')}弃1枚令受伤者各弃一张手牌。`,
    },
];
