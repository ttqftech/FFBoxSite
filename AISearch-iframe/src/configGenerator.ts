import AISearchConfig, { AIModelOption } from './types';

/**
 * 内置的 config 生成器。
 * 用于替代对 http://api.ffbox.ttqf.tech/v2/FFBoxAIConfig/default 的远程请求。
 */

type ModelPriceItem = { modelKey: string; inputMultiplyer: number; outputMultiplyer: number };

const buildModelOptions = (providersConfig: Record<string, { models?: { name: string; id: string; weight?: number }[] }>): AIModelOption[] => {
	const providerNames = Object.keys(providersConfig).filter(
		(providerName) => providersConfig[providerName]?.models?.length,
	);
	const useShortLabel = providerNames.length <= 1;
	const allOptions: AIModelOption[] = [];
	const weightedCandidates: { option: AIModelOption; weight: number }[] = [];

	for (const providerName of providerNames) {
		const providerConfig = providersConfig[providerName];
		for (const model of providerConfig.models || []) {
			const option: AIModelOption = {
				key: `${providerName}:${model.id}`,
				provider: providerName,
				modelId: model.id,
				modelName: model.name,
				label: useShortLabel ? model.name : `${providerName} / ${model.name}`,
			};
			allOptions.push(option);

			const weight = Number(model.weight);
			if (Number.isFinite(weight) && weight > 0) {
				weightedCandidates.push({ option, weight });
			}
		}
	}

	if (!weightedCandidates.length) {
		return allOptions;
	}

	const totalWeight = weightedCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
	if (!(totalWeight > 0)) {
		return allOptions;
	}

	let randomValue = Math.random() * totalWeight;
	for (const candidate of weightedCandidates) {
		randomValue -= candidate.weight;
		if (randomValue <= 0) {
			return [candidate.option, ...allOptions];
		}
	}

	return [weightedCandidates[weightedCandidates.length - 1].option, ...allOptions];
};

const buildModelPrice = (providersConfig: Record<string, { modelPrice?: { modelIdOrIndex: string; inputMultiplyer: number; outputMultiplyer: number }[] }>): ModelPriceItem[] => {
	const allPrice: ModelPriceItem[] = [];
	for (const [providerName, providerConfig] of Object.entries(providersConfig)) {
		for (const modelPrice of providerConfig.modelPrice || []) {
			allPrice.push({
				modelKey: `${providerName}:${modelPrice.modelIdOrIndex}`,
				inputMultiplyer: modelPrice.inputMultiplyer,
				outputMultiplyer: modelPrice.outputMultiplyer,
			});
		}
	}
	return allPrice;
};

