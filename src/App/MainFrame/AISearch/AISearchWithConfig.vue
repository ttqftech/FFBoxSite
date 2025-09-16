<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { computed, onMounted, ref } from 'vue';
import CryptoJS from 'crypto-js';
import AISearchConfig from './types';
// import { version } from '@common/constants';
import { randomString } from '../../../common/utils';
import ImprovedLocalStorage from '../../../common/ImprovedLocalStorage';
import AISearch from './AISearch.vue';
import Msgbox from '../../../components/Msgbox/Msgbox';
import { ButtonType } from '../../../components/Button/Button';

const fetchedConfig = ref<AISearchConfig>();

const providerName = ref<string>();
const model = ref<{ name: string; id: string }>();
let conversationId: string;
let lastUsedTime: number;	// 若使用的日期发生变化，重置用量
let userIdv1: string;
const tokenUsed = ref({ day: 0, week: 0, total: 0 });

const quotaUsed = computed(() => ({
	day: fetchedConfig.value?.tokenLimit?.day ? tokenUsed.value.day / fetchedConfig.value.tokenLimit.day : undefined,
	week: fetchedConfig.value?.tokenLimit?.week ? tokenUsed.value.week / fetchedConfig.value.tokenLimit.week : undefined,
	total: fetchedConfig.value?.tokenLimit?.total ? tokenUsed.value.total / fetchedConfig.value.tokenLimit.total : undefined,
}));

// 检查日期，如果变化则写盘
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
}

