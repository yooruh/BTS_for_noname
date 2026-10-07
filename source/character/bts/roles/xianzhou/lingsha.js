// 灵砂（源 animal.lua L6998-7094）—— 醇醉、浮元与火属性追击。
// 技能：燎霞（必杀技·醇醉异常+星启弃牌）、氛氲（得失技能后治疗受伤角色）、飞彩（受伤弃杀获浮元）、
//       浮元（必杀后/结束阶段视为用杀，防伤弃牌+炎+治疗，3次后失去）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '火·丰饶·丹鼎司司鼎'; // 属性·命途
export const intro =
    `${B('灵砂')}给对手挂${get.poptip('bts_glossary_abnormal_chunzui_faq')}，${get.poptip('bts_glossary_fuyuan_faq')}的追击能改成弃牌、挂${get.poptip('bts_glossary_nature_flame_faq')}和回血。`;

export const character = {
    bts_ch_lingsha: {
        sex: 'female',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_liaoxia', 'bts_sk_fenyun', 'bts_sk_feicai'],
    },
};

export const skill = {
    // ── 必杀技·燎霞（源 st_liaoxia = SkillCard + ZeroCardViewAsSkill，L6999-7026）──
    // 出牌阶段，失5怒气，令至少一名其他角色各附加2层醇醉异常；若你为星启，弃置这些角色各一张手牌。
    bts_sk_liaoxia: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7024）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L7002）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_liaoxia');
            lib.bts.api.loseAngry(player, 5); // 源 L7005：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L7007：AddAbnormal(p, "@abnormal_chunzui", 2)
                lib.bts.api.addAbnormal(target, 'chunzui', 2, player);
                // 源 L7009-7013：星启时弃置目标各一张手牌
                if (lib.bts.api.god(player) && target.countCards('h'))
                    await player.discardPlayerCard(target, 'h', true);
            }
        },
        ai: {
            // AI 口径：失5怒=令敌方各+2层醇醉（弃牌后手牌≤2即清空；星启再即弃1手牌）；
            // 醇醉为负面异常，只贴敌方（源 st_liaoxia，animal.lua L6999-7026）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_liaoxia')) return -1;
                const god = lib.bts.api.god(player);
                let count = 0;
                let best = 0; // 最佳单体收益
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue;
                    count++;
                    let v = 2; // 2层醇醉≈2（再弃1牌即可能清空）
                    if (t.countCards('h') > 0 && t.countCards('h') <= 2) v += 1; // 已在清空线
                    if (god && t.countCards('h')) v += 1; // 星启立即弃1手牌
                    best = Math.max(best, v);
                }
                if (!count) return -1;
                let v = 4 + best; // 5怒大招基准（含资源成本）+单体收益
                v += Math.min(count - 1, 2); // 每多一名目标+1（截断2）
                return Math.min(9, v);
            },
            result: {
                // 目标受损：2层醇醉≈-2；手牌≤2 或星启弃牌加码（源 L7007-7013）
                target: (player, target) => {
                    let v = 2;
                    if (target.countCards('h') > 0 && target.countCards('h') <= 2)
                        v += 1;
                    if (lib.bts.api.god(player) && target.countCards('h')) v += 1;
                    return -v;
                },
            },
        },
    },

    // ── 触发技·氛氲（源 st_fenyun = TriggerSkill EventAcquireSkill/EventLoseSkill，L7028-7046）──
    // 当你获得或失去技能后，你可以令一名受伤角色回复1点体力。
    bts_sk_fenyun: {
        // 无名杀引擎无 gainSkillAfter/loseSkillAfter 事件（v33.2.0 全库零命中），
        // 标准「得失技能后」时机为 changeSkillsAfter（changeSkills 事件生命周期 After，读 event.addSkill/removeSkill）。
        // 故本扩展得失技能须走 addSkills/removeSkills 包装才会触发（飞彩/浮元已改）。
        trigger: { player: 'changeSkillsAfter' },
        filter(event) {
            // 源 L7033-7037：存在受伤角色；另防空转（changeSkills 空改也触发生命周期）
            return (
                (event.addSkill?.length || event.removeSkill?.length) &&
                game.hasPlayer((target) => target.isDamaged())
            );
        },
        async cost(event, trigger, player) {
            // 源 L7039：askForPlayerChosen 选择一名受伤角色
            // AI 口径：回复1点体力只给友方（敌方不救，全负则取消发动）；伤重/濒危者优先
            //（源 st_fenyun，animal.lua L7028-7046）
            event.result = await player
                .chooseTarget(
                    '氛氲：选择一名受伤角色回复1点体力',
                    [1, 1],
                    (card, source, target) => target.isDamaged(),
                    (target) => {
                        if (get.attitude(player, target) <= 0) return -1;
                        let v = 1 + (target.maxHp - target.hp) * 0.5; // 体力缺口越大越值
                        if (target.hp <= 1) v += 2; // 濒危保命
                        return v;
                    },
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            // 源 L7042：room:recover(target, RecoverStruct(player))
            await event.targets[0].recover(player);
        },
        ai: { result: { target: 1 } },
    },

    // ── 触发技·飞彩（源 st_feicai = TriggerSkill Damaged，L7048-7057）──
    // 受到伤害后，可弃置一张【杀】，获得浮元。
    bts_sk_feicai: {
        trigger: { player: 'damageEnd' },
        filter(event, player) {
            // 源 L7052：未拥有浮元且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return (
                !player.hasSkill('bts_sk_fuyuan') &&
                player.getCards('h').some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // 源 L7052：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '飞彩：是否弃置一张【杀】获得浮元？',
                )
                // AI 口径：弃1【杀】换浮元（3次防伤追击：敌弃牌+炎+治疗最低关联者）；
                // 唯一【杀】且血线告急时保留（源 st_feicai，animal.lua L7048-7057）
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    const spare =
                        player.countCards('h', (c) => get.name(c) === 'sha') - 1;
                    if (spare <= 0 && player.hp <= 2) return -1; // 唯一杀且危险：取消
                    return 1;
                })
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L7054：acquireSkill(player, "st_fuyuan")
            // 走 addSkills 包装以触发 changeSkills 事件（氛氲 bts_sk_fenyun 依赖此时机）
            await player.addSkills(['bts_sk_fuyuan']);
        },
        ai: { result: { player: 1 } },
    },

    // ── 触发技·浮元（源 st_fuyuan = TriggerSkill CardFinished/EventPhaseStart，L7059-7092）──
    // 发动必杀技后或结束阶段开始时，可视为对攻击范围内一名其他角色使用【杀】；
    // 此【杀】造成伤害时防止伤害、弃牌+炎+治疗（见 resolver damageBegin1 浮元链）；
    // 累计发动3次后失去此技能。
    bts_sk_fuyuan: {
        // 源 st_fuyuan = TriggerSkill CardFinished/EventPhaseStart（L7059-7092），非必杀技——不标 bts_bisha
        charlotte: true,
        // damageBegin1（源 DamageCaused L1153-1175，自 resolver 迁入）：浮元【杀】造成伤害时结算浮元链。
        trigger: {
            player: ['useSkillAfter', 'phaseJieshuBegin'],
            source: 'damageBegin1',
        },
        filter(event, player, triggername) {
            if (triggername === 'damageBegin1')
                return (
                    event.card?.storage?.bts_sk_fuyuan && event.num > 0
                );
            // 源 L7064-7071：使用必杀技（max_ 技能牌）或结束阶段开始。
            // 无名杀以 bts_bisha 标签判定（勿用子串匹配如 includes('st_')）
            return (
                triggername === 'phaseJieshuBegin' ||
                lib.skill[event.skill]?.bts_bisha === true
            );
        },
        async cost(event, trigger, player) {
            // 源 L7088-7090：canSlash(p, true) and not isProhibited（距离+禁制）；
            // 无名杀以 canUse(card, target, true) 等价（同飞霄·雷狩范式）。
            // AI 口径：浮元【杀】防伤+目标弃1牌+炎，并治疗你回复过的受伤角色——只对敌方追击；
            // 有关联治疗对象时更值（源 st_fuyuan，animal.lua L7059-7092）
            event.result = await player
                .chooseTarget(
                    '浮元：视为对一名其他角色使用【杀】',
                    [1, 1],
                    (card, source, target) =>
                        target !== source &&
                        source.canUse({ name: 'sha', isCard: true }, target, true),
                    (target) => {
                        if (target === player) return -1;
                        if (get.attitude(player, target) >= 0) return -1; // 防伤≠伤害，不追击友方
                        let s = 1 - get.attitude(player, target) / 4;
                        if (
                            game.hasPlayer(
                                (c) =>
                                    c.isDamaged() &&
                                    c.countMark(
                                        `bts_recover_link_${player.playerid}`,
                                    ),
                            )
                        )
                            s += 1; // 浮元链有治疗对象
                        return s;
                    },
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 浮元链（源 DamageCaused L1153-1175）：防止伤害，弃(伤害值)张手牌，
            // 附加火属性，治疗最低体力回复关联角色。
            if (event.triggername === 'damageBegin1') {
                const target = trigger.player;
                trigger.cancel();
                if (target.countCards('h') > 0) {
                    await target.chooseToDiscard(
                        `浮元：弃置${get.cnNumber(trigger.num)}张手牌`,
                        'h',
                        [trigger.num, trigger.num],
                        true,
                    );
                }
                await lib.bts.api.addNature(target, 'flame');
                const healed = game.filterPlayer(
                    (candidate) =>
                        candidate.countMark(
                            `bts_recover_link_${player.playerid}`,
                        ) && candidate.isDamaged(),
                );
                if (healed.length) {
                    const minHp = Math.min(...healed.map((p) => p.hp));
                    const tied = healed.filter((p) => p.hp === minHp);
                    let target2 = tied[0];
                    if (tied.length > 1) {
                        // 源 L1182-1186：并列最小体力时由浮元使用者询问选择
                        const result = await player
                            .chooseTarget(
                                '浮元：选择一名角色回复1点体力',
                                [1, 1],
                                (card, source, t) => tied.includes(t),
                            )
                            // AI 口径：并列最低体力的关联角色中选态度最高者（治疗对象均为友链）
                            .set('ai', (t) => get.attitude(player, t))
                            .forResult();
                        if (!result.bool) return;
                        target2 = result.targets[0];
                    }
                    await target2.recover(player);
                }
                return;
            }
            // event=技能事件；cost 所选目标在技能事件 event.targets（标准约定）
            const target = event.targets[0];
            // 源 L7083：ViewAsCardOnly "st_fuyuan" —— 视为使用【杀】（真实【杀】，可被闪）
            await player.useCard(
                { name: 'sha', isCard: true, storage: { bts_sk_fuyuan: true } },
                target,
                'bts_sk_fuyuan',
            );
            // 源 L7084：gainMark("@fuyuan") —— 计数
            player.addMark('bts_mk_fuyuan', 1);
            // 源 L7085-7087：累计>2 次后移除浮元
            if (player.countMark('bts_mk_fuyuan') > 2) {
                player.removeMark('bts_mk_fuyuan', player.countMark('bts_mk_fuyuan'));
                // 走 removeSkills 包装以触发 changeSkills 事件（氛氲 bts_sk_fenyun 依赖此时机）
                await player.removeSkills(['bts_sk_fuyuan']);
            }
        },
    },
};

