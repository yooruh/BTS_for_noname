// 崩铁杀规则核心注册 + 运行时结算注册表（2026-09-23 重构定稿）。
// 职责分两部分：
//  ── 运行时注册表 ruleService：通用结算器只处理 animal.lua 的公共机制；
//     角色/祝福专属分支由角色模块按事件或 mod 钩子注册（registerEvent / registerMod）。
//  ── 规则类注册（本文件直接命名导出）：全局技能实现的（gamerule 规则技能、
//     标记来源追踪、BGM 跟随、AI 守卫、buff/标记生命周期）与游戏规则数据
//     （资源/势力/属性），由 precontent.js / content.js 直接 import 调用（注册均幂等）。
//     非游戏规则注册（工具函数/无名杀通用注册/UI/AI/音频特性/延迟包/poptip）在 content.js 内联；
//     扩展设置项定义在 source/config.js（不迁移）。
import { lib, game, get, ui } from '../../../../noname.js';
import { extensionPath } from '../tool/utils/paths.js';
import { KINGDOMS, KINGDOM_COLORS } from '../character/bts/factions.js';
import { NATURES, NATURE_CONFIG } from './natures.js';
import { MARKS, SOURCE_TRACK, shouldLogMark } from './markRegistry.js';
import { bts } from './utils.js';
import {
    bts_gamerule_damage,
    bts_gamerule_recover,
    bts_gamerule_phase,
    bts_gamerule_decay,
    glossary as RULE_GLOSSARY,
} from './globalrules.js';
import { BGM_LIST } from '../bgm-list.js';
import { aiGuard, aiGuardReset } from '../tool/ai/aiGuard.js';

// 全局规则技能（globalrules.js，bts_gamerule_ 前缀 → 挂全局）。
const RULE_SKILLS = {
    bts_gamerule_damage,
    bts_gamerule_recover,
    bts_gamerule_phase,
    bts_gamerule_decay,
};

// installBuffSkillLifecycle 的幂等守卫（模块级标志）。
let buffLifecycleInstalled = false;

const EVENT_HANDLERS = new Map();
const MODIFIERS = new Map();

function addEntry(table, key, handler, priority = 0) {
    if (typeof handler !== 'function')
        throw new TypeError(`崩铁杀规则处理器 ${key} 必须是函数`);
    const entries = table.get(key) ?? [];
    const entry = { handler, priority };
    entries.push(entry);
    entries.sort((a, b) => b.priority - a.priority);
    table.set(key, entries);
    return () => {
        const current = table.get(key);
        if (!current) return;
        const index = current.indexOf(entry);
        if (index >= 0) current.splice(index, 1);
        if (!current.length) table.delete(key);
    };
}

// ── 运行时结算注册表（角色/祝福专属分支的事件/数值钩子）────────────────────
export const ruleService = {
    // registerEvent('damageEnd', async (event, player) => {}, priority)
    registerEvent(name, handler, priority = 0) {
        return addEntry(EVENT_HANDLERS, name, handler, priority);
    },
    async dispatchEvent(name, event, player) {
        for (const { handler } of EVENT_HANDLERS.get(name) ?? []) {
            await handler(event, player);
        }
    },
    // registerMod('attackRange', (player, range) => range + 1, priority)
    registerMod(name, handler, priority = 0) {
        return addEntry(MODIFIERS, name, handler, priority);
    },
    dispatchMod(name, ...args) {
        let value = args.at(-1);
        for (const { handler } of MODIFIERS.get(name) ?? []) {
            const result = handler(...args.slice(0, -1), value);
            if (result !== undefined) value = result;
        }
        return value;
    },
    clear() {
        EVENT_HANDLERS.clear();
        MODIFIERS.clear();
    },
};

// ── 规则数据注册（precontent 阶段调用，幂等）──────────────────────────────
/** 资源样式注册（lib.init.css；原先内联于 precontent.js）。 */
export function registerAssets() {
    lib.init.css(`${extensionPath}/style/css`, 'extension');
    lib.bts.runtime.assetsRegistered = true;
}