// 只有 config 加载出来才会加载 AISearch，加载 AISearch 第一次打开弹窗才会 init()
const init = () => {
	if (fetchedConfig.value.initMsgbox) {
		Msgbox({
			content: fetchedConfig.value.initMsgbox,
			buttons: [
				{ text: `我已知悉，继续`, type: ButtonType.Primary },
			]
		})
	}
	if (providerName.value === 'baidu') {
		var options = {
			'method': 'POST',
			'url': 'https://qianfan.baidubce.com/v2/app/conversation',
			'headers': {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${fetchedConfig.value.baidu.key}`
			},
			data: JSON.stringify({
				"app_id": fetchedConfig.value.baidu.appId,
			})
		};
		axios(options)
			.then((res) => {
				console.log(res.data);
				conversationId = res.data.conversation_id;
			})
			.catch(error => {
				throw new Error(error);	// 暂不容错
			});
	}
};

const resetChat = () => {
	if (providerName.value === 'ali') {
		conversationId = undefined;
	} else if (providerName.value === 'baidu') {
		init();
	}
};

const chatAPI = async (message: string) => {
	// 用量检查
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

	// API 请求
	if (providerName.value === 'ali') {
		try {
			const res = await axios.post(
				`https://dashscope.aliyuncs.com/api/v1/apps/${fetchedConfig.value.ali.appId}/completion`,
				{
					input: {
						prompt: message,
						...(conversationId ? { session_id: conversationId } : {}),
						biz_params: {
							customModelId: model.value.id,
							userIdv1,
						}
					},
					parameters: {
						// model_id: model.value.id,
					},
					debug: {}
				},
				{
					headers: {
						"Authorization": `Bearer ${fetchedConfig.value.ali.key}`,
						"Content-Type": "application/json",
					}
				}
			);

			const resData = res.data;
			if (!conversationId) {
				conversationId = resData.output.session_id;
			}
			let usageSum = 0;
			const modelsPrice = fetchedConfig.value.ali.modelPrice || [];
			for (const [usedModelIndex, _usedModel] of Object.entries(resData.usage.models)) {
				const usedModel = _usedModel as any;
				const multiplyerConfig = modelsPrice.find((modelPrice) =>
					modelPrice.modelIdOrIndex === usedModel.model_id ||
					modelPrice.modelIdOrIndex === usedModelIndex
				);
				if (multiplyerConfig) {
					usageSum += usedModel.input_tokens * multiplyerConfig.inputMultiplyer + usedModel.output_tokens * multiplyerConfig.outputMultiplyer;
				} else {
					usageSum += usedModel.input_tokens + usedModel.output_tokens;
				}
			}
			useQuota(usageSum);

			return Promise.resolve(resData.output.text);
		} catch (err) {
			console.log(err);
			if (err instanceof AxiosError) {
				if (err.response?.data) {
					const data = err.response.data;
					if (data.code === 'App.AccessDenied') {
						return Promise.reject(`模型提供商拒绝了请求，请联系 FFBox 作者或更新 FFBox 解决`);	// appId 错误
					} else if (data.code === 'InvalidApiKey') {
						return Promise.reject(`模型提供商拒绝了请求，请联系 FFBox 作者解决`);	// apiKey 错误
					} else if (data.code === 'DataInspectionFailed') {
						useQuota(500);	// 惩罚
						return Promise.reject(fetchedConfig.value.invalidReply);
					} else {
						return Promise.reject(data.message);
					}
				} else {
					return Promise.reject(`请求失败：${err.message}`);
				}
			}
			return Promise.reject(`请求失败：未知原因`);
		}
	} else if (providerName.value === 'baidu') {
		try {
			const res = await axios.post(
				`https://qianfan.baidubce.com/v2/app/conversation/runs`,
				{
					app_id: fetchedConfig.value.baidu.appId,
					query: message,
					conversationId,
					stream: false,
					parameters: {
						customModelId: model.value.id,
					},
				},
				{
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${fetchedConfig.value.baidu.key}`,
					}
				}
			);

			const resData = res.data;
			if (!conversationId) {
				conversationId = resData.output.session_id;
			}
			// useQuota(resData.usage.models[0].input_tokens + resData.usage.models[0].output_tokens);

			return Promise.resolve(resData.output.text);
		} catch (err) {
			console.log(err);
			if (err instanceof AxiosError) {
				return Promise.reject(`请求失败：${err.message}`);
			}
			return Promise.reject(`请求失败：未知原因`);
		}
	}
}

onMounted(async () => {
	// 获取配置，失败则退出
	try {
		// const encryptedConfig = await axios.get('https://ffbox.ttqf.tech/api/v1/FFBoxSiteAIConfig/20250825')
		const encryptedConfig = `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`;
		const fixedCode = 'c934a34fc7823c4e';
		const decrypted = CryptoJS.AES.decrypt(encryptedConfig, fixedCode).toString(CryptoJS.enc.Utf8);
		fetchedConfig.value = JSON.parse(decrypted);
		// fetchedConfig.value = {};
		console.log('AI 帮助配置加载成功');
		// await new Promise((resolve) => setTimeout(() => resolve(0), 1000));
		// fetchedConfig.value = defaultFetchedConfig;
		checkQuota();

		// 初始化用户 ID
		userIdv1 = await ImprovedLocalStorage.get('aiAssistant.userIdv1');
		if (!userIdv1) {
			const t = new Date();
			userIdv1 = `${randomString()}｜${t.getFullYear()}-${(t.getMonth() + 1 + '').padStart(2, '0')}-${(t.getDate() + '').padStart(2, '0')}｜Site｜${navigator.platform}｜${navigator.userAgent}`;
			ImprovedLocalStorage.set('aiAssistant.userIdv1', userIdv1);
		}

		// 随机选择一个供应商和模型
		const randomProviderValue = Math.random();
		for (const _providerName of ['ali', 'baidu'] as const) {
			const provider = fetchedConfig.value[_providerName];
			if (provider.probabilitySum > randomProviderValue) {
				providerName.value = _providerName;
				const randomModelValue = Math.random();
				for (const _model of provider.models) {
					if (_model.probabilitySum > randomModelValue) {
						model.value = _model;
						break;
					}
				}
				break;
			}
		}
	} catch (error) {
		console.log('AI 帮助配置加载失败');
	}
})

</script>

<template>
	<AISearch
		:enabled="fetchedConfig ? true : false"
		:chatAPI="chatAPI" :init="init" :resetChat="resetChat"
		:titleName="fetchedConfig?.titleName" :modelName="model ? model.name : undefined"
		:initialPlaceholders="fetchedConfig?.initialPlaceholders" :initialPlaceholderInterval="fetchedConfig?.initialPlaceholderInterval"
		:initSystemMessage="fetchedConfig?.initSystemMessage"
		:requestKeywordSystemMessage="fetchedConfig?.requestKeywordSystemMessage" :responseKeywordSystemMessage="fetchedConfig?.responseKeywordSystemMessage"
		:requestKeywordLink="fetchedConfig?.requestKeywordLink" :responseKeywordLink="fetchedConfig?.responseKeywordLink"
		:maxInputLength="fetchedConfig?.maxInputLength"
		:maxRounds="fetchedConfig?.maxRounds" :maxRoundsMessage="fetchedConfig?.maxRoundsMessage"
		:quotaUsed="quotaUsed"
	/>
</template>
