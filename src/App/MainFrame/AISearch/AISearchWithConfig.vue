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
