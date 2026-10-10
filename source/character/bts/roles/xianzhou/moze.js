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
            // AI 口径：怒气≥3（filter 同门）且场上有敌方才发；收益=弃/获目标1牌+视为使用的【杀】
            //（带暗之祝福时转暗、目标带异元素再相克+1），可击杀加权；星启改为获得该牌
            //（源 AI max_fengying：怒≥3+enemies>0，Enemies_AI 选敌，StarRail-ai.lua L3400-3416）
            order(item, player) {
                if (lib.bts.aiGuard.blocked(player, 'bts_sk_fengying')) return -1;
                if (!lib.bts.api.getAngry(player, 3)) return -1; // filter 同门
                const isGod = lib.bts.api.god(player);
                const dark = lib.bts.api.getBless(player, 'dark'); // 暗之祝福：无属性伤害转暗
                let best = 0;
                for (const t of game.players) {
                    if (!t.isAlive() || t === player) continue;
                    if (get.attitude(player, t) >= 0) continue; // 只打敌方
                    let v = 1.5; // 1点伤害≈1.5评估单位
                    if (dark) {
                        const nat = lib.bts.api.getNature(null, t);
                        if (nat && nat !== 'dark') v += 1.5; // 相克：目标带异元素时+1
                    }
                    v += Math.min(1, t.countCards('he')) * 0.8; // 弃置/获得目标1张牌
                    if (isGod) v += 0.8; // 星启：改为获得（己方+1牌）
                    if (t.hp <= 1) v += 2.5; // 杀命中即击杀
                    best = Math.max(best, v);
                }
                if (!best) return -1; // 无敌方目标不发动
                return best >= 5.5 ? 8 : best >= 3.5 ? 6 : 5;
            },
            threaten: 2,
            result: {
                // 对敌：1点【杀】伤害（暗祝福相克+1）+弃牌，可击杀加权（与 order 同源）
                target: (player, target) => {
                    let v = 1.5;
                    if (lib.bts.api.getBless(player, 'dark')) {
                        const nat = lib.bts.api.getNature(null, target);
                        if (nat && nat !== 'dark') v += 1.5;
                    }
                    if (target.hp <= 1) v += 2.5;
                    return -v;
                },
            },
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
    },

    // ── 触发技·掠袭（源 st_lvexi = TriggerSkill Damage/Damaged/Death，L6511-6577）──
    // 当你造成伤害后，若你没有暗之祝福，可发动钺贯（锦囊当风杀）并附加4层暗之祝福，
    // 将此伤害角色标记为猎物；此回合结束时进入潜行（不可被指定为目标），直到暗之祝福
    // 全部移除、你或猎物死亡、或全场仅剩2人；猎物受到其他角色【杀】伤害后，你移除1层暗之祝福并追击【杀】。
    bts_sk_lvexi: {
        // 源 L6521（Damage，lua player=伤害来源）：造成伤害后、无暗之祝福时发动。
        // 无名杀伤害事件的 player=受伤者，故用 source 定位来源；damageEnd 在濒死链之后发射
        //（gameEvent trigger "End"），被此伤害打死的目标此时 isAlive() 已为 false——
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
            // 源 L6521：askForSkillInvoke（可选发动）；新描述无弃【杀】费用。
            // AI 口径：仅当伤害对象为敌方时接（源 AI @st_lvexi 卡询：isEnemy(damage.to) 否则不发，
            // StarRail-ai.lua L3418-3422）——对友方发动会将其标记为猎物，后续追击将误伤队友。
            event.result = await player
                .chooseBool(
                    `掠袭：发动${get.poptip('bts_sk_yueguan')}（你的锦囊牌视为风【杀】）并附加4层${get.poptip('bts_glossary_bless_dark_faq')}，将${get.translation(trigger.player)}标记为猎物？`,
                )
                .set('ai', () => get.attitude(player, trigger.player) < 0)
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
            // 「猎物」标记挂在猎物本人（源 L6527；定夺：改为猎物本体显示，贴近源版）。
            // 动态 per-猎物 键为内部簿记：log=false 关闭日志与 get.info 校验（否则未注册键
            // 触发「孩子，你的技能…」告警）。
            prey.addMark('bts_mk_liewu', 1); // 固定键：猎物本体显示「猎物」徽章
            prey.addMark(`bts_mk_liewu_${player.playerid}`, 1, false); // 内部簿记（每貊泽一份）
        },
        group: [
            'bts_sk_lvexi_assault',
            'bts_sk_lvexi_stealth',
            'bts_sk_lvexi_blessZero',
            'bts_sk_lvexi_clear',
        ],
        // 源 L6515-6518（EventPhaseStart NotActive）：潜行——置 alive=false，不可被指定为目标。
        // 卡牌路径走本 mod（引擎 canUse/chooseToUse 默认过滤器读 targetEnabled）；技能自定义
        // filterTarget 与自动 useCard 两条路径由 rules/index.js installUntargetableGuard 的
        //「选目标候选守卫 + useCard 首步守卫」兜住（三处判据统一为 lib.bts.api.untargetable；
        // 单层 targetEnabled 会被黑塔·魔法/效率、Archer·螺旋 等绕过）。
        mod: {
            targetEnabled(card, player, target) {
                if (player !== target && lib.bts.api.untargetable(target))
                    return false;
            },
        },
        // 角色技能特化方法（叁岛 util 范式）：endLvexiState 见文件下方。
        // 同步 content 会被 StepCompiler 重编译（仅引擎全局在作用域），模块内函数必须经
        // lib.skill['bts_sk_lvexi'].util.<fn> 访问（同白厄 bts_sk_fanshi.util）。
        util: { endLvexiState },
        subSkill: {
            assault: {
                // 源 L6542-6560：猎物受到其他角色【杀】伤害后，移除1层暗之祝福并追击【杀】
                audio: 'bts_sk_lvexi',
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
                    // 源 L6550-6557：暗之祝福耗尽、或全场仅剩2人 → 结束掠袭
                    //（定夺：恢复源版退出条件，源为 room:getAllPlayers(true):length()==2，
                    // 按项目惯例取存活角色数 ≤2；blessZero 为主路径，此处双保险且幂等）。
                    if (
                        !lib.bts.api.getBless(player, 'dark') ||
                        lib.bts.api.alivePlayerCount() <= 2
                    )
                        lib.skill['bts_sk_lvexi'].util.endLvexiState(player);
                },
            },
            stealth: {
                // 源 L6515-6518（EventPhaseStart NotActive）：此回合结束时进入潜行——
                // alive=false（无名杀以三层封锁近似：targetEnabled mod + 选目标候选守卫 + useCard 首步守卫）。
                // 时机：源相位表末项只对「标记持有者自己的回合结束」命中，与 player:'phaseEnd'
                // 等价——勿改为 global。
                trigger: { player: 'phaseEnd' },
                forced: true,
                filter(event, player) {
                    // 仅掠袭进行中、尚未潜行、且全场不止2人时进入（源 NotActive 分支无
                    // 人数判据；「全场仅剩2人即结束」政策覆盖潜行进入，避免残局僵持——定夺）。
                    return (
                        player.countMark('bts_mk_moze_dark_assault') > 0 &&
                        !player.countMark('bts_mk_moze_stealth') &&
                        lib.bts.api.alivePlayerCount() > 2
                    );
                },
                async content(event, trigger, player) {
                    player.addMark('bts_mk_moze_stealth', 1);
                    game.log(player, '潜行（不可被指定为目标）');
                },
            },
            blessZero: {
                // 暗之祝福归零（自然衰减/追击耗尽/外部移除）即结束掠袭。监听 bts_mark_remove
                //（自然衰减与追击耗尽均经 removeBless→removeMark）；该事件在归零时先于暗祝福
                // 标记技能卸载派发，本子技（属角色技能）恒挂载可收到。
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
            },
            clear: {
                // 源 L6561-6571（Death）：你或猎物死亡 → 结束掠袭；定夺恢复源版「全场仅剩2人
                // 时退出」（任一阵亡使存活数 ≤2 同样结束；潜行随 endLvexiState 解除）。
                trigger: { player: 'dieAfter', global: 'dieAfter' },
                forced: true,
                // 自己阵亡（player dieAfter）时已标 dead，须 forceDie 才能触发清理；
                // 死后「猎物死亡 / 人数≤2」再触发亦为幂等清理，无害
                forceDie: true,
                filter(event, player) {
                    return (
                        player.countMark('bts_mk_moze_dark_assault') > 0 &&
                        (event.player === player ||
                            event.player?.playerid === player.storage.bts_moze_prey ||
                            lib.bts.api.alivePlayerCount() <= 2)
                    );
                },
                async content(event, trigger, player) {
                    lib.skill['bts_sk_lvexi'].util.endLvexiState(player);
                },
            },
        },
        // AI 口径：result 供跨技能估值——发动后获4层暗之祝福（无属性伤害→暗、异元素相克+1）
        //＋钺贯强化（锦囊当风【杀】）＋回合末潜行（不可被指定为目标）；是否发动由 cost 内联 AI
        // 决定（仅对敌）（源 animal.lua L6511-6577）
        ai: { result: { player: 1 } },
    },
};

