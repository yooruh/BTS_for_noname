// 阶段1（precontent）：建立 lib.bts 运行时、注册阵营/属性/资源，并准备角色与卡牌包。
// 游戏规则数据注册（资源/势力/属性）统一在 rules/index.js 直接命名导出，此处 import 调用。
// 扩展设置项定义在 source/config.js（不迁移）。
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

export const lib_bts = {
    // 角色包在 content 阶段用于模式派生包、角色提示等，消费后删除。
    characterPacks: {},
    // 角色模块的 ai.order 在 content 前也可能被读取，先提供无副作用占位。
    aiGuard: {
        blocked: () => false,
        record: () => {},
    },
    api: bts,
    rules: ruleService,
    runtime: {
        effLock: {},
        assetsRegistered: false,
    },
    dispose() {
        ruleService.clear();
        this.characterPacks = {};
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