export const marks = {
    bts_mk_fuyuan: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_fuyuan_faq',
    },
};

export const translate = {
    bts_ch_lingsha: '灵砂',
    bts_sk_liaoxia: '燎霞',
    bts_sk_liaoxia_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并令至少一名其他角色各附加2层${get.poptip('bts_glossary_abnormal_chunzui_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，弃置这些角色各一张手牌。`,
    bts_sk_fenyun: '氛氲',
    bts_sk_fenyun_info:
        '当你获得或失去技能后，你可以令一名受伤角色回复1点体力。',
    bts_sk_feicai: '飞彩',
    bts_sk_feicai_info: `受到伤害后，你可以弃置一张【杀】，获得${get.poptip('bts_glossary_fuyuan_faq')}。`,
    bts_sk_fuyuan: '浮元',
    bts_sk_fuyuan_info: `发动${get.poptip('bts_glossary_bisha_faq')}后或结束阶段开始时，你可以视为对攻击范围内一名其他角色使用【杀】：此【杀】造成伤害时防止伤害，令其弃置等同于伤害值的手牌并附加${get.poptip('bts_glossary_nature_flame_faq')}，令因你而回复过体力的角色中体力值最少的角色回复1点体力；累计发动3次后失去此技能。`,

    '$bts_sk_liaoxia1': "金鳞燃犀，洞若观火",
    '$bts_sk_liaoxia2': "世间种种…不过是过眼云烟",
    '$bts_sk_fenyun1': "腥膻恶臭快些散去如何？",
    '$bts_sk_fenyun2': "还得让妾身来正本清源…",
    '$bts_sk_feicai1': "去污除秽，请",
    '$bts_sk_feicai2': "身心，需清净",
    '$bts_sk_fuyuan1': "炉香袅孤碧，云缕霏数千",
    '$bts_sk_fuyuan2': "有破绽哦",
    '~bts_ch_lingsha': "烟消…火灭……",
    bts_abnormal_chunzui: '醇醉',
    bts_mk_fuyuan: '浮元',
    bts_mk_fuyuan_info: `来源：${get.poptip('bts_glossary_fuyuan_faq')}赋予；${get.poptip('bts_glossary_fuyuan_faq')}：3次后失去`,
};

export const simpleTranslate = {
    bts_sk_liaoxia_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}令至少1名其他角色各+2${get.poptip('bts_glossary_abnormal_chunzui_faq')}，${get.poptip('bts_glossary_xingqi_faq')}各弃1手牌`,
    bts_sk_fenyun_info: '得失技能后可令1名受伤角色回复1',
    bts_sk_feicai_info: `受伤后可弃杀获得${get.poptip('bts_glossary_fuyuan_faq')}`,
    bts_sk_fuyuan_info: `${get.poptip('bts_glossary_bisha_faq')}后或结束阶段可用${get.poptip('bts_glossary_fuyuan_faq')}杀：防伤、弃N牌+炎、治疗最低关联者；3次后失去`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_abnormal_chunzui: {
        markKind: 'abnormal',
        glossaryId: 'bts_glossary_abnormal_chunzui_faq',
        trigger: { global: 'discard' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.player === player &&
                event.cards?.some((card) => card.original === 'h') &&
                lib.bts.api.getAbnor(player, 'chunzui') &&
                player.countCards('h') > 0 &&
                player.countCards('h') <= lib.bts.api.getAbnor(player, 'chunzui', -1)
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了醇醉，弃置所有手牌');
            await player.discard(player.getCards('h'));
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_abnormal_chunzui_faq',
        name: '|醇醉|',
        info: `异常状态：由技能效果赋予；弃牌后若手牌数不大于层数，弃置所有手牌。`,
    },
    {
        id: 'bts_glossary_fuyuan_faq',
        name: '|浮元|',
        info: `灵砂专属：${get.poptip('bts_sk_fuyuan')}视为【杀】，累计3次失去；可由${get.poptip('bts_sk_feicai')}弃杀重新获得。`,
    },
];
