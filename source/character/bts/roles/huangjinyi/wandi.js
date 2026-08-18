// 万敌（源 animal.lua L7903-8054，V2.2 重做血仇/登神）—— 血仇阈值、登神与濒死回收。
// 技能：诛天（必杀技·血仇+回复1点）、无悔（出牌开始失体+血仇+结束出牌）、血仇（扣血积累/登神/反击）、登神（弃手换回复/濒死退出）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'huangjinyi';
export const title = '虚数·毁灭·黄金裔的角斗士'; // 属性·命途
export const intro =
    `${B('万敌')}用无悔换${get.poptip('bts_glossary_xuechou_faq')}，攒满就登神，回头反打伤你的目标。`;

export const character = {
    bts_ch_wandi: {
        sex: 'male',
        group: 'huangjinyi',
        hp: 4,
        skills: ['bts_sk_zhutian', 'bts_sk_wuhui', 'bts_sk_xuechou'],
    },
};

export const skill = {
    // ── 必杀技·诛天（源 max_zhutian = SkillCard + ZeroCardViewAsSkill，L7904-7925）──
    // 出牌阶段，失5怒气，获得2枚血仇标记；若受伤，回复1点体力（源 RecoverStruct 默认 1，V2.2 描述同步改「回复1点」）。
    bts_sk_zhutian: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L7921）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_zhutian');
            lib.bts.api.loseAngry(player, 5); // 源 L7908：LoseAngry(player, 5)
            player.addMark('bts_mk_xuechou', 2); // 源 L7909：addPlayerMark(@st_xuechou, 2)
            // 源 L7910-7912：若受伤回复1点体力（RecoverStruct(player) 默认 1；V2.0 描述「回复已损失一半」与代码不符，V2.2 已修正为「回复1点」）
            if (player.hp < player.maxHp) await player.recover(player, 1);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_zhutian')
                    ? -1
                    : 6;
            },
            result: { player: 2 },
        },
    },

    // ── 锁定技·无悔（源 st_wuhui = TriggerSkill Compulsory EventPhaseStart Play，L7926-7940）──
    // 出牌阶段开始时，失去2点体力，获得1枚血仇标记（V2.2 重做：原「+体力上限祝福+跳弃牌」删去）。
    bts_sk_wuhui: {
        trigger: { player: 'phaseUseBegin' },
        forced: true,
        async content(event, trigger, player) {
            // 源 L7933：room:loseHp(player, 2)
            await player.loseHp(2);
            // 源 L7934：player:gainMark("@st_xuechou")
            player.addMark('bts_mk_xuechou', 1);
            // 源 L7936 return true → 立即终止出牌阶段。trigger 即 phaseUse 事件本身
            //（phaseUseBegin 为阶段事件 loop 的 Begin 派生点，见核实 F-07）；
            // 勿用 getParent（排除自身、恒返回 {}，跳过块永不执行）。
            if (trigger.name === 'phaseUse') {
                trigger.isSkipped = true;
                trigger.finish();
            }
        },
        ai: { noe: true },
    },

    // ── 锁定技·血仇（源 st_xuechou = TriggerSkill Compulsory HpChanged，L7941-7988）──
    // 扣减体力后获得等量血仇；达到体力上限时：未登神则附加等量体力上限祝福、回复等量体力、
    // 获得登神并在回合结束时额外出回合；已登神则对伤过你的来源各造成1点暴击伤害。
    bts_sk_xuechou: {
        trigger: { player: ['damageEnd', 'loseHpEnd'] },
        forced: true,
        filter(event) {
            return event.num > 0; // 源 L7955：x（扣减量）> 0 才积累
        },
        async content(event, trigger, player) {
            // 源 L7956：player:gainMark("@st_xuechou", x)（trigger=伤害/失血事件）
            player.addMark('bts_mk_xuechou', trigger.num);
            // 源 L7957：血仇 ≥ 体力上限 才结算
            if (player.countMark('bts_mk_xuechou') < player.maxHp) return;
            // 源 L7965/7976：清空血仇
            player.removeMark('bts_mk_xuechou', player.countMark('bts_mk_xuechou'));
            if (!player.hasSkill('bts_sk_dengshen')) {
                // 源 L7975-7981：未登神 → n=旧体力上限，附加 n 层体力上限祝福、回复 n、
                // 获得登神、额外回合。注意 n 取加祝福前的体力上限（先记旧值再 addBless）。
                const n = player.maxHp;
                await lib.bts.api.addBless(player, 'maxhp', n, player);
                await player.recover(player, n);
                await player.addSkill('bts_sk_dengshen');
                lib.bts.api.extraTurn(player, 'bts_extra_turn');
            } else {
                // 源 L7959-7969：已登神 → 对最近一名伤害来源造成1点 "_critical" 伤害
                //（V2.2 由 getBless(maxhp) 改为固定 1 点）。源 LastDamagedLink（L1282-1290）为
                // 单槽：每次伤害先把全部键清空、再只记最近来源 → 目标恒为「最近一名伤害者」。
                // 用引擎 damage 历史取最后一个有来源的事件替代「全部来源」（原实现遍历全部历史
                // 来源各打一次，目标数错——C-01；参照 ren.js 倏忽同款取末事件 source）。
                const last = player
                    .getAllHistory('damage')
                    .filter((event) => event.source)
                    .pop();
                if (last?.source?.isAlive()) {
                    const target = last.source;
                    const damage = target.damage(player, 1, 'nocard');
                    damage.reason = 'bts_sk_xuechou_bts_reason_critical';
                    await damage;
                    // 源 L7967-7969：拥有爱诗（GetXiLian = hasSkill st_aishi）时，
                    // 登神造成伤害后获得等同体力上限祝福数的血仇标记（『纷争』诗）
                    if (player.hasSkill('bts_sk_aishi'))
                        player.addMark(
                            'bts_mk_xuechou',
                            lib.bts.api.getBless(player, 'maxhp', -1) || 1,
                        );
                }
            }
        },
        ai: { noe: true },
    },

    // ── 锁定技·登神（源 st_dengshen = TriggerSkill Compulsory MarkChanged(@angry/@st_xuechou)/EnterDying，L7989-8054）──
    // 登神期间：怒气势≥5自动触发诛天；获得血仇标记后弃全部手牌并回复等量体力；
    // 进入濒死时回复1点体力、移除全部体力上限祝福、退出登神。
    bts_sk_dengshen: {
        charlotte: true,
        trigger: { player: ['dying', 'bts_mark_add', 'bts_mark_remove'] },
        forced: true,
        filter(event, player, triggername) {
            if (triggername === 'dying') return true;
            return ['bts_mk_xuechou', 'bts_mk_angry'].includes(event.markName);
        },
        async content(event, trigger, player) {
            if (event.triggername === 'dying') {
                // 源 L8036-8048：回复1点体力（RecoverStruct 默认 1）、移除全部体力上限祝福、退出登神。
                // 对致死父事件设 nodying 阻断濒死（busi 范式，见 rules/globalBuffs.js）：不 cancel 濒死
                // 事件，否则濒死未完成结算、_status.dying 不移除；回复至 hp>0 后 dying step2 自然收尾。
                const evt = trigger.getParent();
                if (evt && (evt.name === 'damage' || evt.name === 'loseHp')) evt.nodying = true;
                await player.recover(player, 1);
                await lib.bts.api.removeBless(player, 'maxhp', -1, player);
                await player.removeSkill('bts_sk_dengshen');
                return;
            }
            if (trigger.markName === 'bts_mk_angry') {
                // 源 L7997-8011：登神期间怒气≥5 → 自动触发诛天（失5怒气+2血仇+回复1点）
                if (player.countMark('bts_mk_angry') >= 5) {
                    lib.bts.api.loseAngry(player, 5);
                    player.addMark('bts_mk_xuechou', 2);
                    if (player.hp < player.maxHp) await player.recover(player, 1);
                }
                return;
            }
            // trigger.markName === 'bts_mk_xuechou'：弃全部手牌并回复等量体力（源 L8012-8015）
            const hands = player.getCards('h');
            const n = hands.length;
            if (n) {
                await player.discard(hands);
                await player.recover(player, n);
            }
        },
        ai: { noe: true },
    },
};

