// 罗刹（源 animal.lua L6442-6520）—— 归葬、白花和轮转。
// 技能：归葬（必杀技·移除祝福/护盾+白花）、轮转（白花≥2治疗受伤者）、白花（他人受伤治疗+白花）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '虚数·丰饶·金人巷商会会长'; // 属性·命途
export const intro =
    `${B('罗刹')}用${get.poptip('bts_sk_guizang')}拆掉目标的${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}换${get.poptip('bts_glossary_baihua_faq')}；${get.poptip('bts_glossary_baihua_faq')}攒到两枚，就能反复把受伤的人奶回来。`;

export const character = {
    bts_ch_luocha: {
        sex: 'male',
        group: 'xianzhou',
        hp: 4,
        skills: ['bts_sk_guizang', 'bts_sk_lunzhuan', 'bts_sk_baihua'],
    },
};

export const skill = {
    // ── 必杀技·归葬（源 st_guizang = SkillCard + ZeroCardViewAsSkill，L6443-6470）──
    // 出牌阶段，失5怒气，令任意名其他角色各移除1层祝福或1点护盾，你获得1枚白花；
    // 若你为星启，这些角色各附加1层诅咒。
    bts_sk_guizang: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6468）：怒气≥5
            return lib.bts.api.getAngry(player, 5);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6446）：目标 ≠ 自己（无名杀额外要求有祝福/护盾可移除）
            return (
                target !== player &&
                (lib.bts.api.getShield(target) ||
                    Object.keys(target.storage || {}).some(
                        (key) => key.startsWith('bts_bless_') && target.countMark(key),
                    ))
            );
        },
        selectTarget: [1, Infinity],
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_guizang');
            lib.bts.api.loseAngry(player, 5); // 源 L6449：LoseAngry(player, 5)
            for (const target of event.targets) {
                // 源 L6451：RemoveBlessOrShield(p, 1, player)——从目标所有祝福/护盾中选一项移除
                //（源 L600-617；定夺恢复选择）。移除祝福须传完整标记键（bts_bless_*），勿 slice。
                const buffs = Object.keys(target.storage || {}).filter(
                    (key) =>
                        (key.startsWith('bts_bless_') || key === 'bts_shield') &&
                        target.countMark(key) > 0,
                );
                if (!buffs.length) continue;
                let chosen = buffs[0];
                if (buffs.length > 1) {
                    // 控件须为纯字符串（数组会原样成为 result.control 致下游崩溃）；文案走 set('prompt')。
                    const choice = await player
                        .chooseControl(buffs)
                        .set(
                            'prompt',
                            `归葬：选择移除${get.translation(target)}的哪一层祝福/护盾`,
                        )
                        // AI 口径：优先拆护盾（直接抵消伤害），其次致命祝福（其伤害视为致命）；
                        // 均无则首项（源 RemoveBlessOrShield L6451）
                        .set('ai', () => {
                            for (const key of ['bts_shield', 'bts_bless_fatal']) {
                                const idx = buffs.indexOf(key);
                                if (idx >= 0) return idx;
                            }
                            return 0;
                        })
                        .forResult();
                    chosen = choice.control;
                }
                if (chosen === 'bts_shield')
                    lib.bts.api.removeShield(target, 1);
                else lib.bts.api.removeBless(target, chosen, 1);
                // 源 L6455-6457：星启时目标各附加1层诅咒
                if (lib.bts.api.god(player)) lib.bts.api.addCurse(target, 1);
            }
            // 源 L6453：player:gainMark("@baihua")
            player.addMark('bts_mk_baihua', 1);
        },
        ai: {
            // AI 口径：失5怒=拆敌方各1层祝福/护盾（拆友方增益为负收益，勿选）+1枚白花（2枚开轮转治疗）；
            // 星启为目标附加1层诅咒（源 st_guizang，animal.lua L6443-6470）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_guizang')) return -1;
                const god = lib.bts.api.god(player);
                let v = 0; // 敌方可拆资源合计
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue;
                    if (!lib.bts.api.getShield(t) && !lib.bts.api.blessCount(t))
                        continue;
                    v += 1.5; // 拆1层≈1.5（护盾直抵1伤；祝福为敌方资源）
                    if (god) v += 1; // 诅咒1层
                }
                if (!v) return -1;
                if (v >= 5) return 9;
                return v >= 3 ? 8 : 6; // 单体≈6（含白花进度），双目标≈8
            },
            result: {
                // 目标受损：拆1层祝福/护盾≈-1.5（护盾再加0.5）；星启附加诅咒-1（源 L6451-6457）
                target: (player, target) => {
                    let v = 1.5;
                    if (lib.bts.api.getShield(target)) v += 0.5;
                    if (lib.bts.api.god(player)) v += 1;
                    return -v;
                },
            },
        },
    },

    // ── 触发技·轮转（源 st_lunzhuan = TriggerSkill Damage/EventPhaseStart，L6472-6496）──
    // 白花不少于2枚时，其他受伤角色造成伤害后，你可以令其回复1点体力；准备阶段开始时清空白花。
    bts_sk_lunzhuan: {
        trigger: { global: 'damageEnd' },
        logTarget: 'source',
        filter(event, player) {
            // 源 L6481：来源≠你、受伤者≠你、来源受伤、白花>1（damageEnd 的 source=造成者；源以
            // damage.from 触发并治愈来源）。damageEnd 晚于濒死链——被同链打死的来源此时 isDamaged()
            // 仍真，须补 isAlive 门（同掠袭/晴空约定：死目标不可作为效果对象）。
            return (
                event.source &&
                event.source !== player &&
                event.source !== event.player &&
                event.source.isAlive() &&
                event.source.isDamaged() &&
                player.countMark('bts_mk_baihua') > 1
            );
        },
        async cost(event, trigger, player) {
            // cost 型触发技：引擎不询顶层 check，发动与否由此处内联 ai 定
            // 源 L6481-6484：askForSkillInvoke
            event.result = await player
                .chooseBool('轮转：是否令受伤角色回复1点体力？')
                // AI 口径：免费治疗只给友方（敌方不救）——令造成伤害的受伤友方回复1
                //（源 L6481-6484；源 st_lunzhuan，animal.lua L6472-6496）
                .set('ai', () => get.attitude(player, trigger.source) > 0)
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L6481-6484：room:recover(player=来源)
            await trigger.source.recover(player);
        },
        group: ['bts_sk_lunzhuan_clear'],
        subSkill: {
            clear: {
                // 源 L6487-6490：准备阶段开始时白花>1 → 清空白花
                trigger: { player: 'phaseZhunbeiBegin' },
                forced: true,
                filter(event, player) {
                    return player.countMark('bts_mk_baihua') > 1;
                },
                async content(event, trigger, player) {
                    player.removeMark('bts_mk_baihua', player.countMark('bts_mk_baihua'));
                },
            },
        },
    },

    // ── 触发技·白花（源 st_baihua = TriggerSkill Damaged，L6498-6518）──
    // 其他角色受伤后，你可以令其回复1点体力并获得1枚白花，然后可弃置一张【杀】，
    // 否则此技能于你下回合开始前无效。
    bts_sk_baihua: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L6506：受伤者≠你、技能未失效（-start 为 0）。damageEnd 晚于濒死链——被此伤害打死者
            // 此时 isAlive() 已 false 而 isDamaged() 对尸体恒真，不设门会向尸体询问并回血（非法态）；
            // isAlive 门即实现「若此伤害已使目标死亡，则无法发动」（约定见 moze.js 掠袭）。
            return (
                event.player &&
                event.player !== player &&
                event.player.isAlive() &&
                event.player.isDamaged() &&
                !player.countMark('bts_mk_baihua-start')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6506：askForSkillInvoke —— 是否发动；AI 口径：治疗受伤友方1点并+1白花
            //（2枚开启轮转治疗），敌方不救（源 st_baihua，animal.lua L6498-6518）
            event.result = await player
                .chooseBool('白花：是否令受伤角色回复1点体力？')
                .set('ai', () => get.attitude(player, trigger.player) > 0)
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L6508-6509：room:recover(player=受伤者) + p:gainMark("@baihua")
            await trigger.player.recover(player);
            player.addMark('bts_mk_baihua', 1);
            // 源 L6510-6511：可弃【杀】保留白花，否则打 -start 标记（下回合开始前失效）；
            // 取消≠不发动（仍治疗）。
            const discard = await player
                .chooseToDiscard(
                    '白花：弃置一张【杀】以保留白花？',
                    'h',
                    (card) => get.name(card) === 'sha',
                )
                // AI 口径：弃1【杀】保技能本回合可用；唯一【杀】且血线告急时接受暂时失效（-start）
                //（源 L6510-6511）
                .set('ai', (card) => {
                    if (!card || typeof card !== 'object') return -1; // 技能按钮候选（非牌）不选
                    const spare =
                        player.countCards('h', (c) => get.name(c) === 'sha') - 1;
                    if (spare <= 0 && player.hp <= 2) return -1;
                    return 1;
                })
                .forResult();
            if (!discard.bool) player.addMark('bts_mk_baihua-start', 1, false);
        },
        ai: { result: { target: 1 } },
    },
};

