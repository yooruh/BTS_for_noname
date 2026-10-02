// 长夜月（源 animal.lua L8845-8960）—— 长夜忆灵组合模板。
// 技能：无眠（必杀技·至暗之谜+召唤长夜）、同行（扣血得忆质+致命）、咒礼（结束阶段失体召唤长夜）、
//       长夜：漆黑（源占位空技能、重召回血在 AddPet）、余露（忆质≥8霜伤收束）、夜影（距离修正）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '冰·记忆·隐秘的陌客'; // 属性·命途
export const intro =
    `${B('长夜月')}靠${get.poptip('bts_glossary_bless_zhianzhimi_faq')}攒${get.poptip('bts_glossary_yizhi_faq')}，召出${get.poptip('bts_ch_changye')}再用余露的霜伤收尾。`;

export const character = {
    bts_ch_changyeyue: {
        sex: 'female',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_wumian', 'bts_sk_tongxing', 'bts_sk_zhouli'],
    },
};

export const transformCharacter = {
    // 长夜（源 changye，L8907 起）：长夜月的忆灵，1体力。
    bts_ch_changye: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 1,
        skills: ['bts_sk_qihei', 'bts_sk_yulu', 'bts_sk_yeying'],
    },
    // 组合形态（源 changyeyue_and_changye，L8954-8960）：5体力，技能并集。
    bts_ch_changyeyue_and_changye: {
        isUnseen: true,
        sex: 'female',
        group: 'huangjinyi',
        hp: 5,
        skills: [
            'bts_sk_wumian',
            'bts_sk_tongxing',
            'bts_sk_zhouli',
            'bts_sk_qihei',
            'bts_sk_yulu',
            'bts_sk_yeying',
        ],
    },
};

// 替代形态注册：长夜月召唤长夜进入组合形态的 substitute 登记。
export const characterSubstitute = {
    bts_ch_changyeyue: [['bts_ch_changyeyue_and_changye', []]],
};

