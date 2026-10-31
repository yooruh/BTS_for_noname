// 安卓（cordova）文件接口兼容垫片。
//
// 背景：安卓 APP 环境下，引擎 `game.getFileList`（noname/init/cordova.js）经
// `window.resolveLocalFileSystemURL` 调原生 `resolveLocalFileSystemURI`；扩展目录含中文路径
// （如资料卡换肤扫描 `extension/崩铁杀/image/skin/...`）时原生侧会**同步**抛 Java 异常
//（"Error invoking exec: Java exception was raised during method invocation"），失败回调
// 不执行、异常沿调用栈炸到事件层（无名杀全屏报错弹窗；长按/点击链路还会连带 UI 爆炸）。
//
// 处理：包装 `window.resolveLocalFileSystemURL`（及旧别名 resolveLocalFileSystemURI）：
// ① 同步抛错先按 encodeURI 重试一次（中文/空格路径的 URI 解析修正）；② 仍失败则把异常
// 转交失败回调（缺省仅 console.warn），调用方（getFileList 的 failure 分支等）按既有失败
// 路径收尾（如资料卡跳过「可换肤」区块）。仅 cordova 环境安装；桌面/浏览器环境零影响。

/** 给 cordova 的文件解析函数套一层「同步异常 → 失败回调」的垫片。幂等。 */
function wrapResolveFile(urlGetter = () => window.resolveLocalFileSystemURL) {
    const original = urlGetter();
    if (typeof original !== 'function' || original.__btsCompat) return original;
    const wrapped = function (url, success, failure) {
        const fail = typeof failure === 'function' ? failure : function () {};
        try {
            return original.call(window, url, success, fail);
        } catch (error) {
            // 首次同步抛错：对 URI 百分号编码后再试一次（中文路径修正）。
            try {
                if (typeof url === 'string') {
                    const encoded = encodeURI(url);
                    if (encoded !== url) {
                        return original.call(window, encoded, success, fail);
                    }
                }
            } catch (retryError) {
                // 编码重试也未成功：统一走下方失败回调。
            }
            console.warn(
                '[崩铁杀] resolveLocalFileSystemURL 调用失败（已转入失败回调，不再中断游戏）：',
                url,
                error,
            );
            try {
                fail(error);
            } catch (callbackError) {
                console.warn('[崩铁杀] 文件接口失败回调再次抛错：', callbackError);
            }
            return undefined;
        }
    };
    wrapped.__btsCompat = true;
    return wrapped;
}

export function installCordovaFileCompat() {
    if (typeof window === 'undefined' || !window.cordova) return;
    if (typeof window.resolveLocalFileSystemURL === 'function') {
        window.resolveLocalFileSystemURL = wrapResolveFile(
            () => window.resolveLocalFileSystemURL,
        );
    }
    if (typeof window.resolveLocalFileSystemURI === 'function') {
        window.resolveLocalFileSystemURI = wrapResolveFile(
            () => window.resolveLocalFileSystemURI,
        );
    }
}