/** 势力注册（game.addGroup；数据源 character/bts/factions.js）。 */
export function registerKingdoms() {
    for (const [id, short, name] of KINGDOMS) {
        if (!lib.group.includes(id)) {
            // type 'default'：只加入 lib.group（普通势力）。⚠ 不能传 'all'——
            // 'all' 会把势力加入 lib.selectGroup（自选势力列表，默认仅含 shen/devil），
            // 使身份模式把崩铁杀角色当作"神"（get.selectGroup 返回全部势力自选、
            // 身份选将池 identity.js L1025 直接 continue 排除）。
            // config.image → 引擎 addGroup 钩子注册 group_<id> 势力牌（PNG 图标）。
            game.addGroup(
                id,
                short,
                name,
                {
                    color: KINGDOM_COLORS[id],
                    image: `${extensionPath}/image/kingdom/icon/${id}.png`,
                },
                'default',
            );
        }
        // 选将武将卡右上角势力标签的背景色（引擎读 get.translation(`<势力key>Color`)）。
        lib.translate[`${id}Color`] ??= KINGDOM_COLORS[id];
    }
}

/**
 * 属性伤害注册（game.addNature；数据源 rules/natures.js）。
 * 崩铁杀属性 7 键（earth/flame/frost/elec/wind/dark/light = 物理/炎/霜/电/风/量子/虚数）
 * 以 natures.js 为单一来源；角色属性用 bts_n_<key> 标记跟踪，伤害属性经 damage._btsNature 传递。
 * 为避免属性伤害在引擎层面"未注册"（lib.nature 无对应项，属性翻译/判断/排序不可用），
 * 按本体机制把全部 7 键注册进 lib.nature（属性名/颜色/排序见 natures.js NATURE_CONFIG）。
 */
export function registerNatures() {
    for (const nature of NATURES) {
        if (lib.nature.has(nature)) continue;
        const natureConfig = NATURE_CONFIG[nature];
        game.addNature(nature, natureConfig.translation, {
            // 崩铁杀属性不参与本体铁索连环（linked）传导，走自研 bts_damage_link_。
            linked: false,
            order: natureConfig.order,
            color: natureConfig.color,
        });
    }
}

// ── 全局规则技能注册（content 阶段调用，幂等）────────────────────────────
/** 通用机制词条就地注册进 lib.translate（幂等 ??=，不覆盖包 fullTranslate 的相同值）。 */
function registerGlossary(glossary) {
    for (const entry of glossary) {
        lib.translate[entry.id] ??= entry.name;
        lib.translate[`${entry.id}_info`] ??= entry.info;
    }
}

/**
 * 全局规则技能注册 + 全局 API 挂载（bts_gamerule_* 全局技能 + 词条）。
 * 标记技能（全局 globalMarks / 角色 marks / buff）已随角色包 info.skill 注册，
 * 不再经本函数（registerRules 只负责全局规则技能与来源追踪）。
 */
export function registerRules() {
    registerGlossary(RULE_GLOSSARY);
    for (const [id, skill] of Object.entries(RULE_SKILLS)) {
        lib.skill[id] ??= skill;
        if (id.startsWith('bts_gamerule_') && !lib.skill.global.includes(id))
            game.addGlobalSkill(id);
    }
    // 全局 API 挂载（技能代码统一经 lib.bts.* 访问，规避重编译丢包级绑定）。
    lib.bts.api = bts;
    lib.bts.rules = ruleService;
    // 原 lib.bts.dispatch（resolver HANDLERS 派发）已随 bts_gamerule_ex 拆分移除——
    // 全局规则各自为独立技能（bts_gamerule_damage/recover/phase/decay，见 globalrules.js）。
}

/**
 * 标记来源维护全局技能（gameStart 初始化来源并挂摘来源驱动标记）。
 * 单独以「守卫 + addGlobalSkill」安装（同主公开局 BGM 技能 installBgmFollow 的写法），
 * 不并入 RULE_SKILLS 的纯注册流程。游戏中的来源增量（如星启祝福加/减层）由
 * buff 生命周期的 addMark/removeMark 钩子经 lib.bts.api.godSync → syncMarkSources 同步。
 */
