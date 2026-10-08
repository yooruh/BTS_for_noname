// 身份模式 AI 选将（扩展配置 bts_ai_character_mode）：
//   random = 不干预（无名杀原生行为）；score = 太阳神权重表（characterPickWeights.js）+ 主公启发式；
//   style = 手工标定的技能定位标签（STYLE_TAGS），按身份偏好序列挑选。
//   score 取位＝「评分排名 + 排名概率抽取」（仿太阳神 GeneralSelector，见下方小节）；
//   主公位评分另用体力价值饱和曲线（同小节），避免混开武将池时被极端体力武将霸榜。
//
// ── 引擎现状与拦截点（对本 fork 实测）───────────────────────────────
// identity.js L1589-1728：主公 20% 取 list2[0] 否则 list[0]；忠臣 50% 取首个同势力
//   否则 list[0]；其余取 list[0]（双将第二将取 list[1]）；即除随机分支外总是读取 list 前两位/首个同势力位。
//
// 拦截策略（不重写引擎、不动 mode 文件）：
//   1. 包装 game.chooseCharacter：执行窗口内置位「选将流程深度」，窗口内同步创建的
//      chooseCharacter 事件（game.createEvent）被捕获，把 next.ai 的赋值换成我们的包装；
//   2. 包装后的 ai 先按配置选出目标角色 X，再把 X 挪到「引擎必然读取的位置」：
//      · 主公：list 中 X 置顶，并把 list2 内容替换为 [X]（同时覆盖 20% 分支）；
//      · 忠臣：若候选中存在与主公同势力者，X 只从同势力候选中选
//        （引擎 50% 分支强制读首个同势力候选，限制后两个分支都命中 X）；
//      · 其余：X 置顶；
//   3. 调用原 ai —— init、back 回填等全部簿记仍由引擎完成。
//
// ── 范围与限制 ──────────────────────────────────────────────────────────────
//   · 仅单机、identity_mode=normal 的标准身份；明忠/谋攻/3v3v2 与联机不拦截（保持引擎行为）；
//   · 主公位候选含本体武将（混开武将池时允许本体当主公），但体力项按引擎 get.condition 口径
//     饱和（hp>4 时 4+√(hp−4)）——线性体力计分正是「无脑选高体力（兀突骨 15 / 董卓 8）」的根因；
//   · 双将第二将仍按引擎逻辑（list[1]）；候选在 lib.characterReplace 中时引擎照旧再随机替换；
//   · 配置每次调用时读取，设置项切换后下一局生效。
import { lib, game, _status } from '../../../../../noname.js';
import { GENERIC, BY_LORD } from './characterPickWeights.js';

const EXTENSION = '崩铁杀';
const CONFIG_KEY = 'bts_ai_character_mode';
// 参与本逻辑的身份（commoner 等扩展身份交还引擎随机）。
const PICK_IDENTITIES = ['zhu', 'zhong', 'fan', 'nei'];

