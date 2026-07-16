/**
 * 简化版 tooltip，使用原生 title 属性
 * 在 iframe 内部不需要复杂的 tooltip 组件
 */
export function useTooltip(content: string) {
	return {
		title: content,
	};
}
