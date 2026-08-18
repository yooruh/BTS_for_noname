// 貊泽（源 animal.lua L6087-6211）—— 锋影、折翅与暗袭。
// 技能：锋影（必杀技·弃/获牌+杀）、折翅（黑杀+3红杀-1次数）、掠袭（指定猎物+暗之祝福，猎物受杀伤后追击）。
import { lib, game, ui, get, ai, _status, styleText, X, Y, Z, B, O } from '../../shared.js';
export const sort = 'xianzhou';
export const title = '雷·巡猎·巡海游侠'; // 属性·命途
export const intro =
    `${B('貊泽')}指定猎物，猎物被人用【杀】打中后，${get.poptip('bts_glossary_moze_dark_assault_faq')}追上去补刀。`;

export const character = {
    bts_ch_moze: {
        sex: 'male',
        group: 'xianzhou',
        hp: 3,
        skills: ['bts_sk_fengying', 'bts_sk_zhechi', 'bts_sk_lvexi'],
    },
};

export const skill = {
    // ── 必杀技·锋影（源 st_fengying = SkillCard + ZeroCardViewAsSkill，L6088-6117）──
    // 出牌阶段，失3怒气，弃置一名其他角色一张牌（星启时获得之），然后视为对其使用【杀】。
    bts_sk_fengying: {
        // 终结技（源必杀技 max_*，描述以「必杀技」开头；bts_bisha 标签供技能按 id 识别终结技）
        bts_bisha: true,
        enable: 'phaseUse',
        filter(event, player) {
            // 源 enabled_at_play（L6115）：怒气≥3
            return lib.bts.api.getAngry(player, 3);
        },
        filterTarget(card, player, target) {
            // 源 Card filter（L6091）：目标 ≠ 自己
            return target !== player;
        },
        selectTarget: 1,
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_fengying');
            const target = event.targets[0];
            lib.bts.api.loseAngry(player, 3); // 源 L6094：LoseAngry(player, 3)
            // 源 L6095-6104：目标有牌时，星启获得之，否则弃置之
            if (target.countCards('he')) {
                if (lib.bts.api.god(player))
                    await player.gainPlayerCard(target, 'he', true);
                else await player.discardPlayerCard(target, 'he', true);
            }
            // 源 L6105：ViewAsCardOnly —— 视为对目标使用【杀】
            await player.useCard({ name: 'sha', isCard: true }, target);
        },
        ai: {
            order(item, player) {
                return lib.bts.aiGuard.blocked(player, 'bts_sk_fengying') ? -1 : 7;
            },
            result: { target: -1 },
        },
    },

    // ── 锁定技·折翅（源 st_zhechi = TargetModSkill pattern Slash，L6119-6132）──
    // 你使用黑色【杀】的次数上限+3，使用红色【杀】的次数上限-1。
    bts_sk_zhechi: {
        mod: {
            cardUsable(card, player, num) {
                // 源 L6124-6128：residue_func 黑+3 红-1
                if (card.name !== 'sha') return;
                const color = get.color(card, player);
                if (color === 'black') return num + 3;
                if (color === 'red') return Math.max(0, num - 1);
            },
        },
        ai: { noe: true },
    },

    // ── 触发技·掠袭（源 st_lvexi = TriggerSkill Damage/Damaged/Death，L6511-6577）──
    // 当你造成伤害后，若你没有暗之祝福，可发动钺贯（锦囊当风杀）并附加4层暗之祝福，
    // 将此伤害角色标记为猎物；此回合结束时进入潜行（不可被指定为目标），直到暗之祝福
    // 全部移除、或你或猎物死亡；猎物受到其他角色【杀】伤害后，你移除1层暗之祝福并追击【杀】。
    bts_sk_lvexi: {
        // 源 L6521（Damage 事件，lua player=伤害来源）：造成伤害后、无暗之祝福时发动。
        // 无名杀伤害事件的 player 角色=受伤者，故用 source 角色定位伤害来源。
        // damageEnd 由事件循环在伤害 content 结算完成后发射（gameEvent trigger "End"），
        // 濒死检查先于它——被此伤害打死的目标在 damageEnd 时 isAlive() 已为 false，
        // filter 的 isAlive 即实现「若此伤害已使目标死亡，则无法发动」。
        trigger: { source: 'damageEnd' },
        filter(event, player) {
            return (
                event.num > 0 &&
                event.player !== player &&
                event.player.isAlive() &&
                !lib.bts.api.getBless(player, 'dark')
            );
        },
        async cost(event, trigger, player) {
            // 源 L6521：askForSkillInvoke（可选发动）。新描述无弃【杀】费用，去掉弃牌选择。
            event.result = await player
                .chooseBool(
                    `掠袭：发动${get.poptip('bts_sk_yueguan')}（你的锦囊牌视为风【杀】）并附加4层${get.poptip('bts_glossary_bless_dark_faq')}，将${get.translation(trigger.player)}标记为猎物？`,
                )
                .forResult();
        },
        async content(event, trigger, player) {
            lib.bts.aiGuard.record(player, 'bts_sk_lvexi');
            const prey = trigger.player; // 源 L6527：damage.to 为猎物
            // 源 L6524：acquireSkill("#st_yueguan-clear") —— 发动钺贯强化（锦囊当风杀）。
            // 复用飞霄 bts_sk_yueguan_buff（enable 依赖 bts_mk_yueguan-clear 标记），状态结束移除。
            player.addMark('bts_mk_yueguan-clear', 1);
            await player.addSkill('bts_sk_yueguan_buff');
            // 源 L6525：AddBless(player, "@bless_dark", 4)
            await lib.bts.api.addBless(player, 'dark', 4, player);
            player.addMark('bts_mk_moze_dark_assault', 1); // 源 L6526：addPlayerMark(player, st_lvexi)
            player.storage.bts_moze_prey = prey.playerid;
            // 固定键镜像已承担显示（「猎物」徽章），动态 per-猎物 键为内部簿记：
            // log=false 关闭日志与 get.info 校验（否则未注册键触发「孩子，你的技能…」告警；
            // 2026-09-26 实机警告同类修复）。
            prey.addMark(`bts_mk_liewu_${player.playerid}`, 1, false); // 源 L6527：addPlayerMark(damage.to, "@liewu")
            player.addMark('bts_mk_liewu', 1); // 固定键镜像：掠袭中显示「猎物」徽章（动态 per-猎物 键不可静态注册）
        },
        group: [
            'bts_sk_lvexi_assault',
            'bts_sk_lvexi_stealth',
            'bts_sk_lvexi_blessZero',
            'bts_sk_lvexi_clear',
        ],
        // 源 L6515-6518（EventPhaseStart NotActive）：潜行——置 alive=false，不可被指定为目标
        mod: {
            targetEnabled(card, player, target) {
                if (
                    target.hasSkill('bts_sk_lvexi') &&
                    target.countMark('bts_mk_moze_stealth') &&
                    player !== target
                )
                    return false;
            },
        },
        // 角色技能特化方法（叁岛 util 字段范式）：掠袭结束清理 endLvexiState，见文件下方导出。
        // 同步 content 会被 StepCompiler eval 成新函数（仅 lib/game/get 等在作用域），
        // 模块内函数必须经 lib.skill['bts_sk_lvexi'].util.<fn> 访问（同白厄 bts_sk_fanshi.util）。
        util: { endLvexiState },
        subSkill: {
            assault: {
                // 源 L6542-6560：猎物受到其他角色【杀】伤害后，移除1层暗之祝福并追击【杀】
                trigger: { global: 'damageEnd' },
                forced: true,
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_moze_dark_assault') &&
                        event.player?.playerid === player.storage.bts_moze_prey &&
                        event.card?.name === 'sha' &&
                        event.source !== player &&
                        lib.bts.api.getBless(player, 'dark')
                    );
                },
                async content(event, trigger, player) {
                    await lib.bts.api.removeBless(player, 'dark'); // 源 L6547：RemoveBless(p, "@bless_dark") 默认移除1层
                    const prey = trigger.player;
                    // 源 L6549：ViewAsCardOnly —— 视为对猎物使用【杀】
                    if (prey.isAlive())
                        await player.useCard(
                            { name: 'sha', isCard: true },
                            prey,
                            'bts_sk_lvexi',
                        );
                    // 源 L6550-6557：暗之祝福耗尽 → 结束掠袭（「全场仅剩2人」条件已按新描述移除；
                    // 归零主路径由 blessZero 监听 bts_mark_remove 兜底，此处双保险且幂等）。
                    if (!lib.bts.api.getBless(player, 'dark'))
                        lib.skill['bts_sk_lvexi'].util.endLvexiState(player);
                },
                ai: { noe: true },
            },
            stealth: {
                // 源 L6515-6518（EventPhaseStart NotActive）：此回合结束时进入潜行——
                // alive=false（不被视为存活、不可被指定为目标，无名杀以 targetEnabled mod 近似）
                trigger: { player: 'phaseEnd' },
                forced: true,
                filter(event, player) {
                    // 仅掠袭进行中且尚未潜行时进入
                    return (
                        player.countMark('bts_mk_moze_dark_assault') > 0 &&
                        !player.countMark('bts_mk_moze_stealth')
                    );
                },
                async content(event, trigger, player) {
                    player.addMark('bts_mk_moze_stealth', 1);
                    game.log(player, '潜行（不可被指定为目标）');
                },
                ai: { noe: true },
            },
            blessZero: {
                // 新描述「于移除全部暗之祝福层数…前除外」：暗之祝福归零（自然衰减/追击耗尽/
                // 外部移除）即结束掠袭。监听 bts_mark_remove（改装 removeMark 端口派发，见
                // content.js；自然衰减 phaseJieshuBegin 与追击耗尽都经 removeBless→removeMark），
                // 该事件在层数归零时先于暗祝福标记技能卸载派发，本子技（属角色技能）恒挂载可收到。
                trigger: { global: 'bts_mark_remove' },
                forced: true,
                silent: true,
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_moze_dark_assault') > 0 &&
                        event.player === player &&
                        event.markName === 'bts_bless_dark' &&
                        !lib.bts.api.getBless(player, 'dark')
                    );
                },
                async content(event, trigger, player) {
                    lib.skill['bts_sk_lvexi'].util.endLvexiState(player);
                },
                ai: { noe: true },
            },
            clear: {
                // 源 L6561-6571（Death）：你或猎物死亡 → 结束掠袭
                trigger: { player: 'dieAfter', global: 'dieAfter' },
                forced: true,
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_moze_dark_assault') > 0 &&
                        (event.player === player ||
                            event.player?.playerid === player.storage.bts_moze_prey)
                    );
                },
                async content(event, trigger, player) {
                    lib.skill['bts_sk_lvexi'].util.endLvexiState(player);
                },
                ai: { noe: true },
            },
        },
        ai: { result: { player: 1 } },
    },
};

