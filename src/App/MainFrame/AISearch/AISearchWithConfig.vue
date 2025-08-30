<script setup lang="ts">
import axios, { AxiosError } from 'axios';
import { computed, onMounted, ref } from 'vue';
import CryptoJS from 'crypto-js';
import AISearchConfig from './types';
// import { version } from '@common/constants';
import { randomString } from '../../../common/utils';
import ImprovedLocalStorage from '../../../common/ImprovedLocalStorage';
import Msgbox from '../../../components/Msgbox/Msgbox';
import { ButtonType } from '../../../components/Button/Button';
import AISearch from './AISearch.vue';

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

	if (Number.isInteger(aiAssistantData?.tokenUsed?.day)) tokenUsed.value.day = aiAssistantData.tokenUsed.day;
	if (Number.isInteger(aiAssistantData?.tokenUsed?.week)) tokenUsed.value.week = aiAssistantData.tokenUsed.week;
	if (Number.isInteger(aiAssistantData?.tokenUsed?.total)) tokenUsed.value.total = aiAssistantData.tokenUsed.total;

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
