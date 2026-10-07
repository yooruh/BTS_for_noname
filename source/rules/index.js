// 崩铁杀规则核心注册 + 运行时结算注册表。
//  ── ruleService：通用结算只处理源公共机制；角色/祝福专属分支由角色模块按事件/mod 钩子注册。
//  ── 命名导出：gamerule 技能、来源追踪、BGM 跟随、AI 守卫、buff/标记生命周期与规则数据，
//     由 precontent.js / content.js import 调用（幂等）；非游戏规则注册在 content.js 内联。
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
            // type 用 'default'（只入 lib.group）；传 'all' 会进 lib.selectGroup（自选势力）并把身份
            // 选将池按「神」处理、排除崩铁杀角色（identity.js L1025）。config.image → 势力牌图标。
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
 * 属性伤害注册（game.addNature；数据源 rules/natures.js）。属性 7 键（earth/flame/frost/elec/
 * wind/dark/light）全部注册进 lib.nature（否则翻译/判断/排序不可用）；角色属性用 bts_n_<key>
 * 标记跟踪，伤害属性经 damage._btsNature 传递（颜色/排序见 NATURE_CONFIG）。
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
 * 全局规则技能注册 + 全局 API 挂载（bts_gamerule_* 与词条）。标记技能已随角色包
 * info.skill 注册，不经本函数（只负责全局规则技能与来源追踪）。
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
}

/**
 * 标记来源维护全局技能（gameStart 初始化来源并挂摘来源驱动标记；单独安装，不并入 RULE_SKILLS）。
 * 运行时来源增量由 buff 生命周期钩子经 godSync → syncMarkSources 同步。
 */
export function installMarkSourceTrack() {
    if (lib.skill[SOURCE_TRACK]) return;
    lib.skill[SOURCE_TRACK] = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            // 全局技能对每名玩家各触发一次 → 本实例只执行一次（锚点 game.me，无座位回退首个玩家）。
            const anchor = game.me ?? game.players[0];
            if (player !== anchor) return;
            for (const p of game.players) lib.bts.api?.godSync?.(p);
        },
    };
    game.addGlobalSkill(SOURCE_TRACK);
}

// ── BGM 跟随主公（移植源 btsbgm 技能，animal.lua L955-972）─────────────────────
// 身份模式开局且开启「BGM跟随与切换」时，切为主公专属 BGM（清单 source/bgm-list.js 由
// rebuild 生成）；崩铁主公无专属文件 → 随机对战音乐（duel1-12）；非崩铁主公不干预。
// 循环：崩铁杀 BGM 设 loop=true，抑制引擎 ended→playBackgroundMusic 换曲覆盖。
//
// 实现约束：① gameStart 无 event.player，触发用 global；② content 必须 async——StepCompiler
// 会字符串化重编译同步 content，模块变量（如 extensionPath）重编译后不可见；③ ui.backgroundMusic
// 是各端本地媒体，切换/回滚经 broadcastAll 广播（载荷禁闭包）；锚点 game.me ?? game.players[0]；
// ④ 开关 bts_bgm_control 为「各端本地」语义：广播只传方法名+数据，各端 _local* 按本端开关应用。
export function installBgmFollow() {
    if (lib.skill.bts_bgm_follow) return;
    lib.skill.bts_bgm_follow = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            if (get.mode() !== 'identity') return;
            // 开关不在发起端判定：广播照发，各端 _localFollow/_localFollowReset 按本端开关应用。
            // 全局技能每名玩家各触发一次 → 本实例只执行一次（锚点同 installMarkSourceTrack）。
            const anchor = game.me ?? game.players[0];
            if (player !== anchor) return;
            const zhu = game.zhu;
            if (!zhu) return;
            const id = zhu.name;
            if (!id || !id.startsWith('bts_') || !lib.character[id]) {
                // 非崩铁杀主公：恢复引擎默认行为（ended → playBackgroundMusic）；经 broadcastLocal 广播。
                broadcastLocal('_localFollowReset');
                return;
            }
            const file = BGM_LIST.has(id)
                ? id
                : `duel${1 + Math.floor(Math.random() * 12)}`;
            // 循环：引擎 ended 监听会重设 src 覆盖主公 BGM，loop=true 时 ended 不触发。
            // 联机：broadcastLocal 调各端 _localFollow（开关判定、失败回滚、渐变就地完成）。
            broadcastLocal('_localFollow', { file });
        },
    };
    game.addGlobalSkill('bts_bgm_follow');
}