// 结束掠袭的公共清理：解除潜行与钺贯强化、移除状态标记与猎物上的猎杀标记
//（源 L6550-6557 耗尽路径与 L6561-6571 死亡路径共用；blessZero 归零路径复用）。
// 三处监听统一走本函数，避免清理逻辑分散；幂等，可重复调用（事件先后交错无害）。
// 经 bts_sk_lvexi.util 挂载（叁岛 util 字段范式）：content 只能经 lib.skill['bts_sk_lvexi'].util 访问。
function endLvexiState(player) {
    const prey = game.filterPlayer(
        (p) => p.playerid === player.storage.bts_moze_prey,
    )[0];
    if (prey)
        prey.removeMark(
            `bts_mk_liewu_${player.playerid}`,
            prey.countMark(`bts_mk_liewu_${player.playerid}`),
            false, // 内部簿记键：静默移除（与 addMark 的 log=false 成对）
        );
    player.removeMark('bts_mk_liewu', player.countMark('bts_mk_liewu')); // 固定键镜像同步移除
    player.removeMark(
        'bts_mk_moze_dark_assault',
        player.countMark('bts_mk_moze_dark_assault'),
    );
    delete player.storage.bts_moze_prey;
    endLvexi(player); // 潜行/钺贯强化随状态一并解除
}

