import { ref } from 'vue';

/** 当前主题，由父页面通过 postMessage 同步 */
export const colorTheme = ref<'themeLight' | 'themeDark'>('themeLight');

export function setColorTheme(theme: 'themeLight' | 'themeDark') {
	colorTheme.value = theme;
	document.body.className = theme;
}
