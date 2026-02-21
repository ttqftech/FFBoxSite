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
