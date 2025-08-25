export default {
	get(key: string): Promise<any> {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				// 若存在多级则进行特殊处理
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					// key 中的第一项指示需要从 localStorage 读出的字符串
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey]; // 进入深一层
				}
				resolve(obj[keys.shift()]);
			} else {
				try {
					const value = JSON.parse(localStorage.getItem(key));
					resolve(value);
				} catch (error) {
					resolve(localStorage.getItem(key));
				}
				resolve(localStorage.getItem(key));
			}
		});
	},
	set(key: string, value: any) {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				// 若存在多级则进行特殊处理
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					// key 中的第一项指示需要从 localStorage 读出的字符串
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey]; // 进入深一层
				}
				obj[keys.shift()] = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; // 对于对象，需先将其 Proxy 解开
				resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
			} else {
				resolve(localStorage.setItem(key, JSON.stringify(value)))
			}
		});
	},
	delete(key: string) {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				// 若存在多级则进行特殊处理
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					// key 中的第一项指示需要从 localStorage 读出的字符串
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				// obj 指示最深一层对象，而非最深一层对象的值，因此保留 1 的深度
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey]; // 进入深一层
				}
				delete obj[keys.shift()];
				resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
			} else {
				resolve(localStorage.removeItem(key))
			}
		});
		return new Promise((resolve) => resolve(localStorage.removeItem(key)));
	},
}
