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
