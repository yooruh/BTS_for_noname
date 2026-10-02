// 扩展帮助文本（菜单－选项－帮助：机制速查 + 功能索引 + 更新内容）。
// 完整版文档：扩展设置 →「帮助文档」按钮（style/html/help.html）；
// 完整历史更新日志：扩展设置 →「更新日志」按钮（style/html/update.html，构建脚本自动生成）。
// 写法参照叁岛 help.js：分区 getter + 数据源动态生成（词条/元素/势力与代码同源），
// 打开帮助时即时拼装；引用的均为静态导出，不依赖游戏开局状态。
import { game } from '../../../noname.js';
import { updateContent } from './content.js';
import { dialogManager } from './tool/ui/dialogManager.js';
import { extensionPath } from './tool/utils/paths.js';
import { glossary as RULE_GLOSSARY } from './rules/globalrules.js';
import { NATURES, NATURE_CONFIG } from './rules/natures.js';
import { KINGDOMS } from './character/bts/factions.js';

// 「查看完整历史更新日志」链接处理（对齐叁岛）：经 dialogManager.showDocModal
// 打开 style/html/update.html；{{version}} 占位替换为当前版本号。
const changelogOnclick = () => {
    const updateURL = `${extensionPath}/style/html/update.html`;
    const version = game.getExtensionConfig('崩铁杀', 'version') || '未知版本';
    dialogManager.closeAll();
    dialogManager
        .showDocModal(updateURL, '更新日志', (content) =>
            content.replace(/\{\{version\}\}/g, version),
        )
        .catch((error) => {
            console.error('打开【崩铁杀】更新日志失败', error);
            alert('打开更新日志失败，请检查扩展文件完整性');
        });
};
// 全局链接处理器仅在浏览器环境注册（Node 冒烟加载环境中不存在 window）。
if (typeof window !== 'undefined') {
    if (!window.bts) window.bts = {};
    window.bts.changelogOnclick = changelogOnclick;
}

// 通用机制词条查表（与游戏内 poptip 同源，帮助说明即游戏内词条原文）。
const glossaryById = Object.fromEntries(
    RULE_GLOSSARY.map((entry) => [entry.id, entry]),
);

/** 词条 id 列表 → 列表项 HTML（名称剥去词条排版用的竖线标记）。 */
function glossList(ids) {
    const items = ids
        .map((id) => {
            const entry = glossaryById[id];
            if (!entry) return '';
            return `<li>${entry.name.replace(/\|/g, '')}：${entry.info}`;
        })
        .filter(Boolean);
    return `<ul>${items.join('')}</ul>`;
}

const natureNames = NATURES.map((key) => NATURE_CONFIG[key].translation).join('、');

