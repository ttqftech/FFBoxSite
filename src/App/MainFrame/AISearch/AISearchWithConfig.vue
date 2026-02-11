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
		const encryptedConfig = `U2FsdGVkX19w0jvogKuKDJbzLz3lxRJBWSX+9XZnLFdO8wARCdJ8Ju9XJX03zktMHVN6j0YSaYKW2N6sxhduY8t6G/HyD0mq5syUjFFSA6u8/n+rxVKgBsetC2fg23YkAaOnfXkXaAgavr2bM5ZjfzqEH9r25cOpefRABlhnUP6sb0oIk7OmcE4pxWzYPpbL9WFmokyDhXQ5OGeE/T4IkGVVasVTpKKm/j2XX1SWB+VkAyNA7Fs0PUFT+MdBoOuQcNbxxvjA+W1IZSWsVEJjNPqQsC7EePOmAb3bm9TycR0t+trdSm+apSWzvoF2EAnXQAvNcLYSM+NYf881CpieWu+o3FV60kyaJqGt5cOUhJU+SzdpK2S6ZalfJozjcPFKj3Ad6IsA79EeDBH0K6HRRnlZCXhJkLOtV2a6MYTAaFzx54mV+N/Sr17lTYFSXjg2T3PifynefV2xhFld+2Rh45TfQSFXpG4dqpBHtDqFI4cfVJ2fDlh8JX1BnvtpFTDud4+r5sFu6iAwmktATIOFMJdt9ItOdiJ62pwvlgrqa2WThwBA/g8QeFrq+RmOSIlB1r5blgd9jhMLR7y8oFq1lcdzJ+UWtsE7KFXPJ/D6GwPZPgmmit48ptXuHMhW9Kl1jkf1Jv9Qp+5Y452FOqsZP9gF4aiD650nR4MeEmvyYU/++A9ykTZAVzMtAYHmurFtZZuNP4RNvRIZqthJyYoiBJ2ej9EMZm6TrWU7tho6FezoK21NCIAiIYRiKauBlOaQJzEgYsX1oqdccr978NUz5v2r3YIL2Oo2mzq9rmTScz8PsxDyJCv5BgMxXPeKtYgv56KoTWyS31rYrnWh4ZLrbnw8LCI3KbLnWsuxRJ7Bx0uk9/xWWspLJ9UCvpAYsSxqnI4roBnCKXmLxSUccQftS+pDt2OMkw2Ax2RcwtzSpAYPsv6xPNySR7J58JyMDb4IG91PV2OTVwVNZTT5NEriywFUoaXOEBV/KU1nr6Vt6FvqcIYRt0mcPRYrvX2HkHiDLDG8I0HlUgTM5D7YV7gSqdtqnaPoo0bvf2n89U+ezoOUlDViwLTyclLWxhKzlKBRc5pFMH1waRe2xGUAtonW0iIBrye6j4R2+wavpu2Q9sShSFr7GfdX/fonL/fb/3cn4I3+eu58RA8KF3GFfPV338ULGIlPR2/Gf6B1LA4iDcmlEHxMmRyigcTnnOnQZ94YboWnRPEe6hPNE8v3qcAg7QwQH0bDb+QunxX1pNzvwOLe3t03A7oBFZ3IjGXNkzDu6PVYNy3b9MDASC34ENWmZiQpXxboWP3kUm/6hH9HxVp9nx3mtZR4qeE/TNRJfAO3vekE/iCxcDzOXOPsypqUy4zyx+eZpuR/9iDJ6+uVs20jSntkJVEt9DaQYIiJfPEAtoVa8tU/iyTTMe0E+8D+VyzZIWxRQ9nnaODP3+wgvARRz0T/VEtO7+cSncBWio9F+JlQmGWrdStsJVYKvaeUVtVUQX9Cm5NPVzrnqXVvIt9Z/DfaRdsJu/Fjmtwuh6iq7xSP3LHK400aek0fMpyPiCM7tSUMkbnDJD19xf/PwOAcVNVRudOcjbFMPNdzcO9iclUXEijN0j+lpPe0oNqUxZ488xva2Hcf52FSHPTLGu+/ViKw0vYQlQL92SPues7Xo2zc6O+8c+CdFub347ixkPqAIhczhfC4SJCxoKeDWokxDt7OHDKuAcHKSXwnT3qCYDKirFykEscsoodcHC1aOyOYP1/JgfJAmmBKTIGfvhkeKrsJY7kfR6JHD+34CmSKw2sNcsiUgc3PcqQEtv7G4qqoH9UsD4Kxyjy7aOSpSd58vb4FGeutTbWqcEzpHVfIOelQeWNlk1HyPlufh973hrW9Qrb4qAtKm9RueClVuaLsIieB1jWG2JlopWgB6sE8dfG5Z4VZpH3N0YRRaBOkjVkQnrn250aHb8H1YH4CMUnj2PKZrmxp/o1bqjQ+gWNCxp0M9O2CEoUSCMHuH549u5hKcz0m6iDXkQT5E3eoA1LykArAwOVJoYSoOjsheh4OHRd1Tv1L8JlO4/z2QVHEX3a9xcONsnSsu1yTVpE6zXZVO6K4744zQwVjixo0u6gkPAeszHgKjfKRr+TY5lai4rwpchpeI1YU2F5fSiJVLcjQECt50dzYYu3vZ/4AjKow/yybr4dP04AlDr1FZIApu167CejQotDa0XTabTRvnanxLeMKd2sJhr1y0FKbU8zo4RSGLExuw6pdKIoZpmP1GwyWKCP1RyN5AtEnNu6RiVKoA7sOzH1St+yoszTkSSc5jRnOlqMjG/8nlvwhMMLC+rRbgtohrx3deZyfBkZmkwukDvEHPjFolR/XmQlQKx3tMsreATFtdnpmFXuETwoB9GPb/ZmjLRY65SOmcbh9N2pxEJazrqzQgiNY+8IwyxQ6+6hCjJIn1fFWUTQDIH1KIdf9sJMdRkjEGXCx41KuJt2eDpWqq9vqTDcrLC0Uqvmu4dbbbyntmp111diZxbPFpsf+ClxBIzQUHvTF2cfLXxERbteuHKKc8sipVHqBL2m+vErq1Px7RArsmbun3hSnkFRR+NfX+2BwQLoOn04eLx1Y7eglRP0QEXzy381GJlk7v+mFig8JcYwuv1rpKazxAm4MDTUd9wvwrSPO4G3L3O/yDicXp6UGaJZKzXaRqHX83zcFrTEazL7FilaMIFISXo+/ebaImSuPmUFVfIrP8JWkeJKtTPXKU+9NvzAU+gu+m2mjpWSfyHSAKvzMgMwoEH+HyF8ktWMhfcPcOM9HpIc9DjEPIFP2Nx7mhgUA3h64YYErnP15kCHVUinA9Br4DELYdOkJIaHTboEaHfgV9LJybJfI7rwLXZuYOImJGBl358NzwxX0HvXyQUp1kAN85gjBwmVz0+nUW6zM/ybWTMXJHHJXEZRu6ddkqDrK45P8BT7K1aL45O3tAghgWE4Kto+kp/8ENyJV2tFyz3zEHwEgS2yGslJ26P7Y46Auw/h6lLU3a9p2GQXV3UPsZP/lUVU+ZH8ZAM450adc/gbVEfmHDLrSLGvpa0swTzVS42DWoBeGjCb4p/WM5Pb19acDx3QHvDZnKi3II6k+gCutjaLPeFQFlTlEOlcttwHk5RSAh6aglzBpn0D7xHDPDxK1gG2AjXMxQ4jgXwUWP8qPm6YzeYdQif8VV1FbCxq/fdcp44a3O2bB/K+HHt9NOWSh/A9NncfD4j9DdwNm7IDXBU8de1segV0LeX74OeYLO2DGgiv4bPwpB3CoPEOmajM0u+cw2F5Q09OMWJ5MpdBQOuaDmQvRPgrl5o4+ORh0g/Rr5j0clIn9oLUOHeQhsZ/QxnBmZg4ajXZKPVCKzdByBWcOxJiWhnswWM69HQpEzuVWA5kkcIdv6WX5Hg0sq7Qpeu2unFeZeFoDULi3NTBy1BmsY23GjgRMDra4K2VU5JctYfHbz4u3sOACb78q1Eo2yYZuuad0gEE5Lewtw8APep8TG2eNjnBbhhAR0jCXljF9Y/3saJqfm3mQrCujL55Fn0u+lcfVFJv+Yg2X4y7tyXinXuDe6Ndz2Y1SNT8xnGQ6SH/KKM3HcMz7GvmQV4Pe7rLt/bD3jCjEje6GMmbd379EtZ38AQfCYS55Wd9N12CBNd0bu/cZTYYxNma13s8igm7yHcOp6CSgHF0eQaw8qhuDu0dGp+4V7AkzwfUXlKwoqS/SjCpDj5Fm5mU6Pn6X+v5J59brl9XHqtW0iRGimhr9Uc1ylYwTQd7T0k/uQgrDlrn81OmZnygI/twG+NUUn27/3EayoVVGEY1eVPscO1Aj4Ijo6FWHPKnzrWdRZtHYEVjJTAw6NM79pMOaDf3NRtdzMQH5rfkwumSwDpq5io2cbL6fo+9MNN+LJM/av8Jk8SkcyJtT8cYMUkJjYupp90A+yZ+MzBrx6UFewR5Pow2lp5fivBTaelj5UvAY8qbhpvjXk2YZV4IZpUdpXcj8OAJ5+r93Z0xcrHw/mvdq+TvR8utyHGrl33+8GeALUysjwLvN7fxRIE9Wkwu3pXGOkstOmul0Ra5Z6IZWxWtq4SOAXvLScAMgMPpMEO8xBgW3dV1nv71Z0tHstrSdhRHIygcZEFdSHg6vZMaT4PGx/+D1xudSnsjHoYMkJGG+ESHxPJMlyX+GHHK2Y6We/mBSPC9vbDYxzYSIE0YJ+6CFCHS66uNdcQOPWZNmksZig9TLOSc+jskMTWG7T5jSi3vgE18kqDNiPmpr6JJg3NsGHyRgYwtf8fXdYRVJ6j3f6svMF5Dy0WB10AxXF473plaYSkRPDM1TkEfqCu2jCHbq7RAwj+rvugrk6a490GAFKcrFVOUzLE5mS/zvi+repvPDSJFH+6b9Apsq5GF7Zd7GL2GNxRwLHt7wu5p3fAw0pCXxvD31D6RPy36kHEAOIClBJlO+NHlkjdDb2ppY4nnnCwebVtirkziJ/bTjUvkpR0qgICFKKD0VOb9tHR5mExWA+tbLlXkbsbCGeO1bnriiRH0QvqGNH+rmTpe+Caxi+dGi6exn+b6WitziaRI605y1KBVEWDCX9/cWzjI+X2ccYeEamOce+CeuV5HBuSXV1VROHp+P3SHohpo81ttGfcE97HF811/rF0zD6UnVlUGvqmbghVq8yrPsQf3QsviR7CX1a9F2OmI4C7UKj1Fc0MqQSFmUAEL8mEMuQ0wOpXiPPfvlyFS+e8H1SI9x//tITs+p37Gl2DfXlbuGZrGJFqWnDyKIu1qcjF8dAZs80bZO/b7eh44YKu7Yu4KJ/V0ch+mb+DjdQWe517e4m3INgm/EA5urgTanMa5W07TosX3xvND2+vRbN03AN/af48qPJBBqtcsCeVP4qVENOxbbRAgA18S0rLWrmwbGtKR7Yp7KfC2pWa+f6jZRxpRuP911Imqb/8qZq+SoOv8PWEahAxbc1by0vMi4gPrsM7Yf3CaCU5UwQIatD4kZZ3ihukNsviK+h5RABo2F7vhEeVLxo/WererBSCR2QZMaBxILeaimOiiGGfPgViarJBZw8XhmymKG1nkcMNOjzrpX9cO5Zjfz+qx63PsFN4waCh9wYhpjY2HlpYvAqPJoq9YCiPGyvS6x7efbsxla1zOfaqWbTpgkaZf5d0SbzDfK+uLZQmDgtt4UovWUpbSFlEunubHlbXs35NQbZPZGKftVzhpoiGjSxQJSEPSiA+U0NmBap2fvMRzlpRxEjqIHlObGUAU+G8pULzTOEZ/UwYdFUdYysgPzKwBB9ZbqUd+84Fl/z1abaKnNE7C73RnGwh8IXeqvuqFOL84wkN9cdKtIHMHW+p6IbZzUOCAllSS2wCi5OUUVr5Cw8KQKs0q7WoUdvsBcsBKWP5ij0RyVj/75D8GKCFcScmYJtouw2YlsZ4aZxRVeRkWJ75vX2rRl4B+DXJsc/S4dyKddteGVIMdBoX97HCAdcCOp4zEjOh7l623JQx5rSnnCE0b/vvC7OCQFClazTKKWNiSMBTyZQTgh/tcGM/AvsoV6FR/3ScX8gKjIg5dKIeDAvIN4ggkrW0yri80H39uGVEv3WaPAqWr51w0Apiuz/rWkSRW7G2ynI8PJWmrL/n0pRp2KeOFCGEvHjaGLazFQiUMY3iWplR9MeLXPD3PSUxn5gt9Cz5pV9Zyl3VehItzIC9YiOtj2mMgZvlffrNDECC26TFvdzznyvlURpfG+VfOUIMnl/sUYN4q/8D/WR5t+fbDctuWemrYjcJRpA1ediA+eYtnecIy8ubtyzDpLZ6TMwDYeqh81sfAeR9tamuLdadrFod0M/u6JSBrD/Fnvc+JoDl4uCL0TDIRNs/s4IxkXSbi29+4OTRKqEEdvFcP7LFaHt/Wa43IN40abL7cYRXq+72PYmiXamqRFbkSHUPefQkEJKV3qz+SOtYd32QvRRXfaJBhZ9y3IxgjBOT3uzJq/bSXe8tvelUUyG+p+aq+xqi6P8kYpYNr3JQI0SepIKVhN1oK5YS2lsAdkeHAQDNk9fgcaCGa+DruQ2XGjo7khj96PwagbP1PYMEOyLtD8VHKcaMoxJzjfmtTnxxGxU6oT4NCmdiJfOGa3tiObVTVw5NI2hzxXhyvD4SxOTO5m/46vI5xkWer2XLIcmmu19M7ZnjRzIEsUFd1gu+0bKn7d8q+8Ebdlqu9vzjHr96gKMG/kXf0nw/3yAZ2kiLkS4fgKFzv43TU6g6NWPESrW1tAgNLDdT4KeIkPN6nS88xgNBvhcQSjdigsTj7KINjTe76BURn+G8UxZM6CmwDWyGtK47/A2awCm2NH3EnoqEOUwTcMLbipjX0qtJpyMTaLf2SzSFOLGOgfdVaqqbk6KRqxvF0gXnKv8OLqlwIsQ94MF95I4c509KVZBZvz/yJwKRZMcdxR43BLHy7JazBfv+3lcoJVlGZDfWA0GkNd1UnyEJap7+MiQ38nL1BejrjxzfdmNIY0xn/dBPqfh1PCU8tSRrJrHeOgNUPNoNFXp74BSOcoCG2gzP4Z+xAlfHP+3pyJshyLAIPEtc0WSwCfkl1uklU5/MedIas8menWF+mmzf8ayRR3VNO1hbix4XUYXs082R7D24pkX+QyaBDc/OjcIoEiyssKKtM/zKviLn8u7h4mhANzEHQXl6jN9iCHVa/zlHCcB4zPWtzN520ZSEG4zoX08Qb8veJtk2in4cSQUWdZ0gZpaBoPF3a81LGC2Wc+S/6iBrGUiBPRW5//pKUpXziLF8UXVr/L3k2deJxAyd9E10kZUYgmh9DYf4UkDnnotBcvLq+YKVYqHDnUI2DJ1PlZMWSiHQQKjwYsEfF7fcW3aVVDfHVaJS07ATCQE5TwhukGo7zxOJrpI8hiiK5gAIenT+xuLBfP/fZL4PAEjIJ07voZ6vb3N7vl+CK5yVJ/kYPZLdsl8KX+4ny+ndbuuxHW4IBrW59dWrZjc5+tmDeUgx7V9fo84fgRQZv8hZeLazPXr9Wxw5wl738ja7pzExerHG2cRbIXV+6LAwPujyac65Xc9tx7RCrK9k2h0aATTami3LwmNBxVUid65on/RsTdXa/0z1RdkD1/E1UHJHutCj+H7LXX9SJ376XPZvFjUDlhPZDxb6+wZErQj2tYnVrs5B2f/T5pr8g4igxWiojvSkXzCO/idJkhOg0NCY0rXkNP9tnKctw0iRHAIVtggFsOm2aIDRR6+WQeZxbrN5ED+7wl8PDC9Wj+OXbJOOHMWAxAuDqbnJr/B31ST3apiV+IEKzO9ieNBGcTpgDPndrjst5NP6piPy2IL6h5wApNrtza23lv5jwKGgKYMf8erzW7VAM2V7KKtLNJ/4JqvZWkBVU4mFiP+P4JUaMCCvVpsIAE+HXu+zHYAH9kKQOI3/5wBHF6A5wWT+CVAYR/Jn/8elxdF0VDt17s21UejFqSBLXo9vIeFJFyPrMcda/mJvyMif3nrWSlUefY28A/vSIMPzFGiiaWIpTVyckivLiIaGAjf+gKPrF6zJ5N5fPZNMtg4Q/NmgfExd4bJEjD3PV5CMXrJs7uRIYEtRu4I3eI4lxUEBWTXMV+FjjlKkzJWxpWz9uZfq6qLeZpvfAExnfpzxVsIDsdkV1GLpTZVOXewbp9c8FEQ16xbOUbQbMartAmSk9xZMB6AFKUhR79xwBcRnruCtYFVAxZ4/K2g4wquVHTey+V/Ip7LBAQ3weSMSGx1iOxiNPZC8YZ6D1jlUJgKYDu1jtAYozZsc1EBt1KBiEeWIBnZXPve8SjHckkQQVta9St5DIF4CO3cavDJ5mtIo/mJy2uAr3eBuB+ZcamBNmAqRh4hT6lJ5+J0hGoGP9VrxD0q+IrSvk+ZqzGlAHed93Y46EvwIhcVHj7SmSSOIBPE2S6Gl6cGJ2p/r7VbW3Xhid2WUvWVzXFBLKhr5BDaxAZoayVauwFPNLBGs2A2ymYRTAOeYRMuBtiQIcuVcgzY7l/Sw4QNUcyG1kjnsOq4E1Nys4bxPpKEcs4p5LMckZaAiXzJ870SdxoyrMpg+J/VwpgcqAnWdpjKP6q/WvJWEIaK3YisM5urvRQKhja5UXCySkf8CJyp6JclwkDKIifqUzHMxJfs68HwcD/t4Z1DUl1dg9DaJ76Nw5GECGSP51s7yIlTSdcjYBBWo6scuvAQgrSXJ8agZnt/81qs3nKBxjidp5EZJvCln7Re6PI9+GCJSIrRLz0RuEecEVofilhB12yJ68ZySuJmdt9oQR030WPRV0vg/VouzcQ`;
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
