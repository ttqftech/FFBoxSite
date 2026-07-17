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
	| { type: 'agent'; name: string; displayName: string }
	| { type: 'thinking'; content: string }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; id: string; name: string; args: Record<string, any>; display: 'cloud' | 'client' }
	| { type: 'tool_result'; id: string; name: string; content: string }
	| { type: 'client_tool_call'; id: string; name: string; args: Record<string, any>; kind: ClientToolKind }
	| { type: 'usage'; expense: number }
	| { type: 'end' }
	| { type: 'error'; message: string };

/** AI 气泡内的一个 block（思考 / 文本 / 工具调用 / 工具结果） */
export interface ChatBlock {
	type: 'thinking' | 'text' | 'tool_call' | 'tool_result';
	content?: string;
	toolCall?: { id: string; name: string; args: Record<string, any>; display: 'cloud' | 'client' };
	toolResult?: { id: string; name: string; content: string };
}

// #endregion

export interface AIChatMessage {
	role: 'user' | 'ai' | 'aiErr' | 'aiInfo';
	text: string;
	/** AI 气泡内的多 block 内容（流式输出时使用） */
	blocks?: ChatBlock[];
	time?: Date;
	refers?: string[];
	expense?: number;
	actions?: { label: string; url: string }[];
}

/** 流式 chatAPI 参数 */
export interface ChatAPIParams {
	/** 新的用户消息（新的一轮） */
	message?: string;
	/** 客户端工具调用结果续接：工具调用 id */
	toolCallId?: string;
	/** 客户端工具调用结果续接：工具结果文本 */
	toolResult?: string;
	/** 模型 key */
	modelKey?: string;
	/** 流式事件回调 */
	onEvent: (event: StreamEvent) => void;
}

/** 流式 chatAPI 返回类型 */
export interface ChatAPIResult {
	expense?: number;
	/** 客户端工具调用（如果有），前端需据此执行客户端工具 */
	clientToolCall?: { id: string; name: string; args: Record<string, any>; kind: ClientToolKind };
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
