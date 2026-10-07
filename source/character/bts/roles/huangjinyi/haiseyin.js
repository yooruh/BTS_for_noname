// 海瑟音（源 animal.lua L8486-8598）—— 绝海引爆与海妖赠牌。
// 技能：海曲（必杀技·附加绝海祝福）、海妖（他人出牌阶段弃牌令你摸牌，受伤后失效）、泛音（他人弃杀后赠绝海祝福）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '物理·虚无·奏浪的剑棋'; // 属性·命途
export const intro =
    `${B('海瑟音')}叠${get.poptip('bts_glossary_bless_haiqu_faq')}，打人或被打一轮就清掉场上的${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}；别人出牌时，也能用${get.poptip('bts_sk_haiyao')}、${get.poptip('bts_sk_fanyin')}搭把手。`;

export const character = {
    bts_ch_haiseyin: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_haiqu', 'bts_sk_haiyao', 'bts_sk_fanyin'],
    },
};

export const skill = {
    // ── 必杀技·海曲（源 st_haiqu = SkillCard + ZeroCardViewAsSkill，L8487-8508）──
    // 出牌阶段，失5怒气，附加3层绝海祝福（组合形态时改为5层）。
    bts_sk_haiqu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L8506）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_haiqu');
            lib.bts.api.loseAngry(player, 5); // 源 L8491：LoseAngry(player, 5)
            // 源 L8492-8496：n=3，组合形态（GetXiLian）时 +2，AddBless(@bless_haiqu, n)
            await lib.bts.api.addBless(
                player,
                'haiqu',
                player.hasSkill('bts_sk_aishi') ? 5 : 3,
                player,
            );
        },
        ai: {
            // AI 口径：怒气≥5（filter 同门）才可发动；收益=3层绝海祝福（爱诗5层）——祝福期间海瑟音
            // 造成/受到伤害即结算并移除全场麻痹/烧伤/中毒（每层各=1点伤害或失去体力）；敌方异常层越多
            // 即时引爆收益越高，无异常时仅是铺场（源 animal.lua L8487-8508；源 AI max_haiqu 估值 8）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_haiqu')) return -1;
                if (!lib.bts.api.getAngry(player, 5)) return -1; // 怒气<5 且无额外怒气上限：不可用
                let value = 6; // 3层祝福底值（下次由海瑟音触发全场结算）
                if (player.hasSkill('bts_sk_aishi')) value += 1; // 组合形态『律法』诗：5层
                let burst = 0; // 敌方异常层合计：引爆即转化为即时伤害
                for (const target of game.players) {
                    if (!target.isAlive() || target === player) continue;
                    if (get.attitude(player, target) >= 0) continue;
                    burst +=
                        lib.bts.api.getAbnor(target, 'numb', -1) +
                        lib.bts.api.getAbnor(target, 'burn', -1) +
                        lib.bts.api.getAbnor(target, 'poison', -1);
                }
                value += Math.min(2, burst * 0.5); // 引爆收益封顶 +2
                return Math.min(8, value);
            },
            result: { player: 2 },
        },
    },

    // ── 触发技·海妖（源 st_haiyao = TriggerSkill EventPhaseStart/Damage，L8555-8576）──
    // 其他角色出牌阶段开始时，其可弃一张手牌令你摸一张牌；其以此法弃牌后首次受伤时效果失效
    //（源为动态挂摘 "_give" 子技能，无名杀以标记近似）。
    bts_sk_haiyao: {
        trigger: { global: 'phaseUseBegin' },
        filter(event, player) {
            // 源 L8561-8565：其他角色进入出牌阶段，且未失效（give_lose==0）
            const target = event.player;
            if (target === player) return false;
            // 源按回合限一次、每回合重新武装（hasUsed("#st_haiyao_give")）；以 bts_mk_haiyao_used
            // 近似——每次出牌阶段开始清除上轮记录（等效重挂）。
            if (target.getStorage('bts_mk_haiyao_used', false)) {
                target.setStorage('bts_mk_haiyao_used', false, true);
            }
            return (
                !target.getStorage('bts_mk_haiyao_lose', false) &&
                target.countCards('h') > 0
            );
        },
        async cost(event, trigger, player) {
            // 源 L8510-8522：由出牌者选一张手牌作代价；cost 只做选择——取消则技能干净不触发
            //（避免「看似触发却没弃牌」）。
            const target = trigger.player;
            event.result = await target
                .chooseCard(
                    'h',
                    (card) => lib.filter.cardDiscardable(card, target),
                    `海妖：是否弃置一张手牌？`,
                )
                // AI 口径：出牌者视角——弃一摸一（净换牌），出分值最低的手牌；垫底也≥6分则放弃
                //（最高分≤0→引擎取消，同风堇·虹光 ai1 范式）
                .set('ai', (card) =>
                    typeof card === 'object' && card ? 6 - get.value(card) : -1,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L8510-8512：先由在场海瑟音（player）同意，同意才弃当摸
            const target = trigger.player;
            if (!event.cards?.length) return; // cost 未弃牌则无效果
            const consent = await player
                .chooseBool(
                    `海妖：是否同意${get.translation(target)}弃置一张手牌并摸一张牌？`,
                )
                // AI 口径：弃一摸一全部归出牌者，海瑟音自身无收益——只在友方或中立时同意
                //（源 AI st_haiyao_give=asFriend(self,data,true)=isFriend 或非 isEnemy，StarRail-ai.lua L1367）
                .set('ai', () => get.attitude(player, target) >= 0)
                .forResult();
            if (!consent.bool) return; // 海瑟音拒绝：不弃牌不摸
            await target.discard(event.cards); // 结算：真正弃牌（cost 已选择，弃牌移 content）
            target.setStorage('bts_mk_haiyao_used', true, true);
            await target.draw(target, 1); // 源 L8512：出牌者 player 自己摸一张（弃一摸一）
        },
        group: ['bts_sk_haiyao_lock'],
        subSkill: {
            lock: {
                // 源 L8569-8572：出牌者受到伤害后 detach "_give" 并标记 bts_mk_haiyao_lose（失效）
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        event.player &&
                        event.player !== player &&
                        event.player.getStorage('bts_mk_haiyao_used', false) &&
                        !event.player.getStorage('bts_mk_haiyao_lose', false) &&
                        event.num > 0
                    );
                },
                async content(event, trigger, player) {
                    trigger.player.setStorage('bts_mk_haiyao_lose', true, true); // trigger=damageEnd 事件
                },
            },
        },
    },

    // ── 触发技·泛音（源 st_fanyin = TriggerSkill CardsMoveOneTime，L8578-8597）──
    // 其他角色于其出牌阶段弃置【杀】后，你可以令其获得1层海妖祝福。
    bts_sk_fanyin: {
        trigger: { global: 'loseAfter' },
        filter(event, player) {
            // 源 L8589：其他角色于其出牌阶段（Play）从手牌弃置【杀】
            const lost = event.getl?.(event.player);
            return (
                event.type === 'discard' &&
                event.player &&
                event.player !== player &&
                _status.currentPhase === event.player &&
                lost?.hs?.some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            const target = trigger.player; // trigger=loseAfter 事件
            event.result = await player
                .chooseBool(
                    `泛音：是否令${get.translation(target)}获得1层海妖祝福？`,
                )
                // AI 口径：只送友方（海妖祝福把「造成伤害」转为给受害方附加异常，交给敌方攻击者
                // 反而替受害目标上异常）（源 AI st_fanyin=asFriend(self,data)=严格友方，StarRail-ai.lua L1371）
                .set('ai', () => get.attitude(player, target) > 0)
                .forResult();
        },
        async content(event, trigger, player) {
            const target = trigger.player; // trigger=loseAfter 事件
            // 源 L8591：AddBless(target, "@bless_haiyao", 1, p)。
            await lib.bts.api.addBless(target, 'haiyao', 1, player);
        },
    },
};

