// 景元（源 animal.lua L6350-6441）—— 神君祝福与斩勘追击。
// 技能：吾身（必杀技·神君祝福+光伤）、斩勘（觉醒·攻击范围覆盖全场后+怒气+神君）、震曜（伤害后弃杀+神君）、
//       神君（出牌结束≥5神君连发【杀】）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '雷·智识·神策将军'; // 属性·命途
export const intro =
    `${B('景元')}靠${get.poptip('bts_glossary_bless_shenjun_faq')}越叠越能打；${get.poptip('bts_glossary_st_zhankan_faq')}觉醒后攻击范围罩得住全场，出牌阶段把${get.poptip('bts_glossary_bless_shenjun_faq')}【杀】连着拍到伤害关联的角色身上。`;

export const character = {
    bts_ch_jingyuan: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_wushen', 'bts_sk_zhankan', 'bts_sk_zhenyao'],
    },
};

export const skill = {
    // ── 必杀技·吾身（源 st_wushen = SkillCard + ZeroCardViewAsSkill，L6351-6375）──
    // 出牌阶段，失5怒气，获得3层神君祝福，并对至少一名攻击范围内的其他角色各造成1点虚数通常伤害
    // （星启时无距离限制）。
    bts_sk_wushen: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6373）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 L6360：目标在攻击范围内或星启
            return target !== player && (player.inRange(target) || lib.bts.api.god(player));
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wushen');
            lib.bts.api.loseAngry(player, 5); // 源 L6357：LoseAngry(player, 5)
            // 源 L6358：AddBless(player, "@bless_shenjun", 3)
            await lib.bts.api.addBless(player, 'shenjun', 3, player);
            for (const target of event.targets) {
                // 源 L6361：reason 含 "_light_common"（虚数属性 + 通常伤害）
                const damage = target.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_wushen_bts_reason_common_light';
                lib.bts.api.setDamageNature(damage, 'light');
                await damage;
            }
        },
        ai: {
            // AI 口径：失5怒=3层神君（攻距/手牌上限+3，5层连发弹药）+攻击范围内（星启全场）
            // 敌方各1点光伤；打击面越大越值（源 st_wushen，animal.lua L6351-6375）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_wushen')) return -1;
                const god = lib.bts.api.god(player);
                let n = 0; // 可打击敌方数
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (!(player.inRange(t) || god)) continue;
                    if (get.attitude(player, t) < 0) n++;
                }
                if (!n) return -1; // 无覆盖敌方不空放
                if (n >= 3) return 9;
                return n === 2 ? 8 : 6; // 单目标=1点光伤+神君资源
            },
            threaten: 2,
            result: {
                player: 1, // +3层神君（攻距/手牌上限）
                // 目标受损：1点光伤≈1.5（护盾抵扣则≈0.5）；残血击杀加码
                target: (player, target) => {
                    const shielded = lib.bts.api.getShield(target);
                    let v = shielded ? 0.5 : 1.5;
                    if (!shielded && target.hp <= 1) v += 2.5;
                    return -v;
                },
            },
        },
    },

    // ── 触发技·震曜（源 st_zhenyao = TriggerSkill Damage，L6401-6410）──
    // 造成伤害后，可弃置一张【杀】，获得2层神君祝福。
    bts_sk_zhenyao: {
        // 源 events={Damage}（以 damage.from 触发）、描述「造成伤害后」→ 应 source:，player: 会误在受伤时触发。
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            // 源 L6405：造成伤害且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L6405：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '震曜：是否弃置一张【杀】获得2层神君祝福？',
                )
                // AI 口径：弃1【杀】换2层神君（攻距/手牌上限+2）；临近5层连发线最优先，
                // 唯一【杀】且血线告急时保留（源 st_zhenyao，animal.lua L6401-6410）
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    const sj = lib.bts.api.getBless(player, 'shenjun', -1);
                    const spare =
                        player.countCards('h', (c) => get.name(c) === 'sha') - 1;
                    if (spare <= 0 && sj + 2 < 5 && player.hp <= 2) return -1;
                    return sj + 2 >= 5 && sj < 5 ? 2 : 1;
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6407：AddBless(player, "@bless_shenjun", 2)
            await lib.bts.api.addBless(player, 'shenjun', 2, player);
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·神君（源 st_shenjun = TriggerSkill EventPhaseEnd Play，L6412-6439）──
    // 出牌阶段结束时若神君祝福≥5，可移除5层：对「上一个受到你伤害的角色」用第一张【杀】，
    // 再随机对「本回合内受到你伤害」的其他角色至多3次【杀】（原版无属性）。
    bts_sk_shenjun: {
        trigger: { player: 'phaseUseEnd' },
        // 源 L6418 askForSkillInvoke（可选）；定夺「神君可选」——强制扣层会把留作攻击范围/手牌
        // 上限 buff 的祝福打掉。
        filter(event, player) {
            // 源 L6416：出牌阶段结束且神君祝福≥5
            return lib.bts.api.getBless(player, 'shenjun', 5);
        },
        async content(event, trigger, player) {
            // 源 L6418-6420：第一张【杀】指向「上一个受到你伤害的角色」（LastDamageLink 只记最近
            // 一次）；原取全历史第一个已修正。
            const allDamage = player
                .getAllHistory('sourceDamage')
                .filter((evt) => evt.num > 0 && !!evt.player);
            const last = allDamage.at(-1)?.player;
            if (!last || last === player || !last.isAlive()) return;
            // 源 L6419：RemoveBless(@bless_shenjun, 5)
            await lib.bts.api.removeBless(player, 'shenjun', 5, player);
            // 源 L6420：对上一个受伤目标使用神君【杀】（源直接 ViewAsCardOnly，无距离校验；原版无属性）
            await player.useCard({ name: 'sha', isCard: true }, last);
            // 源 L6421-6432：再随机对「本回合内受到过你伤害」的其他角色（-clear 标记回合结束清理
            // L1603）至多3次【杀】，含距离判定（canSlash L6424）；原用全游戏关联已修正。
            const thisTurn = player
                .getHistory('sourceDamage')
                .map((evt) => evt.player)
                .filter(
                    (target) =>
                        target &&
                        target.isAlive() &&
                        target !== player &&
                        player.inRange(target),
                );
            for (let i = 0; i < 3 && thisTurn.length; i++) {
                await player.useCard(
                    { name: 'sha', isCard: true },
                    thisTurn.randomGet(),
                );
            }
        },
        // AI 口径：扣5层神君（攻距/手牌上限-5）换≤4张【杀】；可打目标≥2、能击杀或层数富余时才发动
        //（源 st_shenjun，animal.lua L6412-6439；content 随机追加部分不参与判定）
        check(trigger, player, triggername, indexedData) {
            const allDamage = player
                .getAllHistory('sourceDamage')
                .filter((evt) => evt.num > 0 && !!evt.player);
            const targets = new Set();
            const last = allDamage.at(-1)?.player;
            if (last && last !== player && last.isAlive()) targets.add(last); // 首刀无距离校验
            for (const evt of player.getHistory('sourceDamage')) {
                const t = evt.player;
                if (t && t !== player && t.isAlive() && player.inRange(t))
                    targets.add(t); // 追加刀须在攻击范围内（源 L6424）
            }
            if (!targets.size) return false;
            if (targets.size >= 2) return true;
            if ([...targets].some((t) => t.hp <= 1)) return true; // 能击杀
            return lib.bts.api.getBless(player, 'shenjun', -1) >= 8; // 扣5层后仍≥3，不伤连发储备
        },
    },
};

