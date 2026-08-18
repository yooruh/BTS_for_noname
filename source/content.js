// 阶段2（content）：安装全局规则、真实 AI 守卫，并消费预载角色包信息。
import { lib, game, ui, get } from '../../../noname.js';
import { registerRules, installMarkSourceTrack } from './rules/index.js';
import { MARKS } from './rules/marks.js';
import { aiGuard, aiGuardReset } from './tool/ai/aiGuard.js';
import { registerCharacterPack } from './tool/pack/registry.js';
import { registerPoptips } from './tool/ui/poptips.js';
import { extensionPath } from './tool/utils/paths.js';
import { BGM_LIST } from './bgm-list.js';

// ── 势力名排版（武将卡右上角势力标签）────────────────────────────────────────
// 规律：≤3 字一行；4~5 字首行 2 字+其余第二行；≥6 字每行 3 字。
// 引擎在 ui.create.buttonPresets.character 里把完整势力名直接写入
// `.identity > div`（无子节点时）。此处 hook 该工厂，创建与 refresh 后重排。
function btsFormatKingdomName(text) {
    const chars = Array.from(text);
    const n = chars.length;
    if (n <= 3) return text;
    if (n <= 5)
        return `${chars.slice(0, 2).join('')}<br>${chars.slice(2).join('')}`;
    const lines = [];
    for (let i = 0; i < n; i += 3) lines.push(chars.slice(i, i + 3).join(''));
    return lines.join('<br>');
}

function btsFormatIdentity(node) {
    const group = node && node.node && node.node.group;
    if (!group) return;
    for (const div of group.querySelectorAll(':scope > div')) {
        if (div.childElementCount !== 0) continue;
        const text = div.textContent;
        if (text) div.innerHTML = btsFormatKingdomName(text);
    }
}

function installKingdomLayoutHook() {
    const createCharacter = ui.create.buttonPresets.character;
    if (
        typeof createCharacter !== 'function' ||
        createCharacter.__btsKingdomLayout
    )
        return;
    const wrapped = function (item, type, position, noclick, node) {
        const ret = createCharacter.apply(this, arguments);
        if (ret && ret.node) {
            btsFormatIdentity(ret);
            // refresh（如「切换」按钮换角色）会重写 group.innerHTML，需再次格式化。
            if (typeof ret.refresh === 'function') {
                const origRefresh = ret.refresh;
                ret.refresh = function (...args) {
                    const r = origRefresh.apply(this, args);
                    btsFormatIdentity(ret);
                    return r;
                };
            }
        }
        return ret;
    };
    wrapped.__btsKingdomLayout = true;
    ui.create.buttonPresets.character = wrapped;
}

function registerDeferredPacks(characterPacks) {
    for (const entry of Object.values(characterPacks)) {
        if (entry.registration !== 'deferred') continue;
        if (entry.info.mode && entry.info.mode !== get.mode()) continue;
        registerCharacterPack(entry.info, entry.displayName);
    }
}