// 结束掠袭的公共清理（源耗尽/死亡/归零路径共用）：解除潜行与钺贯强化、移除状态标记
// 与猎物标记。幂等，可重复调用（事件先后交错无害）；经 bts_sk_lvexi.util 挂载
//（content 只能经 lib.skill['bts_sk_lvexi'].util 访问）。
export function endLvexiState(player) {
    // 猎物查找必须含阵亡者：本函数最常经「猎物死亡」（dieAfter）触发，此时死亡角色已移出
    // game.players（进 game.dead），普通 filterPlayer 找不到 → 猎物标记残留（findPlayer2 兜住）。
    const prey = game.findPlayer2(
        (p) => p.playerid === player.storage.bts_moze_prey,
        true,
    );
    if (prey) {
        prey.removeMark(
            `bts_mk_liewu_${player.playerid}`,
            prey.countMark(`bts_mk_liewu_${player.playerid}`),
            false, // 内部簿记键：静默移除（与 addMark 的 log=false 成对）
        );
        prey.removeMark('bts_mk_liewu', prey.countMark('bts_mk_liewu')); // 猎物本体显示标记
    }
    player.removeMark(
        'bts_mk_moze_dark_assault',
        player.countMark('bts_mk_moze_dark_assault'),
    );
    delete player.storage.bts_moze_prey;
    endLvexi(player); // 潜行/钺贯强化随状态一并解除
}

