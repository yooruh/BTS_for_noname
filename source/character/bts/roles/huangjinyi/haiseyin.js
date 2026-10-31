// 海瑟音（源 animal.lua L9786-9906，V2.5）—— 绝海引爆、海妖同盟与泛音赠福。
// 技能：海曲（必杀技·附加绝海祝福）、海妖（弃1摸1；同盟：未造成过伤害的角色视为拥有）、
// 泛音（任一角色出牌阶段弃【杀】后授予海妖祝福）。
// 注：源侧 st_fanyin 有两份定义——L9886-9906 为**活代码**（无 view_as 的 TriggerSkill），
// L9977-10016 的旧版（含 view_as_skill）在 `--[[ ]]--` 块注释内；生效的是前者，故本技能**不是**死代码。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '物理·虚无·奏浪的剑棋'; // 属性·命途
export const intro =
    `${B('海瑟音')}叠${get.poptip('bts_glossary_bless_haiqu_faq')}，打人或被打一轮就清掉场上的${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}、${get.poptip('bts_glossary_zhongdu_faq')}；${get.poptip('bts_sk_haiyao')}的同盟让没造成过伤害的角色也能弃一摸一（须经她同意），${get.poptip('bts_sk_fanyin')}则把弃掉的【杀】换回${get.poptip('bts_glossary_bless_haiyao_faq')}。`;

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

    // ── 主动技·海妖（源 st_haiyao = TriggerSkill + OneCardViewAsSkill，V2.5 L9818-9885）──
    // 出牌阶段限一次，你可以弃置一张牌，然后摸一张牌。
    // 同盟：`global` 把 subSkill 里的同盟版（bts_sk_haiyao_ally）注册为**全局技能**——拥有海妖者
    // 在场时全场都能在出牌阶段看到它，是否真能发动由同盟版自己的 filter 逐人判定（未造成过伤害）。
    bts_sk_haiyao: {
        enable: 'phaseUse',
        usable: 1,
        global: 'bts_sk_haiyao_ally',
        filter(event, player) {
            // 源 enabled_at_play（L9860）：非空手（弃1摸1）
            return player.countCards('h') > 0;
        },
        filterCard(card, player) {
            return lib.filter.cardDiscardable(card, player);
        },
        selectCard: 1,
        position: 'h',
        prompt: '海妖：弃置一张牌，然后摸一张牌',
        async content(event, trigger, player) {
            await player.discard(event.cards); // 源 L9844-9849：以弃1张为代价
            await player.draw(1); // 源 L9848：drawCards(1)
        },
        subSkill: {
            ally: {
                // ── 同盟·海妖（源为 attachSkillToPlayer 挂给全场的 st_haiyao_give，L9818-9843）──
                // 全场技能，filter 逐人判定同盟资格；发动前须经海瑟音同意（其可防止之）。
                // 全局技能默认不播语音（game.trySkillAudio 对 lib.skill.global 短路），故显式开 forceaudio
                audio: 'bts_sk_haiyao',
                forceaudio: true,
                enable: 'phaseUse',
                usable: 1,
                filter(event, player) {
                    // 拥有者本人用主技，不再重复出现一个入口
                    if (player.hasSkill('bts_sk_haiyao')) return false;
                    if (player.countCards('h') <= 0) return false;
                    // 是否「造成过伤害」：整局 sourceDamage 历史（源以摘除资格实现，V2.5 描述即此口径）
                    if (player.countAllHistory('sourceDamage', (evt) => evt.num > 0)) return false;
                    // 同盟依附于海瑟音：她必须活着且仍持有海妖
                    return game.hasPlayer(
                        (owner) =>
                            owner !== player &&
                            owner.isAlive() &&
                            owner.hasSkill('bts_sk_haiyao'),
                    );
                },
                filterCard(card, player) {
                    return lib.filter.cardDiscardable(card, player);
                },
                selectCard: 1,
                position: 'h',
                prompt: '海妖：弃置一张牌，然后摸一张牌（须经海瑟音同意，其可防止之）',
                async content(event, trigger, player) {
                    // 同盟的「同意」门（源 L9825：askForSkillInvoke(owner, "st_haiyao_give")）——
                    // 海瑟音拒绝＝防止本次发动：牌不弃、牌不摸（描述「可以防止其发动此技能」）。
                    const owners = lib.bts.api.seatOrder(
                        game.filterPlayer(
                            (owner) =>
                                owner !== player &&
                                owner.hasSkill('bts_sk_haiyao'),
                        ),
                    );
                    for (const owner of owners) {
                        const allow = await owner
                            .chooseBool(
                                `海妖（同盟）：是否允许${get.translation(player)}弃一张牌并摸一张牌？`,
                            )
                            // AI 口径：盟友同意、敌人拒绝（同意与否只影响对方，无自身代价）
                            .set('ai', () => get.attitude(owner, player) >= 0)
                            .forResult();
                        if (!allow.bool) return; // 被防止
                    }
                    await player.discard(event.cards);
                    await player.draw(1);
                },
                ai: {
                    // AI 口径：海瑟音敌对时必定被防止，直接不用
                    order(item, player) {
                        const owner = game.findPlayer(
                            (target) =>
                                target !== player &&
                                target.isAlive() &&
                                target.hasSkill('bts_sk_haiyao'),
                        );
                        if (!owner || get.attitude(owner, player) < 0) return 0;
                        return player.countCards('h') > player.hp ? 3 : 0.5;
                    },
                    result: { player: 0.5 },
                },
            },
        },
        ai: {
            // AI 口径：弃1摸1 ≈ 净换牌，低分牌多时略有正收益
            order(item, player) {
                return player.countCards('h') > player.hp ? 3 : 0.5;
            },
            result: { player: 0.5 },
        },
    },

    // ── 触发技·泛音（源 st_fanyin = TriggerSkill CardsMoveOneTime，V2.5 L9886-9906）──
    // 当一名角色的【杀】于其出牌阶段内因弃置而置入弃牌堆后，你可以令其附加1层海妖祝福。
    bts_sk_fanyin: {
        trigger: { global: 'loseAfter' },
        // frequent:'check'：check 成立（弃【杀】者为自己或友方）时引擎自动确认，免去每次手点；
        // 不成立（敌方弃【杀】）时照常弹询问。口径：海妖祝福把「造成伤害」转为给受害方挂异常，
        // 交给自己或友方都是正收益（海瑟音本人还能配合海曲全场引爆），敌方默认不发动。
        //（源 AI st_fanyin=asFriend(self,data)=严格友方；V2.5 描述放开到「一名角色」→ 含自己。）
        check(trigger, player) {
            return (
                trigger.player === player ||
                get.attitude(player, trigger.player) > 0
            );
        },
        frequent: 'check',
        filter(event, player) {
            // 源 L9897：to_place=弃牌堆、reason=弃置、且为**手牌**里的【杀】、弃牌者存活并在其出牌阶段。
            // V2.5 描述写「一名角色」（不再限定「其他角色」）→ 自己弃【杀】也可发动。
            const lost = event.getl?.(event.player);
            return (
                event.type === 'discard' &&
                Boolean(event.player) &&
                event.player.isAlive() &&
                _status.currentPhase === event.player &&
                lost?.hs?.some((card) => get.name(card) === 'sha')
            );
        },
        async cost(event, trigger, player) {
            const target = trigger.player; // trigger=loseAfter 事件
            const ask = player.chooseBool(
                `泛音：是否令${get.translation(target)}获得1层海妖祝福？`,
            );
            // 本体·狂骨范式（bingshi/skill.js potkuanggu）：frequent 型触发技的自动确认须由 cost 自行
            // 转发 frequentSkill（引擎只把它挂在 <技能>_cost 事件上）；此处仅在引擎判定命中时转发。
            if (event.frequentSkill) ask.set('frequentSkill', event.skill);
            event.result = await ask
                .set(
                    'ai',
                    () =>
                        target === player ||
                        get.attitude(player, target) > 0,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L9899：AddBless(target, "@bless_haiyao", 1, p)
            await lib.bts.api.addBless(trigger.player, 'haiyao', 1, player);
        },
    },
};

