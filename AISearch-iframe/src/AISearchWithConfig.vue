<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AISearch from './AISearch.vue';
import AISearchConfig, { AIModelOption, ChatAPIParams, ChatAPIResult, StreamEvent } from './types';
import { randomString, generateConversationId } from './utils';
import ImprovedLocalStorage from './storage';
import { generateConfig } from './configGenerator';

/**
 * AISearchWithConfig —— 从主项目转移而来。
 * 负责拉取 AI 帮助配置并渲染 AISearch 组件。
 *
 * 与原主项目版本的差异：
 * - initMsgbox 不在 iframe 中显示，通过 onInitMsgbox 回调转发给父页面
 * - 增加 iframe 通讯相关回调（onAction / onBoundsChange / onStateChange / onMouseLeaveContent）
 */

interface Props {
	// 平台标识，决定 generateConfig 拉取哪套配置（如 'FFBoxSite' / 'FFBox 5.3'），由父页面下发
	platform?: string;
	// iframe 通讯回调
	onInitMsgbox?: (content: string) => void;	// 配置要求显示初始化弹窗（iframe 无法显示 Msgbox，转发父页面）
	onAction?: (url: string) => void;	// 需要父页面处理的动作（如 ffbox:/ 协议）
	onBoundsChange?: (rect: { top: number, left: number, width: number, height: number } | null) => void;	// 内容边界变化
	// onStateChange?: (state: 'closed' | 'opening' | 'opened' | 'closing') => void;	// 开关状态变化
	onMouseLeaveContent?: () => void;	// 鼠标离开内容区域，父页面据此关闭 iframe 的 pointer-events
	onRequestMachineIds?: () => Promise<{ frontendMachineId?: string; backendMachineId?: string }>;	// 向父页面请求机器码（前端和本地服务器）
}

const props = defineProps<Props>();

const fetchedConfig = ref<AISearchConfig>();
const modelOptions = ref<AIModelOption[]>([]);
let conversationId: string | null = null;  // 当前会话 ID，由前端生成
let lastUsedTime = 0;	// 若使用的日期发生变化，重置用量
let userIdv1 = '';
const tokenUsed = ref({ day: 0, week: 0, total: 0 });

const quotaUsed = computed(() => ({
	day: fetchedConfig.value?.tokenLimit?.day ? tokenUsed.value.day / fetchedConfig.value.tokenLimit.day : undefined,
	week: fetchedConfig.value?.tokenLimit?.week ? tokenUsed.value.week / fetchedConfig.value.tokenLimit.week : undefined,
	total: fetchedConfig.value?.tokenLimit?.total ? tokenUsed.value.total / fetchedConfig.value.tokenLimit.total : undefined,
}));

const getModelOption = (modelKey?: string): AIModelOption | undefined => {
	if (!modelOptions.value.length) return undefined;
	if (modelKey) {
		const matched = modelOptions.value.find((item) => item.key === modelKey);
		if (matched) return matched;
	}
	return modelOptions.value[0];
};

const checkQuota = async () => {
	const aiAssistantData = await ImprovedLocalStorage.get('aiAssistant');

	if (Number.isFinite(aiAssistantData?.tokenUsed?.day)) tokenUsed.value.day = aiAssistantData.tokenUsed.day;
	if (Number.isFinite(aiAssistantData?.tokenUsed?.week)) tokenUsed.value.week = aiAssistantData.tokenUsed.week;
	if (Number.isFinite(aiAssistantData?.tokenUsed?.total)) tokenUsed.value.total = aiAssistantData.tokenUsed.total;

	lastUsedTime = +aiAssistantData?.lastUsedTime || 0;
	const lastUsedDay = Math.floor((lastUsedTime - new Date().getTimezoneOffset() * 60000) / 86400000);
	const lastUsedWeekday = Math.floor((lastUsedDay + 3) / 7);	// 0 时间是周四
	const now = Date.now();
	const nowDay = Math.floor((now - new Date().getTimezoneOffset() * 60000) / 86400000);
	const nowWeekday = Math.floor((nowDay + 3) / 7);	// 0 时间是周四
	if (lastUsedDay !== nowDay) {
		tokenUsed.value.day = 0;
		if (lastUsedWeekday !== nowWeekday) {
			tokenUsed.value.week = 0;
		}
		ImprovedLocalStorage.set('aiAssistant.tokenUsed', tokenUsed.value);
	}
};
// 扣减使用量，只更新最后使用时间，不检查日期变化
const useQuota = async (count: number) => {
	await ImprovedLocalStorage.set('aiAssistant.lastUsedTime', Date.now());
	tokenUsed.value.day += count;
	tokenUsed.value.week += count;
	tokenUsed.value.total += count;
	await ImprovedLocalStorage.set('aiAssistant.tokenUsed', tokenUsed.value);
};

// 只有 config 加载出来才会加载 AISearch，加载 AISearch 第一次打开弹窗才会 initWindow()
const initWindow = async (modelKey?: string) => {
	if (!fetchedConfig.value) return;

	if (fetchedConfig.value.initMsgbox) {
		// iframe 中无法显示 Msgbox，转发给父页面
		props.onInitMsgbox?.(fetchedConfig.value.initMsgbox);
	}

	// 生成新的 conversationId（不再向后端发 [init] 请求）
	conversationId = generateConversationId();
};

const resetChat = async (modelKey?: string) => {
	conversationId = null;
	await initWindow(modelKey);
};

/**
 * 流式 chatAPI：使用 SSE fetch 与后端通信。
 * 入参为 message（用户发送新消息）或 toolCallId + toolResult（客户端工具调用结果），通过 onEvent 回调推送流式事件。
 */