export function installMarkSourceTrack() {
    if (lib.skill[SOURCE_TRACK]) return;
    lib.skill[SOURCE_TRACK] = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            // 全局技能对每名玩家各触发一次 → 本实例只执行一次。
            // 联机下内容在主机结算：game.me 为主机座位，主机无座位（旁观开房）时回退
            // 首个玩家，保证同步仍恰好执行一次（旧守卫在无座位实例上会永不执行）。
            const anchor = game.me ?? game.players[0];
            if (player !== anchor) return;
            for (const p of game.players) lib.bts.api?.godSync?.(p);
        },
    };
    game.addGlobalSkill(SOURCE_TRACK);
}

// ── BGM 跟随主公（移植源 btsbgm 技能，animal.lua L955-972）─────────────────────
// 开启设置「BGM跟随主公」后，身份模式开始游戏时把背景音乐切换为主公的
// 专属 BGM（audio/bgm/<主公id>.mp3，由 scripts/migrate-bgm.mjs 迁移）。
// 匹配规则：主公有专属 BGM（source/bgm-list.js 清单，由 rebuild 扫描生成）
// → 播放专属 BGM；崩铁主公无专属文件 → 随机对战音乐（duel1-12）；非崩铁主公
// 不干预（保持引擎默认）。源里「AI 主公且体力上限 <10 → duel」的分支已取消，
// 改按「主公有无专属 BGM」判断，AI/人类不再区分。
// 循环：切到崩铁杀 BGM 时设 loop=true（引擎默认靠 ended→playBackgroundMusic
// 换曲，会把主公 BGM 覆盖成配置曲，需以 loop 抑制）；非崩铁杀主公恢复 loop=false。
//
// 注意1：gameStart 事件没有 event.player，触发角色必须用 global（引擎所有
// 内置技能均为 trigger: { global: 'gameStart' }）；原实现误用 player 导致永不触发。
// 注意2：content 必须是 async——引擎 StepCompiler 会把同步 content 字符串化重编译
// （新函数只能访问 _status/lib/game/ui/get/ai 全局），模块变量（如 extensionPath）
// 在重编译后不可见会抛 ReferenceError；async content 不参与重编译，闭包保留。
// 注意3（联机，2026-10-03）：ui.backgroundMusic 是各端本地媒体，切换/回滚须经
// game.broadcastAll 广播到所有客户端（引擎约定：载荷函数禁引用模块作用域变量，
// 只用引擎全局与入参）；执行锚点 game.me ?? game.players[0]（主机无座位时旧
// game.me 守卫会漏跑，BGM 则任何一端都切不了）。
export function installBgmFollow() {
    if (lib.skill.bts_bgm_follow) return;
    lib.skill.bts_bgm_follow = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            if (get.mode() !== 'identity') return;
            if (!game.getExtensionConfig('崩铁杀', 'bts_bgm_follow_zhu'))
                return;
            // 全局技能对每名玩家各触发一次 → 本实例只执行一次；联机下内容在主机结算，
            // 主机无座位时回退首个玩家（保证仍触发一次）。
            const anchor = game.me ?? game.players[0];
            if (player !== anchor) return;
            const zhu = game.zhu;
            if (!zhu) return;
            const id = zhu.name;
            if (!id || !id.startsWith('bts_') || !lib.character[id]) {
                // 非崩铁杀主公：恢复引擎默认行为（ended → game.playBackgroundMusic 换曲）。
                // 各端本地媒体：经 broadcastAll 广播（单机时等价本地执行）。
                game.broadcastAll(() => {
                    ui.backgroundMusic.loop = false;
                });
                return;
            }
            const file = BGM_LIST.has(id)
                ? id
                : `duel${1 + Math.floor(Math.random() * 12)}`;
            // 循环播放：引擎的 backgroundMusic 不设 loop，而是监听 ended 调
            // game.playBackgroundMusic() 按配置重设 src（会覆盖主公 BGM，导致
            // 播一遍就没了）；loop 为 true 时 ended 事件不触发，换曲监听随之失效。
            // 与引擎 playBackgroundMusic 的 ext: 分支一致（lib.assetURL + extension/<目录名>/）。
            // 兜底：极端情况下（如 duel 曲也被删除）加载失败时恢复原 BGM，避免音乐中断。
            const url = `${lib.assetURL}extension/崩铁杀/audio/bgm/${file}.mp3`;
            // 联机：ui.backgroundMusic 是各端本地 <audio>，须经 broadcastAll 同步执行
            //（引擎约定：载荷函数禁引用模块作用域变量，只用引擎全局与入参；
            // 错误回滚在各端就地读取 prev、就地回滚，跨端自洽）。
            game.broadcastAll((bgmUrl) => {
                ui.backgroundMusic.loop = true;
                const prev = ui.backgroundMusic.src;
                ui.backgroundMusic.onerror = () => {
                    ui.backgroundMusic.onerror = null;
                    if (ui.backgroundMusic.src !== prev) {
                        // 恢复原 BGM 时同步恢复引擎默认的循环行为（loop 关闭）。
                        ui.backgroundMusic.loop = false;
                        ui.backgroundMusic.src = prev;
                    }
                };
                ui.backgroundMusic.src = bgmUrl;
            }, url);
        },
    };
    game.addGlobalSkill('bts_bgm_follow');
}