export const marks = {
    bts_mk_baihua: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_baihua_faq',
    },
    // 白花·技能失效窗口（-start；由 bts_gamerule_phase 于回合开始清理）。须注册——
    // clearSuffixMarks 会以默认 log 移除该键，未注册即触发「孩子，你的技能…」告警。
    'bts_mk_baihua-start': { markKind: 'record' },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_luocha_skin1': '皮肤1',
    'bts_ch_luocha_skin2': '皮肤2',
    'bts_ch_luocha_skin3': '皮肤3',
    'bts_ch_luocha_skin4': '皮肤4',
    'bts_ch_luocha_skin5': '皮肤5',
    'bts_ch_luocha_skin6': '皮肤6',
    'bts_ch_luocha_skin7': '皮肤7',
    bts_ch_luocha: '罗刹',
    bts_sk_guizang: '归葬',
    bts_sk_guizang_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去5点${get.poptip('bts_glossary_nuqi_faq')}并选择至少一名其他角色，各移除其1层${get.poptip('bts_glossary_bless_faq')}或1点${get.poptip('bts_glossary_hudun_faq')}，你获得1枚${get.poptip('bts_glossary_baihua_faq')}；若你为${get.poptip('bts_glossary_xingqi_faq')}，这些角色各附加1层诅咒。`,
    bts_sk_lunzhuan: '轮转',
    bts_sk_lunzhuan_info: `${get.poptip('bts_glossary_baihua_faq')}不少于2枚时，其他受伤角色造成伤害后，你可以令其回复1点体力；准备阶段开始时清空${get.poptip('bts_glossary_baihua_faq')}。`,
    bts_sk_baihua: '白花',
    bts_sk_baihua_info: `其他角色受伤后，你可以令其回复1点体力并获得1枚${get.poptip('bts_glossary_baihua_faq')}，然后可弃置一张【杀】，否则此技能于你下回合开始前无效。`,

    '$bts_sk_guizang1': "永眠非终焉……",
    '$bts_sk_guizang2': "逝者将再临！",
    '$bts_sk_lunzhuan1': "凡夺取的，必将偿还！",
    '$bts_sk_lunzhuan2': "拭目以待吧",
    '$bts_sk_baihua1': "白花盛放！",
    '$bts_sk_baihua2': "领受天赐！",
    '~bts_ch_luocha': "没能…实现啊……",
    bts_mk_baihua: '白花',
    bts_mk_baihua_info: `来源：${get.poptip('bts_sk_guizang')}、${get.poptip('bts_glossary_baihua_faq')}赋予；${get.poptip('bts_sk_lunzhuan')}：满2治疗并清空`,
    'bts_mk_baihua-start': '白花失效',
};

export const simpleTranslate = {
    bts_sk_guizang_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}拆掉目标${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}，+1${get.poptip('bts_glossary_baihua_faq')}，${get.poptip('bts_glossary_xingqi_faq')}时再挂诅咒`,
    bts_sk_lunzhuan_info: `${get.poptip('bts_glossary_baihua_faq')}攒到2枚后，受伤角色造成伤害时可奶回；准备阶段清空`,
    bts_sk_baihua_info: `别人受伤后可奶回并+1${get.poptip('bts_glossary_baihua_faq')}，不弃杀就暂时失效`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

// ── 角色专属词条（随角色包 gather('glossary') 聚合进 fullTranslate，详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_baihua_faq',
        name: '|白花|',
        info: `罗刹专属：${get.poptip('bts_sk_guizang')}${get.poptip('bts_glossary_bisha_faq')}+1；有2枚以上时${get.poptip('bts_sk_lunzhuan')}令受伤者回复1，准备阶段清除。`,
    },
];
