// 文本样式工具（搬运自叁岛，零修改）
// 用于技能描述中给文字着色/降透明度：'r'红难 / 'g'绿易 / 'b'浅蓝较易 / 'y'黄中 / 'o'橙较难 / 'p'粉难 / 'O'半透明
export function styleText(style, text) {
    switch (style) {
        case 'r':
            style = 'color:#ff4343';
            break; // 极难
        case 'g':
            style = 'color:#98fb98';
            break; // 易
        case 'b':
            style = 'color:LightBlue';
            break; // 较易
        case 'y':
            style = 'color:Yellow';
            break; // 中
        case 'o':
            style = 'color:Orange';
            break; // 较难
        case 'p':
            style = 'color:Pink';
            break; // 难
        case 'O':
            style = 'opacity:0.5';
            break;
    }
    return `<span style='${style}'>${text}</span>`;
}