// ── BGM 切换/还原机制（技能级；lib.bts.bgm）── 接口：switch(file[, expire[, owner]]) /
// restore(file) / reset()。开关为「各端本地」语义：广播只传意图（方法名+Ref 数据），各端按本端
// 开关应用；关闭端 switch 不应用不记栈，restore 以本端栈为凭据（中途关设置仍能还原）。
//
// 数据：lib.bts.bgm.stack = [ [prevRef, nextRef], ... ]（模块级；每局由 bts_bgm_stack_reset
// 清空防跨局残留）。Ref 为可跨端解析的引用（载荷禁闭包）：{ file } 崩铁杀 BGM / { engine } 内置 /
// { off } 停播 / { raw } 其他 src 原文（跨端不保证可还原）；可附 { loop }（缺省 file→true，抑制
// ended 换曲）与 { startAt } 秒（就绪后 seek；「从副歌开始」由调用方声明，机制不查曲目表；restore
// 不带起点）。切换/跟随统一「淡出 BGM_FADE_MS → 换源（含 seek）→ 淡入」（各端本地渐变）。
//
// switch：各开启端捕获本端当前播放为 prevRef 压栈并应用 nextRef；传 expire 时注册一次性自动
// 还原（owner.when(expire,false).step(移除监听→restore).finish()，到期事件名补 lib.hookmap）。
// expire 与技能 trigger 同构（字符串/数组默认挂 player 域）；owner 为监听锚点（缺失报错）。
// restore：栈尾找最近 [X, file]——其后有 [file, Z] 则合并为 [X, Z] 放回原位（不切歌）；否则
// 移除并切回 X；栈空/未命中不动作（幂等）。
const BGM_SETTING = 'bts_bgm_control';
const BGM_RESET_SKILL = 'bts_bgm_stack_reset';

// ── 渐变与起点（实现细节）：起点由调用方参数给出（Ref.startAt）；未指定从头播。渐变各端本地
// 线性进行；被后续应用打断时旧渐变作废（token），连切不跳音量（基准沿用）。
const BGM_FADE_MS = 600; // 单侧渐变时长（淡出/淡入各一段）
const BGM_FADE_STEP_MS = 40;

// 本端渐变状态：定时器 + 代际 token + 满音量基准。
let bgmFadeTimer = null;
let bgmFadeToken = 0;
let bgmBaseVolume = null;

/** 停止本端进行中的渐变（新应用接管时调用）。 */
function stopBgmFade() {
    if (bgmFadeTimer) {
        clearInterval(bgmFadeTimer);
        bgmFadeTimer = null;
    }
    bgmFadeToken++;
}

function bgmEnabled() {
    return Boolean(game.getExtensionConfig('崩铁杀', BGM_SETTING));
}

/**
 * 目标标识 → Ref：字符串（'music_off' / bgm 文件名 / 引擎 BGM ID）或 Ref 对象直传
 *（如 { file, startAt }；拷贝一份防外部对象被就地改写）。
 */
function resolveBgmRef(target) {
    if (target && typeof target === 'object') {
        if (!target.file && !target.engine && !target.off && !target.raw)
            throw new TypeError(`BGM 标识无效：${JSON.stringify(target)}`);
        return { ...target };
    }
    if (typeof target !== 'string' || !target)
        throw new TypeError(`BGM 标识无效：${target}`);
    if (target === 'music_off') return { off: true };
    if (BGM_LIST.has(target) || /^duel\d+$/.test(target)) return { file: target };
    return { engine: target };
}

/** 捕获当前播放为 Ref（主机侧读取；归一为可跨端解析的引用）。 */
function captureBgmRef() {
    const el = ui.backgroundMusic;
    // 判空须查 getAttribute('src')：无属性时 IDL src 返回文档 URL（非空），会把「无 BGM」
    // 误记成 { raw }；解析后等于本页 URL 的同样视为无 BGM。
    const raw = el.getAttribute('src');
    if (!raw) return { off: true };
    const src = el.src;
    if (src === location.href) return { off: true };
    const loop = Boolean(el.loop);
    let decoded = src;
    try {
        decoded = decodeURIComponent(src);
    } catch (error) {
        // src 含非法百分号转义时保持原样（仅影响路径匹配，转为 raw 记录）
    }
    const matched = /extension\/崩铁杀\/audio\/bgm\/([^/]+)\.mp3$/.exec(decoded);
    if (matched) return { file: matched[1], loop };
    return { raw: src, loop };
}

/**
 * 换源（纯设置）：off 清源；其余设 src 与 loop，起点在元数据就绪后 seek（覆盖式单 handler，
 * 连切时旧回调天然作废）；opts.onError 挂一次性失败回滚。
 */
