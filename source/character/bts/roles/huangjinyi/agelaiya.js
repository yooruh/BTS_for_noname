// 阿格莱雅（源 animal.lua L7350-7460）—— 衣匠忆灵组合模板。
// 技能：共舞（必杀技·至高之姿+召唤衣匠）、金玫（伤害空手/麻痹/光目标弃牌）、名讳（回合末弃杀召唤衣匠）、
//       衣匠：匠躯（受伤弃牌）、飞驰（出牌结束光属性关联）、刺纹（决斗指定光伤）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '雷·记忆·黄金裔的织者'; // 属性·命途
export const intro =
    `${B('阿格莱雅')}召唤${get.poptip('bts_ch_yijiang')}进入组合形态，拿${get.poptip('bts_glossary_nature_light_faq')}与决斗撕开战线。`;

export const character = {
    bts_ch_agelaiya: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_gongwu', 'bts_sk_jinmeiag', 'bts_sk_minghui'],
    },
};

export const transformCharacter = {
    // 衣匠（源 yijiang，L7409 起）：阿格莱雅的忆灵，3体力。
    bts_ch_yijiang: {
        isUnseen: true,
        sex: 'male',
        group: 'huangjinyi',
        hp: 3,
        skills: ['bts_sk_jiangqu', 'bts_sk_feichi', 'bts_sk_ciwen'],
    },
    // 组合形态（源 agelaiya_and_yijiang，L7454-7460）：7体力，技能并集。
    bts_ch_agelaiya_and_yijiang: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 7,
        skills: [
            'bts_sk_gongwu',
            'bts_sk_jinmeiag',
            'bts_sk_minghui',
            'bts_sk_jiangqu',
            'bts_sk_feichi',
            'bts_sk_ciwen',
        ],
    },
};

// 替代形态注册：阿格莱雅召唤衣匠进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_ch_agelaiya: [['bts_ch_agelaiya_and_yijiang', []]],
};