// ── 流派标签（按技能特点人工标定）────────────────────────────
// 分类：输出 / 防御 / 辅助 / 控制 / 资源（资源=摸牌/牌差/额外回合等节奏运转）；
// 每角色 1-2 个标签、主定位在前；不以「命途」为准（命途只粗反映技能类型），未收录回退 PATH_FALLBACK（命途兜底）。
const STYLE_TAGS = {
    busitu: ['输出', '控制'],
    gilgamesh: ['输出', '辅助'],
    huohua: ['输出', '资源'],
    jizi_qixing: ['资源', '输出'],
    ren_qianye: ['输出'],
    shajin_xilang: ['资源', '控制'],
    yinlang_lv999: ['资源', '辅助'],
    yuanbanlin: ['输出', '资源'],
    zhigengniao_qingge: ['辅助', '资源'],
    aisida: ['资源', '辅助'],
    alan: ['输出', '防御'],
    daheita: ['输出', '资源'],
    heita: ['输出'],
    ruanmei: ['输出', '控制'],
    zhenliyisheng: ['输出'],
    agelaiya: ['输出', '控制'],
    baie: ['输出'],
    changyeyue: ['输出'],
    danheng_tenghuang: ['防御', '输出'],
    fengjin: ['辅助', '防御'],
    haiseyin: ['辅助', '资源'],
    kelvdela: ['辅助', '防御'],
    nakexia: ['控制', '输出'],
    saifeier: ['控制', '输出'],
    tibao: ['辅助', '输出'],
    wandi: ['防御', '输出'],
    xiadie: ['输出', '防御'],
    xilian: ['辅助', '输出'],
    archer: ['输出', '资源'],
    botiou: ['输出', '控制'],
    dalihua: ['控制', '辅助'],
    feicui: ['输出', '辅助'],
    heitiane: ['控制'],
    huahuo: ['辅助', '资源'],
    huangquan: ['控制', '输出'],
    jialahe: ['辅助'],
    luanpo: ['资源'],
    misha: ['控制', '输出'],
    saber: ['输出'],
    shajin: ['防御', '输出'],
    tuopa: ['资源', '输出'],
    xingqiri: ['辅助', '资源'],
    yinzhi: ['输出'],
    zhigengniao: ['辅助', '资源'],
    bailu: ['辅助', '防御'],
    danheng_yinyue: ['输出', '资源'],
    feixiao: ['输出'],
    fuxuan: ['防御'],
    guinaifen: ['输出', '控制'],
    hanya: ['辅助', '资源'],
    huohuo: ['辅助', '防御'],
    jiaoqiu: ['控制', '输出'],
    jingliu: ['输出', '控制'],
    jingyuan: ['输出', '辅助'],
    lingsha: ['辅助', '输出'],
    luocha: ['辅助'],
    moze: ['输出', '控制'],
    qingque: ['资源'],
    sushang: ['输出', '资源'],
    tingyun: ['辅助'],
    tingyun_wangguiren: ['控制', '辅助'],
    xueyi: ['输出'],
    yanqing: ['输出', '防御'],
    yukong: ['辅助', '输出'],
    yunli: ['防御', '辅助'],
    kafuka: ['控制', '输出'],
    liuying: ['输出', '资源'],
    ren: ['输出', '防御'],
    yinlang: ['控制'],
    danheng: ['输出'],
    himiko: ['输出'],
    kaituozhe: ['输出', '防御'],
    sanyueqi: ['控制', '防御'],
    welt: ['控制', '资源'],
    buluoniya: ['辅助', '资源'],
    huke: ['输出', '控制'],
    jiepade: ['防御', '控制'],
    kelala: ['防御', '输出'],
    lingke: ['辅助', '资源'],
    luka: ['输出'],
    natasha: ['辅助'],
    peila: ['控制', '辅助'],
    sangbo: ['控制'],
    xier: ['输出', '资源'],
    xiluwa: ['输出', '控制'],
};

// 命途兜底（tool/ui/title.js 的 PATH_BY_NAME 键）：未标定角色的粗分类。
const PATH_FALLBACK = {
    huimie: ['输出'],
    xunlie: ['输出'],
    zhishi: ['输出'],
    cunhu: ['防御'],
    fengrao: ['辅助'],
    tongxie: ['辅助'],
    xuwu: ['控制'],
    jiyi: ['控制'],
    huanyu: ['资源'],
};

// 身份 → 流派偏好序列（按草拟口径：主公防御/辅助/续航，忠臣辅助，反贼输出，内奸控场/生存）。
const STYLE_PREFERENCE = {
    zhu: ['防御', '辅助', '资源', '控制', '输出'],
    zhong: ['辅助', '防御', '控制', '资源', '输出'],
    fan: ['输出', '控制', '资源', '辅助', '防御'],
    nei: ['控制', '防御', '资源', '辅助', '输出'],
};

// ── 工具 ────────────────────────────────────────────────────────────────────
function pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/** bts_ch_<名> → <名>（权重表/流派表均以短名索引；非本扩展角色原样返回）。 */
function shortName(id) {
    return id.startsWith('bts_ch_') ? id.slice('bts_ch_'.length) : id;
}

/** 流派查询：手工标签优先，未收录回退命途；都查不到返回 null。 */
const pathCache = new Map();
function stylesOf(candidateId) {
    const tags = STYLE_TAGS[shortName(candidateId)];
    if (tags) return tags;
    let path = pathCache.get(candidateId);
    if (path === undefined) {
        path = null;
        const title = lib.characterTitle?.[candidateId];
        if (typeof title === 'string') {
            path = /bts_path_([a-z]+)/.exec(title)?.[1] ?? null;
        }
        pathCache.set(candidateId, path);
    }
    return path ? PATH_FALLBACK[path] ?? null : null;
}

// ── 评分（score）────────────────────────────────────────────────────────────
/** 非主公：GENERIC + BY_LORD 叠加（排序等价于源公式的 1.1^(w1+w2)）。 */
function scoreCandidate(candidateId, identity, zhuShort) {
    const name = shortName(candidateId);
    const generic = GENERIC[identity]?.[name] ?? 0;
    const specific = zhuShort ? BY_LORD[identity]?.[zhuShort]?.[name] ?? 0 : 0;
    return generic + specific;
}