function setBgmSource(el, ref, opts = {}) {
    if (ref.off) {
        el.onloadedmetadata = null;
        el.onerror = null;
        el.src = '';
        return;
    }
    let url = '';
    if (ref.file) {
        el.loop = ref.loop ?? true;
        url = `${lib.assetURL}extension/崩铁杀/audio/bgm/${ref.file}.mp3`;
    } else {
        el.loop = ref.loop ?? false;
        if (ref.engine) {
            url = `${lib.assetURL}audio/background/${ref.engine}.mp3`;
        } else if (ref.raw) {
            url = ref.raw;
        }
    }
    const startAt = ref.startAt ?? 0; // 起点=Ref 显式参数（跟随/还原不带 → 从 0 起）
    if (startAt > 0) {
        el.onloadedmetadata = () => {
            el.onloadedmetadata = null;
            try {
                el.currentTime = startAt; // 元数据就绪后 seek
            } catch (error) {
                // 媒体不支持 seek 时忽略（保持从头播放）
            }
        };
    } else {
        el.onloadedmetadata = null;
    }
    if (opts.onError) {
        el.onerror = () => {
            el.onerror = null;
            opts.onError();
        };
    } else {
        el.onerror = null;
    }
    el.src = url;
}

/**
 * 本端应用 Ref：淡出 → 换源（含 seek）→ 淡入（不做开关判定）。时间驱动（performance.now）：
 * tick 延迟时总时长仍≈BGM_FADE_MS。基准音量仅无进行中渐变时重取；淡出从当前实际音量续降。
 */
function applyBgm(ref, opts = {}) {
    const el = ui.backgroundMusic;
    if (bgmFadeTimer == null) bgmBaseVolume = el.volume;
    const startVol = el.volume; // 淡出起点＝当前实际音量（打断续切时不跳音，从现位继续降）
    stopBgmFade();
    const base = bgmBaseVolume ?? el.volume;
    const token = bgmFadeToken;
    const fadeStart = performance.now();
    let swapAt = 0; // 换源时刻（>0 即进入淡入阶段）
    bgmFadeTimer = setInterval(() => {
        if (token !== bgmFadeToken) return; // 已被新应用接管（stop 已清定时器，双保险）
        const now = performance.now();
        if (!swapAt) {
            const k = Math.min(1, (now - fadeStart) / BGM_FADE_MS);
            el.volume = Math.max(0, startVol * (1 - k));
            if (k >= 1) {
                el.volume = 0;
                setBgmSource(el, ref, opts);
                swapAt = now;
            }
            return;
        }
        const k = Math.min(1, (now - swapAt) / BGM_FADE_MS);
        el.volume = Math.min(base, base * k);
        if (k >= 1) {
            el.volume = base;
            clearInterval(bgmFadeTimer);
            bgmFadeTimer = null;
        }
    }, BGM_FADE_STEP_MS);
}

/**
 * 广播「调用各端本地实现」：载荷只引用引擎全局 lib 与入参——各端执行 lib.bts.bgm[method](payload)，
 * 开关判定/压栈/还原均在各端本地完成。
 */
function broadcastLocal(method, payload) {
    game.broadcastAll((name, data) => {
        lib.bts.bgm[name](data);
    }, method, payload);
}

/** 两个 Ref 是否指向同一 BGM（栈查找/合并用）。 */
function sameBgmRef(a, b) {
    if (!a || !b) return false;
    if (a.off || b.off) return Boolean(a.off && b.off);
    if (a.file !== undefined || b.file !== undefined) return a.file === b.file;
    if (a.engine !== undefined || b.engine !== undefined) return a.engine === b.engine;
    return a.raw === b.raw;
}