// 解除潜行与钺贯强化（源结束路径共用）
export function endLvexi(player) {
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
        // 猎物本体显示标记：掠袭锁定猎物期间=1（动态 bts_mk_liewu_<pid> 为内部簿记不注册）
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
    bts_bless_dark_info: `来源：${get.poptip('bts_sk_lvexi')}赋予；无属性伤害→量子；回合结束自然减少1层`,
    bts_mk_moze_dark_assault: '暗袭',
    bts_mk_moze_dark_assault_info: `来源：${get.poptip('bts_sk_lvexi')}赋予；${get.poptip('bts_sk_lvexi')}：猎物受杀后追击`,
    bts_mk_moze_stealth: '潜行',
    bts_mk_moze_stealth_info: `来源：${get.poptip('bts_sk_lvexi')}赋予；不可被其他角色指定为目标，${get.poptip('bts_glossary_bless_dark_faq')}清空、你/猎物死亡或全场仅剩2人时解除`,
    bts_mk_liewu: '猎物',
    bts_mk_liewu_info: `来源：${get.poptip('bts_sk_lvexi')}赋予；标记目标角色为猎物，${get.poptip('bts_sk_lvexi')}结束移除`,
};

export const simpleTranslate = {
    bts_sk_fengying_info: `${get.poptip('bts_glossary_bisha_faq')}；失3${get.poptip('bts_glossary_nuqi_faq')}弃（${get.poptip('bts_glossary_xingqi_faq')}获得）目标1牌并对其使用杀`,
    bts_sk_zhechi_info: '锁；黑杀次数+3，红杀次数-1',
    bts_sk_lvexi_info: `造成伤害后无${get.poptip('bts_glossary_bless_dark_faq')}可发动${get.poptip('bts_sk_yueguan')}（锦囊当风杀）+4层并标记猎物，回合结束潜行（不可被指定为目标）至${get.poptip('bts_glossary_bless_dark_faq')}清空或死亡；猎物受他人杀伤耗1层追击；目标已被打死则无法发动`,
};

export const pinyins = {}; // 如果默认的拼音正确，不需要再使用字符串数组定义拼音

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
                // 源 L1151-1154：暗之祝福无 _common 排除，无属性技能杀照样转暗（定夺回退源版）。
                !lib.bts.api.getNature(event)
            );
        },
        async content(event, trigger, player) {
            game.log(player, '触发了暗之祝福');
            lib.bts.api.setDamageNature(trigger, 'dark');
        },
    },
};

// ── 角色专属词条：随角色包 gather('glossary') 聚合进 fullTranslate（详见 character/bts/index.js）。
export const glossary = [
    {
        id: 'bts_glossary_bless_dark_faq',
        name: '暗之祝福',
        info: `当你造成无属性伤害时，视为${get.poptip('bts_glossary_nature_dark_faq')}伤害。你的结束阶段开始时，此${get.poptip('bts_glossary_bless_faq')}减少1层。`,
    },
    {
        id: 'bts_glossary_moze_dark_assault_faq',
        name: '|暗袭|',
        info: `貊泽专属：${get.poptip('bts_sk_lvexi')}赋予；猎物受他人【杀】伤害后追击；${get.poptip('bts_glossary_bless_dark_faq')}清空或你/猎物死亡时结束。`,
    },
];
