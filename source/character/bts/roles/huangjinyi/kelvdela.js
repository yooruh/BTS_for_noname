// 刻律德菈（源 animal.lua L8709-8844）—— 升变与可授予的军功。
// 技能：世棋（必杀技·升变标记）、凯撒（失升变后转移/交换牌）、升变（结束阶段弃杀+标记并授予军功）、
//       军功（用/弃杀积累升变、结束阶段分摊伤害、防止必杀技伤害）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
// 军功分摊的 sourceDamage 过滤谓词（内联两处使用）：
// 源 damaged-play 仅在 damage.from 处于出牌阶段时记录（源 L1364-1365），且于每名角色
// 出牌阶段开始被 -play 清扫清零（源 L1563-1569）——故分摊只计"本出牌阶段"受害者；
// 无名杀以伤害事件父链中的 phaseUse（属于军功持有者自己）精确判定，排除响应他人回合等非出牌阶段伤害。

export const sort = 'huangjinyi';
export const title = '风·同谐·执棋的君主'; // 属性·命途
export const intro =
    `${B('刻律德菈')}用【杀】或弃【杀】攒${get.poptip('bts_glossary_shengbian_faq')}，攒够六层，就把伤害摊给这回合被她打过的人。`;

export const character = {
    bts_ch_kelvdela: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_shiqi', 'bts_sk_kaisa', 'bts_sk_shengbian'],
    },
};