/** 注册一次性自动还原（owner.when 动态监听；参照 tempBanSkill 写法）。 */
function registerBgmExpire(expire, owner, target) {
    let spec = expire;
    if (typeof spec === 'string' || Array.isArray(spec)) spec = { player: spec };
    const anchor = owner ?? spec?.owner;
    const trigger = {};
    for (const role of ['player', 'source', 'target', 'global']) {
        if (spec?.[role] != null) trigger[role] = spec[role];
    }
    if (!anchor || !Object.keys(trigger).length)
        throw new Error('BGM 自动还原需要 expire 与 owner（监听锚点玩家）');
    // 参照 addTempSkill：到期事件名补 lib.hookmap（含 relatedTrigger 复合名展开），
    // 无监听的事件也能派发到本动态监听。
    for (const role of Object.keys(trigger)) {
        let names = trigger[role];
        if (!Array.isArray(names)) names = [names];
        for (const name of names) {
            if (typeof name !== 'string') continue;
            lib.hookmap[name] = true;
            const prefix = Object.keys(lib.relatedTrigger).find((key) =>
                name.startsWith(key),
            );
            if (prefix) {
                for (const rawTrigger of lib.relatedTrigger[prefix]) {
                    lib.hookmap[`${rawTrigger}${name.slice(prefix.length)}`] = true;
                }
            }
        }
    }
    // 一次性自动还原：when 动态技能常驻，step 先移除自身再 restore（offline_piracyE 范式；重复触发幂等）。
    anchor
        .when(trigger, false)
        // 死亡后触发器默认被引擎拦下（createTrigger：isDead 且无 forceDie 不派发）；BGM 还原
        // 属全局状态维护，须 forceDie 才能到达本 step（参照引擎延迟牌 when 范式 content.js:7353）。
        .assign({ forceDie: true })
        .step(async (event, triggerEvent, player) => {
            player.removeSkill(event.name);
            restoreBgm(target);
        })
        .finish();
}

/**
 * 切换 BGM 并广播意图（开关按各端本地判定；开启端记录入栈）。
 * @param {string|object} target 崩铁杀 bgm 文件名（audio/bgm 下）或无名杀 BGM ID；
 *   需指定播放起点时传 Ref 对象：{ file: 'bts_ch_zhigengniao', startAt: 33.7 }
 * @param {string|string[]|object} [expire] 自动还原时机（技能 trigger 同构；见顶部注释）
 * @param {object} [owner] 监听锚点玩家（expire 为对象时也可写在其 owner 字段）
 */
function switchBgm(target, expire, owner) {
    const next = resolveBgmRef(target);
    // 不设发起端门（主机没开客机开时客机仍须切换；关闭端 _localSwitch no-op）；broadcastAll 在
    // 主机本地同步执行一次，主机与客机同走 _localSwitch。
    broadcastLocal('_localSwitch', next);
    if (expire != null) registerBgmExpire(expire, owner, target);
}

/** 还原 BGM（合并/回退规则见顶部注释；各端按本端栈执行，栈空或未命中不动作）。 */
function restoreBgm(target) {
    const key = resolveBgmRef(target);
    broadcastLocal('_localRestore', key);
}

/** 安装 BGM 切换/还原机制（挂载 lib.bts.bgm + 每局清栈全局技能；幂等）。 */
export function installBgmControl() {
    lib.bts.bgm.switch = switchBgm;
    lib.bts.bgm.restore = restoreBgm;
    lib.bts.bgm.reset = () => {
        lib.bts.bgm.stack.length = 0;
    };
    // ── 各端本地实现（广播只传方法名+数据；本地函数可引用模块作用域——禁闭包只约束载荷）──
    // 本端应用切换：关闭端不应用、不记栈；开启端捕获本端当前 BGM 压栈后应用。
    lib.bts.bgm._localSwitch = (ref) => {
        if (!bgmEnabled()) return;
        lib.bts.bgm.stack.push([captureBgmRef(), ref]);
        applyBgm(ref);
    };
    // 本端还原：以本端栈为凭据（没切过的端栈空天然 no-op；中途关设置的端仍能还原）。
    lib.bts.bgm._localRestore = (ref) => {
        const stack = lib.bts.bgm.stack;
        if (!stack.length) return;
        let hit = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (sameBgmRef(stack[i][1], ref)) {
                hit = i;
                break;
            }
        }
        if (hit < 0) return;
        // 自己已被另一个切换叠掉：[X, 自己]+[自己, Z] 合并为 [X, Z] 放回原位、播放不动
        //（链条保持完整，便于 Z 还原时找回 X）。
        let merged = -1;
        for (let i = hit + 1; i < stack.length; i++) {
            if (sameBgmRef(stack[i][0], ref)) {
                merged = i;
                break;
            }
        }
        if (merged >= 0) {
            const entry = [stack[hit][0], stack[merged][1]];
            stack.splice(merged, 1);
            stack.splice(hit, 1, entry);
            return;
        }
        // 自己是最近一次切换：移除并切回原 BGM（含捕获 loop）；splice 返回元素数组（外层包
        // 元组），需双层解构取 prevRef。
        const [[prev]] = stack.splice(hit, 1);
        applyBgm(prev);
    };
    // 本端清栈（跨局回收；无开关门——残留清理不改变播放，不涉及开关语义）。
    lib.bts.bgm._localReset = () => {
        lib.bts.bgm.stack.length = 0;
    };
    // 本端「跟随主公」应用：payload={file} 走 applyBgm、不带起点；加载失败回滚原曲目与
    // 循环状态（兜底优先「有声音」，不补渐变）。
    lib.bts.bgm._localFollow = (payload) => {
        if (!bgmEnabled()) return;
        const el = ui.backgroundMusic;
        const prevSrc = el.src;
        const prevLoop = el.loop;
        applyBgm(
            { file: payload.file },
            {
                onError() {
                    el.loop = prevLoop;
                    el.src = prevSrc;
                },
            },
        );
    };
    // 本端「跟随复位」（非崩铁主公：恢复引擎默认循环行为；关闭端保持本端现状）。
    lib.bts.bgm._localFollowReset = () => {
        if (!bgmEnabled()) return;
        ui.backgroundMusic.loop = false;
    };
    if (lib.skill[BGM_RESET_SKILL]) return;
    lib.skill[BGM_RESET_SKILL] = {
        trigger: { global: 'gameStart' },
        forced: true,
        silent: true,
        async content(event, trigger, player) {
            // 全局技能对每名玩家各触发一次 → 本实例只执行一次（同 installBgmFollow）。
            const anchor = game.me ?? game.players[0];
            if (player !== anchor) return;
            // 各端清各自的栈（客机残余栈会让「还原」误操作）。
            broadcastLocal('_localReset');
        },
    };
    game.addGlobalSkill(BGM_RESET_SKILL);
}

