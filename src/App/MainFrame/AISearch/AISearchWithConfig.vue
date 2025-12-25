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