export const skill = {
    // ── 必杀技·世棋（源 st_shiqi = SkillCard + ZeroCardViewAsSkill，L8710-8730）──
    // 出牌阶段，失5怒气，获得2枚升变标记；若你为星启，将手牌补至五张。
    bts_sk_shiqi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L8728）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_shiqi');
            lib.bts.api.loseAngry(player, 5); // 源 L8714：LoseAngry(player, 5)
            player.addMark('bts_mk_shengbian', 2); // 源 L8715：gainMark(@st_shengbian, 2)
            // 源 L8716-8718：星启且手牌<5时补至5张
            if (lib.bts.api.god(player) && player.countCards('h') < 5)
                await player.draw(player, 5 - player.countCards('h'));
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_shiqi')
                    ? -1
                    : 5;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·凯撒（源 st_kaisa = TriggerSkill Compulsory MarkChanged，L8732-8766）──
    // 源描述：「当其他角色获得升变标记后，你获得其一张牌，然后交给其一张牌；
    // 当你获得升变标记后，若有其他角色拥有『军功』，你将全部升变标记转移给其。」
    // 源代码作失去方向（gain<0）——同族 7 处 gain 方向与描述相反的系统性笔误，
    // 2026-10-02 用户定夺按描述方向实现（bts_mark_add，两分支结算对象随描述重构）。
    bts_sk_kaisa: {
        trigger: { global: 'bts_mark_add' },
        forced: true,
        filter(event) {
            return event.markName === 'bts_mk_shengbian' && event.num > 0;
        },
        async content(event, trigger, player) {
            // trigger=addMark 事件；trigger.player=获得升变者
            const gainer = trigger.player;
            if (!gainer || gainer === player) {
                // 分支 B（源描述）：你获得升变后，若有其他角色拥有军功，将全部升变转移给其
                const owner = game
                    .filterPlayer(
                        (target) =>
                            target !== player &&
                            target.hasSkill('bts_sk_jungong'),
                    )
                    .at(0);
                if (!owner) return;
                const count = player.countMark('bts_mk_shengbian');
                if (count) {
                    player.removeMark('bts_mk_shengbian', count);
                    owner.addMark('bts_mk_shengbian', count);
                }
                return;
            }
            // 分支 A（源描述）：其他角色获得升变后，你获得其一张牌并交给其一张牌（交换）
            if (gainer.countCards('he')) {
                await player.gainPlayerCard(gainer, 'he', true);
                if (player.countCards('h')) {
                    const give = await player
                        .chooseCard('h', '凯撒：交给获得升变者一张手牌')
                        .forResult();
                    if (give.bool) await player.give(give.cards, gainer);
                }
            }
        },
        ai: { noe: true },
    },

    // ── 触发技·升变（源 st_shengbian = TriggerSkill EventPhaseStart Finish，L8819-8842）──
    // 结束阶段开始时，可弃置一张【杀】获得1枚升变标记；若没有角色拥有军功，选择一名角色获得军功。
    bts_sk_shengbian: {
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L8823：结束阶段且手牌有【杀】可弃（无名杀把弃牌放进 cost）
            return player.getCards('h').some((card) => get.name(card) === 'sha');
        },
        async cost(event, trigger, player) {
            // 源 L8823：askForCard(player, "Slash") —— 仅选择弃【杀】，弃牌移入 content 结算
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '升变：是否弃置一张【杀】？',
                )
                .forResult();
            if (!event.result.bool) return;
            // 无军功角色时，授予军功的目标选择也并入 cost（取消则仅弃杀+1升变）
            if (
                !game.filterPlayer((target) => target.hasSkill('bts_sk_jungong')).at(0)
            ) {
                const target = await player
                    .chooseTarget(
                        '升变：选择一名角色获得军功',
                        [1, 1],
                        () => true,
                        (target) => get.attitude(player, target),
                    )
                    .forResult();
                if (target.bool) event.result.targets = target.targets;
            }
        },
        async content(event, trigger, player) {
            // cost 所选弃牌/目标在技能事件 event.cards/event.targets（标准约定）
            if (event.cards) await player.discard(event.cards); // 源：弃【杀】移入 content 结算
            player.addMark('bts_mk_shengbian', 1); // 源 L8824：gainMark(@st_shengbian)
            const target = event.targets?.[0];
            if (target) {
                // 源 L8834：acquireSkill(target, "st_jungong") —— 授予军功
                await target.addSkill('bts_sk_jungong');
                target.setStorage('bts_mk_jungong_owner', true, true);
            }
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·军功（源 st_jungong = TriggerSkill Compulsory CardUsed/CardsMoveOneTime/EventPhaseEnd/DamageCaused，L8768-8817）──
    // 使用【杀】或【决斗】、弃置【杀】后获得1枚升变标记；出牌阶段结束时，升变不少于6枚则弃6枚，
    // 对本阶段受到过你伤害的角色造成分摊伤害；防止你必杀技造成的伤害（源 L8810-8814）。
    // 爱诗『律法』诗：升变拥有者（刻律德菈）拥有爱诗时，分摊额外+1升变（源 L8800）。
    bts_sk_jungong: {
        charlotte: true,
        trigger: {
            player: ['useCard', 'loseAfter', 'phaseUseEnd'],
            source: 'damageBegin1',
        },
        forced: true,
        filter(event, player, triggername) {
            // triggername 判变体（event.name 为基名）
            if (triggername === 'useCard')
                // 源 L8773-8777：使用【杀】或【决斗】
                return ['sha', 'juedou'].includes(event.card?.name);
            if (triggername === 'loseAfter')
                // 源 L8779-8786：从手牌弃置【杀】
                return (
                    event.type === 'discard' &&
                    event.getl?.(player)?.hs?.some((card) => get.name(card) === 'sha')
                );
            if (triggername === 'phaseUseEnd')
                // 源 L8787：出牌阶段结束且升变>5，且本出牌阶段受到过你伤害的角色存在。
                // 源口径：damaged-play 于每名角色出牌阶段开始被 gamerule 的 -play 清扫清零
                // （源 L1563-1569），且仅在"伤害来源处于出牌阶段"时记录（源 L1364-1365）；
                // 无名杀以当前回合 sourceDamage 历史 + 父链 phaseUse 精确判定"你的出牌阶段"造成的伤害。
                return (
                    player.countMark('bts_mk_shengbian') >= 6 &&
                    player
                        .getHistory('sourceDamage', (evt) =>
                            evt.num > 0 &&
                            !!evt.player &&
                            evt.player !== player &&
                            evt.getParent?.('phaseUse')?.player === player,
                        )
                        .length > 0
                );
            // 源 L8810-8814：DamageCaused 且 reason 含 "max_"（必杀技）→ return true 防止
            // （对照混乱/海妖祝福同款 DamageCaused 防止范式；判定用 bts_bisha 标签，勿用 includes('st_')）
            return lib.bts.api.isBishaReason(event.reason);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'useCard' || event.triggername === 'loseAfter') {
                // 源 L8777/L8784：gainMark(@st_shengbian)
                player.addMark('bts_mk_shengbian', 1);
                return;
            }
            if (event.triggername === 'damageBegin1') {
                // 源 L8810-8814：AddNew(damage,"max_") + return true —— 防止你必杀技造成的伤害
                // （源描述"防止你必杀技造成的伤害"；原实现误标 _fatal 只免怒气仍造成伤害，已改）
                trigger.cancel();
                return;
            }
            // 源 L8787-8808：出牌阶段结束，升变>5 → 弃6枚，对本出牌阶段受到过你伤害的角色
            // 造成分摊伤害。源口径：damaged-play 于每名角色出牌阶段开始被 -play 清扫清零
            // （源 L1563-1569），且仅在"伤害来源处于出牌阶段"时记录（源 L1364-1365）；
            // 无名杀以当前回合 sourceDamage 历史 + 父链 phaseUse 精确判定你的出牌阶段伤害
            // （原用 bts_damage_link_ 全阶段累计标记、不清理，与源/描述口径不符，已改）。
            const damages = player.getHistory('sourceDamage', (evt) =>
                evt.num > 0 &&
                !!evt.player &&
                evt.player !== player &&
                evt.getParent?.('phaseUse')?.player === player,
            );
            const targets = [];
            const seen = new Set();
            let total = 0;
            for (const evt of damages) {
                total += evt.num || 0;
                if (!seen.has(evt.player.playerid)) {
                    seen.add(evt.player.playerid);
                    targets.push(evt.player);
                }
            }
            player.removeMark('bts_mk_shengbian', 6); // 源 L8798：loseMark(@st_shengbian, 6)
            // 源 L8800：若有升变拥有者（刻律德菈）拥有爱诗，军功持有者额外+1升变（『律法』诗）
            if (
                game.filterPlayer(
                    (p) =>
                        p.hasSkill('bts_sk_shengbian') && p.hasSkill('bts_sk_aishi'),
                ).length > 0
            )
                player.addMark('bts_mk_shengbian', 1);
            for (const target of targets) {
                // 源 L8805-8807：room:damage(... sum/人数)
                const damage = target.damage(
                    player,
                    Math.max(1, Math.floor(total / targets.length)),
                    'nocard',
                );
                damage.reason = 'bts_sk_jungong';
                await damage;
            }
        },
        ai: { noe: true },
    },
};

