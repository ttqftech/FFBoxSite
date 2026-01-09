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
