/**
 * 获取随机字符串
 */
export function randomString(length = 6, dictionary = 'abcdefghijklmnopqrstuvwxyz'): string {
	let result = '';
	for (let i = length; i > 0; --i) result += dictionary[Math.floor(Math.random() * dictionary.length)];
	return result;
}