export const skill = {
    // ── 必杀技·无眠（源 st_wumian = SkillCard + ZeroCardViewAsSkill，L8846-8868）──
    // 出牌阶段，失5怒气，附加2层至暗之谜祝福（星启改为4层），并召唤长夜。
    bts_sk_wumian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L8866）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_wumian');
            lib.bts.api.loseAngry(player, 5); // 源 L8850：LoseAngry(player, 5)
            // 源 L8851-8855：AddBless(@bless_zhianzhimi, n)，星启时 n=4 否则 n=2
            await lib.bts.api.addBless(
                player,
                'zhianzhimi',
                lib.bts.api.god(player) ? 4 : 2,
                player,
            );
            // 源 L8856：AddPet(player, "changye")
            await lib.bts.api.addPet(player, 'changye');
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_wumian')
                    ? -1
                    : 7;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·同行（源 st_tongxing = TriggerSkill Compulsory HpChanged，L9228-9246）──
    // 扣减体力后，获得1枚忆质；若拥有至暗之谜祝福，改为7枚。然后若没有致命祝福，附加1层。
    bts_sk_tongxing: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        forced: true,
        filter(event) {
            // 源 L9233：扣减量>0
            return lib.bts.api.getLostHp(event) > 0;
        },
        async content(event, trigger, player) {
            // 源 L9236-9240：n=1，有至暗之谜则 ×7，gainMark("@yizhi", n)（trigger=伤害/失血事件）。
            // 定夺 2026-09-12（C-03）：倍率对齐源改 ×7；源基数固定 1/7（按事件计），
            // 端口沿用 lostHp 失血量作基数（既有取舍，仅倍率按定夺对齐）。
            const amount =
                lib.bts.api.getLostHp(trigger) *
                (lib.bts.api.getBless(player, 'zhianzhimi') ? 7 : 1);
            player.addMark('bts_mk_yizhi', amount);
            // 源 L8885-8887：无致命祝福则附加1层
            if (!lib.bts.api.getBless(player, 'fatal'))
                await lib.bts.api.addBless(player, 'fatal', 1, player);
        },
        ai: { noe: true },
    },

    // ── 触发技·咒礼（源 st_zhouli = TriggerSkill EventPhaseStart Finish，L8892-8905）──
    // 结束阶段开始时，可失去1点体力，召唤长夜。
    bts_sk_zhouli: {
        // 召唤忆灵的技能均为 unique:true（用户定夺 2026-09-02）
        unique: true,
        trigger: { player: 'phaseJieshuBegin' },
        filter(event, player) {
            // 源 L8896：结束阶段且未召唤长夜（无名杀在 filter 排除已召唤）
            return !lib.bts.api.getPet(player, 'changye');
        },
        async cost(event, trigger, player) {
            // 源 L8896-8898：askForSkillInvoke 确认（仅选择），失体移入 content 结算
            const result = await player
                .chooseBool('咒礼：是否失去1点体力并召唤长夜？')
                .forResult();
            event.result = { bool: result.bool };
        },
        async content(event, trigger, player) {
            await player.loseHp(); // 源 L8898：room:loseHp(player)
            // 源 L8899：AddPet(player, "changye")
            await lib.bts.api.addPet(player, 'changye');
            // 源 L8900-8902：源为 GetXiLian 时额外 +1 忆质（无名杀以爱诗技能近似）
            if (player.hasSkill('bts_sk_aishi')) player.addMark('bts_mk_yizhi', 1);
        },
        ai: { result: { player: 1 } },
    },

    // ── 锁定技·漆黑（源 st_qihei = TriggerSkill Compulsory Damaged，L8908-8914）──
    // 源技能壳为空、效果硬编码在 AddPet；2026-10-02 自注册重构：改为监听 bts_pet_add
    //（rules/utils.js addPet 在重复召唤时派发）——长夜重复召唤时，你回复1点体力（源 L807-810）。
    bts_sk_qihei: {
        charlotte: true,
        trigger: { player: 'bts_pet_add' },
        forced: true,
        filter(event) {
            return event.pet === 'changye' && event.repeated;
        },
        async content(event, trigger, player) {
            await player.recover(player);
        },
        ai: { noe: true },
    },

    // ── 锁定技·余露（源 st_yulu = TriggerSkill Compulsory MarkChanged，L8916-8933）──
    // 忆质不少于8枚时，移除全部忆质与长夜，对上个对你造成伤害的角色造成1点霜属性伤害。
    // 源在 MarkChanged（忆质累计>7）时触发、无需实际扣血；无名杀以 addMark（忆质增加）近似之。
    bts_sk_yulu: {
        trigger: { player: 'bts_mark_add' },
        forced: true,
        filter(event, player) {
            // 源 L8936：LastDamagedLink>0（只记最近伤害者，L1275-1283）须存活
            const last = player
                .getAllHistory('damage')
                .filter((ev) => ev.source)
                .pop();
            return (
                event.markName === 'bts_mk_yizhi' &&
                player.countMark('bts_mk_yizhi') >= 8 &&
                !!last?.source?.isAlive()
            );
        },
        async content(event, trigger, player) {
            // 源 L8923-8929：对 LastDamagedLink 目标（记被伤者/键=来源/只记最近）造成 "_frost"
            // 霜属性伤害——只打「上个伤害你且存活者」（同风堇·走开范式；批1原实现误用
            // getAllHistory('damage') 全部来源，把伤过你的所有角色都打了）
            const last = player
                .getAllHistory('damage')
                .filter((ev) => ev.source)
                .pop();
            // 源 L8925-8928：移除全部忆质与长夜
            player.removeMark('bts_mk_yizhi', player.countMark('bts_mk_yizhi'));
            await lib.bts.api.removePet(player, 'changye');
            if (last?.source?.isAlive()) {
                const damage = last.source.damage(player, 1, 'nocard');
                damage.reason = 'bts_sk_yulu_frost';
                lib.bts.api.setDamageNature(damage, 'frost');
                await damage;
            }
        },
        ai: { noe: true },
    },

    // ── 锁定技·夜影（源 st_yeying = DistanceSkill，L8935-8952）──
    // 拥有此技能的角色距离极近（-1000）；场上有任何角色拥有此技能时，其他角色计算距离时+1。
    bts_sk_yeying: {
        charlotte: true,
        mod: {
            globalTo(from, to, distance) {
                // 源 L8944-8946：目标是持有者 → 距离-1000（极近）
                if (to.hasSkill('bts_sk_yeying')) return -1000;
                // 源 L8947-8949：任何角色持有 → 计算距离+1
                if (game.hasPlayer((player) => player.hasSkill('bts_sk_yeying')))
                    return distance + 1;
            },
        },
        ai: { noe: true },
    },
};

