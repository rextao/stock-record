import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stock-record:theme';
const THEME_ATTRIBUTE = 'data-prefers-color-scheme';
const DEFAULT_MODE: ThemeMode = 'dark';

/**
 * 首屏防闪烁脚本。必须在 <head> 里同步执行：
 * SPA + Service Worker 预缓存的是同一份静态 index.html，主题无法在构建期烘进去，
 * 放到 useEffect 里会先渲染默认主题再跳变。
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',m=localStorage.getItem(k)||'${DEFAULT_MODE}',r=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.setAttribute('${THEME_ATTRIBUTE}',r);}catch(e){document.documentElement.setAttribute('${THEME_ATTRIBUTE}','${DEFAULT_MODE}');}})();`;

function systemTheme(): ResolvedTheme {
	if (typeof window === 'undefined') return DEFAULT_MODE === 'light' ? 'light' : 'dark';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(mode: ThemeMode): ResolvedTheme {
	return mode === 'system' ? systemTheme() : mode;
}

function readStoredMode(): ThemeMode {
	if (typeof localStorage === 'undefined') return DEFAULT_MODE;
	const raw = localStorage.getItem(THEME_STORAGE_KEY);
	return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_MODE;
}

function apply(resolved: ResolvedTheme) {
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
}

/**
 * 把 store 里当前生效的主题强行写回 <html>。
 * React 重建 documentElement（hydration 失配后的 client-render 回退）会带走这个属性，
 * 挂载后调一次作为兜底，配合 Layout 里声明式的 data-prefers-color-scheme 双保险。
 */
export function applyResolvedTheme() {
	apply(useThemeStore.getState().resolved);
}

interface ThemeState {
	mode: ThemeMode;
	/** 实际生效的主题，mode 为 system 时跟随系统 */
	resolved: ResolvedTheme;
	setMode: (mode: ThemeMode) => void;
	toggle: () => void;
	/** 订阅系统主题变化，返回取消订阅函数 */
	syncWithSystem: () => () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
	const initialMode = readStoredMode();

	return {
		mode: initialMode,
		resolved: resolve(initialMode),

		setMode: (next) => {
			const resolved = resolve(next);
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(THEME_STORAGE_KEY, next);
			}
			apply(resolved);
			set({ mode: next, resolved });
		},

		toggle: () => {
			get().setMode(get().resolved === 'dark' ? 'light' : 'dark');
		},

		syncWithSystem: () => {
			if (typeof window === 'undefined') return () => {};
			const mql = window.matchMedia('(prefers-color-scheme: dark)');
			const onChange = () => {
				if (get().mode !== 'system') return;
				const resolved = systemTheme();
				apply(resolved);
				set({ resolved });
			};
			mql.addEventListener('change', onChange);
			return () => mql.removeEventListener('change', onChange);
		},
	};
});

/**
 * 读取 CSS 令牌的实际值。Canvas 绘图（ctx.strokeStyle）和 lucide 图标的 color
 * 这类必须拿到 JS 字符串的场景用它，避免把色值二次硬编码。
 */
export function readToken(name: string, el: Element | null = null): string {
	if (typeof window === 'undefined') return '';
	const target = el ?? document.documentElement;
	return getComputedStyle(target).getPropertyValue(name).trim();
}