const helpSections = {
    // ── 简介 ──────────────────────────────────────────────────────────────
    get intro() {
        const version =
            game.getExtensionConfig('崩铁杀', 'version') || '未知版本';
        return `《崩铁杀》（星穹铁道·三国杀），《太阳神三国杀 V2 EX》同名扩展的无名杀移植版。<br>
当前版本：${version}。80 余名角色分布于 8 大阵营（持续更新），在无名杀基础规则之上追加了怒气、必杀技、护盾、诅咒、异常、祝福与元素等自定义机制，并附带在线更新、推荐设置、AI 选将等扩展功能。<br>
首次接触无名杀的话，先展开下面的「无名杀基础操作」；本页是机制速查，更完整的说明见 扩展设置 →「帮助文档」按钮。`;
    },

    // ── 无名杀基础操作（新手引导；details 点击展开）──────────────────────
    get basics() {
        return `<details style="margin:4px 0"><summary style="cursor:pointer;font-weight:bold">无名杀基础操作（点击展开）</summary>
<ul>
<li><b>开始一局</b>：主菜单「开始游戏」→ 选择模式（初次建议单机身份模式）→ 选将界面点击选择武将（崩铁杀角色按势力分组）→「确定」。</li>
<li><b>回合流程</b>：判定 → 摸牌 → 出牌 → 弃牌 → 结束；轮到你能行动时，界面会给出提示与可选按钮。</li>
<li><b>出牌</b>：点击手牌使用或打出；需要选择目标时点其他角色，再点「确定」，点「取消」可以重选。</li>
<li><b>技能</b>：角色卡旁的技能按钮在条件满足时会亮起，点击发动；必杀技要攒足怒气才会亮。</li>
<li><b>看说明</b>：悬浮（移动端长按）角色、技能与标记即可看解释；描述里带下划线的名词可点击查看词条。</li>
<li><b>卡住时</b>：菜单里的「托管」交给 AI 代打，随时可以收回；本扩展不添加新卡牌，对局使用无名杀标准牌堆。</li>
</ul></details>`;
    },

    // ── 基础机制（词条原文）──────────────────────────────────────────────
    get mechanics() {
        return `基础机制${glossList([
            'bts_glossary_nuqi_faq',
            'bts_glossary_bisha_faq',
            'bts_glossary_hudun_faq',
            'bts_glossary_bless_faq',
            'bts_glossary_xingqi_faq',
        ])}`;
    },

    // ── 伤害与元素 ────────────────────────────────────────────────────────
    get damageNature() {
        return `伤害与元素<br>
<ul>
<li><b>伤害性质</b>：<b>致命</b>——受伤者不会因此回复怒气；<b>贯通</b>——无视护盾；<b>暴击</b>——伤害来源回复1点怒气。带有“通常伤害”标注的伤害不受上述祝福改写。</li>
<li><b>元素共 7 种</b>：${natureNames}（与崩铁官方命名一致；标记显示为“xx附加”）。</li>
<li><b>元素融合</b>：对已附加元素的角色再次附加<b>相同</b>元素时，移除元素并触发对应的融合异常（炎→烧伤、霜→冻结、风→中毒、量子→睡眠、物理→石化、虚数→麻痹）；附加<b>不同</b>元素时，回复1点体力并替换为新元素。</li>
<li><b>元素相克</b>：带元素的伤害命中附加了另一元素的角色时，该伤害+1，并移除其元素附加。</li>
</ul>`;
    },

    // ── 异常状态（词条原文）─────────────────────────────────────────────
    get abnormal() {
        return `异常状态（由技能赋予；回合结束阶段各减1层；回复体力会清除烧伤/麻痹/中毒/冻结/石化/睡眠六种基础异常）${glossList(
            [
                'bts_glossary_mabi_faq',
                'bts_glossary_abnormal_burn_faq',
                'bts_glossary_zhongdu_faq',
                'bts_glossary_abnormal_freeze_faq',
                'bts_glossary_abnormal_fossilize_faq',
                'bts_glossary_abnormal_sleep_faq',
                'bts_glossary_abnormal_confuse_faq',
                'bts_glossary_abnormal_scary_faq',
                'bts_glossary_abnormal_diyu_faq',
                'bts_glossary_abnormal_luoxuan_faq',
                'bts_glossary_abnormal_losemaxhp_faq',
            ],
        )}<br>各角色专属异常（如败谢、沉醉、揭露等）可在对应技能与词条中查看。`;
    },

    // ── 祝福（词条原文）─────────────────────────────────────────────────
    get bless() {
        return `祝福（由技能赋予；每层提供对应效果，回合结束阶段各减1层，常驻祝福除外）${glossList(
            [
                'bts_glossary_bless_fatal_faq',
                'bts_glossary_bless_through_faq',
                'bts_glossary_bless_critical_faq',
                'bts_glossary_bless_busi_faq',
                'bts_glossary_bless_maxhp_faq',
                'bts_glossary_bless_god_faq',
                'bts_glossary_bless_yingzi_faq',
                'bts_glossary_bless_zhiyu_faq',
                'bts_glossary_bless_zengfu_faq',
                'bts_glossary_bless_cifu_faq',
                'bts_glossary_bless_funny_faq',
            ],
        )}<br>各角色专属祝福（如神君、生息、热意、雨过天晴等）可在对应技能与词条中查看。`;
    },

    // ── 其他全局规则 ─────────────────────────────────────────────────────
    get globalRules() {
        return `其他全局规则<br>
<ul>
<li><b>忆灵</b>：部分角色可召唤忆灵并入其合体形态（体力合并计算）；本体受伤/回复时忆灵生命同步扣减/回补，忆灵生命归零自动离场并触发对应离场效果。</li>
<li><b>欢愉</b>：欢愉行动结算后获得1枚笑点；欢愉时刻消耗全部笑点换算欢愉层数，每层使欢愉成功判定+10%。</li>
<li><b>伤害链/治疗链</b>：系统记录“对谁造成过伤害/为谁回复过体力”，供相关技能判定（悬浮在角色或标记上可查看来源）。</li>
<li><b>回合计数清理</b>：技能内部“本回合内有效”的计数会在出牌阶段开始、回合开始、回合结束时自动清理，不会跨回合残留。</li>
<li><b>体力上限保底</b>：所有减少体力上限的效果最多扣至 1 点，不会因此进入濒死或死亡。</li>
<li><b>额外回合</b>：部分技能可插入额外回合或额外出牌阶段。</li>
</ul>`;
    },

    // ── 势力 ─────────────────────────────────────────────────────────────
    get faction() {
        return `势力：${KINGDOMS.map(([, name]) => name).join('、')}。<br>角色可在选将界面按势力筛选；身份模式下不同势力的主公拥有不同的固有 BGM（开启「BGM跟随主公」后生效）。`;
    },

    // ── 对无名杀底层的扩展（用户重点关注）───────────────────────────────
    get engine() {
        return `本扩展对无名杀底层所做的扩展与覆写<br>
<ul>
<li><b>全局规则技能</b>：以 4 个全局技能（伤害/回复/阶段/衰减）承载所有角色共享的底层结算：伤害与怒气、元素相克与附加、回复清异常、忆灵生命同步、回合内计数清理、祝福/异常自然衰减等，无需每个角色技能单独实现。</li>
<li><b>标记生命周期</b>：覆写玩家的标记读写（addMark/removeMark）：标记层数大于 0 时自动挂载其展示技能、归零自动卸载，并派发自定义标记事件（bts_mark_add/bts_mark_remove）供效果监听；标记的变更日志也由该层统一接管（内部计数不写战斗日志）。</li>
<li><b>元素与势力注册</b>：7 种元素注册进引擎元素表（不参与本体的铁索连环传导，改用自研伤害链）；8 个阵营注册进势力表（含专属颜色与势力图标）。</li>
<li><b>AI 选将</b>：身份模式单机局可指定 AI 选将策略（纯随机/按评分/按技能流派）。</li>
<li><b>AI 防重试守卫</b>：防止 AI 在同一阶段反复空转发动同一技能导致卡死。</li>
<li><b>BGM 跟随主公</b>：身份模式开局把背景音乐切换为主公的专属 BGM。</li>
<li><b>界面增强</b>：角色称号的属性/命途图标、出牌注记（“xx对xx使用”）、技能详情弹窗宽度加倍、武将卡势力名自动换行、标记与词条悬浮说明。</li>
<li><b>引擎差异适配</b>：减少体力上限保底 1 点（本体规则会把体力上限≤0 的角色直接判死）；出牌阶段中止改用阶段事件原生语义；额外回合以阶段插入实现。</li>
</ul>`;
    },

    // ── 设置与功能 ───────────────────────────────────────────────────────
    get settings() {
        return `扩展设置（选项 → 扩展 → 崩铁杀）<br>
<ul>
<li><b>在线更新扩展</b>：从 GitHub/Gitee 获取更新（支持断点续传、备份回滚）。</li>
<li><b>应用推荐的无名杀全局设置</b>：载入适配本扩展的全局配置（Windows/Android 两套，可先备份当前配置）。</li>
<li><b>AI选将逻辑</b>：纯随机 / 按评分（太阳神选将权重表）/ 按流派（技能定位标签）；仅单机·标准身份生效。</li>
<li><b>主公星启启用条件</b>：均启用 / 仅崩铁角色在场 / 仅崩铁角色为主公 / 不启用。</li>
<li><b>BGM跟随主公</b>：身份模式开局切换为主公专属 BGM。</li>
<li><b>显示怒气标记</b>：是否在角色旁显示怒气层数。</li>
<li><b>技能详情弹窗宽度加倍</b>：长技能描述更易阅读。</li>
<li><b>卡牌上显示出牌信息</b>：在打出的牌下方显示“xx对xx使用”等注记。</li>
<li><b>阅读辅助</b>：「技能详情弹窗宽度加倍」「卡牌上显示出牌信息」建议新手开启；「在线更新扩展」用于保持版本最新。</li>
</ul>`;
    },

    // ── 更新内容（最近版本；完整历史见「更新日志」页）────────────────────
    get updateInfo() {
        const textEntry = updateContent.find((item) => item.type === 'text');
        let str = textEntry.data;
        const hrIndex = str.lastIndexOf('<hr>');
        if (hrIndex > -1) str = str.slice(0, hrIndex);
        const brIndex = str.lastIndexOf('<br>');
        if (brIndex > -1) str = str.slice(0, brIndex);
        str += '</div>';
        const version =
            game.getExtensionConfig('崩铁杀', 'version') || '未知版本';
        return `崩铁杀（${version}更新）<br>${str}`;
    },

    // ── 更新日志链接（style/html/update.html，构建脚本自动生成）──────────
    get changelogLink() {
        return `<hr>
<a onclick="window.bts.changelogOnclick()" style="cursor:pointer;text-decoration:underline">
查看完整历史更新日志
</a><br>`;
    },
};

export default {
    get 崩铁杀() {
        return [
            helpSections.intro,
            helpSections.basics,
            helpSections.mechanics,
            helpSections.damageNature,
            helpSections.abnormal,
            helpSections.bless,
            helpSections.globalRules,
            helpSections.faction,
            helpSections.engine,
            helpSections.settings,
            helpSections.updateInfo,
            helpSections.changelogLink,
        ].join('<br>');
    },
};
