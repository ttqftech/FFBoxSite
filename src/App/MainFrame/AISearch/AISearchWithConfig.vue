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
