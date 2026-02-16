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