/** 主公位无权重表数据：启发式评分（体力价值、技能数、主公技、流派适配）。 */
function scoreLordCandidate(candidateId) {
    const character = lib.character[candidateId];
    if (!character) return 0;
    // 兼容两种取法：1.11+ 的 Character 对象（hp/skills 属性）与旧式数组（[2]/[3]）。
    let hp = character.hp ?? character[2];
    if (typeof hp === 'string') hp = parseFloat(hp) || 0;
    const skills = character.skills ?? character[3];
    const skillCount = Array.isArray(skills) ? skills.length : 0;
    let score = lordHpValue(hp) * 0.5 + skillCount * 0.3;
    if (character.isZhugong) score += 1.5;
    const styles = stylesOf(candidateId);
    if (styles?.some((style) => ['防御', '辅助', '资源'].includes(style))) {
        score += 1;
    }
    return score;
}

/** 体力价值曲线：沿用引擎 get.condition（noname/get/index.js:6216）——体力 >4 时按 4+√(hp−4) 递减增长。
 *  本体极端体力（兀突骨 15 / 董卓 8）若按线性计分会把主公位评分拉满，即「无脑选高体力」的根因。 */
function lordHpValue(hp) {
    return hp > 4 ? 4 + Math.sqrt(hp - 4) : hp;
}

// ── 取位：评分排名 + 排名概率抽取（仿太阳神 GeneralSelector）──────────────────
// 太阳神按分值排序取前 6 名，再按累计百分位抽取（70%/15%/7%/3%/2%/2%）。
const RANK_PROB = [70, 85, 92, 95, 97, 99];

/** 按评分降序排名（主公位用主公启发式，其余用太阳神权重表）；同分随机定序，
 *  保证并列候选等概率进入任一排名（不依赖引擎调用前的 randomSort）。 */
function rankByScore(candidates, identity, zhuShort) {
    return candidates
        .map((candidate) => ({
            candidate,
            score:
                identity === 'zhu'
                    ? scoreLordCandidate(candidate)
                    : scoreCandidate(candidate, identity, zhuShort),
            tie: Math.random(),
        }))
        .sort((a, b) => b.score - a.score || a.tie - b.tie)
        .map((item) => item.candidate);
}

/** 排名概率抽取：第 1~6 名依次 70%/15%/7%/3%/2%/2%（候选不足 6 名时末位吸收剩余概率）。
 *  与源参考一致——权重/启发式只决定排名，抽选保留随机性，避免「每局固定同一名」。 */
function sampleByRank(ranked) {
    if (!ranked.length) return null;
    const pool = ranked.slice(0, RANK_PROB.length);
    if (pool.length === 1) return pool[0];
    const rnd = Math.random() * 100;
    for (let index = 0; index < RANK_PROB.length; index++) {
        if (rnd < RANK_PROB[index]) return pool[Math.min(index, pool.length - 1)];
    }
    return pool[pool.length - 1];
}

/** 评分模式取位（全身份一致）：评分排名 + 排名概率抽取。 */
function pickByScore(candidates, identity, zhuShort) {
    return sampleByRank(rankByScore(candidates, identity, zhuShort));
}

// ── 流派（style）────────────────────────────────────────────────────────────
function pickByStyle(candidates, identity) {
    for (const style of STYLE_PREFERENCE[identity]) {
        const matched = candidates.filter((candidate) =>
            (stylesOf(candidate) ?? []).includes(style),
        );
        if (matched.length) return pickRandom(matched);
    }
    return null;
}

// ── 决策与取位 ──────────────────────────────────────────────────────────────
/** 选出目标角色；不满足条件（非 AI/非标准身份/无候选）返回 null。 */
function computePick(player, list) {
    const mode = game.getExtensionConfig(EXTENSION, CONFIG_KEY);
    if (mode !== 'score' && mode !== 'style') return null;
    if (_status.mode !== 'normal') return null;
    if (!Array.isArray(list) || !list.length) return null;
    if (player === game.me) return null; // 双保险：只干预 AI 位
    const identity = player.identity;
    if (!PICK_IDENTITIES.includes(identity)) return null;

    const zhu = game.zhu;
    const zhuShort = zhu?.name ? shortName(zhu.name) : null;
    let candidates = list;
    // 忠臣：候选中存在与主公同势力者时只从同势力候选里选（见文件头拦截策略 2）。
    if (identity === 'zhong' && zhu?.group) {
        const sameGroup = list.filter(
            (candidate) => lib.character[candidate]?.[1] === zhu.group,
        );
        if (sameGroup.length) candidates = sameGroup;
    }

    if (mode === 'score') {
        return pickByScore(candidates, identity, zhuShort);
    }
    return pickByStyle(candidates, identity);
}

