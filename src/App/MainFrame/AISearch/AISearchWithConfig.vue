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