// ── 场景曲注册（源 due30.mp3 → 设置·音效·背景音乐可选）──────────────────────
// 登记进 lib.configMenu.audio.config.background_music.item（显示名）与 lib.config.all.
// background_music（合法值/随机池）；链接用 ext: 形式（引擎解析 extension/<路径>），不改安装目录。
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
// 显示类标记（mark:true + hiddenSkill）以「技能」形式挂载：层数>0 addSkill（承载显示与触发）、
// 归零 removeSkill；包装 player.addMark/removeMark 统一处理（含角色代码直接 addMark 的标记）。
// 标记变化走自定义事件 bts_mark_add/bts_mark_remove（不依赖引擎内建触发，跨 fork 不可靠）：
// 在引擎改存储后手动派发镜像事件，仅 bts_ 前缀。时序：godSync 之后创建；移除侧在 removeSkill
// 前派发、附加侧在 addSkill 后派发（保证自身 buffSkill 已挂载可收到）；安装期置 lib.hookmap。
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
        // log 策略（定夺）：记录类静默、资源/效果类保留；显式传参优先。
        const effectiveLog = log === undefined ? shouldLogMark(name) : log;
        const result = origAddMark.call(this, name, num, effectiveLog);
        const added = this.countMark(name) - before;
        // 星启祝福层数变化 → 重算星启来源并挂摘统一「星启」标记（godSync）。
        if (name === MARKS.bless('god')) lib.bts.api?.godSync?.(this);
        // 先 addSkill（同步生效）再派发 bts_mark_add——保证自身 buffSkill（如生息/升格）已挂载可收到。
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
        // log 策略同 addMark。
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
 * 崩铁杀自定义事件注册：bts_pet_add / bts_pet_remove / bts_resource_add /
 * bts_shield_removed / bts_funny_act_after（bts_mark_add/remove 见 installBuffSkillLifecycle）。
 * 派发点见 rules/utils.js emit()；事件名须命中 lib.hookmap 门禁，安装期统一置位（幂等）。
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

// ── 「不可被指定为目标」目标封锁挂载（貊泽·掠袭·潜行先行，实现通用化）──
// 源版以 alive=false 让潜行者从一切目标选择中消失；无名杀逐路径等价实现：
//   ① 卡牌选目标：targetEnabled mod（自定义 filterTarget 会整体替换默认过滤器 → 由 ②③ 覆盖）；
//   ② 技能选目标：Check.processSelection 候选判据（UI 与 AI 同一份 selectable 名单）；
//   ③ 自动「视为使用」：useCard 内容首步过滤目标，全滤空时中止（源「目标为空则 return false」同义）。
// 判据统一 lib.bts.api.untargetable(target)；自身指定自身不受限。
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
    // ③ 就地包裹 useCard 首步（不能 insert 新步骤：内容用绝对索引 goto，插步会错位；就地包裹
    // 保持索引不变；事件播放前同步构造，首步读到最终 targets）。
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