export const marks = {
    bts_mk_haiyao_lose: {
        markKind: 'record',
    },
    bts_mk_haiyao_used: {
        markKind: 'record',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_haiseyin_skin1': '皮肤1',
    'bts_ch_haiseyin_skin2': '皮肤2',
    'bts_ch_haiseyin_skin3': '皮肤3',
    'bts_ch_haiseyin_skin4': '皮肤4',
    'bts_ch_haiseyin_skin5': '皮肤5',
    'bts_ch_haiseyin_skin6': '皮肤6',
    'bts_ch_haiseyin_skin7': '皮肤7',
    bts_ch_haiseyin: '海瑟音',
    bts_sk_haiqu: '海曲',
    bts_sk_haiqu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，附加3层${get.poptip('bts_glossary_bless_haiqu_faq')}。`,
    bts_sk_haiyao: '海妖',
    bts_sk_haiyao_info:
        '其他角色出牌阶段开始时，其可以弃置一张手牌，经你同意后摸一张牌；其以此法弃牌后首次受到伤害时，此效果对其失效。',
    bts_sk_fanyin: '泛音',
    bts_sk_fanyin_info: `其他角色于其出牌阶段弃置【杀】后，你可以令其获得1层${get.poptip('bts_glossary_bless_haiyao_faq')}。`,
    bts_bless_haiqu: '绝海祝福',
    bts_bless_haiqu_info: `造成或受到伤害后，结算并移除全场${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}和${get.poptip('bts_glossary_zhongdu_faq')}；结束阶段开始时移除1层。`,
    bts_bless_haiyao: '海妖祝福',
    bts_bless_haiyao_info: `当你对其他角色造成伤害时，防止此伤害并令其附加1层${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}或${get.poptip('bts_glossary_zhongdu_faq')}（随机）。`,

    '$bts_sk_haiqu1': "嘘，请在此驻足静听",
    '$bts_sk_haiqu2': "这场永不餍足的深海欢宴中，来自各位的悲鸣",
    '$bts_sk_haiyao1': "迷醉吧",
    '$bts_sk_haiyao2': "张牙舞爪的虾蟹，还不足为惧",
    '$bts_sk_fanyin1': "潮汐，与我沉沦",
    '$bts_sk_fanyin2': "盛典，不醉不归",
    '~bts_ch_haiseyin': "终究落幕了……",
    bts_mk_haiyao_lose: '海妖失效',
    bts_mk_haiyao_used: '海妖已用',
};

export const simpleTranslate = {
    bts_sk_haiqu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_haiqu_faq')}`,
    bts_sk_haiyao_info: '别人出牌时可弃1手牌，你同意则其摸1；对方首次受伤后就不能再作为目标',
    bts_sk_fanyin_info: `别人出牌阶段弃【杀】，可让他+1${get.poptip('bts_glossary_bless_haiyao_faq')}`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_haiqu: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_haiqu_faq',
        trigger: { source: 'damageEnd', player: 'damageEnd' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.num > 0 &&
                (event.source === player || event.player === player)
            );
        },
        async content(event, trigger, player) {
            for (const target of lib.bts.api.seatOrder(game.filterPlayer()))
                await lib.skill['bts_sk_mosuo'].util.kafuka(target, player);
        },
    },
    bts_bless_haiyao: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_haiyao_faq',
        trigger: { source: 'damageBegin1' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                !!event.player &&
                event.player !== player
            );
        },
        async content(event, trigger, player) {
            trigger.cancel();
            const abnormal =
                ['numb', 'burn', 'poison'][Math.floor(Math.random() * 3)];
            await lib.bts.api.addAbnormal(trigger.player, abnormal);
        },
    },
};

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_haiqu_faq',
        name: '绝海祝福',
        info: `当你造成或受到伤害后，你结算并移除所有角色的${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_bless_haiyao_faq',
        name: '海妖祝福',
        info: `当你对其他角色造成伤害时，防止此伤害并令其附加1层${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}或${get.poptip('bts_glossary_zhongdu_faq')}（随机）。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