// ── 场景曲注册（源 due30.mp3 → 设置·音效·背景音乐可选）──────────────────────
// 引擎可选背景音乐列表 = lib.configMenu.audio.config.background_music.item（显示名）
// + lib.config.all.background_music（合法值/随机池；init 阶段导入 game/package.js 的
// music 目录）。扩展把自带场景曲登记进二者：文件随扩展发布（audio/bgm/due30.mp3），
// 链接用 ext: 形式（playBackgroundMusic 对 ext: 分支解析 extension/<路径>），
// 不改动无名杀安装目录，重装引擎不丢失。扩展加载（init 的 loadExtension）晚于
// 音乐目录导入、早于设置菜单构建，故登记后打开设置即可见。
const SCENE_BGM_LINK = 'ext:崩铁杀/audio/bgm/due30.mp3';
const SCENE_BGM_NAME = '崩铁杀·场景曲（due30）';
export function installSceneBgm() {
    const item = lib.configMenu?.audio?.config?.background_music?.item;
    const all = lib.config?.all?.background_music;
    if (!item || !all) return;
    if (item[SCENE_BGM_LINK]) return;
    item[SCENE_BGM_LINK] = SCENE_BGM_NAME;
    if (!all.includes(SCENE_BGM_LINK)) all.add(SCENE_BGM_LINK);
}

// ── buff 标记技能生命周期（叁岛 buff 技能模式）────────────────────────────
// 所有显示类标记（RULE_MARKS，mark: true + hiddenSkill）以「技能」形式挂载：
// 标记层数 > 0 时 addSkill（技能不可见，承载标记显示与触发效果），
// 层数归零时 removeSkill（标记用完删除技能）。包装 player.addMark/removeMark
// 统一处理（含角色代码直接 addMark 的标记，如赌注/朔望/残梦/飞黄等）。
//
// 扩展自定义标记触发（任务6，TODO 任务6）：本包技能不再监听引擎内建
// addMark/removeMark 触发（跨无名杀 fork 该二内建触发不一定存在/规范），改为
// 监听自定义事件 bts_mark_add/bts_mark_remove。此二事件在此处（引擎
// addMark/removeMark 实际改变存储后）手动派发：构造镜像引擎 addMark/removeMark
// 的事件（emptyEvent content → event.trigger(event.name)），仅对 bts_ 前缀标记
// 派发（16 处监听对象皆 bts_*，减少无关开销、不干扰引擎其他 mark 监听）。
// 事件在 godSync 之后创建；移除侧在 removeSkill 之前派发（保证自身 buffSkill 仍挂载可收到）；
// 附加侧在 addSkill（同步生效：skills.add + addSkillTrigger 立即执行）之后派发（同理保证挂载，
// 2026-10-02 修正：原顺序下「自身标记首次被附加」的 buffSkill 收不到事件）。
// 派发事件名需命中 lib.hookmap 门禁（gameEvent trigger L955），故安装期强制置位；
// 具体技能侧已把 trigger 的 addMark/removeMark 字面量改为 bts_mark_add/bts_mark_remove。
const MARK_EVT_ADD = 'bts_mark_add';
const MARK_EVT_REMOVE = 'bts_mark_remove';

