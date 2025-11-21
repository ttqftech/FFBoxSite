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