export const marks = {
    // 斩勘：觉醒标记 + 触发逻辑（源 st_zhankan = TriggerSkill Wake，L6377-6399）：
    // 攻击范围覆盖所有其他角色后，获得3点怒气并获得神君。
    bts_sk_zhankan: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_st_zhankan_faq',
        trigger: { global: ['useCardAfter', 'dieAfter'] },
        forced: true,
        filter(event, player) {
            // 源 L6384-6389：所有其他角色都在你攻击范围内，且未觉醒
            return (
                !player.countMark('bts_sk_zhankan') &&
                game.filterPlayer((target) => target !== player).every((target) => player.inRange(target))
            );
        },
        async content(event, trigger, player) {
            // 源 L6391-6394：+怒气 + acquireSkill("st_shenjun")
            player.addMark('bts_sk_zhankan', 1);
            lib.bts.api.addAngry(player, 3); // 源 L6393：AddAngry(p, 3)
            await player.addSkill('bts_sk_shenjun'); // 源 L6394：acquireSkill
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_jingyuan_skin1': '皮肤1',
    'bts_ch_jingyuan_skin10': '皮肤10',
    'bts_ch_jingyuan_skin11': '皮肤11',
    'bts_ch_jingyuan_skin2': '皮肤2',
    'bts_ch_jingyuan_skin3': '皮肤3',
    'bts_ch_jingyuan_skin4': '皮肤4',
    'bts_ch_jingyuan_skin5': '皮肤5',
    'bts_ch_jingyuan_skin6': '皮肤6',
    'bts_ch_jingyuan_skin7': '皮肤7',
    'bts_ch_jingyuan_skin8': '皮肤8',
    'bts_ch_jingyuan_skin9': '皮肤9',
    bts_ch_jingyuan: '景元',
    bts_sk_wushen: '吾身',
    bts_sk_wushen_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得3层${get.poptip('bts_glossary_bless_shenjun_faq')}并对至少一名攻击范围内的其他角色各造成1点${get.poptip('bts_glossary_nature_light_dmg_faq')}通常伤害（${get.poptip('bts_glossary_xingqi_faq')}时无距离限制）。`,
    bts_sk_zhankan: '斩勘',
    bts_sk_zhankan_info: `觉醒技，当你的攻击范围覆盖所有其他角色后，你获得3点${get.poptip('bts_glossary_nuqi_faq')}并获得${get.poptip('bts_glossary_bless_shenjun_faq')}。`,
    bts_sk_zhenyao: '震曜',
    bts_sk_zhenyao_info: `造成伤害后，你可以弃置一张【杀】，获得2层${get.poptip('bts_glossary_bless_shenjun_faq')}。`,
    bts_sk_shenjun: '神君',
    bts_sk_shenjun_info: `出牌阶段结束时，若你拥有至少5层${get.poptip('bts_glossary_bless_shenjun_faq')}，你可以移除5层，视为对上一个受到由你造成的伤害的角色使用【杀】，然后三次视为对受到过由你造成的伤害的随机其他角色使用【杀】。`,

    '$bts_sk_wushen1': "该出奇兵了",
    '$bts_sk_wushen2': "煌煌威灵，遵吾敕命。斩无赦！",
    '$bts_sk_zhankan1': "随我冲阵",
    '$bts_sk_zhankan2': "时不我待",
    '$bts_sk_zhenyao1': "兵戈，无情！",
    '$bts_sk_zhenyao2': "雷霆，在此！",
    '$bts_sk_shenjun1': "急如律令",
    '$bts_sk_shenjun2': "哼，破绽百出",
    '~bts_ch_jingyuan': "久疏战阵了…",
    bts_bless_shenjun: '神君祝福',
    bts_bless_shenjun_info: `来源：${get.poptip('bts_sk_wushen')}、${get.poptip('bts_sk_zhenyao')}赋予；攻击范围/手牌上限+层数，${get.poptip('bts_glossary_bless_shenjun_faq')}耗5层连杀；回合结束自然减少1层`,
};

export const simpleTranslate = {
    bts_sk_wushen_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_shenjun_faq')}，给范围内至少1名其他角色各来一下${get.poptip('bts_glossary_nature_light_dmg_faq')}通常伤害`,
    bts_sk_zhenyao_info: `伤害后可弃杀+2${get.poptip('bts_glossary_bless_shenjun_faq')}`,
    bts_sk_shenjun_info: `出牌结束时${get.poptip('bts_glossary_bless_shenjun_faq')}≥5可扣5层：先对上一个被你伤过的角色用【杀】，再随机对本回合伤过的角色至多3次`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_shenjun: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_shenjun_faq',
        mod: {
            attackRange(player, range) {
                return range + lib.bts.api.getBless(player, 'shenjun', -1);
            },
            maxHandcard(player, num) {
                return num + lib.bts.api.getBless(player, 'shenjun', -1);
            },
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_shenjun_faq',
        name: '神君祝福',
        info: `你的攻击范围与手牌上限增加此${get.poptip('bts_glossary_bless_faq')}层数；拥有至少5层时可由${get.poptip('bts_glossary_bless_shenjun_faq')}移除5层发动【杀】连击。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_st_zhankan_faq',
        name: '|斩勘|',
        info: `景元专属：${get.poptip('bts_sk_zhankan')}觉醒获得，+3${get.poptip('bts_glossary_nuqi_faq')}并解锁${get.poptip('bts_sk_shenjun')}。`,
    },
];
