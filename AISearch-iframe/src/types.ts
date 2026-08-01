/**
 * 已使用模型的用量计算算法
 */
type ModelPrice = {
	modelKey: string; // provider:model_id
	inputMultiplyer: number; // 输入乘数
	outputMultiplyer: number; // 输出乘数
}[];

export interface AIModelOption {
	key: string;
	provider: string;
	modelId: string;
	modelName: string;
	label: string;
}

interface ResponseKeywordMessage {
	keywords: string[];
	message: string;
	warning?: boolean;	// 是否显示黄色字体，默认 false
	once?: boolean;	// 是否只显示一次，默认 false
}
type RequestKeywordMessage = ResponseKeywordMessage & { forbid: boolean };

interface ResponseResponseKeywordLink {
	keywords: string[];
	urls?: string[];
	blank?: boolean;	// 是否新标签打开，网页版默认 true，PC 版无论如何为 true
	execute?: string[];	// 执行程序
}
type RequestResponseKeywordLink = ResponseResponseKeywordLink & { needContinue?: boolean };	// continue 表示匹配到后是否继续向 API 发送消息，默认 true

// #region 流式输出相关类型

/** 客户端工具种类 */
export type ClientToolKind = 'notification' | 'request-response';

/** SSE 流式事件（与后端 StreamEvent 对应） */
export type StreamEvent =
	| { type: 'connected' }
	| { type: 'agent'; name: string; displayName: string }
	| { type: 'thinking'; content: string }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; id: string; name: string; args: Record<string, any>; display: 'cloud' | 'client' }
	| { type: 'tool_result'; id: string; name: string; content: string }
	| { type: 'client_tool_call'; id: string; name: string; args: Record<string, any>; needResponse: boolean }
	| { type: 'usage'; inputUsage: number; outputUsage: number }
	| { type: 'end' }
	| { type: 'error'; message: string };

// AI 气泡内的一个 block（思考 / 文本 / 工具调用 / 工具结果）
export interface ChatBlock {
	type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'error';
	content?: string;
	toolCall?: { id: string; name: string; args: Record<string, any>; display: 'cloud' | 'client' };
	toolResult?: { id: string; name: string; content: string };
	confirmStatus?: 'pending' | 'confirmed' | 'skipped';	// 客户端工具调用的确认状态
}

// #endregion

export interface AIChatMessage {
	role: 'user' | 'ai' | 'aiErr' | 'aiInfo';
	text: string;
	blocks?: ChatBlock[];	// AI 气泡内的多 block 内容
	status?: string;		// 当前 AI 气泡的状态文字（例如「大模型处理中」「xxx 处理中」），流式过程中在气泡顶部展示
	time?: Date;
	refers?: string[];
	inputUsage?: number;	// 本次 AI 回复的输入 token 用量 * 加权
	outputUsage?: number;	// 本次 AI 回复的输出 token 用量 * 加权
	// expense?: number;	// 算力开销（按模型输入/输出乘数加权后的用量）
	actions?: { label: string; url: string }[];
}

// chatAPI 参数（大体上与后端同步）
export interface ChatAPIParams {
	message?: string;	// 新的一轮用户消息
	extraInfo?: Record<string, any>;	// 额外的非用户输入的消息（待实现）
	toolCallId?: string;	// 客户端工具调用结果：工具 id
	toolResult?: string;	// 客户端工具调用结果：结果文本
	modelKey?: string;
	onEvent: (event: StreamEvent) => void;	// 流式事件回调
}

// chatAPI 返回类型
export interface ChatAPIResult {
	inputUsage?: number;	// 本次 AI 回复的输入 token 用量
	outputUsage?: number;	// 本次 AI 回复的输出 token 用量
	clientToolCalls?: { id: string; name: string; args: Record<string, any>; needResponse: boolean }[];	// 本次返回的客户端工具调用列表（可能多个）
}

/**
 * 整体配置对象类型
 */
interface AISearchConfig {
	chatUrl?: string;
	conversationStatusUrl?: string;
	modelPrice?: ModelPrice;
	modelOptions?: AIModelOption[];
	requestKeywordLink?: RequestResponseKeywordLink[];	// 请求关键词匹配到则打开一个链接
	responseKeywordLink?: ResponseResponseKeywordLink[];	// 响应关键词匹配到则打开一个链接
	requestKeywordSystemMessage?: RequestKeywordMessage[];	// 请求关键词匹配到则显示一条系统消息
	responseKeywordSystemMessage?: ResponseKeywordMessage[];	// 响应关键词匹配到则显示一条系统消息
	tokenLimit?: { day?: number; week?: number; total?: number };
	tokenLimitMessage?: { day?: string; week?: string; total?: string };
	maxInputLength?: number;
	initialPlaceholders?: string[];
	initialPlaceholderInterval?: number;
	maxRounds?: number;
	maxRoundsMessage?: string;
	titleName?: string;
	initMsgbox?: string;	// 第一次打开聊天窗时的弹窗
	initSystemMessage?: AIChatMessage;	// 第一次打开聊天窗和重置对话时显示一条系统消息
	invalidReply?: string;	// AI 检测到非法内容不予回答时显示一条系统消息
}

export default AISearchConfig;