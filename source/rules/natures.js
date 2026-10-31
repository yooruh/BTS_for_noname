// 崩铁杀属性/元素单一来源。
// 7 键 HSR 体系：earth/flame/frost/elec/wind/dark/light = 物理/炎/霜/电/风/量子/虚数。
// 消费方：precontent.js registerNatures（注册进 lib.nature）、rules/utils.js（属性 API）、
// rules/globalMarks.js（bts_n_* 标记）、character/bts/index.js fullTranslate（属性名）。

export const NATURES = ['earth', 'flame', 'frost', 'elec', 'wind', 'dark', 'light'];

// 崩铁杀属性不参与本体铁索连环（linked）传导，走自研 bts_damage_link_。
export const NATURE_CONFIG = {
    earth: { translation: '物理', order: 40, color: '#cecece' },
    flame: { translation: '炎', order: 20, color: '#e62929' },
    frost: { translation: '霜', order: 30, color: '#4cabde' },
    elec: { translation: '电', order: 35, color: '#b64dd4' },
    wind: { translation: '风', order: 10, color: '#55c590' },
    dark: { translation: '量子', order: 60, color: '#4f47be' },
    light: { translation: '虚数', order: 50, color: '#f3df32' },
};

// 属性名 translate（并入 fullTranslate）：裸键（官方名→改名：火→炎、冰→霜、雷→电）、
// nature_<key>（引擎 addNature 显示名约定）、bts_n_*（标记附加名）。
export const translate = Object.assign(
    {},
    ...NATURES.map((key) => ({ [key]: NATURE_CONFIG[key].translation })),
    ...NATURES.map((key) => ({ [`nature_${key}`]: NATURE_CONFIG[key].translation })),
    ...NATURES.map((key) => ({ [`bts_n_${key}`]: `${NATURE_CONFIG[key].translation}附加` })),
);
