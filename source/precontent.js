// 阶段1（precontent）：建立 lib.bts 运行时、注册阵营/属性/资源，并准备角色与卡牌包。
// 游戏规则数据注册统一在 rules/index.js 命名导出、此处 import 调用；设置项定义在 source/config.js。
import { lib, game } from '../../../noname.js';
import { bts } from './rules/utils.js';
import {
    ruleService,
    registerAssets,
    registerKingdoms,
    registerNatures,
} from './rules/index.js';
import { loadPackRegistry } from './tool/pack/registry.js';
import { CHARACTER_PACK_FILES, CARD_PACK_FILES } from './tool/pack/manifest.js';
import { aiHelpers } from './tool/ai/aiHelpers.js';

export const lib_bts = {
    // 角色包在 content 阶段用于模式派生包、角色提示等，消费后删除。
    characterPacks: {},
    // 角色模块的 ai.order 在 content 前也可能被读取，先提供无副作用占位。
    aiGuard: {
        blocked: () => false,
        record: () => {},
    },
    // AI 纯函数工具箱（tool/ai/aiHelpers.js，Phase 4.3 定型、接口冻结）：
    // 局面读取/量纲换算/威胁排序；纯函数无副作用，content 前即可用。
    aiHelpers,
    api: bts,
    rules: ruleService,
    runtime: {
        effLock: {},
        assetsRegistered: false,
    },
    // 技能级 BGM 切换栈：[[前曲 Ref, 后曲 Ref], ...]；switch/restore/reset 由 rules/index.js
    // 的 installBgmControl 填充；每局开局由全局技能清空。
    bgm: { stack: [] },
    dispose() {
        ruleService.clear();
        this.characterPacks = {};
        this.bgm.stack.length = 0;
    },
};

export async function precontent(config, pack) {
    lib.bts = lib_bts;
    // 资源样式 / 8 势力 / 7 属性统一注册（rules/index.js 直接导出）。
    registerAssets();
    registerKingdoms();
    registerNatures();

    lib.bts.characterPacks = await loadPackRegistry(CHARACTER_PACK_FILES);
    await loadPackRegistry(CARD_PACK_FILES, 'card');
}