export const marks = {
    bts_mk_shengbian: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_shengbian_faq',
    },
    bts_mk_jungong_owner: {
        markKind: 'record',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_kelvdela_skin1': '皮肤1',
    'bts_ch_kelvdela_skin2': '皮肤2',
    'bts_ch_kelvdela_skin3': '皮肤3',
    'bts_ch_kelvdela_skin4': '皮肤4',
    'bts_ch_kelvdela_skin5': '皮肤5',
    'bts_ch_kelvdela_skin6': '皮肤6',
    'bts_ch_kelvdela_skin1': '皮肤1',
    'bts_ch_kelvdela_skin2': '皮肤2',
    'bts_ch_kelvdela_skin3': '皮肤3',
    'bts_ch_kelvdela_skin4': '皮肤4',
    'bts_ch_kelvdela_skin5': '皮肤5',
    'bts_ch_kelvdela_skin6': '皮肤6',
    bts_ch_kelvdela: '刻律德菈',
    bts_sk_shiqi: '世棋',
    bts_sk_shiqi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得2枚${get.poptip('bts_glossary_shengbian_faq')}标记；若你为${get.poptip('bts_glossary_xingqi_faq')}，将手牌补至五张。`,
    bts_sk_kaisa: '凯撒',
    bts_sk_kaisa_info: `锁定技，当其他角色获得${get.poptip('bts_glossary_shengbian_faq')}标记后，你获得其一张牌，然后交给其一张牌；当你获得${get.poptip('bts_glossary_shengbian_faq')}标记后，若有其他角色拥有「${get.poptip('bts_sk_jungong')}」，你将全部${get.poptip('bts_glossary_shengbian_faq')}转移给其。`,
    bts_sk_shengbian: '升变',
    bts_sk_shengbian_info: `结束阶段开始时，你可以弃置一张【杀】获得1枚${get.poptip('bts_glossary_shengbian_faq')}；若没有角色拥有${get.poptip('bts_sk_jungong')}，你选择一名角色获得${get.poptip('bts_sk_jungong')}。`,
    bts_sk_jungong: '军功',
    bts_sk_jungong_info: `锁定技，使用【杀】或【决斗】、弃置【杀】后获得${get.poptip('bts_glossary_shengbian_faq')}；出牌阶段结束时，${get.poptip('bts_glossary_shengbian_faq')}不少于6枚则弃6枚，对本阶段受到过你伤害的角色造成分摊伤害；防止你${get.poptip('bts_glossary_bisha_faq')}造成的伤害。（源描述与代码一致）`,
    bts_mk_shengbian: '升变',

    '$bts_sk_shiqi1': "败者成灰，胜者为王……",
    '$bts_sk_shiqi2': "我以「律法」之名宣判——汝等，满盘皆输！",
    '$bts_sk_kaisa1': "血战到底",
    '$bts_sk_kaisa2': "为我厮杀吧！",
    '$bts_sk_shengbian1': "请你，以身入局吧！",
    '$bts_sk_shengbian2': "哼，继续冲锋",
    '~bts_ch_kelvdela': "为了…大业……",
    bts_mk_jungong_owner: '军功来源',
};

export const simpleTranslate = {
    bts_sk_shiqi_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_shengbian_faq')}，${get.poptip('bts_glossary_xingqi_faq')}补满5张手牌`,
    bts_sk_kaisa_info: `锁；他人获得${get.poptip('bts_glossary_shengbian_faq')}时你与其换一张牌；你获得${get.poptip('bts_glossary_shengbian_faq')}时全转给${get.poptip('bts_sk_jungong')}角色`,
    bts_sk_shengbian_info: `出牌结束可弃杀+1${get.poptip('bts_glossary_shengbian_faq')}；没人拿${get.poptip('bts_sk_jungong')}时你得${get.poptip('bts_sk_jungong')}`,
    bts_sk_jungong_info: `锁；用/弃杀攒${get.poptip('bts_glossary_shengbian_faq')}，攒到6层就把伤害摊出去；自己${get.poptip('bts_glossary_bisha_faq')}伤害被防止`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_shengbian_faq',
        name: '|升变|',
        info: `刻律德菈专属：${get.poptip('bts_sk_shiqi')}${get.poptip('bts_glossary_bisha_faq')}、${get.poptip('bts_sk_shengbian')}结束弃杀、${get.poptip('bts_sk_jungong')}用/失杀各+1枚；出牌阶段结束时满6消费6枚，对最近伤害者造成伤害。`,
    },
];
