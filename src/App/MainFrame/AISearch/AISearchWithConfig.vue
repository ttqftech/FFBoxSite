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
