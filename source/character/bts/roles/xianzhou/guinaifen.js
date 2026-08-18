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
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_kanxi') ? -1 : 7;
            },
            result: { target: -2 },
        },
    },

    // ── 触发技·迎红（源 st_yinghong = TriggerSkill CardsMoveOneTime，L6233-6246）──
    // 其他角色于其回合外失去牌后，你可以弃置一张【杀】，令其附加1层烧伤。
    bts_sk_yinghong: {
        // 无名杀标准范式：守成 dcshoucheng（huicui/skill.js）——全牌移事件族 + getl 遍历找
        // 失去者 + _status.currentPhase 判回合外。界周泰·奋激为弃置限定+排除自弃，
        // 与迎红"任何失去"不符（源 CardsMoveOneTime 含出牌/自弃），故以守成为准。
        trigger: { global: ['equipAfter', 'addJudgeAfter', 'loseAfter', 'gainAfter', 'loseAsyncAfter', 'addToExpansionAfter'] },
        filter(event, player) {
            // 源 L6237-6242 三重排除：
            // ① 失去者（move.from）≠ 桂乃芬 —— 桂乃芬自己失牌（含被顺）不触发；
            // ② 移入桂乃芬手牌/装备的不触发（源 L6240-6241）——含桂乃芬顺手牵羊他人：
            //    loseAsyncAfter 事件 event.player=接收者=桂乃芬，且 getl 聚合器忽略 getlx=false、
            //    不会随空模板过滤（旧假设错误，E-01），故须显式按 event.player 排除；
            // ③ 失去者须于其回合外（_status.currentPhase 判定，源 L6239 NotActive）。
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
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    '迎红：是否弃置一张【杀】令失去牌的角色附加1层烧伤？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards?.length) await player.discard(event.cards); // 弃置所选【杀】作为代价
            // 源 L6245：AddAbnormal(target=失去者 move.from, "@abnormal_burn", 1, player)。
            // 失去者由 filter 捕获（trigger._yinghongTarget）；旧实现误用 trigger.player（接收者），
            // 顺/借等 loseAsync 事件会把烧伤加给接收者而非失去者（E-01）。
            const loser = trigger._yinghongTarget || trigger.player;
            if (!loser?.isAlive()) return;
            lib.bts.api.addAbnormal(loser, 'burn', 1, player);
        },
        ai: { result: { player: 1 } },
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
        ai: { noe: true },
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

export const pinyins = { bts_ch_guinaifen: 'guinaifen' };
