// 引擎 IndexedDB 接口守卫（过渡修复：安卓「导入扩展后进入游戏」报 `{"isTrusted":true}`）。
//
// 背景：引擎 `game.getDB`/`game.putDB`/`game.deleteDB`（noname/game/index.js）在调用方未提供
// onError 时，会把 IndexedDB 请求的 error 事件对象直接 `reject` 给一个无人接管的 Promise。设备侧一旦出现
// IDB 读写失败（存储压力/配额/内核差异等「部分机型」场景），全局 onunhandledrejection 会把它
// JSON 成 `{"isTrusted":true}` 弹出无信息量报错框（`util/error.js` 的 normalizeError），
// 且原流程（如开局的模式存档读取 `getDB("data", mode, cb)`）不会继续。
//
// 处理（幂等；桌面/手机通用；不改变任何业务分支）：
// ① 调用方已给 onError：原样透传；
// ② 回调式但无 onError：补一个「仅记录日志」的 onError，失败按引擎既有的静默降级收尾——
//    不再产生孤儿 rejection（把「不可读的全局崩溃弹窗」降为「可读降级日志」）；
// ③ 纯 Promise 式（无回调）：保持拒绝语义，但把原始事件换成可读 Error（供 .catch/await）。
// 失败记入 `lib.bts.dbCompat.issues` 并 console.warn（含库名/键），供受影响设备诊断定位。
// 根治在引擎侧补丁（getDB/putDB 改可读错误 + 浮动调用点补 catch），见《迁移工作记录》。
import { lib, game } from '../../../../../noname.js';

const issues = [];

function recordIssue(action, storeName, key, reason) {
    issues.push({
        action,
        store: String(storeName),
        key: key === undefined ? null : key,
        time: Date.now(),
        reasonType: reason && reason.constructor ? reason.constructor.name : typeof reason,
    });
    if (issues.length > 20) issues.shift();
    if (lib && lib.bts && lib.bts.dbCompat) lib.bts.dbCompat.issues = issues;
}

function toReadableError(action, storeName, key, reason) {
    if (reason instanceof Error) return reason;
    let text;
    if (typeof reason === 'string') {
        text = reason;
    } else if (reason && typeof reason.type === 'string') {
        // DOM 事件（IndexedDB 的 AbortError/UnknownError 等以事件形式到达）
        text = `原始事件 ${reason.type}`;
    } else {
        try {
            text = JSON.stringify(reason);
        } catch (error) {
            text = String(reason);
        }
    }
    const where = key === undefined || key === null ? '' : ` / ${JSON.stringify(key)}`;
    return new Error(`IndexedDB ${action}失败（${storeName}${where}）：${text}`);
}

function makeLogHandler(action, storeName, key) {
    return (reason) => {
        recordIssue(action, storeName, key, reason);
        console.warn(
            `[崩铁杀] IndexedDB ${action}失败（已按降级处理，不再中断游戏）：${storeName}`,
            key,
            reason,
        );
    };
}

function wrapGetDB(original) {
    const wrapped = function (storeName, query, onSuccess, onError) {
        if (typeof onError === 'function') {
            return original.apply(this, arguments);
        }
        if (typeof onSuccess === 'function') {
            return original.call(
                this,
                storeName,
                query,
                onSuccess,
                makeLogHandler('读取', storeName, query),
            );
        }
        return original.call(this, storeName, query).catch((reason) => {
            recordIssue('读取', storeName, query, reason);
            console.warn(`[崩铁杀] IndexedDB 读取失败：${storeName}`, query, reason);
            throw toReadableError('读取', storeName, query, reason);
        });
    };
    wrapped.__btsDBCompat = true;
    return wrapped;
}

function wrapPutDB(original) {
    const wrapped = function (storeName, idbValidKey, value, onSuccess, onError) {
        if (typeof onError === 'function') {
            return original.apply(this, arguments);
        }
        if (typeof onSuccess === 'function') {
            return original.call(
                this,
                storeName,
                idbValidKey,
                value,
                onSuccess,
                makeLogHandler('写入', storeName, idbValidKey),
            );
        }
        return original.call(this, storeName, idbValidKey, value).catch((reason) => {
            recordIssue('写入', storeName, idbValidKey, reason);
            console.warn(`[崩铁杀] IndexedDB 写入失败：${storeName}`, idbValidKey, reason);
            throw toReadableError('写入', storeName, idbValidKey, reason);
        });
    };
    wrapped.__btsDBCompat = true;
    return wrapped;
}

function wrapDeleteDB(original) {
    const wrapped = function (storeName, query, onSuccess, onError) {
        if (typeof onError === 'function') {
            return original.apply(this, arguments);
        }
        if (typeof onSuccess === 'function') {
            return original.call(
                this,
                storeName,
                query,
                onSuccess,
                makeLogHandler('删除', storeName, query),
            );
        }
        return original.call(this, storeName, query).catch((reason) => {
            recordIssue('删除', storeName, query, reason);
            console.warn(`[崩铁杀] IndexedDB 删除失败：${storeName}`, query, reason);
            throw toReadableError('删除', storeName, query, reason);
        });
    };
    wrapped.__btsDBCompat = true;
    return wrapped;
}

/** content 阶段调用：安装 getDB/putDB/deleteDB 守卫（幂等）。 */
export function installDBCompat() {
    if (typeof game.getDB === 'function' && !game.getDB.__btsDBCompat) {
        game.getDB = wrapGetDB(game.getDB);
    }
    if (typeof game.putDB === 'function' && !game.putDB.__btsDBCompat) {
        game.putDB = wrapPutDB(game.putDB);
    }
    if (typeof game.deleteDB === 'function' && !game.deleteDB.__btsDBCompat) {
        game.deleteDB = wrapDeleteDB(game.deleteDB);
    }
    if (lib.bts) {
        lib.bts.dbCompat = { issues };
    }
}