export const marks = {
    bts_mk_yizhi: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_yizhi_faq',
    },
    bts_pet_changye: {
        // 忆灵体力（lib.bts.api 忆灵系统，markKind:'pet' 使体力可见）
        markKind: 'pet',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_changyeyue_skin1': '皮肤1',
    'bts_ch_changyeyue_skin10': '皮肤10',
    'bts_ch_changyeyue_skin11': '皮肤11',
    'bts_ch_changyeyue_skin12': '皮肤12',
    'bts_ch_changyeyue_skin2': '皮肤2',
    'bts_ch_changyeyue_skin3': '皮肤3',
    'bts_ch_changyeyue_skin4': '皮肤4',
    'bts_ch_changyeyue_skin5': '皮肤5',
    'bts_ch_changyeyue_skin6': '皮肤6',
    'bts_ch_changyeyue_skin7': '皮肤7',
    'bts_ch_changyeyue_skin8': '皮肤8',
    'bts_ch_changyeyue_skin9': '皮肤9',
    bts_ch_changyeyue: '长夜月',
    bts_ch_changye: '长夜',
    bts_ch_changyeyue_and_changye: '长夜月&长夜',
    bts_sk_wumian: '无眠',
    bts_sk_wumian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，附加2层${get.poptip('bts_glossary_bless_zhianzhimi_faq')}（若你为${get.poptip('bts_glossary_xingqi_faq')}则改为4层），并召唤${get.poptip('bts_ch_changye')}。`,
    bts_sk_tongxing: '同行',
    bts_sk_tongxing_info: `锁定技，扣减体力后，获得1枚${get.poptip('bts_glossary_yizhi_faq')}；若你拥有${get.poptip('bts_glossary_bless_zhianzhimi_faq')}，改为7枚。然后若没有${get.poptip('bts_glossary_bless_fatal_faq')}，附加1层${get.poptip('bts_glossary_bless_fatal_faq')}。`,
    bts_sk_zhouli: '昼离',
    bts_sk_zhouli_info: `结束阶段开始时，你可以失去1点体力，召唤${get.poptip('bts_ch_changye')}。`,
    bts_sk_qihei: '漆黑',
    bts_sk_qihei_info: `锁定技，当${get.poptip('bts_ch_changye')}被重复召唤时，你回复1点体力。`,
    bts_sk_yulu: '雨露',
    bts_sk_yulu_info: `锁定技，${get.poptip('bts_glossary_yizhi_faq')}不少于8枚时，移除全部${get.poptip('bts_glossary_yizhi_faq')}与${get.poptip('bts_ch_changye')}，对伤害关联角色造成1点${get.poptip('bts_glossary_nature_frost_dmg_faq')}伤害。`,
    bts_sk_yeying: '夜影',
    bts_sk_yeying_info:
        '锁定技，拥有此技能的角色距离极近；其他角色计算距离时+1。',
    bts_bless_zhianzhimi: '至暗之谜祝福',
    bts_mk_yizhi: '忆质',
    bts_pet_changye: '长夜',

    '$bts_sk_wumian1': "别担心，闭上双眼……",
    '$bts_sk_wumian2': "夜色将要落幕…嘘，晚安",
    '$bts_sk_tongxing1': "乖一点",
    '$bts_sk_tongxing2': "好好记着",
    '$bts_sk_zhouli1': "好好招待大家",
    '$bts_sk_zhouli2': "听话，该登场了~",
    '$bts_sk_yulu1': "天亮了，该醒啦~",
    '$bts_sk_yulu2': "诸位，后会有期~",
    '~bts_ch_changye': "没能…保护好……",
    '~bts_ch_changyeyue': "没能…保护好……",
    // 2026-09-28：×6→×7 对齐源（参照本 L14486「7倍」）与实现（定夺 C-03 ×7）。
    bts_bless_zhianzhimi_info: `来源：${get.poptip('bts_sk_wumian')}赋予；扣血获${get.poptip('bts_glossary_yizhi_faq')}×7；回合结束自然减少1层`,
};

export const simpleTranslate = {
    bts_sk_wumian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+${get.poptip('bts_glossary_bless_zhianzhimi_faq')}并召唤${get.poptip('bts_ch_changye')}`,
    bts_sk_tongxing_info: `锁；扣血+${get.poptip('bts_glossary_yizhi_faq')}，${get.poptip('bts_glossary_bless_zhianzhimi_faq')}时改+7并确保${get.poptip('bts_glossary_bless_fatal_faq')}`,
    bts_sk_zhouli_info: `结束阶段可失1体力召唤${get.poptip('bts_ch_changye')}`,
    bts_sk_yulu_info: `锁；${get.poptip('bts_glossary_yizhi_faq')}≥8时移除${get.poptip('bts_ch_changye')}并造成霜伤`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

export const buffSkills = {
    bts_bless_zhianzhimi: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_zhianzhimi_faq',
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_zhianzhimi_faq',
        name: '至暗之谜祝福',
        // 2026-09-28：×6→×7 对齐源（参照本 L14486）与实现（定夺 C-03）。
        info: `你扣减体力获得${get.poptip('bts_glossary_yizhi_faq')}时，获得量×7。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_yizhi_faq',
        name: '|忆质|',
        info: `长夜月专属：${get.poptip('bts_sk_tongxing')}受伤、${get.poptip('bts_sk_zhouli')}召唤各+量；满8由${get.poptip('bts_sk_yulu')}对最近伤害者造成伤害并解${get.poptip('bts_ch_changye')}。`,
    },
];