const chatAPI = async (params: ChatAPIParams): Promise<ChatAPIResult> => {
	const { message, toolCallId, toolResult, modelKey, onEvent } = params;

	checkQuota();
	if (fetchedConfig.value?.tokenLimit?.day && tokenUsed.value.day >= fetchedConfig.value.tokenLimit.day) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.day ?? '今日 AI 用量已达到上限');
	}
	if (fetchedConfig.value?.tokenLimit?.week && tokenUsed.value.week >= fetchedConfig.value.tokenLimit.week) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.week ?? '本周 AI 用量已达到上限');
	}
	if (fetchedConfig.value?.tokenLimit?.total && tokenUsed.value.total >= fetchedConfig.value.tokenLimit.total) {
		return Promise.reject(fetchedConfig.value?.tokenLimitMessage?.total ?? '累计 AI 用量已达到上限');
	}

	const selected = getModelOption(modelKey);
	if (!selected) return Promise.reject('暂无可用模型');
	if (!fetchedConfig.value?.chatUrl) return Promise.reject('AI configuration missing');

	// 如果还没有 conversationId，生成一个
	if (!conversationId) {
		conversationId = generateConversationId();
	}

	const requestBody: Record<string, any> = {
		conversationId,
		provider: selected.provider,
		modelId: selected.modelId,
	};
	if (message !== undefined) {
		requestBody.message = message;
	} else if (toolCallId !== undefined) {
		requestBody.toolCallId = toolCallId;
		requestBody.toolResult = toolResult ?? '';
	}

	let expense = 0;
	let clientToolCall: ChatAPIResult['clientToolCall'];

	try {
		const response = await fetch(fetchedConfig.value.chatUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const errText = await response.text();
			return Promise.reject(`请求失败 (${response.status}): ${errText}`);
		}
		onEvent({ type: 'connected' });

		const reader = response.body?.getReader();
		if (!reader) return Promise.reject('无法获取响应流');

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// 解析 SSE：每条事件以 \n\n 分隔
			const lines = buffer.split('\n\n');
			buffer = lines.pop() || '';  // 最后一段可能不完整，保留

			for (const block of lines) {
				const line = block.trim();
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6).trim();
				if (data === '[DONE]') continue;
				try {
					const event = JSON.parse(data) as StreamEvent;
					onEvent(event);
					if (event.type === 'usage') expense = event.expense;
					if (event.type === 'client_tool_call') {
						clientToolCall = { id: event.id, name: event.name, args: event.args, needResponse: event.needResponse };
					}
					// if (event.type === 'error') {
					// 	return Promise.reject(event.message);
					// }
				} catch (e) {
					// JSON 解析失败，跳过
				}
			}
		}

		// 处理 buffer 中剩余的数据
		if (buffer.trim().startsWith('data: ')) {
			const data = buffer.trim().slice(6).trim();
			if (data && data !== '[DONE]') {
				try {
					const event = JSON.parse(data) as StreamEvent;
					onEvent(event);
					if (event.type === 'usage') expense = event.expense;
					if (event.type === 'client_tool_call') {
						clientToolCall = { id: event.id, name: event.name, args: event.args, needResponse: event.needResponse };
					}
				} catch (e) {
					// ignore
				}
			}
		}

		if (expense > 0) await useQuota(expense);
		return { expense, clientToolCall };
	} catch (err: any) {
		return Promise.reject(`请求失败：${err?.message || '未知原因'}`);
	}
};

let inited = false;
const init = async () => {
	if (inited) return;

	try {
		const configData = generateConfig(props.platform);
		fetchedConfig.value = configData;
		modelOptions.value = fetchedConfig.value.modelOptions || [];

		checkQuota();

		userIdv1 = await ImprovedLocalStorage.get('aiAssistant.userIdv1');
		if (!userIdv1) {
			const t = new Date();
			userIdv1 = `${randomString()}｜${t.getFullYear()}-${(t.getMonth() + 1 + '').padStart(2, '0')}-${(t.getDate() + '').padStart(2, '0')}｜Site｜${navigator.platform}｜${navigator.userAgent}`;
			ImprovedLocalStorage.set('aiAssistant.userIdv1', userIdv1);
		}

		inited = true;
	} catch (error) {
		console.log('AI 帮助配置加载失败', error);
	}
};

onMounted(() => {
	// 延迟初始化配置，与原项目保持一致
	setTimeout(() => {
		init();
	}, 100);
});
</script>

<template>
	<AISearch
		:enabled="fetchedConfig ? true : false"
		:chatAPI="chatAPI" :init="initWindow" :resetChat="resetChat"
		:titleName="fetchedConfig?.titleName"
		:modelOptions="modelOptions"
		:initialPlaceholders="fetchedConfig?.initialPlaceholders" :initialPlaceholderInterval="fetchedConfig?.initialPlaceholderInterval"
		:initSystemMessage="fetchedConfig?.initSystemMessage"
		:requestKeywordSystemMessage="fetchedConfig?.requestKeywordSystemMessage" :responseKeywordSystemMessage="fetchedConfig?.responseKeywordSystemMessage"
		:requestKeywordLink="fetchedConfig?.requestKeywordLink" :responseKeywordLink="fetchedConfig?.responseKeywordLink"
		:maxInputLength="fetchedConfig?.maxInputLength"
		:maxRounds="fetchedConfig?.maxRounds" :maxRoundsMessage="fetchedConfig?.maxRoundsMessage"
		:quotaUsed="quotaUsed"
		:onAction="props.onAction"
		:onBoundsChange="props.onBoundsChange"
		:onMouseLeaveContent="props.onMouseLeaveContent"
		:onRequestMachineIds="props.onRequestMachineIds"
	/>
</template>