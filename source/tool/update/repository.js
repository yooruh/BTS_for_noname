

// ==================== 环境检测 ====================
const Environment = {
    isCordova() {
        return typeof window !== 'undefined' && typeof window.cordova === 'object';
    },

    isNode() {
        return typeof window !== 'undefined' &&
            typeof window.process === 'object' &&
            typeof window.__dirname === 'string' &&
            typeof window.require === 'function';
    },

    isElectronRenderer() {
        return typeof window !== 'undefined' &&
            window.process &&
            window.process.type === 'renderer';
    },

    getEnvironmentType() {
        if (this.isCordova()) return 'cordova';
        if (this.isElectronRenderer()) return 'electron-renderer';
        if (this.isNode()) return 'node';
        return 'browser';
    }
};

// ==================== Token 管理 ====================
class TokenManager {
    constructor() {
        this.cache = new Map();
        this.load();
    }

    load() {
        try {
            if (localStorage.getItem('noname_authorization')) {
                this.cache.set('github', localStorage.getItem('noname_authorization'));
            }
            if (localStorage.getItem('noname_github_token')) {
                this.cache.set('github', localStorage.getItem('noname_github_token'));
            }
            if (localStorage.getItem('noname_gitee_token')) {
                this.cache.set('gitee', localStorage.getItem('noname_gitee_token'));
            }
        } catch (e) {
            console.warn('[Token] 加载失败:', e);
        }
    }

    get(platform) {
        return this.cache.get(platform);
    }

    set(platform, token) {
        this.cache.set(platform, token);
        try {
            if (platform === 'gitee') {
                localStorage.setItem('noname_gitee_token', token);
            } else {
                localStorage.setItem('noname_authorization', token);
                localStorage.setItem('noname_github_token', token);
            }
            return true;
        } catch (e) {
            console.error('[Token] 保存失败:', e);
            return false;
        }
    }

    clear(platform) {
        this.cache.delete(platform);
        if (platform === 'gitee') {
            localStorage.removeItem('noname_gitee_token');
        } else {
            localStorage.removeItem('noname_authorization');
            localStorage.removeItem('noname_github_token');
        }
    }

    has(platform) {
        return !!this.get(platform);
    }
}

// ==================== Git 适配器 ====================
class GitAdapter {
    constructor(url) {
        this.raw = null;
        this.api = null;
        this.fallback = null;
        this.mirror = null; // 跨平台维护镜像（github → gitee raw），用于 github 不可达/证书失败或 CDN 旧缓存时兜底
        this.platform = null;
        this.owner = null;
        this.repo = null;
        this.branch = 'main';
        this.token = null;
        this.parse(url);
    }

    parse(url) {
        if (!url) throw new Error('无效的仓库地址');
        url = url.trim().replace(/\/+$/, '');

        if (url.includes('github.com')) {
            this.platform = 'github';
            const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
            if (!match) throw new Error('无法解析GitHub地址');
            [, this.owner, this.repo, this.branch] = match;
        } else if (url.includes('gitee.com')) {
            this.platform = 'gitee';
            const match = url.match(/gitee\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
            if (!match) throw new Error('无法解析Gitee地址');
            [, this.owner, this.repo, this.branch] = match;
        } else {
            throw new Error('不支持的Git平台');
        }

        this.repo = this.repo.replace(/\.git$/, '');
        this.branch = this.branch || 'main';
        this.updateURLs();
    }

    updateURLs() {
        const { platform, owner, repo, branch } = this;
        if (platform === 'github') {
            this.raw = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
            this.api = `https://api.github.com/repos/${owner}/${repo}/contents/`;
            this.fallback = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/`;
            // gitee 为同内容维护镜像（项目同时推送 github/gitee），优先于可能旧缓存的 jsdelivr
            this.mirror = `https://gitee.com/${owner}/${repo}/raw/${branch}/`;
        } else {
            this.raw = `https://gitee.com/${owner}/${repo}/raw/${branch}/`;
            this.api = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/`;
            this.fallback = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
            this.mirror = null;
        }
    }

    switchBranch(branch) {
        this.branch = branch;
        this.updateURLs();
    }

    getURL(path = '') {
        return this.raw + path.replace(/^\/+/, '');
    }

    getFallbackURL(path = '') {
        return this.fallback + path.replace(/^\/+/, '');
    }

    getMirrorURL(path = '') {
        return this.mirror ? this.mirror + path.replace(/^\/+/, '') : null;
    }

    /**
     * 生成代码包的下载地址列表（按优先级排序，供 SmartDownloader 依次尝试）。
     * 主源：专门分支（默认 zips）上的 release/code/，走与逐文件更新相同的 raw + jsdelivr 机制；
     * 备用：GitHub/Gitee release 资产（tag + filename）。
     * @param {{filename:string, branch?:string, tag?:string}} zipMeta
     * @returns {string[]}
     */
    getZipURLs(zipMeta = {}) {
        const filename = zipMeta.filename;
        if (!filename) return [];
        const branch = zipMeta.branch || 'zips';
        const url = encodeURIComponent(filename);
        const urls = [];

        if (this.platform === 'github') {
            urls.push(`https://raw.githubusercontent.com/${this.owner}/${this.repo}/${branch}/release/code/${url}`);
            urls.push(`https://gitee.com/${this.owner}/${this.repo}/raw/${branch}/release/code/${url}`);
            urls.push(`https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${branch}/release/code/${url}`);
        } else {
            urls.push(`https://gitee.com/${this.owner}/${this.repo}/raw/${branch}/release/code/${url}`);
            urls.push(`https://raw.githubusercontent.com/${this.owner}/${this.repo}/${branch}/release/code/${url}`);
            urls.push(`https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${branch}/release/code/${url}`);
        }

        // 备用：GitHub Release 资产（发布脚本只建 GitHub Release，资产名与 zip.filename 同名；
        // 代码包改 ASCII 名后此 URL 与资产一致；Gitee 无 Release，不生成对应 URL）
        const tag = zipMeta.tag;
        if (tag) {
            urls.push(`https://github.com/${this.owner}/${this.repo}/releases/download/${tag}/${url}`);
        }
        return urls;
    }
}

export { Environment, Environment as updateEnvironment, TokenManager, GitAdapter };