/** 构造并手动派发一个 bts_ 标记变化事件（字段镜像引擎 addMark/removeMark）。 */
function dispatchMarkEvent(evtName, player, markName, num, log) {
    const next = game.createEvent(evtName, false, get.event());
    next.player = player;
    next.num = num;
    next.markName = markName;
    next.log = log;
    next.forceDie = true;
    next.includeOut = true;
    next.setContent('emptyEvent');
}

export function installBuffSkillLifecycle() {
    if (buffLifecycleInstalled) return;
    buffLifecycleInstalled = true;
    lib.hookmap[MARK_EVT_ADD] = true;
    lib.hookmap[MARK_EVT_REMOVE] = true;
    const proto = lib.element.Player.prototype;
    const origAddMark = proto.addMark;
    const origRemoveMark = proto.removeMark;
    proto.addMark = function (name, num, log) {
        const before = this.countMark(name);
        // 标记变更 log 策略（2026-09-26 用户定夺）：仅记录类（不显示 UI 的内部簿记，
        // 如燔世系列）静默；资源/效果类保留；显式传参优先（false 静默 / true 记录）。
        const effectiveLog = log === undefined ? shouldLogMark(name) : log;
        const result = origAddMark.call(this, name, num, effectiveLog);
        const added = this.countMark(name) - before;
        // 星启祝福层数变化 → 重算星启来源并挂摘统一「星启」标记（godSync）。
        if (name === MARKS.bless('god')) lib.bts.api?.godSync?.(this);
        // 先挂载「标记技能」（addSkill 同步生效），再派发 bts_mark_add——保证自身 buffSkill
        //（如生息/升格：监听自身 bts_ 标记被「附加」）在派发时已完成挂载可收到。
        if (lib.skill[name]?.mark && !this.hasSkill(name)) {
            this.addSkill(name);
        }
        if (added && String(name).startsWith('bts_')) {
            dispatchMarkEvent(MARK_EVT_ADD, this, name, added, effectiveLog);
        }
        return result;
    };
    proto.removeMark = function (name, num, log) {
        const before = this.countMark(name);
        // 标记变更 log 策略（同 addMark；2026-09-26 用户定夺）。
        const effectiveLog = log === undefined ? shouldLogMark(name) : log;
        const result = origRemoveMark.call(this, name, num, effectiveLog);
        const removed = before - this.countMark(name);
        if (name === MARKS.bless('god')) lib.bts.api?.godSync?.(this);
        if (removed > 0 && String(name).startsWith('bts_')) {
            dispatchMarkEvent(MARK_EVT_REMOVE, this, name, removed, effectiveLog);
        }
        if (
            lib.skill[name]?.mark &&
            this.countMark(name) <= 0 &&
            this.hasSkill(name)
        ) {
            this.removeSkill(name);
        }
        return result;
    };
}

/**
 * 崩铁杀自定义事件注册（2026-10-02 技能效果自注册重构）。
 * 除 bts_mark_add/bts_mark_remove（见 installBuffSkillLifecycle）外的自派发事件：
 *   bts_pet_add / bts_pet_remove / bts_resource_add / bts_shield_removed / bts_funny_act_after
 * 派发点见 rules/utils.js emit()；消费技能以 trigger: { player/global: '<名>' } 监听。
 * 事件名须命中 lib.hookmap 门禁（引擎 gameEvent.js trigger 门禁），故安装期统一置位；
 * 幂等：重复赋值无副作用。
 */
