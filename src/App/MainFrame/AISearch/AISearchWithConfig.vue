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
	} else if (providerName.value === 'ali') {
		let options = {
			'method': 'POST',
			'url': `https://dashscope.aliyuncs.com/api/v1/apps/${fetchedConfig.value.ali.appId}/completion`,
			'headers': {
				"Authorization": `Bearer ${fetchedConfig.value.ali.key}`,
				"Content-Type": "application/json",
			},
			data: JSON.stringify({
				input: {
					prompt: '[init]',
					biz_params: {
						customModelId: model.value.id,
						conversationId,
						userIdv1,
					}
				},
				parameters: {
					// model_id: model.value.id,
				},
				debug: {}
			})
		};
		axios(options).then((res) => {
			const resData = res.data;
			conversationId = resData.output.session_id;
		})
		.catch(error => {
			throw new Error(error);	// 暂不容错
		});
	}
};

const resetChat = () => {
	if (providerName.value === 'ali') {
		init();
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
							conversationId,
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
			for (const [usedModelIndex, _usedModel] of Object.entries(resData.usage.models || [])) {
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

			return Promise.resolve({
				content: resData.output.text,
				expense: usageSum,
			});
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

			return Promise.resolve({
				content: resData.output.text,
				expense: 0,
			});
		} catch (err) {
			console.log(err);
			if (err instanceof AxiosError) {
				return Promise.reject(`请求失败：${err.message}`);
			}
			return Promise.reject(`请求失败：未知原因`);
		}
	}
}

const statusAPI = async () => {
	if (providerName.value === 'ali') {
		if (fetchedConfig.value.ali.conversationStatusUrl) {
			try {
				const options = {
					url: fetchedConfig.value.ali.conversationStatusUrl,
					method: 'POST',
					mode: 'cors',
					data: JSON.stringify({ type: 'get', conversationId }),
				}
				const result = await axios(options);
				return result.data;				
			} catch (error) {
				return undefined;
			}
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
		:chatAPI="chatAPI" :init="init" :resetChat="resetChat" :statusAPI="statusAPI"
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