function moveToFront(array, item) {
    const index = array.indexOf(item);
    if (index > 0) {
        array.splice(index, 1);
        array.unshift(item);
    }
}

/** 把选中的角色挪到引擎必然读取的位置（见文件头拦截策略）。 */
function reposition(list, list2, pick, identity) {
    moveToFront(list, pick);
    if (identity === 'zhu' && Array.isArray(list2)) {
        // list2 是 getZhuList() 的临时副本，整体替换即可（20% 分支先 randomSort 再读 [0]）。
        list2.splice(0, list2.length, pick);
    }
}

// ── 引擎拦截 ────────────────────────────────────────────────────────────────
let pickFlowDepth = 0; // 处于 game.chooseCharacter 同步执行窗口内的深度

function wrapAiDecision(originalAi) {
    return function (player, list, list2, back) {
        try {
            const pick = computePick(player, list);
            if (pick) reposition(list, list2, pick, player?.identity);
        } catch (error) {
            // 选将失败会拖死整局开局，这里兜底回退引擎随机；报错保持可见。
            console.error('[崩铁杀] AI 选将（bts_ai_character_mode）异常，回退引擎随机', error);
        }
        return originalAi.apply(this, arguments);
    };
}

/** 把事件上的 ai 赋值换成包装（内容里调用 event.ai(...) 时经 getter 取到包装）。 */
function trapEventAi(event) {
    let storedAi = null;
    Object.defineProperty(event, 'ai', {
        configurable: true,
        enumerable: true,
        get() {
            return storedAi;
        },
        set(value) {
            storedAi = typeof value === 'function' ? wrapAiDecision(value) : value;
        },
    });
}

/** 包装 game.createEvent（全引擎一次）：捕获选将流程窗口内创建的 chooseCharacter 事件。 */
function installCreateEventTrap() {
    if (game.createEvent.__btsAiPickTrap) return;
    const originalCreateEvent = game.createEvent;
    const wrapped = function (name, trigger, triggerEvent) {
        const event = originalCreateEvent.call(this, name, trigger, triggerEvent);
        if (pickFlowDepth > 0 && name === 'chooseCharacter' && event) {
            trapEventAi(event);
        }
        return event;
    };
    wrapped.__btsAiPickTrap = true;
    game.createEvent = wrapped;
}

/** 包装 game.chooseCharacter（身份模式装载后各局挂一次；标记幂等）。 */
function wrapChooseCharacter() {
    const original = game.chooseCharacter;
    if (typeof original !== 'function' || original.__btsAiPickWrapped) return;
    const wrapped = function () {
        pickFlowDepth += 1;
        try {
            return original.apply(this, arguments);
        } finally {
            pickFlowDepth -= 1;
        }
    };
    wrapped.__btsAiPickWrapped = true;
    game.chooseCharacter = wrapped;
}

/** 装载 identity 模式后补包装（game.chooseCharacter 在 switchMode 回调里才挂到 game 上）。 */
function patchIdentityMode() {
    try {
        wrapChooseCharacter();
    } catch (error) {
        console.error('[崩铁杀] AI 选将包装失败', error);
    }
}

function installModeLoadHook() {
    if (typeof game.loadModeAsync !== 'function' || game.loadModeAsync.__btsAiPickHooked) {
        return;
    }
    const original = game.loadModeAsync;
    const wrapped = function (name, callback, onerror) {
        const wrappedCallback = callback
            ? function (content) {
                  const result = callback.apply(this, arguments);
                  if (name === 'identity') patchIdentityMode();
                  return result;
              }
            : callback;
        return original.call(this, name, wrappedCallback, onerror);
    };
    wrapped.__btsAiPickHooked = true;
    game.loadModeAsync = wrapped;
}

/** content 阶段调用：安装 AI 选将（评分/流派）拦截；random 模式零干预。 */
export function installCharacterPickAI() {
    installCreateEventTrap();
    installModeLoadHook();
    patchIdentityMode(); // 热重载/调试场景：identity 已装载时立即补包装
    // 调试探针（用法见《调试与自动化测试手册》§7.6：lib.bts.aiPick.*）。
    if (lib.bts) {
        lib.bts.aiPick = {
            computePick,
            pickByScore,
            pickByStyle,
            rankByScore,
            sampleByRank,
            scoreCandidate,
            scoreLordCandidate,
            lordHpValue,
            stylesOf,
            STYLE_TAGS,
            STYLE_PREFERENCE,
        };
    }
}