const CUSTOM_EVENTS = [
    'bts_pet_add', // 忆灵登场/重复召唤（utils.addPet）
    'bts_pet_remove', // 忆灵离场（utils.removePet，先于形态还原派发）
    'bts_resource_add', // 怒气/祝福/护盾被附加（utils.addAngry/addBless/addShield）
    'bts_shield_removed', // 护盾因伤害被抵扣（rules/globalBuffs.js bts_shield）
    'bts_funny_act_after', // 欢愉行动后置（utils.afterFunnyAct）
];

export function installCustomEventHooks() {
    for (const name of CUSTOM_EVENTS) lib.hookmap[name] = true;
}

// ── AI 防重试守卫挂载（tool/ai/aiGuard.js，注册全局技能 bts_aiGuardReset）──
export function installAiGuard() {
    lib.bts.aiGuard = aiGuard;
    lib.skill.bts_aiGuardReset = aiGuardReset;
    if (!lib.skill.global.includes('bts_aiGuardReset'))
        game.addGlobalSkill('bts_aiGuardReset');
}

// ── 「不可被指定为目标」目标封锁挂载（2026-10-01；貊泽·掠袭·潜行先行，实现通用化）──
// 源版以 alive=false 让潜行者从一切目标选择与指定中消失；无名杀逐路径等价实现：
//   ① 卡牌选目标：技能自带 targetEnabled mod（moze.js）——引擎在 canUse 与 chooseToUse
//      的默认目标过滤器里读；但技能声明了自定义 filterTarget 时会整体替换默认过滤器
//      （不读 targetEnabled，黑塔·魔法/剑制 等全走该路径）→ 需 ② ③ 覆盖。
//   ② 技能选目标：chooseToUse/chooseTarget 的候选统一由 Check.processSelection 计算
//      （isSelectable → event.filterTarget；AI 的 get.selectableTargets 读同一份
//      selectable 名单）——在此追加判据，UI 与 AI 双端一并生效。
//   ③ 自动「视为使用」（技能以固定目标直接 useCard，不经选目标流程，如黑塔·效率、
//      Archer·螺旋 反击追杀）：useCard 内容首步过滤目标；全部目标被滤空时中止本次
//      使用（源 ViewAsCard「目标为空则 return false」同语义）。
// 判据统一为 lib.bts.api.untargetable(target)（utils.js）；自身指定自身不受限。
let untargetableGuardInstalled = false;

export function installUntargetableGuard() {
    if (untargetableGuardInstalled) return;
    untargetableGuardInstalled = true;
    // ② 选目标候选封锁。
    if (game.Check && typeof game.Check.processSelection === 'function') {
        const origProcess = game.Check.processSelection;
        game.Check.processSelection = function (options) {
            if (options && options.type === 'target') {
                const inner = options.isSelectable;
                options.isSelectable = function (target, event) {
                    if (!inner(target, event)) return false;
                    return !(
                        event?.player !== target &&
                        lib.bts.api?.untargetable?.(target)
                    );
                };
            }
            return origProcess.call(this, options);
        };
    }
    // ③ 自动「视为使用」封锁（就地包裹 useCard 内容首步）。
    //    不能 insert 新步骤：该内容内部用绝对索引 event.goto(11)/goto(12)，插步会使跳转
    //    错位；就地包裹则步骤索引布局不变。事件在播放前同步构造，首步能读到最终 targets；
    //    数组元素在编译产物里按运行时索引读取，安装早于任何对局，时序安全。
    const steps = lib.element.content?.useCard;
    if (Array.isArray(steps) && !steps.btsTargetGuard) {
        const first = steps[0];
        steps.btsTargetGuard = true;
        steps[0] = async function (event, trigger, player, result) {
            if (event.targets && event.targets.length) {
                const untargetable = lib.bts.api?.untargetable;
                if (typeof untargetable === 'function') {
                    const before = event.targets.length;
                    event.targets = event.targets.filter(
                        (target) =>
                            target === event.player || !untargetable(target),
                    );
                    if (before && !event.targets.length) {
                        // 全部目标均为不可指定者：视为未发生这次使用（与引擎首步
                        // 「err: no card → event.finish()」同式，后续步骤不再执行）。
                        event.finish();
                        return;
                    }
                }
            }
            return first.apply(this, arguments);
        };
    }
}
