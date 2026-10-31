// 崩铁杀势力单一来源。
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
    ['yinhe', '银河', '银河'],
    ['yijie', '异界', '异界'],
    ['xunhaiyouxia', '巡海游侠', '巡海游侠'],
    ['gongsi', '公司', '公司'],
];

export const KINGDOM_COLORS = {
    xingqionglieche: '#842722',
    xinghelieshou: '#547998',
    heitakongjianzhan: '#c7c7c4',
    yaliluo: '#4fa8c9',
    pinuokangni: '#aaa270',
    xianzhou: '#2f8f8a',
    huangjinyi: '#f08ee1',
    erxiangleyuan: '#8b6bbf',
    yinhe: '#4b5d9e',
    yijie: '#f02500',
    xunhaiyouxia: '#3d323f',
    gongsi: '#e2ac62',
};

// 势力显示名 translate（并入 fullTranslate；包名 bts 翻译在 index.js metaTranslate）
export const translate = Object.fromEntries(
    KINGDOMS.map(([id, short]) => [id, short]),
);