export const generateConfig = (platform?: string): AISearchConfig => {
	const FFBOXSITE_OVERRIDES = {
		titleName: '旅行者的神之嘴二代（FFBox 特供版） (Beta)',
		tokenLimitMessage: {
			day: '今日 AI 用量已达到上限啦～明天可以再来哦！',
			week: '本周 AI 用量已达到上限啦～下周一可以再来哦！',
			total: 'AI 用量已达到上限啦🥹我能理解您好问的习惯，但有限的 AI 资源还是要分配给更多的用户。如果您还想使用的话，需要清除数据哦～',
		},
		initialPlaceholderInterval: 2700,
		initialPlaceholders: [
			'智能帮助（最近更新 2026-07-29）',
			'智能帮助（v2.0）',
			'AI 助手技术上与其他常规机器人有何不同',
			'AI 会取代人类吗',
			'为何要做 AI 助手功能',
			'软件技术选型有什么考虑',
			'FFBox 相比别的软件有什么不同',
			'下一个版本会有什么功能',
			'怎样联系到作者',
			'编码器和格式分别是什么概念',
			'FFBox 的服务器是什么',
			'更新 FFBox 后以前的配置能保留吗',
			'如何无损剪辑视频时长',
			'如何无损拼接视频',
			'如何视频转音频',
			'如何混流',
			'如何使用远程转码',
			'如何清除服务器缓存',
			'如何设置输出文件夹',
			'如何配置 ffmpeg 位置',
			'如何转码图片',
			'如何转码音频',
			'怎么看转码进展曲线',
			'可以预估视频的输出大小吗（进展曲线）',
			'安装 ffmpeg 之后依然提示找不到',
			'安卓手机可以使用转码服务吗',
			'《肇庆市第一中学》系列视频有何深意',
			'如何评价コロナ',
			'如何评价地铁安检',
			'涩话草坪是啥',
			'怎样理解高考没太大作用',
			'为何要在乎“正义”',
			'怎么看待别家的软件比 FFBox 下载量高',
			'今天吃什么',
			'为何作者的朋友圈是全部历史可见',
			'作者是学生吗',
		],
		initSystemMessage: {
			role: 'aiInfo' as const,
			text: '欢迎使用第二代 FFBox AI 帮助～☺️\n- AI 助手依靠阿里云 + Cloudflare 运转，算力费用由 FFBox 作者承担。建议您在切换话题时重置一下对话，以减少用量消耗🍵\n- 如果提示欠费，此乃作者的阿里云账户被玩空了所致，可以去 FFBox 催更吐槽群里戳一下作者😁\n- AI 助手的回答未必是真相（会编造我没说过的东西），不作事实依据哦😊',
			actions: [
				{
					label: '5.3 版本更新调研问卷',
					url: 'https://my.feishu.cn/share/base/form/shrcnbcEHYKePV5mCQbzZGwyaCg',
				},
				{
					label: '5.4 版本更新调研问卷（点我！）',
					url: 'https://my.feishu.cn/share/base/form/shrcnQcRgrccqVrVugK0fnqrMmc',
				},
			],
		},
	};
	const HR_OVERRIDES = {
		titleName: '旅行者的神之嘴二代 (面试官特调) (Beta)',
		initialPlaceholderInterval: 2500,
		initialPlaceholders: [
			'不智能帮助（最近更新 2026-07-29）',
			'不智能帮助（v2.0）',
			'AI 助手技术上与其他常规机器人有何不同',
			'AI 会取代人类吗',
			'为何要做 AI 助手功能',
			'FFBox 相比别的软件有什么不同',
			'为什么 gap 了一年多没找工作😅',
			'《肇庆市第一中学》系列视频有何深意',
			'涩话草坪是啥',
		],
		initSystemMessage: {
			role: 'aiInfo' as const,
			text: '这里是神之嘴二代——面试官特调分身！另外两只 AI 分别在 FFBox 和 FFBox 官网上～\n- AI 助手依靠云算力运转。建议您在切换话题时重置一下对话，以减少用量消耗🍵\n- 如果提示欠费，此乃作者的阿里云账户被玩空了所致，可以去戳一下作者😁\n- AI 助手的回答未必是真相（会编造我没说过的东西），不作事实依据哦😊',
			actions: [
				{
					label: 'FFBox 官网',
					url: 'https://ffbox.ttqf.tech/',
				},
			],
		},
	}

	const providersConfig: Record<string, {
		models: { name: string; id: string; weight?: number }[];
		modelPrice: { modelIdOrIndex: string; inputMultiplyer: number; outputMultiplyer: number }[];
	}> = {
		'阿里-O': {
			models: [
				// { name: 'qwen3.5-plus-2026-04-20', id: 'qwen3.5-plus-2026-04-20', weight: 1 },
				// { name: 'deepseek-v4-flash', id: 'deepseek-v4-flash', weight: 1 },
				// { name: 'deepseek-v4-pro', id: 'deepseek-v4-pro', weight: 1 },
				// { name: 'qwen3.6-27b', id: 'qwen3.6-27b', weight: 1 },
				{ name: 'qwen3.7-plus', id: 'qwen3.7-plus', weight: 1 },
				{ name: 'qwen3.7-plus-2026-05-26', id: 'qwen3.7-plus-2026-05-26', weight: 1 },
				{ name: 'glm-5.2（贵！）', id: 'glm-5.2', weight: 0.1 },
				{ name: 'qwen3.7-flash', id: 'qwen3.7-flash', weight: 0.5 },
				{ name: 'qwen3.7-flash-2026-07-15', id: 'qwen3.7-flash-2026-07-15', weight: 0.5 },
				{ name: 'deepseek-v4-flash-0731', id: 'deepseek-v4-flash-0731', weight: 0.8 },
				{ name: 'kimi-k2.7-code（贵！）', id: 'kimi-k2.7-code', weight: 0.1 },
				{ name: 'qwen3.8-max（贵！）', id: 'qwen3.8-max', weight: 0 },
			],
			modelPrice: [
				// { modelIdOrIndex: 'qwen3.5-plus-2026-04-20', inputMultiplyer: 0.8, outputMultiplyer: 4.8 },	// 2026-07-23 过期
				// { modelIdOrIndex: 'deepseek-v4-flash', inputMultiplyer: 1, outputMultiplyer: 2 },	// 2026-07-24 过期
				// { modelIdOrIndex: 'deepseek-v4-pro', inputMultiplyer: 12, outputMultiplyer: 24 },	// 2026-07-24 过期
				// { modelIdOrIndex: 'qwen3.6-27b', inputMultiplyer: 3, outputMultiplyer: 18 },	// 2026-07-23 过期
				{ modelIdOrIndex: 'qwen3.7-plus', inputMultiplyer: 2, outputMultiplyer: 8 },	// 2026-09-01 过期
				{ modelIdOrIndex: 'qwen3.7-plus-2026-05-26', inputMultiplyer: 2, outputMultiplyer: 8 },		// 2026-09-01 过期
				{ modelIdOrIndex: 'glm-5.2', inputMultiplyer: 8, outputMultiplyer: 28 },	// 2026-09-15 过期
				{ modelIdOrIndex: 'qwen3.7-flash', inputMultiplyer: 0.2, outputMultiplyer: 0.8 },	// 2026-10-23 过期
				{ modelIdOrIndex: 'qwen3.7-flash-2026-07-15', inputMultiplyer: 0.2, outputMultiplyer: 0.8 },	// 2026-10-23 过期
				{ modelIdOrIndex: 'deepseek-v4-flash-0731', inputMultiplyer: 1.5, outputMultiplyer: 4.5 },	// 2026-10-31 过期
				{ modelIdOrIndex: 'kimi-k2.7-code', inputMultiplyer: 6.5, outputMultiplyer: 27 },	// 2026-09-14 过期
				{ modelIdOrIndex: 'qwen3.8-max', inputMultiplyer: 12, outputMultiplyer: 36 },	// 2026-11-01 过期
			],
		},
        ollama: {
            models: [
                { name: 'qwen3.5:2b', id: 'qwen3.5:2b', weight: 0 },
                // { name: 'qwen2.5:0.5b', id: 'qwen2.5:0.5b', weight: 20 },
            ],
            modelPrice: [],
        },
		'小米-O': {
			models: [
				{ name: 'mimo-v2.5-pro', id: 'mimo-v2.5-pro', weight: 0 },
				{ name: 'mimo-v2.5', id: 'mimo-v2.5', weight: 1 },
			],
			modelPrice: [
				{ modelIdOrIndex: 'mimo-v2.5-pro', inputMultiplyer: 3, outputMultiplyer: 6 },
				{ modelIdOrIndex: 'mimo-v2.5', inputMultiplyer: 1, outputMultiplyer: 2 },
			],
		},
		'DeepSeek-O': {
			models: [
				{ name: 'deepseek-v4-flash', id: 'deepseek-v4-flash', weight: 1 },
			],
			modelPrice: [
				{ modelIdOrIndex: 'deepseek-v4-flash', inputMultiplyer: 1.5, outputMultiplyer: 4.5 },
			],
		},
		'小红书-O': {
			models: [
				{ name: 'dots3-note-prev', id: 'dots3-note-prev', weight: 1 },
			],
			modelPrice: [
				{ modelIdOrIndex: 'dots3-note-prev', inputMultiplyer: 1, outputMultiplyer: 1 },
			],
		},
		// 'しろそら-Oif': {
		// 	models: [
		// 		{ name: 'DeepSeek-V3.2', id: 'deepseek-ai/DeepSeek-V3.2', weight: 1 },
		// 		// { name: 'DeepSeek-V3', id: 'deepseek-ai/DeepSeek-V3', weight: 1 },
		// 		// { name: 'DeepSeek-R1', id: 'deepseek-ai/DeepSeek-R1', weight: 1 },
		// 		{ name: 'GLM-4.6', id: 'zai-org/GLM-4.6', weight: 1 },
		// 	],
		// 	modelPrice: [
		// 		// 使用的是 io 福利 0.001 倍率，但按 0.1 倍率计算
		// 		{ modelIdOrIndex: 'deepseek-ai/DeepSeek-V3.2', inputMultiplyer: 0.026, outputMultiplyer: 0.038 },
		// 		// { modelIdOrIndex: 'deepseek-ai/DeepSeek-V3', inputMultiplyer: 0.125, outputMultiplyer: 0.125 },
		// 		// { modelIdOrIndex: 'deepseek-ai/DeepSeek-R1', inputMultiplyer: 0.3, outputMultiplyer: 0.7 },
		// 	],
		// },
		// 'しろそら-Oic': {
		// 	models: [
		// 		{ name: 'GPT-5.6-luna', id: 'gpt-5.6-luna', weight: 0.1 },
		// 		// { name: 'grok-4.5', id: 'grok-4.5', weight: 1 },
		// 		{ name: 'GPT-5.4', id: 'gpt-5.4', weight: 0.1 },
		// 	],
		// 	modelPrice: [
		// 		// 使用的是 ioclub 0.05 倍率，但按 0.5 倍率计算
		// 		{ modelIdOrIndex: 'gpt-5.6-luna', inputMultiplyer: 0.5, outputMultiplyer: 3 },
		// 		// { modelIdOrIndex: 'grok-4.5', inputMultiplyer: 1, outputMultiplyer: 3 },
		// 		{ modelIdOrIndex: 'gpt-5.4', inputMultiplyer: 1.25, outputMultiplyer: 7.5 },
		// 	],
		// }
		// 'しろそら-Oic': {
		// 	models: [
		// 		{ name: 'deepseek-v4-flash', id: 'deepseek-v4-flash', weight: 0.1 },
		// 	],
		// 	modelPrice: [
		// 		{ modelIdOrIndex: 'deepseek-v4-flash', inputMultiplyer: 1, outputMultiplyer: 1 },
		// 	],
		// }
	};

	const sharedConfig = {
		requestKeywordLink: [
			{
				keywords: ['打开高考筑梦营'],
				urls: ['https://www.ttqf.tech/subSite/CEEDreamweaversCamp/index.html'],
				needContinue: false,
			},
		],
		responseKeywordLink: [],
		requestKeywordSystemMessage: [
			{
				keywords: ['发票', '商业', '购买'],
				message: 'FFBox 目前是免费软件，使用时请遵守协议条款中的规则，关于商业相关勿轻信 AI 回复。',
				warning: true,
				forbid: false,
			},
			{
				keywords: ['中国', '国家', '党', '习近平', '新冠', '军队', '政', '抗议', '六四', '特朗普', '高市早苗'],
				message: '⚠️请谨慎在话题中涉及政治。AI 发言不代表任何人的立场。',
				warning: true,
				forbid: false,
			},
		],
		responseKeywordSystemMessage: [
			{
				keywords: ['发票', '商业', '购买'],
				message: 'FFBox 目前是免费软件，使用时请遵守协议条款中的规则，关于商业相关勿轻信 AI 回复。',
				warning: true,
			},
			{
				keywords: ['国家', '习近平', '新冠', '军队', '政'],
				message: '⚠️请谨慎在话题中涉及政治。AI 发言不代表任何人的立场。',
				warning: true,
			},
		],
		tokenLimit: {
			day: 70000,	// 0.07 元
			week: 180000,
			total: 700000,	// 0.7 元
		},
		tokenLimitMessage: {
			day: '今日 AI 用量已达到上限啦～明天可以再来哦！\n（ℹ️您还可在 FFBox 官网使用 AI 助手）',
			week: '本周 AI 用量已达到上限啦～下周一可以再来哦！\n（ℹ️您还可在 FFBox 官网使用 AI 助手）',
			total: 'AI 用量已达到上限啦🥹我能理解您好问的习惯，但有限的 AI 资源还是要分配给更多的用户。如果您还想使用的话，需要清除数据哦～\n（ℹ️您还可在 FFBox 官网使用 AI 助手）',
		},
		maxInputLength: 640,
		initialPlaceholders: [
			'智能帮助（最近更新 2026-08-21）',
			'智能帮助（v2.0）',
			'5.3 版本更新调研问卷',
			'编码器和格式分别是什么概念',
			'FFBox 的服务器是什么',
			'更新 FFBox 后以前的配置能保留吗',
			'如何无损剪辑视频时长',
			'如何无损拼接视频',
			'如何视频转音频',
			'如何混流',
			'如何使用远程转码',
			'如何清除服务器缓存',
			'如何设置输出文件夹',
			'如何配置 ffmpeg 位置',
			'如何转码图片',
			'如何转码音频',
			'怎么看转码进展曲线',
			'可以预估视频的输出大小吗（进展曲线）',
			'安装 ffmpeg 之后依然提示找不到',
			'安卓手机可以使用转码服务吗',
		],
		initialPlaceholderInterval: 4000,
		maxRounds: 12,
		maxRoundsMessage: '本轮对话发言次数已达到上限啦，请点击重置按钮开始新对话吧～',
		titleName: `FFBox AI 帮助 (${platform})`,
		initMsgbox: '',
		initSystemMessage: {
			role: 'aiInfo' as const,
			text: '欢迎使用第二代 FFBox AI 帮助～☺️\n- AI 助手依靠云算力运转，算力费用由 FFBox 作者承担。建议您在切换话题时重置一下对话，以减少用量消耗🍵\n- 如果提示欠费，此乃作者的阿里云账户被玩空了所致，可以去 FFBox 催更吐槽群里戳一下作者😁\n- AI 助手的回答未必是真相（会编造我没说过的东西），不作事实依据哦😊',
			actions: [
				{
					label: '5.3 版本更新调研问卷',
					url: 'https://my.feishu.cn/share/base/form/shrcnbcEHYKePV5mCQbzZGwyaCg',
				},
				{
					label: '5.4 版本更新调研问卷（点我！）',
					url: 'https://my.feishu.cn/share/base/form/shrcnQcRgrccqVrVugK0fnqrMmc',
				},
			],
		},
		invalidReply: '这话不能说😱……',
	};

	const platformOverrides = platform === 'FFBoxSite' ? FFBOXSITE_OVERRIDES : platform === 'hr' ? HR_OVERRIDES : {};

	const unifiedConfig: AISearchConfig = {
		...sharedConfig,
		...platformOverrides,
		chatUrl: 'https://ffboxaihelptest-bsuyltssti.cn-shenzhen.fcapp.run/api/chat/stream',
		// chatUrl: 'http://localhost:9000/api/chat/stream',
		conversationStatusUrl: undefined,
		modelOptions: buildModelOptions(providersConfig),
		modelPrice: buildModelPrice(providersConfig),
	};

	return unifiedConfig;
};