// 解除潜行与钺贯强化（源结束路径共用）
function endLvexi(player) {
    player.removeMark('bts_mk_moze_stealth', player.countMark('bts_mk_moze_stealth'));
    player.removeMark(
        'bts_mk_yueguan-clear',
        player.countMark('bts_mk_yueguan-clear'),
    );
    player.removeSkill('bts_sk_yueguan_buff');
    player.removeSkill('bts_sk_yueguan_buff_hit');
}

export const marks = {
    bts_mk_moze_dark_assault: {
        markKind: 'mark',
        markType: 'text',
        glossaryId: 'bts_glossary_moze_dark_assault_faq',
    },
    bts_mk_moze_stealth: {
        markKind: 'mark',
        markType: 'text', // 源版无对应图标素材（@moze_stealth 为移植新增状态），文字角标
    },
    bts_mk_liewu: {
        // 固定键镜像：掠袭进行中=1（动态 bts_mk_liewu_<pid> 无法静态注册，图标已就位）
        markKind: 'mark',
    },
};

export const translate = {
    // 可选皮肤显示名（皮肤N；scripts/migrate.mjs --skins 维护，图经 image/skin 目录扫描发现）。
    'bts_ch_moze_skin1': '皮肤1',
    'bts_ch_moze_skin2': '皮肤2',
    bts_ch_moze: '貊泽',
    bts_sk_fengying: '锋影',
    bts_sk_fengying_info: `${get.poptip('bts_glossary_bisha_faq')}，出牌阶段，你可以失去3点${get.poptip('bts_glossary_nuqi_faq')}，弃置一名其他角色一张牌（${get.poptip('bts_glossary_xingqi_faq')}时获得之），然后视为对其使用【杀】。`,
    bts_sk_zhechi: '折翅',
    bts_sk_zhechi_info: '锁定技，你使用黑色【杀】的次数上限+3，使用红色【杀】的次数上限-1。',
    bts_sk_lvexi: '掠袭',
    bts_sk_lvexi_info: `当你造成伤害后，若你没有${get.poptip('bts_glossary_bless_dark_faq')}，你可以发动${get.poptip('bts_sk_yueguan')}（你的锦囊牌视为风【杀】）并附加4层${get.poptip('bts_glossary_bless_dark_faq')}，若如此做，将此伤害角色标记为猎物；此回合结束时你进入潜行，不可被其他角色指定为目标，直到移除全部${get.poptip('bts_glossary_bless_dark_faq')}层数、或你或猎物死亡。猎物受到其他角色【杀】伤害后，你移除1层${get.poptip('bts_glossary_bless_dark_faq')}并视为对其使用【杀】。若此伤害已使目标死亡，则无法发动。`,

    '$bts_sk_fengying1': "该收割了",
    '$bts_sk_fengying2': "风声所到之处…你无所遁形！",
    '$bts_sk_zhechi1': "我，即是锋刃……",
    '$bts_sk_zhechi2': "我，即是阴影……",
    '$bts_sk_lvexi1': "时机，转瞬即逝",
    '$bts_sk_lvexi2': "夜色，如影随形",
    '$bts_sk_lvexi3': "幽冥，奔袭！",
    '$bts_sk_lvexi4': "乌羽潜行",
    '~bts_ch_moze': "功亏…一篑……",
    bts_bless_dark: '暗之祝福',
    bts_bless_dark_info: '来源：掠袭赋予；无属性伤害→量子；回合结束自然减少1层',
    bts_mk_moze_dark_assault: '暗袭',
    bts_mk_moze_dark_assault_info: '来源：掠袭赋予；掠袭：猎物受杀后追击',
    bts_mk_moze_stealth: '潜行',
    bts_mk_moze_stealth_info: '来源：掠袭赋予；不可被其他角色指定为目标，暗之祝福清空或你/猎物死亡时解除',
    bts_mk_liewu: '猎物',
    bts_mk_liewu_info: '来源：掠袭赋予；标记目标角色为猎物，掠袭结束移除',
};

