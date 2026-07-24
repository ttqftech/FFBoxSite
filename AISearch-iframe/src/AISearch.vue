<script setup lang="ts">
import { ref, nextTick, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import gsap from 'gsap';
import AISearchConfig, { AIChatMessage, AIModelOption, ChatAPIParams, ChatAPIResult, StreamEvent, ChatBlock } from './types';
import { getTimeString, newLinedContent } from './utils';
import { useTooltip } from './useTooltip';
import Button, { ButtonType } from './components/Button';
import DropdownInput from './components/DropdownInput.vue';
import type { MenuItem } from './components/DropdownInput.vue';
import GradientRect from './assets/gradientRect.svg?skipsvgo';	// svgo 存在 bug 导致 svg 中的 id 跨 svg 产生重复
import IconRefresh from './assets/refresh.svg';
import IconLoading from './assets/loading.svg';
import IconAI from './assets/AI.svg';
import IconX from './assets/close.svg';

interface Props {
	enabled?: boolean;	// 是否启用并显示该组件，未定义则启用
	chatAPI?: (params: ChatAPIParams) => Promise<ChatAPIResult>;	// 聊天 API（流式），未定义则将在对话框中输出当前时间，出错将显示错误信息
	resetChat?: (modelKey?: string) => any;	// 点击重置对话时需要处理的副作用
	init?: (modelKey?: string) => any;	// 首次打开窗口时需要处理的副作用
	titleName?: string;	// 标题名，未定义则使用“FFBox AI 帮助”
	modelOptions?: AIModelOption[];
	initialPlaceholders?: string[];	// 未激活窗口时的 placeholder，未定义则使用“智能帮助”
	initialPlaceholderInterval?: number;	// 未激活窗口时的 placeholder 的轮换间隔（ms），未定义则使用 4000
	initSystemMessage?: AIChatMessage;	// 初始化窗口以及重置对话前补充一条系统信息
	requestKeywordLink?: AISearchConfig['requestKeywordLink'];	// 发送内容若出现关键字则打开一个链接
	responseKeywordLink?: AISearchConfig['responseKeywordLink'];	// 返回内容若出现关键字则则打开一个链接
	requestKeywordSystemMessage?: AISearchConfig['requestKeywordSystemMessage'];	// 发送内容若出现关键字则显示一条系统信息
	responseKeywordSystemMessage?: AISearchConfig['responseKeywordSystemMessage'];	// 返回内容若出现关键字则显示一条系统信息
	activatedPlaceholder?: string;	// 激活窗口时的 placeholder，未定义则使用“输入问题...”
	maxInputLength?: number;	// 用户输入的最大长度，未定义则 10000
	maxRounds?: number;	// 用户允许在单个对话中发送的消息回合数，未定义则无限
	maxRoundsMessage?: string;	// 用户允许在单个对话中发送的消息回合数达到上限时显示一条系统信息
	quotaUsed?: AISearchConfig['tokenLimit'];	// 用户已使用的额度，0~1，达到 1 后不允许再使用
	modelPrice?: AISearchConfig['modelPrice'];	// 各模型的输入/输出乘数，用于计算算力开销

	// iframe 相关回调
	onAction?: (url: string) => void;	// 需要父页面处理的动作（如 ffbox:/ 协议）
	onBoundsChange?: (rect: { top: number, left: number, width: number, height: number } | null) => void;	// 内容边界变化
	// onStateChange?: (state: 'closed' | 'opening' | 'opened' | 'closing') => void;	// 开关状态变化
	onMouseLeaveContent?: () => void;	// 鼠标离开内容区域，父页面据此关闭 iframe 的 pointer-events
	onRequestMachineIds?: () => Promise<{ frontendMachineId?: string; backendMachineId?: string }>;	// 向父页面请求机器码（前端和本地服务器）
}

const props = defineProps<Props>();

// #region 窗口开关逻辑

const isOpened = ref<'closed' | 'opening' | 'opened' | 'closing'>('closed');
let hasOpened = false;

const defaultAnchorRef = ref<HTMLDivElement>(null);
const anchorRef = ref<HTMLDivElement>(null);
const panelRef = ref<HTMLDivElement>(null);
const anchorStyle = ref<Record<string, string> | null>(null);

const openedClass = computed(() => isOpened.value === 'opening' || isOpened.value === 'opened' ? 'opened' : '');

// 上报内容边界给父页面，用于 pointer-events 切换
const reportBounds = async () => {
	if (!props.onBoundsChange) return;
	await new Promise((resolve) => setTimeout(resolve, 0));	// Vue 的更新实际上发生在 nextFrame 之后，而这个函数会在它之前触发，因此需要等一下

	boundsRafId = 0;
	const anchorEl = anchorRef.value;
	const panelEl = panelRef.value;
	if (!anchorEl) {
		props.onBoundsChange(null);
		return;
	}
	const anchorRect = anchorEl.getBoundingClientRect();
	// console.log('reportBounds', anchorRect);
	// 关闭状态下只报 anchor（输入框区域）
	if (isOpened.value === 'closed' || !panelEl) {
		props.onBoundsChange({
			top: anchorRect.top,
			left: anchorRect.left,
			width: anchorRect.width,
			height: anchorRect.height,
		});
		return;
	}
	// 打开状态下报 anchor 和 panel 的并集
	const panelRect = panelEl.getBoundingClientRect();
	const top = Math.min(anchorRect.top, panelRect.top);
	const left = Math.min(anchorRect.left, panelRect.left);
	const right = Math.max(anchorRect.right, panelRect.right);
	const bottom = Math.max(anchorRect.bottom, panelRect.bottom);
	props.onBoundsChange({
		top,
		left,
		width: right - left,
		height: bottom - top,
	});
};

let boundsRafId: number;
// 使用 requestAnimationFrame 上报边界，避免高频调用
const reportBoundsRaf = () => {
	if (boundsRafId) return;
	boundsRafId = requestAnimationFrame(reportBounds);
};

const openWindow = () => {
	if (!defaultAnchorRef.value) return;

	if (!hasOpened && props.init) {
		hasOpened = true;
		props.init(selectedModelKey.value);
	}

	const defaultRect = defaultAnchorRef.value.getBoundingClientRect();	// 记录默认位置
	// 按默认位置转换为 fixed 定位
	anchorStyle.value = {
		position: 'fixed',
		bottom: window.innerHeight - defaultRect.top - defaultRect.height + 'px',
		left: defaultRect.left + 'px',
		right: window.innerWidth - defaultRect.left - defaultRect.width + 'px',
		height: '32px',
		zIndex: '10',
	};

	isOpened.value = 'opening';
	// props.onStateChange?.('opening');
	reportBoundsRaf();
	const targetLeftRight = window.innerWidth * 0.30 - 100;
	const targetBottom = -40 + window.innerHeight * 0.15;
	const targetStyle: Record<string, string> = {
		position: 'fixed',
		bottom: targetBottom + 'px',
		left: targetLeftRight + 'px',
		right: targetLeftRight + 'px',
		height: '32px',
		zIndex: '10',
	};
	gsap.to(anchorStyle.value, {
		...targetStyle,
		duration: 0.7,
		ease: 'power3.inOut',
		onUpdate() {
			reportBoundsRaf();
		},
		onComplete() {
			targetStyle.bottom = 'calc(-40px + 15vh)';	// 改为 CSS 能动态计算的格式
			targetStyle.left = 'calc(30vw - 100px)';
			targetStyle.right = 'calc(30vw - 100px)';
			anchorStyle.value = targetStyle;
			isOpened.value = 'opened';
			// props.onStateChange?.('opened');
			reportBoundsRaf();
		}
	});
};

const closeWindow = async () => {
	const defaultRect = defaultAnchorRef.value.getBoundingClientRect();
	const currentRect = anchorRef.value.getBoundingClientRect();
	inputValue.value = '';
	textRef.value.value = '';
	const event = document.createEvent('HTMLEvents');
	event.initEvent('input', false, true);
	textRef.value.dispatchEvent(event);
	// 按当前位置转换为 fixed 定位
	anchorStyle.value = {
		position: 'fixed',
		bottom: window.innerHeight - currentRect.top - currentRect.height + 'px',
		left: currentRect.left + 'px',
		width: currentRect.width + 'px',
		height: '32px',
		zIndex: '10',
	};

	isOpened.value = 'closing';
	// props.onStateChange?.('closing');
	reportBoundsRaf();
	const targetStyle = {
		position: 'fixed',
		bottom: window.innerHeight - defaultRect.top - defaultRect.height + 'px',
		left: defaultRect.left + 'px',
		width: defaultRect.width + 'px',
		height: defaultRect.height + 'px',
		zIndex: '10',
	};
	gsap.to(anchorStyle.value, {
		...targetStyle,
		duration: 0.7,
		ease: 'power3.inOut',
		onUpdate() {
			reportBoundsRaf();
		},
		onComplete() {
			anchorStyle.value = {};
			isOpened.value = 'closed';
			// props.onStateChange?.('closed');
			reportBoundsRaf();
		}
	});
};

// 窗口大小变化时重新上报边界
const handleResize = () => {
	reportBoundsRaf();
};

onMounted(() => {
	window.addEventListener('resize', handleResize);
	// 初始上报一次边界
	nextTick(() => reportBounds());
});

onBeforeUnmount(() => {
	window.removeEventListener('resize', handleResize);
	cancelAnimationFrame(boundsRafId);
});

// #endregion

// #region 聊天逻辑

const showedRequestKeywordMessage: string[] = [];
const showedResponseKeywordMessage: string[] = [];
const inputValue = ref('');
const messages = ref<AIChatMessage[]>([]);
const sessionId = ref<string | null>(null);
const loading = ref(false);
const selectedModelKey = ref<string | undefined>(undefined);

const textRef = ref<HTMLTextAreaElement>(null);
const messagesRef = ref<HTMLDivElement>(null);

const currentRoundsPerMax = computed(() => props.maxRounds && messages.value.filter((msg) => msg.role === 'user').length / (props.maxRounds || Number.MAX_SAFE_INTEGER));

const usageTouchedWarning = computed(() =>
	props.quotaUsed?.day >= 0.75 || props.quotaUsed?.week >= 0.75 || props.quotaUsed?.total >= 0.75 ||
	(currentRoundsPerMax.value >= 0.75)
);

const roundsSvgPiePath = computed(() => {
	const cx = 24, cy = 24, r = 20;
	const pct = currentRoundsPerMax.value;
	const startAngle = -Math.PI / 2;	// 从正上方开始
	const endAngle = startAngle + pct * 2 * Math.PI;

	const x1 = cx + r * Math.cos(startAngle);
	const y1 = cy + r * Math.sin(startAngle);
	const x2 = cx + r * Math.cos(endAngle);
	const y2 = cy + r * Math.sin(endAngle);

	const largeArcFlag = pct > 0.5 ? 1 : 0;

	if (pct >= 1) {
		// 满圆用 circle 代替，避免弧线闭合 bug
		return `M ${cx} ${cy - r}
				A ${r} ${r} 0 1 1 ${cx} ${cy + r}
				A ${r} ${r} 0 1 1 ${cx} ${cy - r}
				Z`;
	}

	return `M ${cx},${cy}
			L ${x1},${y1}
			A ${r},${r} 0 ${largeArcFlag},1 ${x2},${y2}
			Z`;
});

const modelDropdownList = computed<MenuItem[]>(() => {
	const entries = props.modelOptions || [];
	if (!entries.length) {
		return [];
	}
	const first = { type: 'normal' as const, value: entries[0].key, label: entries[0].label };
	const rest = entries.slice(1).map((item) => ({ type: 'normal' as const, value: item.key, label: item.label }));
	return rest.length ? [first, { type: 'separator' as const }, ...rest] : [first];
});
const selectedModelDisplayText = computed(() => selectedModelKey.value ? props.modelOptions.find((model) => model.key === selectedModelKey.value)?.key || '' : '');

/** 根据工具名返回自动工具结果（MVP 占位） */
const getAutoToolResult = (toolName: string): string => {
	if (toolName === 'client_get_task_info') return '无任务信息';
	return '';
};

const sendMessage = async (userText?: string, continuation?: { toolCallId: string; toolResult: string }) => {
	const text = userText ?? inputValue.value.trim();
	if (!text && !continuation) return;
	if (loading.value) return;

	// 对话轮数检查（仅对新消息生效，续接不计数）
	if (!continuation && props.maxRounds) {
		if (messages.value.filter((msg) => msg.role === 'user').length >= props.maxRounds) {
			messages.value.push({ role: "aiErr", text: props.maxRoundsMessage || '本轮对话发言次数已达到上限' });
			return;
		}
	}

	// 添加用户消息（续接跳过）
	if (!continuation) {
		messages.value.push({ role: 'user', text, time: new Date() });
		inputValue.value = '';
		textRef.value.value = '';

		// 发送匹配关键词打开链接
		if (props.requestKeywordLink) {
			let needContinue = true;
			for (const item of props.requestKeywordLink) {
				const isContain = item.keywords.some((keyword) => text.includes(keyword));
				if (isContain) {
					for (const url of (item.urls || [])) window.open(url, item.blank ? '_blank' : undefined);
					if (item.needContinue === false) needContinue = false;
				}
			}
			if (!needContinue) return;
		}
		// 发送警告词检查
		if (props.requestKeywordSystemMessage) {
			for (const item of props.requestKeywordSystemMessage) {
				const keywordIndex = item.keywords.findIndex((keyword) => text.includes(keyword));
				if (keywordIndex >= 0) {
					const dontShowSecondTime = item.once && showedRequestKeywordMessage.includes(item.keywords[keywordIndex]);
					if (!dontShowSecondTime) {
						messages.value.push({ role: item.warning ? "aiErr" : 'aiInfo', text: item.message });
					}
					showedRequestKeywordMessage.push(item.keywords[keywordIndex]);
					if (item.forbid) return;
				}
			}
		}
	}

	// 开始发送
	loading.value = true;

	// 创建 AI 消息（多 block 气泡）
	const aiMessage: AIChatMessage = { role: 'ai', text: '', blocks: [], status: '呼叫第二代 AI 智能体', time: new Date() };
	messages.value.push(aiMessage);
	// 通过响应式代理引用，确保流式追加能触发视图更新
	const aiMsg = messages.value[messages.value.length - 1];
	const blocks = aiMsg.blocks!;

	let currentAgentName = '';

	const handleStreamEvent = (event: StreamEvent) => {
		switch (event.type) {
			case 'connected':
				aiMsg.status = '思考中';
				break;
			case 'agent':
				currentAgentName = event.displayName;
				aiMsg.status = `【${event.displayName}】正在为您服务`;
				break;
			case 'thinking': {
				// 追加到思考 block
				const lastBlock = blocks[blocks.length - 1];
				if (lastBlock && lastBlock.type === 'thinking') {
					lastBlock.content = (lastBlock.content || '') + event.content;
				} else {
					blocks.push({ type: 'thinking', content: event.content });
				}
				break;
			}
			case 'text': {
				const lastBlock = blocks[blocks.length - 1];
				if (lastBlock && lastBlock.type === 'text') {
					lastBlock.content = (lastBlock.content || '') + event.content;
				} else {
					blocks.push({ type: 'text', content: event.content });
				}
				aiMsg.text = blocks.filter(b => b.type === 'text').map(b => b.content || '').join('');	// 合并所有 text block
				break;
			}
			case 'tool_call':
				blocks.push({ type: 'tool_call', toolCall: { id: event.id, name: event.name, args: event.args, display: event.display } });
				break;
			case 'tool_result':
				blocks.push({ type: 'tool_result', toolResult: { id: event.id, name: event.name, content: event.content } });
				break;
			case 'usage': {
				// 按当前所选模型的输入/输出乘数计算算力开销
				const priceItem = props.modelPrice?.find((p) => p.modelKey === selectedModelKey.value);
				const inputMul = priceItem?.inputMultiplyer ?? 1;
				const outputMul = priceItem?.outputMultiplyer ?? 1;
				aiMsg.inputUsage = Math.round(event.inputUsage * inputMul);
				aiMsg.outputUsage = Math.round(event.outputUsage * outputMul);
				// aiMsg.expense = event.inputUsage * inputMul + event.outputUsage * outputMul;
				break;
			}
			case 'end':
				aiMsg.status = undefined;
				break;
			case 'error':
				blocks.push({ type: 'error', content: event.message });
				break;
		}
	};

	try {
		const params: ChatAPIParams = continuation
			? { toolCallId: continuation.toolCallId, toolResult: continuation.toolResult, modelKey: selectedModelKey.value, onEvent: handleStreamEvent }
			: { message: text, modelKey: selectedModelKey.value, onEvent: handleStreamEvent };

		const result = await props.chatAPI!(params);

		// 处理客户端工具调用
		if (result.clientToolCall) {
			const ctc = result.clientToolCall;
			if (!ctc.needResponse) {
				// 通知型：显示成功提示（作为客户端发起的消息）
				messages.value.push({ role: 'user', blocks: [{ type: 'tool_call', toolCall: { id: ctc.id, name: ctc.name, args: ctc.args, display: 'client' } }], text: '', time: new Date() });
				// 可以在这里触发 onAction 等回调
			} else if (ctc.needResponse) {
				// 请求-响应型：作为客户端消息，自动续接
				messages.value.push({ role: 'user', blocks: [{ type: 'tool_call', toolCall: { id: ctc.id, name: ctc.name, args: ctc.args, display: 'client' } }], text: '', time: new Date() });
				// 对 get_machine_ids，向父页面请求机器码返回给后端
				let toolResultText = '';
				if (ctc.name === 'get_machine_ids') {
					const machineIds = await props.onRequestMachineIds?.() ?? {};
					toolResultText = JSON.stringify({
						frontendMachineId: machineIds.frontendMachineId,
						backendMachineId: machineIds.backendMachineId,
					});
				} else {
					toolResultText = getAutoToolResult(ctc.name);
				}
				// 自动续接
				loading.value = false;
				await sendMessage(undefined, { toolCallId: ctc.id, toolResult: toolResultText });
				return;
			}
		}

		// 响应关键词处理
		if (aiMsg.text) {
			if (props.responseKeywordLink) {
				for (const item of props.responseKeywordLink) {
					const isContain = item.keywords.some((keyword) => aiMsg.text.includes(keyword));
					if (isContain) {
						for (const url of (item.urls || [])) window.open(url, item.blank === false ? '_blank' : undefined);
					}
				}
			}
			if (props.responseKeywordSystemMessage) {
				for (const item of props.responseKeywordSystemMessage) {
					const keywordIndex = item.keywords.findIndex((keyword) => aiMsg.text.includes(keyword));
					if (keywordIndex >= 0) {
						const dontShowSecondTime = item.once && showedResponseKeywordMessage.includes(item.keywords[keywordIndex]);
						if (!dontShowSecondTime) {
							messages.value.push({ role: item.warning ? "aiErr" : 'aiInfo', text: item.message });
						}
						showedResponseKeywordMessage.push(item.keywords[keywordIndex]);
					}
				}
			}
		}
	} catch (error) {
		blocks.push({ type: 'error', content: error instanceof Error ? error.message : String(error) });
	} finally {
		loading.value = false;
		if (aiMsg) aiMsg.status = undefined;
	}
};

const resetChat = () => {
	messages.value = [];
	sessionId.value = null;
	(props.resetChat || (() => {}))(selectedModelKey.value);
	if (props.initSystemMessage) {
		setTimeout(() => {
			messages.value.push(props.initSystemMessage);
		}, 0);
	}
};

const handleInputKeyPress = (event: KeyboardEvent) => {
	if (loading.value) return;
	if (event.key === 'Enter' && event.shiftKey === false) sendMessage(inputValue.value);
};

const handleActionButtonClick = (url: string) => {
	const urlObject = new URL(url);
	if (urlObject.protocol === 'ffbox:') {
		// ffbox:/ 协议交给父页面处理
		props.onAction?.(url);
	} else {
		window.open(url);
	}
};

const handleModelChange = (value: string) => {
	const newModel = props.modelOptions.find((model) => model.key === value);
	const currentModel = props.modelOptions.find((model) => model.key === selectedModelKey.value);
	if (!newModel || newModel === currentModel) {
		return;
	}
	selectedModelKey.value = newModel.key;
	// 现在不同供应商统一由 API 负责管理聊天记录，不需要重置
	// if (newModel.provider !== currentModel.provider) {
	// 	resetChat();
	// }
};

watch(() => props.modelOptions, (newOptions) => {
	const options = newOptions || [];
	if (!options.length) {
		selectedModelKey.value = undefined;
		return;
	}
	const hasCurrent = options.some((item) => item.key === selectedModelKey.value);
	if (!hasCurrent) selectedModelKey.value = options[0].key;
}, { immediate: true });

let initialPlaceholderTimer: number;
const initialPlaceholderIndex = ref(0);
const initialPlaceholderText = computed(() => props.initialPlaceholders?.[initialPlaceholderIndex.value] ?? '智能帮助加载中');
watch(() => props.initialPlaceholderInterval, () => {
	clearInterval(initialPlaceholderTimer);
	if (props.initialPlaceholderInterval) {
		initialPlaceholderTimer = setInterval(() => {
			let newIndex = 0;
			do {
				newIndex = Math.floor(Math.random() * props.initialPlaceholders?.length || 1);
			} while (newIndex === initialPlaceholderIndex.value);
			initialPlaceholderIndex.value = newIndex;
		}, props.initialPlaceholderInterval) as any;
	}
}, { immediate: true });

watch(() => messages.value.length, () => {
	nextTick(() => messagesRef.value.scrollTo(0, Number.MAX_SAFE_INTEGER));
});

// #endregion

watch(() => props.enabled, () => {
	if (props.enabled) {
		if (props.initSystemMessage) {
			messages.value.push(props.initSystemMessage);
		}
		setTimeout(() => {
			reportBounds();
		}, 500);
	}
}, { immediate: true });

</script>

<template>
	<div class="defaultAnchor" ref="defaultAnchorRef" :class="props.enabled === false ? 'disabled' : ''" @mouseleave="props.onMouseLeaveContent?.()">
		<div class="aiSearchPositionAnchor" :style="anchorStyle" ref="anchorRef">
			<transition name="panelAnim">
				<div v-show="openedClass || true" :class="['panel', openedClass]" ref="panelRef">
					<!-- <GradientRect /> -->
					<div class="chatHeader">
						<div class="left">
							<IconAI />
							<h3>{{ props.titleName ?? 'FFBox AI 帮助' }}</h3>
							<DropdownInput
								v-if="modelDropdownList.length"
								class="modelName"
								:readonly="true"
								:text="selectedModelDisplayText"
								:list="modelDropdownList"
								:onChange="handleModelChange"
							/>
							<!-- Three Concentric Progress Rings (SVG only) -->
							<div
								v-if="props.quotaUsed"
								class="usage"
								v-bind="useTooltip(`\
									${props.quotaUsed.day !== undefined ? `今日用量：${(props.quotaUsed.day * 100).toFixed(1)}%\n` : ''}\
									${props.quotaUsed.week !== undefined ? `本周用量：${(props.quotaUsed.week * 100).toFixed(1)}%\n` : ''}\
									${props.quotaUsed.total !== undefined ? `累计用量：${(props.quotaUsed.total * 100).toFixed(1)}%\n` : ''}\
									${props.maxRounds !== undefined ? `本次对话：${messages.filter((msg) => msg.role === 'user').length} / ${props.maxRounds}\n` : ''}`
								.slice(0, -1))"
							>
								<svg class="usageRing" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI 使用量">
									<defs>
										<filter id="quotaUsageBgShadow" x="-50%" y="-50%" width="200%" height="200%">
											<feDropShadow dx="0" dy="0" stdDeviation="2" :flood-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" flood-opacity="0.4"/>
										</filter>
										<filter id="quotaUsageRingShadow" x="-50%" y="-50%" width="200%" height="200%">
											<feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="hwb(var(--bg97))" flood-opacity="1"/>
										</filter>

										<!-- 渐变（外/中/内） -->
										<linearGradient id="gOuter" x1="0" y1="0" x2="1" y2="1">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
										<linearGradient id="gMiddle" x1="1" y1="0" x2="0" y2="1">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
										<linearGradient id="gInner" x1="0" y1="1" x2="1" y2="0">
											<stop offset="0%" :stop-color="usageTouchedWarning ? 'var(--red1)' : 'var(--blue1)'" />
											<stop offset="100%" :stop-color="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" />
										</linearGradient>
									</defs>

									<!-- 背景 -->
									<circle cx="24" cy="24" r="22" fill="hwb(var(--bg97))" filter="url(#quotaUsageBgShadow)" />

									<!-- 进度圆 -->
									<path
										v-if="props.maxRounds !== undefined"
										:d="roundsSvgPiePath"
										:fill="usageTouchedWarning ? 'var(--red2)' : 'var(--blue2)'" opacity="0.1"
									/>

									<!-- 外圈 -->
									<circle v-if="props.quotaUsed.day !== undefined" class="track"
										cx="24" cy="24" r="18" />
									<circle v-if="props.quotaUsed.day !== undefined" class="progress" :style="`stroke: url(#gOuter); stroke-dasharray: ${props.quotaUsed.day * 100} 100`"
										cx="24" cy="24" r="18" pathLength="100" filter="url(#quotaUsageRingShadow)" />

									<!-- 中圈 -->
									<circle v-if="props.quotaUsed.week !== undefined" class="track"
										cx="24" cy="24" r="13"/>
									<circle v-if="props.quotaUsed.week !== undefined" class="progress" :style="`stroke: url(#gMiddle); stroke-dasharray: ${props.quotaUsed.week * 100} 100`"
										cx="24" cy="24" r="13" pathLength="100" filter="url(#quotaUsageRingShadow)" />

									<!-- 内圈 -->
									<circle v-if="props.quotaUsed.total !== undefined" class="track"
										cx="24" cy="24" r="8"/>
									<circle v-if="props.quotaUsed.total !== undefined" class="progress" :style="`stroke: url(#gInner); stroke-dasharray: ${props.quotaUsed.total * 100} 100`"
										cx="24" cy="24" r="8" pathLength="100" filter="url(#quotaUsageRingShadow)" />
								</svg>
								<span class="text" v-if="usageTouchedWarning">注意用量</span>
							</div>
						</div>
						<div class="right">
							<Button @click="resetChat" aria-label="重置 AI 聊天消息" :type="ButtonType.NoBg" :disabled="loading"><IconRefresh /></Button>
							<Button @click="closeWindow" aria-label="关闭 AI 聊天弹窗" :type="ButtonType.NoBg"><IconX style="height: 20px" /></Button>
						</div>
					</div>
					<div class="chatMessages" ref="messagesRef">
						<TransitionGroup name="msgAnim">
							<div v-for="(msg, idx) in messages" :key="idx" :class="['msg', msg.role]">
								<div class="msgContent">
									<template v-if="msg.role === 'ai' && msg.status">
										<div class="blockStatus"><IconLoading class="loading" />{{ msg.status }}</div>
									</template>
									<template v-if="msg.blocks && msg.blocks.length">
										<template v-for="(block, bIdx) in msg.blocks" :key="bIdx">
											<div v-if="block.type === 'thinking'" class="blockThinking">
												<details><summary>思考过程</summary>{{ block.content }}</details>
											</div>
											<template v-else-if="block.type === 'text'">
												<div>
													<component :is="newLinedContent(block.content || '')" />
												</div>
											</template>
											<div v-else-if="block.type === 'tool_call'" class="blockToolCall">
												🔧 工具调用：{{ block.toolCall?.name }}
											</div>
											<div v-else-if="block.type === 'tool_result'" class="blockToolResult">
												↳ {{ block.toolResult?.content }}
											</div>
											<div v-else-if="block.type === 'error'" class="blockError">
												⚠️ {{ block.content }}
											</div>
										</template>
									</template>
									<template v-else-if="msg.text">
										<component :is="newLinedContent(msg.text)" />
									</template>
								</div>
								<div class="smallText">
									{{ [
										msg.time ? getTimeString(msg.time) : '',
										msg.refers?.length ? '参考来源：' + msg.refers.join('；') : '',
										msg.inputUsage !== undefined && msg.outputUsage !== undefined ? `算力开销：${msg.inputUsage} / ${msg.outputUsage}` : '',
										// msg.expense ? '算力开销：' + Math.round(msg.expense) : '',
									].filter((text) => text).join('｜') }}
									<button v-for="action in msg.actions" @click="handleActionButtonClick(action.url)">{{ action.label }}</button>
								</div>
							</div>
						</TransitionGroup>
					</div>
				</div>
			</transition>
			<div class="inputArea" :class="openedClass">
				<textarea
					type="text"
					rows="1"
					:class="openedClass"
					ref="textRef"
					v-model="inputValue"
					:placeholder="openedClass.length ? '输入问题...' : ''"
					:disabled="loading"
					:maxlength="props.maxInputLength ?? 10000"
					@focus="() => isOpened === 'closed' ? openWindow() : null"
					@keypress="handleInputKeyPress"
					aria-label="AI 聊天输入框"
				/>
				<div :class="['iconAI', openedClass]">
					<IconAI />
					<span>{{ initialPlaceholderText }}</span>
				</div>
				<GradientRect v-if="isOpened === 'closed'" class="gradientRect" />
				<Button @click="() => sendMessage(inputValue)" :disabled="loading" :class="openedClass">🚀</Button>
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	/* iframe 内容需要显式启用 pointer-events，因为 body 设置了 pointer-events: none */
	.defaultAnchor {
		position: relative;
		height: 32px;
		width: 100%;
		transition: width 0.5s ease;
		pointer-events: auto;
		&.disabled {
			width: 0 !important;
			overflow: hidden;
		}
		.aiSearchPositionAnchor {
			position: relative;	// 激活时由 js 改为 fixed
			height: 100%;	// 激活时由 js 控制
			.inputArea {
				pointer-events: auto;
				position: absolute;
				bottom: 0;
				height: 32px;	// 关闭状态
				width: 100%;
				display: flex;
				align-items: stretch;
				transition: height 0.7s ease;
				-webkit-app-region: none;
				&.opened {
					// max-height: 82px;	// 打开状态
					height: unset;
				}
				textarea {
					width: 100%;
					max-height: 32px;
					box-sizing: border-box;
					padding: 8px 10px 5px;
					border: none;
					outline: none;
					border-radius: 16px;
					font-family: inherit;
					font-size: 14px;
					line-height: 19px;
					color: inherit;
					background-color: hwb(var(--bg99));
					box-shadow: 0 0 1px 0.5px hwb(var(--highlight)),
								0 1.5px 3px 0 hwb(var(--hoverShadow) / 0.2);
					overflow: auto;
					resize: none;
					transition: all 0.7s ease;
					&.opened {
						width: calc(100% - 48px);
						margin-right: 48px;
						max-height: 82px;
						height: unset;	// 自由拓展高度，直到 max-height
					}
				}
				.iconAI {
					position: absolute;
					bottom: 0;
					left: 0;
					right: 0;
					height: 32px;
					margin-right: 4px;
					display: flex;
					justify-content: center;
					align-items: center;
					gap: 8px;
					color: var(--33);
					font-size: 13px;
					opacity: 0.7;
					pointer-events: none;
					transition: opacity 0.1s linear;
					&.opened {
						opacity: 0;
					}
					svg {
						height: 32px;
					}
					span {
						max-width: calc(100% - 32px - 16px);
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
				}
				&:hover:not(&.opened) .iconAI {
					opacity: 1;
				}
				.gradientRect {
					position: absolute;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					border-radius: 16px;
					opacity: 0;
					pointer-events: none;
					box-shadow: 0 1px 0px 0px hwb(228 30% 0% / 0.3);
				}
				&:hover>svg {
					opacity: 1;
					box-shadow: 0 1px 16px 16px hwb(228 30% 0% / 0);
					transition: box-shadow 0.6s ease-out;
				}
				button {
					position: absolute;
					right: 0;
					top: 0;
					bottom: 0;
					width: 0;
					min-width: unset;
					height: 100%;
					padding: 0;
					opacity: 0;
					overflow: hidden;
					transition: width 0.7s ease, opacity 0.5s linear;
					&.opened {
						width: 40px;
						opacity: 1;
					}
				}
			}
			.panel {
				pointer-events: auto;
				position: absolute;
				top: 0;
				left: -8px;
				right: -8px;
				bottom: -8px;
				border-radius: 8px;
				background-color: hwb(var(--bg97) / 0.7);
				backdrop-filter: blur(2px) contrast(110%);
				box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
						0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),	// 远阴影
						0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),	// 近阴影
						0 10px 40px -8px hwb(220 30% 0% / 0.2),
						0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
				display: flex;
				flex-direction: column;
				overflow: hidden;
				opacity: 0;
				transition: top 0.7s cubic-bezier(0.5, 0, 0.2, 1), opacity 0.3s linear 0.1s;
				-webkit-app-region: none;
				&.opened {
					opacity: 1;
					top: calc(-80px - 70vh + 60px);
					transition: top 0.7s cubic-bezier(0.8, 0, 0.2, 1) 0.1s, opacity 0.1s linear;
				}
				.chatHeader {
					display: flex;
					justify-content: space-between;
					padding: 8px 12px;
					border-bottom: 1px solid var(--77);
					background: hwb(var(--bg95));
					.left {
						display: flex;
						align-items: center;
						svg {
							height: 28px;
						}
						h3 {
							margin: 0 8px;
							font-size: 18px;
							font-weight: 500;
						}
						.modelName {
							margin-left: 4px;
							border: hwb(255 50% 0% / 0.5) 1px solid;
							border-radius: 8px;
							background-color: hwb(255 50% 0% / 0.2);
							width: 180px;
							:deep(input) {
								font-size: 11px;
							}
						}
						.usage {
							display: flex;
							align-items: center;
							.usageRing {
								--blue1: #5B8DEF;
								--blue2: #1AD6FF;
								--green1: #7BD88F;
								--green2: #2ED573;
								--red1: hwb(20 20% 0%);
								--red2: hwb(5 40% 5%);
								margin-left: 12px;
								width: 22px;
								height: 22px;
								.track {
									fill: none;
									stroke: hwb(0 65% 35% / 0.05);
									stroke-width: 2px;
								}
								.progress {
									fill: none;
									stroke-linecap: round;
									stroke-dashoffset: 0;
									stroke-dasharray: var(--p,0) 100;
									stroke-width: 2.5px;
									transform-origin: 24px 24px;	// 方便整体旋转让起点在正上方
									transform: rotate(-90deg);
									transition: stroke-dasharray .6s ease;
									opacity: 0.5;
								}
							}
							.text {
								margin-left: 8px;
								font-size: 10px;
							}
						}
					}
					.right {
						display: flex;
						button {
							min-width: unset;
							width: 30px;
							margin: 0 0 0 2px;
							padding: 0;
							display: flex;
							justify-content: center;
							align-items: center;
							svg {
								height: 14px;
								width: auto;
							}
						}
					}
				}
				.chatMessages {
					flex: 1;
					padding: 12px 12px;
					margin-bottom: 68px;
					overflow-y: auto;
					.msgAnim-enter-from {
						opacity: 0;
						&.user>div {
							transform: scale(0.95);
							box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset !important;	// 上高光;
						}
						&.ai>div {
							transform: scale(0.9);
							box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset !important;	// 上高光;
						}
					}
					.msgAnim-enter-active {
						transition: opacity 0.1s linear, flex 10s;	// flex 是撑时长给 vue 看的
						div {
							transition: all 0.7s cubic-bezier(0.1, 2, 0.3, 1);
						}
					}
					.msgAnim-leave-to {
						opacity: 0;
						transform: scale(0.6);
					}
					.msgAnim-leave-active {
						transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(1, 0, 1, 1);
					}
					.msg {
						position: relative;
						margin-bottom: 24px;
						.msgContent {
							display: inline-block;
							max-width: 80%;
							padding: 10px 16px;
							border-radius: 8px;
							border: none;
							font-size: 14px;
							line-height: 18px;
							text-align: justify;
							opacity: 1;
							user-select: text;
							&>*:not(&>*:nth-last-child(1)) {
								margin-bottom: 6px;
								// color: red !important;
							}
							@keyframes rotation {
								from {
									transform: rotate(0deg);
								}
								to {
									transform: rotate(360deg);
								}
							}
							.loading {
								width: 18px;
								height: 18px;
								animation: rotation 1s steps(8) infinite;
								margin-right: 4px;
								vertical-align: -4px;
								color: #33aacc77;
							}
						}
						.blockThinking {
							font-size: 12px;
							color: var(--66);
							details {
								summary {
									cursor: pointer;
									opacity: 0.7;
								}
							}
						}
						.blockToolCall {
							font-size: 12px;
						}
						.blockStatus {
							// font-size: 12px;
							color: #33aacc;
							font-style: italic;
							.loading {
								width: 14px;
								height: 14px;
								animation: rotation 1s steps(8) infinite;
								margin-right: 4px;
								vertical-align: -3px;
								color: #33aacc77;
							}
						}
						.blockToolResult {
							font-size: 12px;
							color: var(--66);
							margin: 2px 0 4px 16px;
						}
						.blockError {
							// font-size: 13px;
							color: #dd8800;
							font-style: italic;
						}
						.smallText {
							position: absolute;
							top: calc(100% + 6px);
							font-size: 10px;
							opacity: 0.5;
							button {
								font-size: 10px;
							}
						}
						&.user {
							text-align: right;
							.msgContent {
								color: #fefefe;
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(210 5% 5% / 0.85) inset;	// 背景色
							}
							.blockToolCall {
								color: #FFE777;
							}
							.smallText {
								right: 2px;
							}
						}
						&.ai, &.aiErr, &.aiInfo {
							text-align: left;
							.msgContent {
								color: var(--33);
								box-shadow: 0 0 1px 0.5px hwb(var(--hoverLightBg)),
										0 1.5px 4px 0 hwb(var(--hoverShadow) / 0.2),
										0 1px 0.5px 0px hwb(var(--highlight) / 0.5) inset,	// 上高光
										0 0 0 9999px hwb(var(--hoverLightBg) / 0.85) inset;	// 背景色
							}
							.blockToolCall {
								color: #5B8DEF;
							}
							.smallText {
								left: 2px;
							}
						}
						&.aiErr>.msgContent {
							color: #dd8800;
							font-style: italic;
						}
						&.aiInfo>.msgContent {
							color: #33aacc;
							font-style: italic;
						}
					}
				}
			}
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
