// 阶段2（content）：安装非游戏规则类注册（工具/UI/AI/poptip/延迟包），并消费预载角色包信息。
// 规则类注册（gamerule/标记来源/BGM 跟随/AI 守卫/buff 生命周期）统一在 rules/index.js 命名
// 导出、此处 import 调用；其余非游戏规则注册内联于本文件。设置项定义在 source/config.js。
import { lib, game, ui, get } from '../../../noname.js';
import {
    registerRules,
    installBgmControl,
    installBgmFollow,
    installSceneBgm,
    installMarkSourceTrack,
    installBuffSkillLifecycle,
    installCustomEventHooks,
    installAiGuard,
    installUntargetableGuard,
} from './rules/index.js';
import { registerCharacterPack } from './tool/pack/registry.js';
import { registerPoptips, registerNaturePathPoptips } from './tool/ui/poptips.js';
import { installNodeintroWide } from './tool/ui/nodeintroWidth.js';
import { installCardsInfo } from './tool/ui/cardsInfo.js';
import { installCharacterPickAI } from './tool/ai/characterPick.js';
import { installCordovaFileCompat } from './tool/utils/cordovaCompat.js';
import { installDBCompat } from './tool/utils/dbCompat.js';

// ── 势力名排版（武将卡右上角势力标签）────────────────────────────────────────
// 规律：≤3 字一行；4~5 字首行 2 字+余下第二行；≥6 字每行 3 字。hook
// ui.create.buttonPresets.character（引擎把完整势力名直写 `.identity > div`），创建与 refresh 后重排。
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

// ── AI 选将（配置项 bts_ai_character_mode）──────────────────────────────────
// 实现于 tool/ai/characterPick.js：包装 game.chooseCharacter 的同步执行窗口、替换 next.ai
// 决策（引擎分支与取位见该文件头部）。仅单机·标准身份（identity_mode=normal）生效。

export async function content(config, pack) {
    const extensionPack = lib.extensionPack['崩铁杀'];
    if (extensionPack) {
        extensionPack.author = "一个月惹";
        extensionPack.version = game.getExtensionConfig('崩铁杀', 'version');
    }
    // 更新内容展示（对齐叁岛）：扩展版本变化时登记更新日志，开局由引擎
    // game.showChangeLog 弹窗展示「崩铁杀 X 更新内容」；版本未变化时不重复弹出。
    game.showExtensionChangeLog(updateContent, '崩铁杀');
    // 规则类注册（rules/index.js 直接导出）：全局规则技能 + 词条 + API 挂载。
    registerRules();
    // 非游戏规则注册：安卓(cordova)文件接口兼容垫片（同步异常转失败回调、避免全屏报错炸 UI；
    // 见 tool/utils/cordovaCompat.js）。
    installCordovaFileCompat();
    // 非游戏规则注册：引擎 IndexedDB 接口守卫（无 onError 的 getDB/putDB 调用不再产生
    // 「isTrusted」孤儿 rejection 崩溃弹窗，降级为可读日志；见 tool/utils/dbCompat.js）。
    installDBCompat();
    // 非游戏规则注册（内联）：势力名排版 hook。
    installKingdomLayoutHook();
    // 规则类注册：BGM 切换/还原机制（lib.bts.bgm；供角色技能调用 + 每局清栈）。
    installBgmControl();
    // 规则类注册：BGM 跟随主公（全局技能 bts_bgm_follow；与技能切换共用设置开关）。
    installBgmFollow();
    // 非游戏规则注册：场景曲（源 due30）登记进「设置·音效·背景音乐」可选列表。
    installSceneBgm();
    // 规则类注册：标记来源追踪（全局技能 bts_mk_source_track）。
    installMarkSourceTrack();
    // 规则类注册：buff 标记生命周期（包装 addMark/removeMark + 自定义标记事件）。
    installBuffSkillLifecycle();
    // 规则类注册：技能效果自注册自定义事件（bts_pet_*/bts_resource_add/… 的 hookmap 置位）。
    installCustomEventHooks();
    // 非游戏规则注册：AI 选将（评分/流派；tool/ai/characterPick.js）。
    installCharacterPickAI();
    // 规则类注册：AI 防重试守卫（全局技能 bts_aiGuardReset）——模式加载完成后再安装，
    // 避免 global 列表被模式覆盖。
    installAiGuard();
    // 规则类注册：「不可被指定为目标」封锁（貊泽·潜行；候选 + useCard 首步双守卫，
    // 判据 lib.bts.api.untargetable（细节见 rules/index.js）。
    installUntargetableGuard();
    // 非游戏规则注册（内联）：配置项 bts_nodeintro_wide 技能详情弹窗（#nodeintro）宽度加倍。
    installNodeintroWide();
    // 非游戏规则注册（内联）：配置项 bts_cardsInfo 卡牌上显示出牌信息。
    installCardsInfo();

    registerDeferredPacks(lib.bts.characterPacks || {});
    // 非游戏规则注册（内联）：角色与专有名词词条、属性/命途 poptip。
    registerPoptips(lib.bts.characterPacks || {});
    registerNaturePathPoptips();
    delete lib.bts.characterPacks;
}

// 更新内容数据（扩展更新弹窗 + 帮助「更新内容」分区）：
// 由 `npm run build`（scripts/build.mjs）依据 release/releases.json 自动生成，勿手改。
export const updateContent = [
    {
        type: "text", addText: true, data: `<div style="text-align: left;font-size: 16px;">
① 公开测试版本，非正式移植版，欢迎上报问题（部分与太阳神不一致的地方是故意为之）；<br>
② 建立可复现构建与发布工具链，可集成化打包，此版本兼容无名杀v1.11.2，对标v1.11.6；<br>
③ 优化了技能的AI逻辑和BGM功能，修复了反复重载问题；<br>
④ 根据上个版本的反馈，在帮助文档新增了Q&A<br>
<hr>
<li>本版本仍在开发中，未完成的角色、资源与机制将持续补充。</li>
</div>`
    }
];
