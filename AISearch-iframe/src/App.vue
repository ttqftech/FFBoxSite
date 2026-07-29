<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, reactive } from 'vue';
import AISearchWithConfig from './AISearchWithConfig.vue';
import { setColorTheme } from './theme';

/**
 * iframe 入口组件。
 * 职责：
 * 1. 包装定位容器（位置与尺寸由父页面 AISearchIframeHost 下发 containerBounds 决定）
 * 2. 渲染 AISearchWithConfig（配置拉取 + AISearch 组件，已整体转移至 iframe）
 * 3. 通过 postMessage 与父页面通讯：转发回调、接收主题 / opAreaBounds
 *
 * 设计说明：
 * - 父页面 AISearchIframeHost 通过 ResizeObserver 监听自身尺寸位置变化，
 *   将宿主容器的 getBoundingClientRect 下发到 iframe；
 *   iframe 按此 containerBounds 将 aiSearchWrapper 绝对定位到与宿主容器重合的位置。
 */

// 与父页面的 postMessage 通讯
const postToParent = (payload: any) => {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage(payload, '*');
	}
};

// 请求-响应机制（参照 sponsorPanel/v1.html 的 request 函数）
let requestIdCounter = 0;
const pendingRequests = new Map<string, (data: any) => void>();

function requestParent<T = any>(type: string, payload: Record<string, any> = {}): Promise<T> {
	return new Promise((resolve) => {
		const requestId = 'req_' + (++requestIdCounter);
		pendingRequests.set(requestId, resolve);
		postToParent({ type, requestId, ...payload });
	});
}

// AISearchWithConfig 回调 -> 转发给父页面
const handleInitMsgbox = (content: string) => postToParent({ type: 'initMsgbox', content });
const handleAction = (url: string) => postToParent({ type: 'action', url });
const handleBoundsChange = (rect: { top: number, left: number, width: number, height: number } | null) => postToParent({ type: 'opAreaBounds', rect });
// const handleStateChange = (state: 'closed' | 'opening' | 'opened' | 'closing') => postToParent({ type: 'state', state });
const handleMouseLeaveContent = () => postToParent({ type: 'contentMouseLeave' });
const handleRequestMachineIds = () => requestParent<{ frontendMachineId?: string; backendMachineId?: string }>('getMachineIds');
// 向父页面发起 HTTP 代调用（iframe 指定服务器/方法/路径/参数，宿主代为调用后端 API 后回传结果）
const handleHttpRequest = (payload: { serverId?: string; method: string; path: string; query?: Record<string, any>; body?: any }) => requestParent<any>('httpRequest', payload);

// 由父页面下发的 bounds（宿主容器在父页面 viewport 下的 rect）
const hostBounds = reactive({ top: 0, left: 0, width: 400, height: 100 });

// 由父页面下发的 platform，决定 generateConfig 使用哪套配置
const platform = ref<string>('');

// 接收父页面消息
const handleMessage = (event: MessageEvent) => {
	const data = event.data;
	if (!data || typeof data !== 'object') return;
	// 处理父页面的 response（请求-响应型通讯）
	if (data.type === 'response' && data.requestId) {
		const resolve = pendingRequests.get(data.requestId);
		if (resolve) {
			pendingRequests.delete(data.requestId);
			resolve(data.data);
		}
		return;
	}
	switch (data.type) {
		case 'theme':
			if (data.theme === 'themeLight' || data.theme === 'themeDark') {
				setColorTheme(data.theme);
			}
			break;
		case 'hostBounds':
			if (data.rect && typeof data.rect === 'object') {
				const { top, left, width, height } = data.rect;
				hostBounds.top = top;
				hostBounds.left = left;	
				hostBounds.width = width;
				hostBounds.height = height;
			}
			break;
		case 'platform':
			if (typeof data.platform === 'string') {
				platform.value = data.platform;
			}
			break;
	}
};

onMounted(() => {
	window.addEventListener('message', handleMessage);
	// 通知父页面 iframe 已就绪，父页面会下发主题和初始 bounds
	postToParent({ type: 'ready' });
});

onBeforeUnmount(() => {
	window.removeEventListener('message', handleMessage);
});
</script>

<template>
	<!-- 定位容器：按父页面下发的 bounds 定位，与宿主容器完全重合 -->
	<div
		class="aiSearchWrapper"
		:style="{
			top: hostBounds.top + 'px',
			left: hostBounds.left + 'px',
			width: hostBounds.width + 'px',
			height: hostBounds.height + 'px',
		}"
	>
		<div class="aiSearchInner">
			<AISearchWithConfig
				:platform="platform"
				:onInitMsgbox="handleInitMsgbox"
				:onAction="handleAction"
				:onBoundsChange="handleBoundsChange"
				:onMouseLeaveContent="handleMouseLeaveContent"
				:onRequestMachineIds="handleRequestMachineIds"
				:onHttpRequest="handleHttpRequest"
		/>
		</div>
	</div>
</template>

<style>
	/* 定位容器，使用 fixed（iframe body 即为视口）。
	 * 具体 top/left/width/height 由父页面下发的 bounds 驱动。 */
	.aiSearchWrapper {
		position: fixed;
		display: flex;
		justify-content: center;
		align-items: center;
		pointer-events: none;	/* 包装器本身不拦截，由内部 defaultAnchor 拦截 */
	}
	.aiSearchInner {
		display: flex;
		justify-content: center;
		align-items: center;
		width: clamp(104px, calc(40px + 50%), 100%);
	}
</style>