export const marks = {
    bts_mk_xuechou: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_xuechou_faq',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_wandi_skin1': '皮肤1',
    'bts_ch_wandi_skin2': '皮肤2',
    'bts_ch_wandi_skin3': '皮肤3',
    'bts_ch_wandi_skin4': '皮肤4',
    'bts_ch_wandi_skin5': '皮肤5',
    'bts_ch_wandi_skin6': '皮肤6',
    'bts_ch_wandi_skin7': '皮肤7',
    bts_ch_wandi: '万敌',
    bts_sk_zhutian: '诛天',
    bts_sk_zhutian_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}，获得2枚${get.poptip('bts_glossary_xuechou_faq')}标记并回复1点体力。`,
    bts_sk_wuhui: '无悔',
    bts_sk_wuhui_info: `锁定技，出牌阶段开始时，你失去2点体力，获得1枚${get.poptip('bts_glossary_xuechou_faq')}标记并结束此阶段。`,
    bts_sk_xuechou: '血仇',
    bts_sk_xuechou_info: `锁定技，扣减体力后获得等量${get.poptip('bts_glossary_xuechou_faq')}；达到${get.poptip('bts_glossary_bless_maxhp_faq')}时，若你未拥有${get.poptip('bts_sk_dengshen')}，弃全部${get.poptip('bts_glossary_xuechou_faq')}、获得等量${get.poptip('bts_glossary_bless_maxhp_faq')}并回复等量体力、获得${get.poptip('bts_sk_dengshen')}并于此回合结束时执行额外回合；若你已拥有${get.poptip('bts_sk_dengshen')}，弃全部${get.poptip('bts_glossary_xuechou_faq')}，对上个对你造成伤害的角色造成1点${get.poptip('bts_glossary_bless_critical_faq')}伤害，若你拥有${get.poptip('bts_sk_aishi')}，获得等同${get.poptip('bts_glossary_bless_maxhp_faq')}数的${get.poptip('bts_glossary_xuechou_faq')}标记。`,
    bts_sk_dengshen: '登神',
    bts_sk_dengshen_info: `锁定技，登神期间：你回复怒气且能发动必杀技时自动发动诛天；获得${get.poptip('bts_glossary_xuechou_faq')}标记后弃置所有手牌并回复等量体力；进入濒死状态时，失去此技能、回复1点体力并移除全部${get.poptip('bts_glossary_bless_maxhp_faq')}。`,

    '$bts_sk_zhutian1': "垂死之魂，直面我！",
    '$bts_sk_zhutian2': "我允许你们…伏首受诛！",
    '$bts_sk_wuhui1': "玉石，俱焚！",
    '$bts_sk_wuhui2': "万劫，不复！",
    '$bts_sk_xuechou1': "赐你天谴！",
    '$bts_sk_xuechou2': "荡平万邦！",
    '$bts_sk_dengshen1': "流淌吧，悬锋之血！",
    '$bts_sk_dengshen2': "怒吼吧，吾即纷争",
    '~bts_ch_wandi': "结…束了……",
    bts_mk_xuechou: '血仇',
    bts_mk_xuechou_info: '来源：诛天、血仇赋予；登神：满体力上限',
};

export const simpleTranslate = {
    bts_sk_zhutian_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}+2${get.poptip('bts_glossary_xuechou_faq')}并回复1点体力`,
    bts_sk_wuhui_info: `锁；出牌开始失2体力+1${get.poptip('bts_glossary_xuechou_faq')}并结束出牌阶段`,
    bts_sk_xuechou_info: `锁；扣血+${get.poptip('bts_glossary_xuechou_faq')}，满上限后登神并反击伤害来源`,
};

export const pinyins = { bts_ch_wandi: 'wandi' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_xuechou_faq',
        name: '|血仇|',
        info: `万敌专属：${get.poptip('bts_sk_zhutian')}必杀、${get.poptip('bts_sk_xuechou')}受伤各+层；满体力上限清空登神，或对最近伤害者造成伤害。`,
    },
];
