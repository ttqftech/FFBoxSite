<script setup lang="ts">
// 以下这句对全局有效
/// <reference types="vite-svg-loader" />
import { onMounted, watch } from 'vue';
import { useAppStore } from '../stores/appStore';
import MainFrame from './MainFrame/MainFrame.vue'
import Popup from '../components/Popup/Popup';

const appStore = useAppStore();

watch(() => appStore.colorTheme, (value) => {
	document.body.className = value;
}, { immediate: true });

onMounted(() => {
	const mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
	const handleChange = (e) => {
		appStore.colorTheme = e.matches ? 'themeDark' : 'themeLight'
	};
	mediaQueryList.addEventListener('change', handleChange);
	handleChange(mediaQueryList);
	const vueLoadend = performance.now();
	for (let index = 0; index < 10000000; index++) {
		index;
	}
	setTimeout(() => {
		const navigationPerf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
		Popup({
			message: `本次页面加载耗时 ${(vueLoadend / 1000).toFixed(3)} 秒，其中网络耗时 ${(navigationPerf.responseEnd / 1000).toFixed(3)} 秒，SSG 技术节省了 ${((vueLoadend - (window as any).__htmlLoadEnd) / 1000).toFixed(3)} 秒`,
		});
		// debugger;
	}, 0);
});

</script>

<template>
	<MainFrame />
</template>

<style>
	body {
		margin: 0;
		background: hwb(var(--bg94));
		overflow-x: hidden;
	}
</style>
