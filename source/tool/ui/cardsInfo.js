// 卡牌上显示出牌信息（配置项 bts_cardsInfo）
// ——移植自叁岛世界扩展《onlineFix》的 edit_cardsInfo（source/onlineFix/function.js 的
// edits.cardsInfo 与 source/onlineFix/video.js 的 game.videoContent.cardInfo）。
// 只取这一功能，不引入叁岛 onlineFix 的其余在线改动。
//
// 效果：在打出的卡牌下方显示一行小字：“xx对xx使用”“xx打出”“xx弃置”等。
//
// 原理：打出动画的唯一入口是 lib.element.player.$throwordered（$throw 把用出的牌转到
// 场面中央时调用，本体自身也在这里挂 card_animation_info 的卡面信息）。本模块包装该函数：
// - 开启时：先按原流程调用 $throwordered2 完成动画，再按 _status.event 计算说明文字，把
//   .cardsetion.bts-card-annotation 注记挂进打出牌节点（复用 node.node.cardsetion 缓存
//   做幂等更新）；文字经 game.broadcastAll 同步到直连客户端（客户端拿到的 DOM 参数会
//   退化为普通对象，按 _cardid 找回本次打出的牌——与本体内置注记同款做法）；同时
//   game.addVideo('cardInfo' …) 记录，由本模块注册的 game.videoContent.cardInfo 在录像
//   回放时于对应时刻补挂注记。
// - 关闭时：原样调用原 $throwordered（本体全局设置 card_animation_info 的注记照常生效）。
//
// 与叁岛的差异（按本扩展/当前引擎约定调整，2026-09-28 移植）：
// 1. 开关改用本扩展配置键 bts_cardsInfo：包装常驻、每次打出时实时判开关（叁岛在扩展装载时
//    按 edit_cardsInfo 一次性决定是否替换 $throwordered）；开启时同样跳过本体 card_animation_info
//    的注记分支，避免两套文案叠成两行。
// 2. 直连客户端找回节点用 node._cardid（与本体一致，避免同名同花色点数牌误配；叁岛用
//    name/number/suit 匹配）。
// 3. 修正 judge 分支的运算符优先级错误：叁岛原式 `playername + judgestr || '' + '判定牌'`
//    实为 (playername + judgestr) || …，judgestr 缺失时会拼出“xxundefined”；按原意改为
//    playername + (judgestr || '判定牌')。
// 4. 样式收窄到本功能类名 .cardsetion.bts-card-annotation，不覆盖本体的 .cardsetion；
//    录像回放时不渲染即时注记（_status.video），交由录像记录在正确时刻补挂。
// 5. useCard 分支 targets 为空（如【无懈可击】等无目标牌）时，叁岛原式会拼出“xx对使用”，
//    空目标按“xx使用”回退。
import { lib, game, ui, get, _status } from '../../../../../noname.js';

const CONFIG_KEY = 'bts_cardsInfo';
const STYLE_ID = 'bts-cardsInfo-style';

/** 配置开关；未设置时默认开启（与 config.js 中 init: true 一致）。 */
function isEnabled() {
    return game.getExtensionConfig('崩铁杀', CONFIG_KEY) ?? true;
}

