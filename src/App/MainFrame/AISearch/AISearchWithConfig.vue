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
