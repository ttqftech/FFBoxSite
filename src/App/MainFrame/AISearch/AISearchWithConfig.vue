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