/** 注入本功能专属样式（幂等；各客户端装载扩展时各自注入一次）。 */
function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .cardsetion.bts-card-annotation {
            left: 1px;
            width: calc(100% - 2px);
            bottom: 0;
            color: #fff;
            text-shadow: 1px 1px black;
            font-size: 15px;
            text-align: center;
            z-index: 100000;
            pointer-events: none;
        }
        /* 随叁岛同款注入（打出牌上的临时名牌保持可见） */
        .card .tempname.tempimage {
            opacity: 1 !important;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 注记渲染。本函数作为 game.broadcastAll 载荷会被序列化发送到直连客户端执行，
 * 因此不得引用模块作用域变量，只可用引擎全局与入参（与本体 $throwordered 内置注记同款）。
 * 客户端收到的 DOM 节点参数会退化为普通对象，此时按 _cardid 找回本次打出的牌。
 */
function renderCardsetion(node, eventInfo, cardInfo) {
    if (!node || !node.node) {
        node = [...ui.arena.childNodes].find(card => {
            if (card.classList.contains('thrown') && card.classList.contains('card')) {
                if (cardInfo.cardid != null && card._cardid == cardInfo.cardid && !card.selectedt) {
                    card.selectedt = true;
                    return true;
                }
            }
        });
    }
    if (!node || !node.node) return;
    if (!node.node.cardsetion) {
        node.node.cardsetion = ui.create.div('.cardsetion.bts-card-annotation', eventInfo, node);
    } else {
        node.node.cardsetion.innerHTML = eventInfo;
    }
}

/** 按当前事件计算说明文字（沿叁岛 edits.cardsInfo 的文案表）。 */
function getCardEventInfo(player) {
    const { name, targets, judgestr } = _status.event;
    const playername = get.translation(player);
    switch (name) {
        case 'useCard': {
            if (targets.length === 1 && targets[0] === player) {
                return `${playername}使用`;
            }
            if (targets.length && targets.length < 3) {
                return `${playername}对${get.translation(targets)}使用`;
            }
            return `${playername}使用`;
        }
        case 'disCard':
        case 'lose':
        case 'die': {
            // 叁岛原码 disCard / lose / die 三个分支同文案
            return `${playername}弃置`;
        }
        case 'useSkill': {
            return _status.event.skill === '_chongzhu' ? `${playername}重铸` : playername;
        }
        case 'respond': {
            return `${playername}打出`;
        }
        case 'judge': {
            return playername + (judgestr || '判定牌');
        }
        case 'gain': {
            return `${playername}交给`;
        }
        default: {
            return playername;
        }
    }
}

/** 给本次打出的牌挂注记并记录录像。 */
function attachCardsetion(player, node) {
    if (!node || !node.node) return;
    const eventInfo = getCardEventInfo(player);
    const cardInfo = {
        name: get.name(node),
        number: get.number(node),
        suit: get.suit(node),
        cardid: node._cardid,
    };
    game.broadcastAll(renderCardsetion, node, eventInfo, cardInfo);
    game.addVideo('cardInfo', null, { eventInfo, cardInfo });
}

/** 配置切换时清理场上已显示的注记（关闭即时生效；开启无需处理，之后打出的牌自带注记）。 */
export function applyCardsInfo() {
    if (isEnabled() || !ui.arena) return;
    for (const annotation of ui.arena.querySelectorAll('.cardsetion.bts-card-annotation')) {
        const parent = annotation.parentNode;
        if (parent && parent.node && parent.node.cardsetion === annotation) {
            delete parent.node.cardsetion;
        }
        annotation.remove();
    }
}

/** 安装：包装 $throwordered、注册录像回放处理器并注入样式（幂等）。 */
export function installCardsInfo() {
    const original = lib.element.player.$throwordered;
    if (typeof original !== 'function' || original.__btsCardsInfo) return;
    installStyle();
    game.videoContent.cardInfo = function ({ eventInfo, cardInfo }) {
        // 录像回放：按牌面信息找回本次打出的牌（同叁岛 video.js 的 cardInfo 处理器）。
        const node = ui.thrown.find(card => card.name === cardInfo.name && card.number === cardInfo.number && card.suit === cardInfo.suit);
        if (!node || !node.node) return;
        if (!node.node.cardsetion) {
            node.node.cardsetion = ui.create.div('.cardsetion.bts-card-annotation', eventInfo, node);
        } else {
            node.node.cardsetion.innerHTML = eventInfo;
        }
    };
    const wrapped = function (node) {
        if (!isEnabled()) {
            // 关闭：完全走原函数（本体全局设置 card_animation_info 的注记照常生效）。
            return original.apply(this, arguments);
        }
        // 开启：与叁岛一致直接走 $throwordered2，跳过本体注记分支，避免两套文案叠显。
        const thrownNode = this.$throwordered2.apply(this, arguments);
        // 录像回放中不渲染即时注记，交由录像记录在对应时刻补挂。
        if (!_status.video) attachCardsetion(this, node);
        return thrownNode;
    };
    wrapped.__btsCardsInfo = true;
    lib.element.player.$throwordered = wrapped;
}
