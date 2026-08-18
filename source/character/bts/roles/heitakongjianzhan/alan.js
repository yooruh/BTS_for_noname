// 阿兰（源 animal.lua L2814-2880）—— 狂裁必杀技拿牌、至痛锁定防异常伤害、解禁反伤。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';export const sort = 'heitakongjianzhan';
export const title = '雷·毁灭·以身作引'; // 属性·命途
export const intro =
    `${B('阿兰')}是续航反击：${get.poptip('bts_glossary_bisha_faq')}${B('狂裁')}花${get.poptip('bts_glossary_nuqi_faq')}拿走多人手牌，${B('至痛')}免疫异常伤害但会触发仪式，${B('解禁')}受伤后叠${get.poptip('bts_glossary_bless_busi_faq')}并反伤。` +
    '<li>至痛触发仪式后失去技能，注意时机';

export const character = {
    bts_ch_alan: {
        sex: 'male',
        group: 'heitakongjianzhan',
        hp: 3,
        skills: ['bts_sk_kuangcai', 'bts_sk_zhitong', 'bts_sk_jiejin'],
    },
};

export const skill = {
    // ── 必杀技·狂裁（源 st_kuangcai = ZeroCardViewAsSkill，L2815-2838）──
    bts_sk_kuangcai: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(event, player, target) {
            if (target === player || target.countCards('h') === 0) return false;
            // 源 L2916：#targets <= max(getLostHp,1) or God —— 非星启上限 = X
            return (
                lib.bts.api.god(player) ||
                ui.selected.targets.length <
                    Math.max(player.maxHp - player.hp, 1)
            );
        },
        selectTarget(card, player) {
            // 源 L2918-2920 feasible：#targets == X or God —— 非星启硬性恰好 X 名，
            // 星启不限目标数。无名杀 selectTarget 函数式返回 [min,max]。
            // 引擎解析技能配置的函数式 selectTarget 一律零参（get.select(fn) → fn()；技能按钮评估
            // game.check 与实际选目标流程皆然），使用者从事件栈取（官方范式 _status.event.player；
            // 与 mod.selectTarget(card, player, range) 的 checkMod 带参约定区分——本函数两种姿势兼容）。
            player ??= _status.event?.player;
            if (!player) return [1, 1]; // 兜底：无上下文（异常调用）不崩；正常流程由 filterTarget 控上限
            return lib.bts.api.god(player)
                ? [1, Infinity]
                : [Math.max(player.maxHp - player.hp, 1), Math.max(player.maxHp - player.hp, 1)];
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_kuangcai');
            lib.bts.api.loseAngry(player, 3); // 源 L2833
            for (const t of event.targets || []) {
                // 源 L2925-2926：askForCardChosen(p, "he") + obtainCard —— 获得一张手牌或装备牌
                await player.gainPlayerCard(t, 'he', 'visible');
            }
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_kuangcai')
                    ? -1
                    : 5;
            },
            result: { player: 1, target: -1 },
        },
    },

    // ── 锁定技·至痛（源 st_zhitong = TriggerSkill Compulsory DamageInflicted/Damaged，L2839-2861）──
    bts_sk_zhitong: {
        trigger: { player: 'damageBegin2' },
        forced: true,
        filter(event, player) {
            return event.reason?.includes('abnormal');
        },
        async content(event, trigger, player) {
            trigger.cancel(); // 防止此异常伤害（取消触发事件 damageBegin2）
            player.addMark('bts_sk_zhitong', 1);
        },
        group: ['bts_sk_zhitong_lose'],
        subSkill: {
            lose: {
                trigger: { player: 'damageEnd' },
                filter(event, player) {
                    return player.countMark('bts_sk_zhitong') > 0 && event.num > 0;
                },
                async content(event, trigger, player) {
                    player.removeMark(
                        'bts_sk_zhitong',
                        player.countMark('bts_sk_zhitong'),
                    );
                    player.removeSkill('bts_sk_zhitong'); // 源 detachSkillFromPlayer：失去此技能
                },
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 解禁（源 st_jiejin = TriggerSkill Damaged，L2862-2880）──
    bts_sk_jiejin: {
        trigger: { player: 'damageEnd' },
        logTarget: (trigger, player) => trigger.source,
        filter(event, player) {
            // 源 L2974：getHp() >= 1（不是 >1）；无来源伤害也附加不死祝福（L2975-2976）
            return player.hp >= 1 && event.num > 0;
        },
        async cost(event, trigger, player) {
            // 源 askForSkillInvoke 可选（描述「你可以」）；无名杀原实现自动发动，补选择权
            event.result = await player
                .chooseBool('解禁：是否附加1层不死祝福并对来源造成1点伤害？')
                .forResult();
        },
        async content(event, trigger, player) {
            await lib.bts.api.addBless(player, 'busi'); // 源 AddBless(@bless_busi)
            // 源 L2976-2980：仅在有来源时反伤（无来源伤害只附加不死祝福）
            if (trigger.source)
                await trigger.source.damage(player, 1, 'nocard').set("reason", 'bts_sk_jiejin');
        },
        ai: {
            result: { player: 1, target: -1 },
        },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_alan_skin1': '皮肤1',
    bts_ch_alan: '阿兰',
    bts_sk_kuangcai: '狂裁',
    bts_sk_kuangcai_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}并选择X名有手牌的其他角色（X为你已损失的体力值且至少为1，若你为${get.poptip('bts_glossary_xingqi_faq')}则无限制），获得这些角色各一张牌（手牌或装备牌）。`,
    bts_sk_zhitong: '至痛',
    bts_sk_zhitong_info:'锁定技，当你受到由异常造成的伤害时，防止此伤害。仪式：当你受到伤害后，失去此技能。',
    bts_sk_jiejin: '解禁',
    bts_sk_jiejin_info: `当你受到伤害后，若你的体力值不小于1，你可以附加1层${get.poptip('bts_glossary_bless_busi_faq')}，对来源造成1点伤害。`,

    '$bts_sk_kuangcai1': "这点疼痛不足挂齿",
    '$bts_sk_kuangcai2': "而你们将会，痛苦万倍！嘿啊！",
    '$bts_sk_zhitong1': "嗯？",
    '$bts_sk_zhitong2': "真碍事",
    '$bts_sk_jiejin1': "成全你们",
    '$bts_sk_jiejin2': "都给我闭嘴",
    '~bts_ch_alan': "不能保护大家了……",
};

export const simpleTranslate = {
    bts_sk_kuangcai_info: `${get.poptip('bts_glossary_bisha_faq')}；出牌阶段，失3${get.poptip('bts_glossary_nuqi_faq')}获得最多X名（X=已损失体力，${get.poptip('bts_glossary_xingqi_faq')}无限制）有手牌角色各1张牌`,
    bts_sk_zhitong_info: '锁；防止异常造成的伤害，之后受到伤害后失去此技能',
    bts_sk_jiejin_info: `受到伤害后，若体力≥1可+1${get.poptip('bts_glossary_bless_busi_faq')}并对来源造成1点伤害`,
};

export const pinyins = { bts_ch_alan: 'alan' };
