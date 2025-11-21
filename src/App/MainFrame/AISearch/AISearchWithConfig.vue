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
