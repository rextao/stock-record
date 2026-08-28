/**
 * 只保留数字和一个小数点。移动端要拿到数字键盘就得用 type="text" + inputMode，
 * 这样浏览器不再帮我们过滤非法字符，得自己在 onChange 里清洗。
 */
export function sanitizeDecimalInput(raw: string): string {
	const cleaned = raw.replace(/[^\d.]/g, '')
	const [head, ...rest] = cleaned.split('.')
	// 多余的小数点直接吞掉，而不是截断后面的输入
	return rest.length > 0 ? `${head}.${rest.join('')}` : head
}

/** 数字输入框的通用属性：iOS/Android 会弹带小数点的数字键盘 */
export const DECIMAL_INPUT_PROPS = {
	// 刻意不用 type="number"：它会让 inputMode 失效，且在部分内核里弹出带 e/+/- 的键盘
	type: 'text' as const,
	inputMode: 'decimal' as const,
	pattern: '[0-9]*[.,]?[0-9]*',
}

/** 只保留数字，用于股数这类整数输入 */
export function sanitizeIntegerInput(raw: string): string {
	return raw.replace(/\D/g, '')
}

/** 整数输入框的通用属性：弹纯数字键盘，连小数点都不给 */
export const INTEGER_INPUT_PROPS = {
	type: 'text' as const,
	inputMode: 'numeric' as const,
	pattern: '[0-9]*',
}
