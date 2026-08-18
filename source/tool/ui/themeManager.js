import { game } from '../../../../../noname.js';

const THEME_CONFIG_KEY = 'bts_uiTheme';
const THEME_VALUES = new Set(['system', 'light', 'dark']);

const OPACITY_CONFIG_KEY = 'bts_uiOpacity';
const OPACITY_PRESETS = ['100', '90', '75', '60', '50', '25'];
const OPACITY_PERCENT = { '100': 1, '90': 0.9, '75': 0.75, '60': 0.6, '50': 0.5, '25': 0.25 };

function normalizeTheme(theme) {
    return THEME_VALUES.has(theme) ? theme : 'system';
}

function normalizeOpacity(opacity) {
    return OPACITY_PRESETS.includes(String(opacity)) ? String(opacity) : '100';
}

function applyThemeAttribute(target, theme) {
    if (!target) return;
    target.dataset.litTheme = normalizeTheme(theme);
}

function applyOpacityVar(target, percent) {
    if (!target) return;
    target.style.setProperty('--lit-ui-opacity', String(percent));
}

const ThemeManager = (() => {
    let currentTheme = 'system';
    let currentOpacity = '100';
    const documentFrames = new Set();

    const refreshFrames = () => {
        documentFrames.forEach(iframe => {
            if (!iframe?.isConnected) {
                documentFrames.delete(iframe);
                return;
            }
            applyThemeAttribute(iframe.contentDocument?.documentElement, currentTheme);
            applyOpacityVar(iframe.contentDocument?.documentElement, OPACITY_PERCENT[currentOpacity]);
        });
    };

    return {
        init() {
            const savedTheme = game.getExtensionConfig('崩铁杀', THEME_CONFIG_KEY);
            this.apply(savedTheme);
            const savedOpacity = game.getExtensionConfig('崩铁杀', OPACITY_CONFIG_KEY);
            this.applyOpacity(savedOpacity);
        },

        apply(theme) {
            currentTheme = normalizeTheme(theme);
            applyThemeAttribute(document.documentElement, currentTheme);
            refreshFrames();
            return currentTheme;
        },

        save(theme) {
            const normalizedTheme = this.apply(theme);
            game.saveExtensionConfig('崩铁杀', THEME_CONFIG_KEY, normalizedTheme);
            return normalizedTheme;
        },

        getTheme() {
            return currentTheme;
        },

        applyOpacity(opacity) {
            currentOpacity = normalizeOpacity(opacity);
            applyOpacityVar(document.documentElement, OPACITY_PERCENT[currentOpacity]);
            refreshFrames();
            return currentOpacity;
        },

        saveOpacity(opacity) {
            const normalizedOpacity = this.applyOpacity(opacity);
            game.saveExtensionConfig('崩铁杀', OPACITY_CONFIG_KEY, normalizedOpacity);
            return normalizedOpacity;
        },

        getOpacity() {
            return currentOpacity;
        },

        registerDocumentFrame(iframe) {
            if (!iframe) return;
            documentFrames.add(iframe);
            applyThemeAttribute(iframe.contentDocument?.documentElement, currentTheme);
            applyOpacityVar(iframe.contentDocument?.documentElement, OPACITY_PERCENT[currentOpacity]);
        },

        unregisterDocumentFrame(iframe) {
            documentFrames.delete(iframe);
        },

        applyThemeToDocument(documentNode) {
            applyThemeAttribute(documentNode?.documentElement, currentTheme);
            applyOpacityVar(documentNode?.documentElement, OPACITY_PERCENT[currentOpacity]);
        },

        injectThemeAttribute(html) {
            const theme = currentTheme;
            if (/<html\b[^>]*\bdata-lit-theme=/i.test(html)) {
                return html.replace(/(<html\b[^>]*\bdata-lit-theme=")[^"]*(")/i, `$1${theme}$2`);
            }
            if (/<html\b/i.test(html)) {
                return html.replace(/<html\b/i, `<html data-lit-theme="${theme}"`);
            }
            return `<html data-lit-theme="${theme}">${html}</html>`;
        },
    };
})();

export const themeManager = ThemeManager;
export { THEME_CONFIG_KEY, normalizeTheme, OPACITY_CONFIG_KEY, normalizeOpacity };
