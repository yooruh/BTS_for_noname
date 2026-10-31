// 桂乃芬（源 animal.lua L5860-5923）—— 烧伤爆破与诅咒。
// 技能：看戏（必杀技·清空目标烧伤逐层无源伤害）、迎红（他人回合外失牌弃杀加烧伤）、养艺（烧伤伤害后目标+诅咒）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '火·虚无·街头艺人'; // 属性·命途
export const intro =
    `${B('桂乃芬')}引爆${get.poptip('bts_glossary_abnormal_burn_faq')}炸伤害，别人回合外还能弃【杀】继续挂火。`;

export const character = {
    bts_ch_guinaifen: {
        sex: 'female',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_sk_kanxi', 'bts_sk_yinghong', 'bts_sk_yangyi'],
    },
};

export const skill = {
    // ── 必杀技·看戏（源 st_kanxi = SkillCard + ZeroCardViewAsSkill，L5861-5889）──
    // 出牌阶段，失3怒气并选择一名有烧伤的其他角色，移除其所有烧伤并逐层造成1点无来源伤害。
    bts_sk_kanxi: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L5887）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L5864）：目标 ≠ 自己（无名杀额外要求目标有烧伤，见描述）
            return target !== player && lib.bts.api.getAbnor(target, 'burn');
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_kanxi');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L5867：LoseAngry(player, 3)
            // 源 L5868-5877：移除全部烧伤，逐层造成无来源伤害
            const layers = lib.bts.api.getAbnor(target, 'burn', -1);
            lib.bts.api.removeAbnormal(target, 'burn', layers);
            for (let i = 0; i < layers; i++) {
                const damage = target.damage(null, 1, 'nosource');
                damage.reason = 'bts_abnormal_burn';
                await damage;
            }
        },
        ai: {
            // AI 口径：敌方带烧伤且怒气≥3 时爆破；层数越值（逐层1点即时伤害）、可斩杀另加分；
            // 单层无斩杀不动（与烧伤自然 tick 每回合1点差别很小）（源 max_kanxi，animal.lua L5861-5889；源 AI StarRail-ai.lua L2496-2506）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_kanxi')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1; // 与 filter 同门
                let best = 0;
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue; // 只爆破敌方
                    const layers = lib.bts.api.getAbnor(target, 'burn', -1);
                    if (!layers) continue;
                    // 逐层1点即时伤害；≥2层再折算养艺诅咒（下次受伤追加等量，按+1计）
                    let value = layers + (layers >= 2 ? 1 : 0);
                    if (target.hp <= layers) value += 2; // 可一击斩杀
                    best = Math.max(best, value);
                }
                if (best < 2) return -1; // 收益太薄：留住怒气
                return Math.min(9, 4 + best);
            },
            result: {
                // 对敌：移除全部烧伤并逐层造成1点无来源伤害；养艺联动再叠等量诅咒
                target: (player, target) => {
                    const layers = lib.bts.api.getAbnor(target, 'burn', -1);
                    if (!layers) return 0;
                    return -(
                        layers +
                        (player.hasSkill('bts_sk_yangyi') ? layers * 0.5 : 0)
                    );
                },
            },
        },
    },

    // ── 触发技·迎红（源 st_yinghong = TriggerSkill CardsMoveOneTime，L6233-6246）──
    // 其他角色于其回合外失去牌后，你可以弃置一张【杀】，令其附加1层烧伤。
    bts_sk_yinghong: {
        // 范式：守成 dcshoucheng（huicui/skill.js）——全牌移事件族 + getl 遍历找失去者 +
        // _status.currentPhase 判回合外；界周泰·奋激为弃置限定，与迎红"任何失去"（源含出牌/自弃）不符。
        trigger: { global: ['equipAfter', 'addJudgeAfter', 'loseAfter', 'gainAfter', 'loseAsyncAfter', 'addToExpansionAfter'] },
        filter(event, player) {
            // 源 L6237-6242 三重排除：① 失去者（move.from）≠ 桂乃芬——自己失牌（含被顺）不触发；
            // ② 移入桂乃芬手牌/装备的不触发（源 L6240-6241）——含其顺手牵羊他人：loseAsyncAfter 的
            //    event.player=接收者，getl 不随空模板过滤（E-01），须按 event.player 显式排除；
            // ③ 失去者须于其回合外（_status.currentPhase，源 L6239 NotActive）。
            if (event.player === player) return false;
            // 桂乃芬须有【杀】可弃（源 askForCard(Slash)）
            if (
                !player
                    .getCards('h')
                    .some((card) => get.name(card) === 'sha')
            )
                return false;
            const target = _status.currentPhase;
            // 取失去者（源 move.from 为单一目标；hasPlayer 只判有无、取不到目标，改 filterPlayer）
            const loser = game.filterPlayer((current) => {
                // 其他角色（非桂乃芬）于其回合外（非当前回合角色）失去手牌/装备牌
                if (current === player || !current.isIn()) return false;
                if (target === current) return false; // 其回合内不算"回合外"
                // getl 取该牌移事件的来源区域（hs=手牌、es=装备）
                const evt = event.getl(current);
                if (!evt || (!evt.hs?.length && !evt.es?.length)) return false;
                return true;
            })[0];
            if (!loser) return false;
            event._yinghongTarget = loser; // 供 content 定位失去者（顺/借等事件接收者≠失去者）
            return true;
        },
        async cost(event, trigger, player) {
            // 源 L5899：askForCard(player, "Slash") —— 仅选择要弃置的【杀】（弃置移到 content）
            // AI 口径：只对敌方附加（烧伤=每回合1伤+引爆燃料），未烧伤优先（首次点燃价值更高）；
            // 弃【杀】按分值扣减，>0 才弃，最高分≤0 由引擎取消=不发动（源 AI StarRail-ai.lua L2508-2511：非敌不交）
            const loser = trigger._yinghongTarget;
            const att = loser ? get.attitude(player, loser) : 0;
            const burning = loser ? lib.bts.api.getAbnor(loser, 'burn') : false;
            const base = att < 0 ? (burning ? 4 : 5.5) : -10;
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '迎红：是否弃置一张【杀】令失去牌的角色附加1层烧伤？',
                )
                .set('ai', (card) => base - get.value(card))
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6245：AddAbnormal(失去者 move.from, "@abnormal_burn", 1, player)。
            // 失去者由 filter 捕获（trigger._yinghongTarget）；勿用 trigger.player——loseAsync 的接收者≠失去者（E-01）。
            const loser = trigger._yinghongTarget || trigger.player;
            if (!loser?.isAlive()) return;
            lib.bts.api.addAbnormal(loser, 'burn', 1, player);
        },
        ai: {
            // 发动代价=弃1张【杀】；收益=敌方+1层烧伤（负=目标受损，友方由态度加权排除）
            result: {
                player: -1,
                target: (player, target) => -1,
            },
        },
    },

    // ── 锁定技·养艺（源 st_yangyi = TriggerSkill Compulsory Damaged，L5906-5922）──
    // 角色受到烧伤造成的伤害后，其附加1层诅咒。
    bts_sk_yangyi: {
        trigger: { global: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 源 L5913：reason 含 "abnormal_burn"（烧伤伤害）
            return event.reason?.includes('bts_abnormal_burn') && event.player?.isAlive();
        },
        async content(event, trigger, player) {
            // 源 L5915：AddACurse(player=受伤者, p)（trigger=damageEnd 事件）
            lib.bts.api.addCurse(trigger.player, 1);
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_guinaifen_skin1': '皮肤1',
    'bts_ch_guinaifen_skin2': '皮肤2',
    'bts_ch_guinaifen_skin3': '皮肤3',
    bts_ch_guinaifen: '桂乃芬',
    bts_sk_kanxi: '看戏',
    bts_sk_kanxi_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择一名有${get.poptip('bts_glossary_abnormal_burn_faq')}的其他角色，移除其所有${get.poptip('bts_glossary_abnormal_burn_faq')}并逐层造成1点无来源伤害。`,
    bts_sk_yinghong: '迎红',
    bts_sk_yinghong_info: `其他角色于其回合外失去牌后，你可以弃置一张【杀】，令其附加1层${get.poptip('bts_glossary_abnormal_burn_faq')}。`,
    bts_sk_yangyi: '养艺',
    bts_sk_yangyi_info: `锁定技，角色受到${get.poptip('bts_glossary_abnormal_burn_faq')}造成的伤害后，其附加1层诅咒。`,

    '$bts_sk_kanxi1': "瞧一瞧看一看了哎！",
    '$bts_sk_kanxi2': "机会难得，给您拜个早年吧！",
    '$bts_sk_yinghong1': "花开富贵！",
    '$bts_sk_yinghong2': "恭喜发财！",
    '$bts_sk_yangyi1': "先暖个场！",
    '$bts_sk_yangyi2': "走你！",
    '~bts_ch_guinaifen': "哎呀，演砸了…",
};

export const simpleTranslate = {
    bts_sk_kanxi_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}清空目标${get.poptip('bts_glossary_abnormal_burn_faq')}并逐层造成无源伤害`,
    bts_sk_yinghong_info: `他人回合外失牌后可弃杀令其+1${get.poptip('bts_glossary_abnormal_burn_faq')}`,
    bts_sk_yangyi_info: `锁；角色受${get.poptip('bts_glossary_abnormal_burn_faq')}伤害后+1诅咒`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音