export const simpleTranslate = {
    bts_sk_fengying_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}弃（${get.poptip('bts_glossary_xingqi_faq')}获得）目标1牌并对其使用杀`,
    bts_sk_zhechi_info: '锁；黑杀次数+3，红杀次数-1',
    bts_sk_lvexi_info: `造成伤害后无${get.poptip('bts_glossary_bless_dark_faq')}可发动${get.poptip('bts_sk_yueguan')}（锦囊当风杀）+4层并标记猎物，回合结束潜行（不可被指定为目标）至${get.poptip('bts_glossary_bless_dark_faq')}清空或死亡；猎物受他人杀伤耗1层追击；目标已被打死则无法发动`,
};

export const pinyins = { bts_ch_moze: 'moze' };

export const buffSkills = {
    bts_bless_dark: {
        markKind: 'bless',
        glossaryId: 'bts_glossary_bless_dark_faq',
        // 转换类祝福挂 damageBefore（最早钩子，先于 damageBegin1-4 与元素相克，无需 priority 魔法值；
        // firstDo 保证在其它同事件监听前完成属性转换，见《技能开发规范》A13）。
        firstDo: true,
        trigger: { source: 'damageBefore' },
        forced: true,
        silent: true,
        filter(event, player) {
            return (
                event.source === player &&
                event.num > 0 &&
                // 源版 L1151-1154：暗之祝福无 _common 排除，_common 技能杀（无属性）照样转暗
                //（2026-09-13 回退至源版）。
                !lib.bts.api.getNature(event)
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了暗之祝福');
            lib.bts.api.setDamageNature(trigger, 'dark');
        },
    },
};

// ── 角色专属词条（TODO 任务3 自 glossary.js 归位；正文引用本角色技能）。
// 词条数据随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_dark_faq',
        name: '暗之祝福',
        info: '当你造成无属性伤害时，视为量子属性伤害。你的结束阶段开始时，此祝福减少1层。',
    },
    {
        id: 'bts_glossary_moze_dark_assault_faq',
        name: '|暗袭|',
        info: `貊泽专属：${get.poptip('bts_sk_lvexi')}赋予；猎物受他人【杀】伤害后追击；暗之祝福清空或你/猎物死亡时结束。`,
    },
];
