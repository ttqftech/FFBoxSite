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
