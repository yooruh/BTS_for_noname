// 崩铁杀全局展示/记录标记（阶段2 自 rules/markRegistry.js RULE_MARKS 全局项迁入）。
// 角色主题标记随各自角色文件 marks 导出；此处仅留全局通用标记（怒气/豁免/属性附加/星启）。
// 内容层：只放定义（markKind/glossaryId + 机制参数），显示文本一律进 translate。
// 由 character/bts/index.js 合并 → buildMarkSkill（markIntro 基座）烘焙进 info.skill。

export const marks = {
    'bts_mk_skill-clear': { markKind: 'record' },
    'bts_mk_yueguan-clear': { markKind: 'record' },
    bts_mk_angry: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nuqi_faq',
    },
    bts_mk_extra_max: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_extra_st_faq',
    },
    // 属性附加标记：显示名在 natures.js translate（bts_n_* 附加名），此处不重复。
    bts_n_earth: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_earth_faq',
    },
    bts_n_flame: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_flame_faq',
    },
    bts_n_frost: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_frost_faq',
    },
    bts_n_elec: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_elec_faq',
    },
    bts_n_wind: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_wind_faq',
    },
    bts_n_dark: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_dark_faq',
    },
    bts_n_light: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_nature_light_faq',
    },
    // 统一「星启」显示标记：层数依托星启祝福（bts_bless_god）层数，挂摘与来源维护由
    // syncMarkSources（全局技能 installMarkSourceTrack → lib.bts.api.godSync）负责——
    // 主公星启（isZhu）即便星启祝福为 0 层也显示。
    bts_mk_xingqi: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_xingqi_faq',
        layersFrom: 'bts_bless_god',
        trackSource: true,
        // 复用星启祝福图标（源版 @bless_god.png 即星启图标，无独立星启素材）；
        // image 字段指定共用基名，避免复制一份同名素材。
        image: 'bts_bless_god',
    },
    // 欢愉子系统·笑点（源 @funnypoint）：欢愉行动后 +1，欢愉时刻消耗全部换算层数。
    bts_mk_funnypoint: {
        markKind: 'mark',
        glossaryId: 'bts_glossary_funnypoint_faq',
    },
};

export const translate = {
    'bts_mk_skill-clear': '必杀技已用',
    'bts_mk_yueguan-clear': '月冠已用',
    bts_mk_angry: '怒气',
    bts_mk_extra_max: '怒气豁免',
    bts_mk_xingqi: '星启',
    bts_mk_funnypoint: '笑点',
};
