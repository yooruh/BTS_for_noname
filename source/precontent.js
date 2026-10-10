// 阶段1（precontent）：建立 lib.bts 运行时、注册阵营/属性/资源（含武将名字前缀样式），并准备角色与卡牌包。
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

// 武将名字前缀样式（引擎 get.slimName→get.prefixSpan 读 lib.namePrefix；范式：叁岛 precontent 的
// namePrefix.set / 本体内置表）。角色侧对应注册 `<角色id>_prefix` 翻译键（值须为其显示名的起始串，
// 如「应星DIY白厄」的 bts_diy_ch_baie_yingxing_prefix: '应星DIY'）；未登记样式的前缀按引擎默认白字渲染。
const NAME_PREFIXES = {
    // 群友投稿 DIY · 应星：黄金裔主题金（与 style/html 的 accent 同族）。
    // 自绘 getSpan（同叁岛「9」，带 getSpan 的前缀不再套引擎默认样式）：两行横排——
    // 第一行「应星」、换行、第二行「DIY」。
    '应星DIY': {
        getSpan() {
            const span = document.createElement('span');
            span.style.color = '#d4b577';
            span.dataset.nature = 'soilmm';
            // 竖排上下文（.player > .name_seat 为 vertical-rl）内必须显式 horizontal-tb：
            // 否则 br 换行方向随继承翻转、DIY 逐字竖排（2026-10-09 实机缺陷）
            span.style.writingMode = span.style.webkitWritingMode = 'horizontal-tb';
            span.style.display = 'inline-block';
            span.style.textAlign = 'center';
            span.style.lineHeight = '1';
            span.appendChild(document.createTextNode('应星'));
            span.appendChild(document.createElement('br'));
            span.appendChild(document.createTextNode('DIY'));
            return span.outerHTML;
        },
    },
};

function registerNamePrefixes() {
    for (const [prefix, style] of Object.entries(NAME_PREFIXES))
        lib.namePrefix.set(prefix, style);
}

export async function precontent(config, pack) {
    lib.bts = lib_bts;
    // 资源样式 / 8 势力 / 7 属性（rules/index.js）+ 武将名字前缀样式（NAME_PREFIXES）统一注册。
    registerAssets();
    registerKingdoms();
    registerNatures();
    registerNamePrefixes();

    lib.bts.characterPacks = await loadPackRegistry(CHARACTER_PACK_FILES);
    await loadPackRegistry(CARD_PACK_FILES, 'card');
}