// ── BGM 跟随主公（移植源 btsbgm 技能，animal.lua L955-972）─────────────────────
// 开启设置「BGM跟随主公」后，身份模式开始游戏时把背景音乐切换为主公的
// 专属 BGM（audio/bgm/<主公id>.mp3，由 scripts/migrate-bgm.mjs 迁移）。
// 匹配规则：主公有专属 BGM（source/bgm-list.js 清单，由 rebuild 扫描生成）
// → 播放专属 BGM；没有 → 随机对战音乐（duel1-12）。源里「AI 主公且体力上限
// <10 → duel」的分支已取消，改按「主公有无专属 BGM」判断，AI/人类不再区分。
// 循环：切到崩铁杀 BGM 时设 loop=true（引擎默认靠 ended→playBackgroundMusic
// 换曲，会把主公 BGM 覆盖成配置曲，需以 loop 抑制）；非崩铁杀主公恢复 loop=false。
//
// 注意1：gameStart 事件没有 event.player，触发角色必须用 global（引擎所有
// 内置技能均为 trigger: { global: 'gameStart' }）；原实现误用 player 导致永不触发。
// 注意2：content 必须是 async——引擎 StepCompiler 会把同步 content 字符串化重编译
// （新函数只能访问 _status/lib/game/ui/get/ai 全局），模块变量（如 extensionPath）
// 在重编译后不可见会抛 ReferenceError；async content 不参与重编译，闭包保留。
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
            if (player !== game.me) return; // 全局技能每人触发一次，本地只执行一次
            const zhu = game.zhu;
            if (!zhu) return;
            const id = zhu.name;
            if (!id || !id.startsWith('bts_') || !lib.character[id]) {
                // 非崩铁杀主公：恢复引擎默认行为（ended → game.playBackgroundMusic 换曲）。
                ui.backgroundMusic.loop = false;
                return;
            }
            const file = BGM_LIST.has(id)
                ? id
                : `duel${1 + Math.floor(Math.random() * 12)}`;
            // 循环播放：引擎的 backgroundMusic 不设 loop，而是监听 ended 调
            // game.playBackgroundMusic() 按配置重设 src（会覆盖主公 BGM，导致
            // 播一遍就没了）；loop 为 true 时 ended 事件不触发，换曲监听随之失效。
            ui.backgroundMusic.loop = true;
            // 与引擎 playBackgroundMusic 的 ext: 分支一致（lib.assetURL + extension/<目录名>/）。
            // 目录名用字面量（与 getExtensionConfig('崩铁杀', …) 同款，保证全局可解析）。
            // 兜底：极端情况下（如 duel 曲也被删除）加载失败时恢复原 BGM，避免音乐中断。
            const url = `${lib.assetURL}extension/崩铁杀/audio/bgm/${file}.mp3`;
            const prev = ui.backgroundMusic.src;
            const onError = () => {
                ui.backgroundMusic.onerror = null;
                if (ui.backgroundMusic.src !== prev) {
                    // 恢复原 BGM 时同步恢复引擎默认的循环行为（loop 关闭）。
                    ui.backgroundMusic.loop = false;
                    ui.backgroundMusic.src = prev;
                }
            };
            ui.backgroundMusic.onerror = onError;
            ui.backgroundMusic.src = url;
        },
    };
    game.addGlobalSkill('bts_bgm_follow');
}