export const marks = {};

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
    bts_sk_haiyao_info: `你和全场未造成过伤害的角色于各自的出牌阶段限一次，可以弃置一张牌，然后摸一张牌。未造成过伤害的角色发动此技能前，你可以防止其发动此技能。`,
    bts_sk_haiyao_ally: '海妖',
    bts_sk_haiyao_ally_info: `（${get.poptip('bts_sk_haiyao')}·同盟）出牌阶段限一次，你可以弃置一张牌，然后摸一张牌；发动前须经海瑟音同意，其可以防止之。`,
    bts_sk_fanyin: '泛音',
    bts_sk_fanyin_info: `当一名角色的【杀】于其出牌阶段内因弃置而置入弃牌堆后，你可以令其附加1层${get.poptip('bts_glossary_bless_haiyao_faq')}。`,
    bts_bless_haiqu: '绝海祝福',
    bts_bless_haiqu_info: `造成或受到伤害后，结算并移除全场${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}和${get.poptip('bts_glossary_zhongdu_faq')}；结束阶段开始时移除1层。`,
    bts_bless_haiyao: '海妖祝福',
    bts_bless_haiyao_info: `当你对其他角色造成伤害时，防止此伤害并令其附加1层${get.poptip('bts_glossary_mabi_faq')}、${get.poptip('bts_glossary_abnormal_burn_faq')}或${get.poptip('bts_glossary_zhongdu_faq')}（随机）。`,

    '$bts_sk_haiqu1': "嘘，请在此驻足静听",
    '$bts_sk_haiqu2': "这场永不餍足的深海欢宴中，来自各位的悲鸣",
    '$bts_sk_haiyao1': "迷醉吧",
    '$bts_sk_haiyao2': "张牙舞爪的虾蟹，还不足为惧",
    '$bts_sk_fanyin1': "潮汐，与我沉沦。",
    '$bts_sk_fanyin2': "盛典，不醉不归。",
    '~bts_ch_haiseyin': "终究落幕了……",
};

export const simpleTranslate = {
    bts_sk_haiqu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3${get.poptip('bts_glossary_bless_haiqu_faq')}`,
    bts_sk_haiyao_info: `你与未造成过伤害的角色出牌阶段各限一次：弃1牌摸1；后者发动前你可阻止`,
    bts_sk_haiyao_ally_info: `同盟·弃1牌摸1；发动前海瑟音可阻止`,
    bts_sk_fanyin_info: `任一角色出牌阶段弃【杀】后，可令其+1${get.poptip('bts_glossary_bless_haiyao_faq')}`,
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
