// 崩铁杀势力单一来源（阶段2 自 rules/markRegistry.js KINGDOMS/KINGDOM_COLORS 迁入）。
// 消费方：precontent.js registerKingdoms（game.addGroup）、tool/pack/rolePack.js
// createCharacterSort（按 sort 分组）、character/bts/index.js fullTranslate（势力名）。
// 内容层：只维护势力 id/显示名/颜色；勿在别处再登记同名势力。

// [id, 显示名（addGroup short → lib.translate[id]，选将分组/资料卡/日志显示）, 全名（translate[id+'2']）]
// 显示名取完整势力名，样式见 style/css/extension.css（选将 tab 等固定宽度位置自适应）。
export const KINGDOMS = [
    ['xingqionglieche', '星穹列车', '星穹列车'],
    ['xinghelieshou', '星核猎手', '星核猎手'],
    ['heitakongjianzhan', '黑塔空间站', '黑塔空间站'],
    ['yaliluo', '贝洛伯格', '贝洛伯格'],
    ['pinuokangni', '匹诺康尼', '匹诺康尼'],
    ['xianzhou', '仙舟', '仙舟'],
    ['huangjinyi', '黄金裔', '黄金裔'],
    ['erxiangleyuan', '二相乐园', '二相乐园'],
];

export const KINGDOM_COLORS = {
    xingqionglieche: '#547998',
    xinghelieshou: '#a52442',
    heitakongjianzhan: '#96943d',
    yaliluo: '#4fa8c9',
    pinuokangni: '#c9a86a',
    xianzhou: '#d0796c',
    huangjinyi: '#7097df',
    erxiangleyuan: '#8b6bbf', // 占位色，待项目组确认
};

// 势力显示名 translate（并入 fullTranslate；包名 bts 翻译在 index.js metaTranslate）
export const translate = Object.fromEntries(
    KINGDOMS.map(([id, short]) => [id, short]),
);