// ── buff 标记技能生命周期（叁岛 buff 技能模式）────────────────────────────
// 所有显示类标记（RULE_MARKS，mark: true + hiddenSkill）以「技能」形式挂载：
// 标记层数 > 0 时 addSkill（技能不可见，承载标记显示与触发效果），
// 层数归零时 removeSkill（标记用完删除技能）。包装 player.addMark/removeMark
// 统一处理（含角色代码直接 addMark 的标记，如赌注/朔望/残梦/飞黄等）。
function installBuffSkillLifecycle() {
    if (installBuffSkillLifecycle.__done) return;
    installBuffSkillLifecycle.__done = true;
    const proto = lib.element.Player.prototype;
    const origAddMark = proto.addMark;
    const origRemoveMark = proto.removeMark;
    proto.addMark = function (name, num, log) {
        const result = origAddMark.apply(this, arguments);
        // 星启祝福层数变化 → 重算星启来源并挂摘统一「星启」标记（godSync）。
        if (name === MARKS.bless('god')) lib.bts.api?.godSync?.(this);
        if (lib.skill[name]?.mark && !this.hasSkill(name)) {
            this.addSkill(name);
        }
        return result;
    };
    proto.removeMark = function (name, num, log) {
        const result = origRemoveMark.apply(this, arguments);
        if (name === MARKS.bless('god')) lib.bts.api?.godSync?.(this);
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

// ── AI 选将逻辑口子（配置项 bts_ai_character_mode，实现预留）────────────────
// 配置值：random 纯随机（默认，无名杀原生行为）/ score 按评分 / style 按流派。
//
// 【无名杀身份模式选将现状】mode/identity.js：
//  - 单机 chooseCharacterPurple、联机 chooseCharacterPurpleOL；
//  - AI 选将均为纯随机：主公 L1278 list.randomGet()、其他角色 L1312 randomRemove(1)[0]；
//  - 选将池按势力分组，每势力角色数 < 12 的势力被剔除（L1229-1233，
//    崩铁杀多数势力因此进不了"势力选将"流程，如需可在此一并处理）。
//
// 【扩展层覆盖实现方法】（不改本体，升级无名杀不丢）：
//   1. 保存原函数并包装：
//        const orig = lib.mode.identity.chooseCharacterPurple;
//        lib.mode.identity.chooseCharacterPurple = function () { ... orig() ... };
//      （OL 版同理包装 chooseCharacterPurpleOL；先判 _status.connectMode）
//   2. AI 选将拦截点（事件 content 的 step 4/5/6）：
//      - 主公：AI 主公在 step 4 之后 init（L1273-1281），把 list.randomGet()
//        替换为 aiPickCharacter(list, 'zhu')；
//      - 其他角色：step 6（L1309-1314）randomRemove(1)[0] 替换为
//        aiPickCharacter(map[group], 身份)；
//      - 玩家候选池（chooseButton 的 list）也可按配置筛选。
//   3. 评分函数 aiPickCharacter(list, identity)：
//      - score 模式：对每个角色打分后取最高。维度建议：
//         体力上限（存活）、技能数/技能质量、崩铁杀体系适配
//         （必杀技/怒气/护盾/祝福/异常收益）、身份倾向：
//         主公→防御/辅助/续航，忠臣→辅助/与主公配合，
//         反贼→输出/集火，内奸→控场/生存；
//      - style 模式：为角色打"流派"标签（输出/防御/辅助/控制/资源），
//        AI 按身份优先选对应流派，再在流派内随机；
//      - isZhugong 标记（主公技角色）在主公选择时优先。
//   4. 注意：AI 玩家的 chooseButton 有 ai 回调（identity.js L1244-1246），
//      若走 chooseButton 的 AI 也可包装 _status.event.ai，但 AI 主公/路人
//      角色直接 init 不走 chooseButton，故以 step 内拦截为主。
function installCharacterPickAI() {
    const mode = game.getExtensionConfig('崩铁杀', 'bts_ai_character_mode');
    if (!mode || mode === 'random') {
        return; // 纯随机 = 无名杀原生行为，暂不干预
    }
    // TODO：按 score / style 实现（实现方法见上方注释），
    // 包装 lib.mode.identity.chooseCharacterPurple(OL) 并接入 aiPickCharacter。
}

export async function content(config, pack) {
    const extensionPack = lib.extensionPack['崩铁杀'];
    if (extensionPack) {
        extensionPack.author = "一个月惹";
        extensionPack.version = game.getExtensionConfig('崩铁杀', 'version');
    }
    registerRules();
    installKingdomLayoutHook();
    installBgmFollow();
    installMarkSourceTrack();
    installBuffSkillLifecycle();
    installCharacterPickAI();

    // 与叁岛相同：模式加载完成后再安装真实守卫，避免 global 列表被模式覆盖。
    lib.bts.aiGuard = aiGuard;
    lib.skill.bts_aiGuardReset = aiGuardReset;
    if (!lib.skill.global.includes('bts_aiGuardReset'))
        game.addGlobalSkill('bts_aiGuardReset');

    registerDeferredPacks(lib.bts.characterPacks || {});
    // 角色与专有名词词条的 poptip 注册（参照叁岛 registerPoptips）。
    registerPoptips(lib.bts.characterPacks || {});
    delete lib.bts.characterPacks;
}

export const updateContent = `<div style="text-align:left;font-size:16px;">
1. 自太阳神三国杀 V2 Lua 扩展移植崩铁杀（星穹铁道·三国杀），覆盖星穹列车、星核猎手、黑塔空间站、贝洛伯格、匹诺康尼、二相乐园、仙舟、雅利洛等阵营角色。<br>
2. 建立可复现构建与发布工具链：发布/清理/PNG 压缩/在线更新/音效映射脚本、文件清单 Directory.json 与版本包流程。<br>
3. 完整标记与词条系统：中文标记名、属性（元素）、异常、祝福、护盾、忆灵/组合角色与替代形态（changeHero/忆灵双形态）、主公 BGM 跟随；专名/祝福/异常/属性注册为中文词条（poptip/derivation）、触发技 cost 化。<br>
4. 全库代码规范与逐技能核对：83 名角色简写变量补全，对照太阳神原版逐技能核对并补源码注释。<br>
<li>本版本仍在开发中，未完成的角色、资源与机制将持续补充。</li>
</div>`;
