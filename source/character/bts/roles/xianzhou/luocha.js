// 罗刹（源 animal.lua L6442-6520）—— 归葬、白花和轮转。
// 技能：归葬（必杀技·移除祝福/护盾+白花）、轮转（白花≥2治疗受伤者）、白花（他人受伤治疗+白花）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '虚数·丰饶·金人巷商会会长'; // 属性·命途
export const intro =
    `${B('罗刹')}用归葬拆掉目标的${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}换${get.poptip('bts_glossary_baihua_faq')}；白花攒到两枚，就能反复把受伤的人奶回来。`;

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
                // 源 L6451：RemoveBlessOrShield(p, 1, player) —— 移除目标一层祝福或护盾（内联）
                // 源 RemoveBlessOrShield（L600-617）由罗刹 askForChoice 从目标所有祝福/护盾中选一项移除
                //（用户定夺 2026-09-02 恢复选择）；移除祝福传完整标记键（bts_bless_*），勿 slice
                //（原 slice(6) 拼出 bts_bless_ess_* 不存在标记，祝福分支静默移除 0 层，已修正）。
                const buffs = Object.keys(target.storage || {}).filter(
                    (key) =>
                        (key.startsWith('bts_bless_') || key === 'bts_shield') &&
                        target.countMark(key) > 0,
                );
                if (!buffs.length) continue;
                let chosen = buffs[0];
                if (buffs.length > 1) {
                    // 修复：控件须为纯字符串（[键,文案] 数组会原样成为 result.control 致下游崩溃）；文案改走 set('prompt')
                    const choice = await player
                        .chooseControl(buffs)
                        .set(
                            'prompt',
                            `归葬：选择移除${get.translation(target)}的哪一层祝福/护盾`,
                        )
                        .set('ai', () => 0)
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
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_guizang') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 触发技·轮转（源 st_lunzhuan = TriggerSkill Damage/EventPhaseStart，L6472-6496）──
    // 白花不少于2枚时，其他受伤角色造成伤害后，你可以令其回复1点体力；准备阶段开始时清空白花。
    bts_sk_lunzhuan: {
        trigger: { global: 'damageEnd' },
        logTarget: 'source',
        filter(event, player) {
            // 源 L6481：伤害来源 ≠ 你、受伤者 ≠ 你、伤害来源受伤、白花>1
            // (无名杀 damageEnd 里 event.source=造成者、event.player=承受者；源以 damage.from 触发并治愈来源；
            // 源无每回合限一次，原实现残留 st_lunzhuan-start 未设置的死条件，已删)
            // 2026-09-27 修复（死者回血非法态）：damageEnd 在 dying→die 链之后发射（gameEvent trigger "End"），
            // 来源若在同一结算链中阵亡，此时 isDamaged() 对尸体仍为真，回复将落在尸体上——补 isAlive 门
            //（同 moze.js 掠袭/风堇晴空约定：死目标不可作为效果对象）。
            return (
                event.source &&
                event.source !== player &&
                event.source !== event.player &&
                event.source.isAlive() &&
                event.source.isDamaged() &&
                player.countMark('bts_mk_baihua') > 1
            );
        },
        async content(event, trigger, player) {
            // 源 L6481-6484：askForSkillInvoke 后 room:recover(player=来源)
            const result = await player
                .chooseBool('轮转：是否令受伤角色回复1点体力？')
                .forResult();
            if (result.bool) {
                await trigger.source.recover(player);
            }
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
                ai: { noe: true },
            },
        },
        ai: { noe: true },
    },

    // ── 触发技·白花（源 st_baihua = TriggerSkill Damaged，L6498-6518）──
    // 其他角色受伤后，你可以令其回复1点体力并获得1枚白花，然后可弃置一张【杀】，
    // 否则此技能于你下回合开始前无效。
    bts_sk_baihua: {
        trigger: { global: 'damageEnd' },
        logTarget: 'player',
        filter(event, player) {
            // 源 L6506：受伤者 ≠ 你、且技能未失效（-start 标记为0）
            // 2026-09-27 修复（死者回血非法态，实机复现于测试台）：damageEnd 晚于濒死链——被此伤害
            // 打死的目标在 damageEnd 时 class 'dead' 已挂、isAlive()===false，而 isDamaged()（hp<maxHp）
            // 对尸体恒真：若不设门，白花会向尸体询问并 recover(+1)（后端审计曾捕获「阵亡 hp=1」非法态）。
            // 约定见 moze.js 掠袭：「被此伤害打死的目标在 damageEnd 时 isAlive() 已为 false，filter 的
            // isAlive 即实现『若此伤害已使目标死亡，则无法发动』」。
            return (
                event.player &&
                event.player !== player &&
                event.player.isAlive() &&
                event.player.isDamaged() &&
                !player.countMark('bts_mk_baihua-start')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6506：askForSkillInvoke —— 是否发动
            event.result = await player
                .chooseBool('白花：是否令受伤角色回复1点体力？')
                .forResult();
        },
        async content(event, trigger, player) {
            // 源 L6508-6509：room:recover(player=受伤者) + p:gainMark("@baihua")
            await trigger.player.recover(player);
            player.addMark('bts_mk_baihua', 1);
            // 源 L6510-6511：可弃【杀】保留白花，否则打 -start 标记（技能于下回合开始前失效）；
            // 取消≠不发动（仍治疗，只是技能失效），故保留在 content
            const discard = await player
                .chooseToDiscard(
                    '白花：弃置一张【杀】以保留白花？',
                    'h',
                    (card) => get.name(card) === 'sha',
                )
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
    // 白花·技能失效窗口（-start；由 bts_gamerule_phase 于回合开始清理）。
    // 2026-09-26：补注册——阶段规则修复后 clearSuffixMarks 会以默认 log 移除该键，
    // 未注册即触发「孩子，你的技能…」引擎告警（实机日志实证）。
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
    bts_mk_baihua_info: '来源：归葬、白花赋予；轮转：满2治疗并清空',
    'bts_mk_baihua-start': '白花失效',
};

export const simpleTranslate = {
    bts_sk_guizang_info: `${get.poptip('bts_glossary_bisha_faq')}；失5${get.poptip('bts_glossary_nuqi_faq')}拆掉目标${get.poptip('bts_glossary_bless_faq')}或${get.poptip('bts_glossary_hudun_faq')}，+1${get.poptip('bts_glossary_baihua_faq')}，${get.poptip('bts_glossary_xingqi_faq')}时再挂诅咒`,
    bts_sk_lunzhuan_info: `${get.poptip('bts_glossary_baihua_faq')}攒到2枚后，受伤角色造成伤害时可奶回；准备阶段清空`,
    bts_sk_baihua_info: `别人受伤后可奶回并+1${get.poptip('bts_glossary_baihua_faq')}，不弃杀就暂时失效`,
};

export const pinyins = { bts_ch_luocha: 'luocha' };

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_baihua_faq',
        name: '|白花|',
        info: `罗刹专属：${get.poptip('bts_sk_guizang')}必杀+1；有2枚以上时${get.poptip('bts_sk_lunzhuan')}令受伤者回复1，准备阶段清除。`,
    },
];
