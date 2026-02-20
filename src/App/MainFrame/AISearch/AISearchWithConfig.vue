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
