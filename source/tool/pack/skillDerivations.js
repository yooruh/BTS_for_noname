// 技能 → 词条 derivation 自动挂载（角色包通用装配件）。
// 规则按技能源码特征识别关联词条（怒气/护盾/祝福/属性…），在技能合并后追加 derivation，
// 供技能详情页显示关联词条；不覆盖技能已有的 derivation。
// 消费方：character/bts/index.js、character/diy/index.js（各包用自家 glossary 构建规则）。
// test(id, src, info)：src 为技能 id + 各函数/字符串字段的源码文本；info 为技能对象。
const STATIC_RULES = [
    // 必杀技统一以 bts_bisha 标签判定（勿按 id 前缀；同 zaixian/军功等范式）。
    {
        id: 'bts_glossary_bisha_faq',
        test: (id, src, info) => info?.bts_bisha === true,
    },
    {
        id: 'bts_glossary_nuqi_faq',
        test: (id, src) =>
            /(?:getAngry|loseAngry|addAngry|'angry'|"angry"|'bts_mk_angry'|"bts_mk_angry")/.test(
                src,
            ),
    },
    {
        id: 'bts_glossary_hudun_faq',
        test: (id, src) =>
            /hudun|'shield'|"shield"|'bts_shield'|"bts_shield"/.test(src),
    },
    {
        id: 'bts_glossary_xingqi_faq',
        test: (id, src) => /bts\.god\(|bless_god|'god'/.test(src),
    },
    {
        id: 'bts_glossary_bless_faq',
        test: (id, src) => /addBless|removeBless|getBless/.test(src),
    },
    { id: 'bts_glossary_canmeng_faq', test: (id, src) => /canmeng/.test(src) },
    {
        id: 'bts_glossary_feihuang_faq',
        test: (id, src) => /feihuang/.test(src),
    },
    {
        id: 'bts_glossary_zhongdu_faq',
        test: (id, src) => /poison|zhongdu/.test(src),
    },
    { id: 'bts_glossary_mabi_faq', test: (id, src) => /numb|mabi/.test(src) },
    {
        id: 'bts_glossary_guantong_faq',
        test: (id, src) => /'through'/.test(src),
    },
    {
        id: 'bts_glossary_nature_dark_faq',
        test: (id, src) => /nature\s*:\s*'dark'/.test(src),
    },
    {
        id: 'bts_glossary_nature_light_faq',
        test: (id, src) => /nature\s*:\s*'light'/.test(src),
    },
    {
        id: 'bts_glossary_nature_flame_faq',
        test: (id, src) => /nature\s*:\s*'flame'/.test(src),
    },
    {
        id: 'bts_glossary_nature_wind_faq',
        test: (id, src) => /nature\s*:\s*'wind'/.test(src),
    },
    {
        id: 'bts_glossary_nature_frost_faq',
        test: (id, src) => /nature\s*:\s*'frost'/.test(src),
    },
    {
        id: 'bts_glossary_nature_elec_faq',
        test: (id, src) => /nature\s*:\s*'elec'/.test(src),
    },
];

/**
 * 构建包内 derivation 规则集：静态规则 + 具体祝福词条自动规则。
 * 具体祝福：技能源码含 '<blessKey>'（如 'zhiyu'、'dark'）→ 挂载对应祝福词条
 * （bts_glossary_bless_<key>_faq），而非仅总「祝福」词条。
 * @param {Array<{id: string}>} glossary 该包聚合后的词条表（通用 + 角色专属）。
 */
export function buildDerivationRules(glossary = []) {
    const rules = [...STATIC_RULES];
    for (const entry of glossary) {
        const m = /^bts(?:_[a-z]+)?_glossary_bless_([a-z]+)_faq$/.exec(entry.id);
        if (!m) continue;
        const blessKey = m[1];
        rules.push({
            id: entry.id,
            test: (id, src) => src.includes(`'${blessKey}'`),
        });
    }
    return rules;
}

/** 收集技能对象的可检查源码文本（函数取 toString，字符串字段原样）。 */
export function collectSkillSource(id, info) {
    const parts = [id];
    for (const value of Object.values(info)) {
        if (typeof value === 'function') parts.push(String(value));
        else if (typeof value === 'string') parts.push(value);
    }
    return parts.join('\n');
}

/**
 * 为角色包技能自动挂载词条 derivation（追加，不覆盖已有 derivation）。
 * @param {Object} skillMap 包内合并后的技能表（info.skill）。
 * @param {Array<{id: string, test: Function}>} rules buildDerivationRules 的产物。
 */
export function attachGlossaryDerivations(skillMap, rules = STATIC_RULES) {
    for (const [id, info] of Object.entries(skillMap || {})) {
        if (!info || typeof info !== 'object') continue;
        if (/_glossary_/.test(id)) continue; // 词条技能不挂载，避免自引用
        const deps = new Set(
            Array.isArray(info.derivation)
                ? info.derivation
                : info.derivation
                    ? [info.derivation]
                    : [],
        );
        const src = collectSkillSource(id, info);
        for (const rule of rules) {
            if (rule.test(id, src, info)) deps.add(rule.id);
        }
        if (deps.size) {
            info.derivation = deps.size === 1 ? [...deps][0] : [...deps];
        }
    }
}