export const skill = {
    // ── 必杀技·共舞（源 st_gongwu = SkillCard + ZeroCardViewAsSkill，L7351-7377）──
    // 出牌阶段，失5怒气，附加3层至高之姿；召唤衣匠（已存在则回复至组合形态体力），然后执行额外回合。
    bts_sk_gongwu: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7375）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_gongwu');
            lib.bts.api.loseAngry(player, 5); // 源 L7355：LoseAngry(player, 5)
            // 源 L7356：AddBless(player, "@bless_zhigaozhizi", 3)
            await lib.bts.api.addBless(player, 'zhigaozhizi', 3, player);
            if (lib.bts.api.getPet(player, 'yijiang')) {
                // 源 L7357-7359 + GetPetLostHp（L884-888）：已召唤衣匠 → 回复 忆灵上限−当前忆灵生命
                //（2026-09-02 统一生命池后改真 GetPetLostHp，替换原 maxHp−hp 近似）
                const lost = lib.bts.api.getPetLostHp(player, 'yijiang');
                if (lost) await player.recover(player, lost);
            } else {
                // 源 L7360：AddPet(player, "yijiang") —— 召唤衣匠
                await lib.bts.api.addPet(player, 'yijiang');
            }
            // 源 L7362：addPlayerMark(player, "extra_turn") —— 额外回合
            lib.bts.api.extraTurn(player, 'bts_extra_turn');
            // 源 L7363-7365：Global_PlayPhaseTerminated（结束本出牌阶段），GetXiLian(爱诗) 时除外
            if (!player.hasSkill('bts_sk_aishi'))
                lib.bts.api.endPlayPhase(player);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_gongwu')
                    ? -1
                    : 7;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·金玫（源 st_jinmei = TriggerSkill Compulsory Damage，L7379-7390）──
    // 你对虚数或麻痹角色造成伤害后，其弃置一张手牌。
    bts_sk_jinmeiag: {
        trigger: { source: 'damageEnd' },
        forced: true,
        filter(event, player) {
            // 源 L7385：目标有手牌、处于麻痹或为虚数角色、且可弃手牌
            return (
                event.player?.countCards('h') &&
                (lib.bts.api.getAbnor(event.player, 'numb') ||
                    lib.bts.api.getNature(null, event.player) === 'light')
            );
        },
        async content(event, trigger, player) {
            // 源 L7387：askForDiscard(damage.to, 1, 1) —— 目标弃置一张手牌（trigger=damageEnd 事件）
            await trigger.player.chooseToDiscard('金玫：弃置一张手牌', 'h', 1, true);
        },
        ai: { noe: true },
    },

    // ── 触发技·名讳（源 st_minghui = TriggerSkill EventPhaseStart NotActive，L7392-7407）──
    // 回合结束后，可弃置一张【杀】：衣匠已存在则回复1点体力；否则召唤衣匠并执行额外回合。
    bts_sk_minghui: {
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        trigger: { player: 'phaseEnd' },
        filter(event, player) {
            // 源 L7396-7400：回合结束（NotActive）且手牌有【杀】可弃；
            // 源 L7397：衣匠存在时仅受伤（isWounded）才提供恢复分支，满血不发起
            const hasPet = lib.bts.api.getPet(player, 'yijiang');
            return (
                player.getCards('h').some((card) => get.name(card) === 'sha') &&
                (!hasPet || player.isDamaged())
            );
        },
        async cost(event, trigger, player) {
            // 源 L7397/7400：askForCard(player, "Slash") —— 仅选择弃【杀】，弃牌移入 content 结算
            const hasPet = lib.bts.api.getPet(player, 'yijiang');
            event.result = await player
                .chooseCard(
                    'h',
                    (card) =>
                        get.name(card) === 'sha' &&
                        lib.filter.cardDiscardable(card, player),
                    hasPet
                        ? '名讳：是否弃置一张【杀】回复1点体力？'
                        : '名讳：是否弃置一张【杀】召唤衣匠并执行额外回合？',
                )
                .forResult();
        },
        async content(event, trigger, player) {
            if (event.cards) await player.discard(event.cards); // cost 所选弃牌
            const hasPet = lib.bts.api.getPet(player, 'yijiang');
            if (hasPet) {
                // 源 L7398-7399：回复1点体力
                await player.recover(player);
            } else {
                // 源 L7402-7403：召唤衣匠并执行额外回合
                await lib.bts.api.addPet(player, 'yijiang');
                lib.bts.api.extraTurn(player, 'bts_extra_turn');
            }
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·匠躯（源 st_jiangqu = TriggerSkill Compulsory Damaged）──
    // 你受到伤害后，弃置所有手牌（源已更新为 throwAllHandCards；2026-10-02 跟改）。
    bts_sk_jiangqu: {
        trigger: { player: 'damageEnd' },
        forced: true,
        filter(event, player) {
            return player.countCards('h') > 0;
        },
        async content(event, trigger, player) {
            // 源（现行）throwAllHandCards = 弃置所有手牌
            await player.discard(player.getCards('h'));
        },
        ai: { noe: true },
    },

    // ── 锁定技·飞驰（源 st_feichi = TriggerSkill Compulsory EventPhaseEnd Play，L7423-7437）──
    // 出牌阶段结束时，若你造成过伤害，令所有伤害关联角色获得虚数属性。
    bts_sk_feichi: {
        trigger: { player: 'phaseUseEnd' },
        forced: true,
        filter(event, player) {
            // 源 L7428：出牌阶段且伤害标记 > 0（本回合造成过伤害）
            return player.getHistory('sourceDamage').length > 0;
        },
        async content(event, trigger, player) {
            // 源 L7429-7434：对所有 LastDamageLink 角色 AddNature(p, "light")；
            // 用无名杀本体的 sourceDamage 历史直接取“最近伤害目标”（最后一条的受害者），
            // 等价源“令最近伤害关联角色获得虚数属性”，不再依赖自维护的 LastDamagedLink 标记。
            const history = player.getHistory('sourceDamage');
            const target = history[history.length - 1]?.player;
            if (target?.isAlive())
                await lib.bts.api.addNature(target, 'light');
        },
        ai: { noe: true },
    },

    // ── 锁定技·刺纹（源 st_ciwen = TriggerSkill Compulsory TargetSpecified，L7439-7452）──
    // 你使用【决斗】指定目标后，对其造成1点虚数伤害。
    bts_sk_ciwen: {
        trigger: { player: 'useCardToPlayered' },
        forced: true,
        filter(event) {
            // 源 L7445：使用【决斗】指定目标
            return event.card?.name === 'juedou' && !!event.target;
        },
        async content(event, trigger, player) {
            // 源 L7448：reason 含 "_light" 的伤害（trigger=useCardToPlayered 事件）
            const damage = trigger.target.damage(player, 1, 'nocard');
            damage.reason = 'bts_sk_ciwen_light';
            lib.bts.api.setDamageNature(damage, 'light');
            await damage;
        },
        ai: { noe: true },
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_agelaiya_skin1': '皮肤1',
    'bts_ch_agelaiya_skin2': '皮肤2',
    'bts_ch_agelaiya_skin3': '皮肤3',
    'bts_ch_agelaiya_skin4': '皮肤4',
    'bts_ch_agelaiya_skin5': '皮肤5',
    'bts_ch_agelaiya_skin1': '皮肤1',
    'bts_ch_agelaiya_skin2': '皮肤2',
    'bts_ch_agelaiya_skin3': '皮肤3',
    'bts_ch_agelaiya_skin4': '皮肤4',
    'bts_ch_agelaiya_skin5': '皮肤5',
    'bts_ch_agelaiya_skin1': '皮肤1',
    'bts_ch_agelaiya_skin2': '皮肤2',
    'bts_ch_agelaiya_skin3': '皮肤3',
    'bts_ch_agelaiya_skin4': '皮肤4',
    'bts_ch_agelaiya_skin5': '皮肤5',
    bts_ch_agelaiya: '阿格莱雅',
    bts_ch_yijiang: '衣匠',
    bts_ch_agelaiya_and_yijiang: '阿格莱雅&衣匠',
    bts_pet_yijiang: '衣匠',
    bts_sk_gongwu: '共舞',
    bts_sk_gongwu_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，附加3层至高之姿${get.poptip('bts_glossary_bless_faq')}并召唤${get.poptip('bts_ch_yijiang')}；若${get.poptip('bts_ch_yijiang')}已存在，改为回复体力。然后执行一个额外回合。`,
    bts_sk_jinmeiag: '金玫',
    bts_sk_jinmeiag_info: `锁定技，当你对${get.poptip('bts_glossary_nature_light_faq')}或处于${get.poptip('bts_glossary_mabi_faq')}的角色造成伤害后，若其有手牌，其弃置一张手牌。`,
    bts_sk_minghui: '名讳',
    bts_sk_minghui_info:
        `回合结束后，你可以弃置一张【杀】：若${get.poptip('bts_ch_yijiang')}已存在，你回复1点体力；否则召唤${get.poptip('bts_ch_yijiang')}并执行一个额外回合。`,
    bts_sk_jiangqu: '匠躯',
    bts_sk_jiangqu_info: '锁定技，受到伤害后，弃置所有手牌。',
    bts_sk_feichi: '飞驰',
    bts_sk_feichi_info: `锁定技，出牌阶段结束时，若你造成过伤害，令最近伤害关联角色获得${get.poptip('bts_glossary_nature_light_faq')}。`,
    bts_sk_ciwen: '刺纹',
    bts_sk_ciwen_info: `锁定技，当你使用【决斗】指定目标后，对其造成1点${get.poptip('bts_glossary_nature_light_dmg_faq')}伤害。`,

    '$bts_sk_gongwu1': "万缕千丝，在我指尖",
    '$bts_sk_gongwu2': "你我的命运，由此交织",
    '$bts_sk_jinmeiag1': "伪饰",
    '$bts_sk_jinmeiag2': "一针见血才好",
    '$bts_sk_minghui1': "沐浴黄金",
    '$bts_sk_minghui2': "予你盛装",
    '$bts_sk_ciwen1': "生命啊，脆若游丝",
    '$bts_sk_feichi1': "裁断之时",
    '$bts_sk_jiangqu1': "静息宁神，启示便会显现",
    '$bts_sk_ciwen2': "谎言啊，纤毫毕现",
    '$bts_sk_feichi2': "与我共舞",
    '$bts_sk_jiangqu2': "阻碍重重",
    '~bts_ch_agelaiya': "作茧…自缚……",
    '~bts_ch_yijiang': "作茧…自缚……",
    bts_bless_zhigaozhizi: '至高之姿祝福',
    bts_bless_zhigaozhizi_info: `来源：${get.poptip('bts_glossary_bless_gongwu_faq')}赋予；杀当决斗、光伤后+层；回合结束自然减少1层`,

    '~bts_ch_agelaiya_and_yijiang': "作茧…自缚……",
};

export const simpleTranslate = {
    bts_sk_gongwu_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+3至高之姿，召唤${get.poptip('bts_ch_yijiang')}（已存在则回复），额外回合`,
    bts_sk_jinmeiag_info: `锁；对${get.poptip('bts_glossary_nature_light_faq')}或${get.poptip('bts_glossary_mabi_faq')}角色造成伤害后其弃1手牌`,
    bts_sk_minghui_info: `回合结束可弃杀：有${get.poptip('bts_ch_yijiang')}则回复，否则召唤并额外回合`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const marks = {
    bts_pet_yijiang: {
        // 忆灵体力（lib.bts.api 忆灵系统，markKind:'pet' 使体力可见）
        markKind: 'pet',
    },
};

export const buffSkills = {
    bts_bless_zhigaozhizi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_zhigaozhizi_faq',
        trigger: { source: 'damageEnd', player: 'useCard' },
        forced: true,
        silent: true,
        filter(event, player, triggername) {
            if (triggername === 'useCard') {
                const card = event.card;
                return (
                    event.player === player &&
                    !!card &&
                    card.name === 'sha' &&
                    lib.bts.api.getBless(player, 'zhigaozhizi')
                );
            }
            return (
                event.source === player &&
                event.num > 0 &&
                lib.bts.api.getNature(event) === 'light'
            );
        },
        async content(event, trigger, player) {
            if (event.triggername === 'useCard') {
                const card = trigger.card;
                const duel = get.autoViewAs(
                    { name: 'juedou', suit: card.suit, number: card.number },
                    trigger.cards,
                );
                duel.storage = { ...(card.storage || {}) };
                trigger.card = duel;
                game.log(player, '触发了至高之姿祝福，此【杀】视为【决斗】');
                return;
            }
            await lib.bts.api.addBless(player, 'zhigaozhizi', 1, player);
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_zhigaozhizi_faq',
        name: '至高之姿祝福',
        info: `你的【杀】视为【决斗】；当你造成光属性伤害后，附加1层此${get.poptip('bts_glossary_bless_faq')}。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
];
