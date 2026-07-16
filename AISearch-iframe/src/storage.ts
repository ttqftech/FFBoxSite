export default {
	get(key: string): Promise<any> {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				// 若存在多级则进行特殊处理
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey];
				}
				resolve(obj[keys.shift()]);
			} else {
				try {
					const value = JSON.parse(localStorage.getItem(key));
					resolve(value);
				} catch (error) {
					resolve(localStorage.getItem(key));
				}
			}
		});
	},
	set(key: string, value: any) {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey];
				}
				obj[keys.shift()] = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
				resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
			} else {
				resolve(localStorage.setItem(key, JSON.stringify(value)))
			}
		});
	},
	delete(key: string) {
		return new Promise((resolve) => {
			if (key.indexOf('.') > -1) {
				const keys = key.split('.');
				const keyInLS = keys[0];
				let storedValue;
				try {
					storedValue = JSON.parse(localStorage.getItem(keys.shift()));
				} catch (error) {}
				if (storedValue == undefined) {
					storedValue = {};
				}
				let obj = storedValue;
				while (keys.length > 1) {
					const currentKey = keys.shift();
					if (obj[currentKey] == undefined) {
						obj[currentKey] = {};
					}
					obj = obj[currentKey];
				}
				delete obj[keys.shift()];
				resolve(localStorage.setItem(keyInLS, JSON.stringify(storedValue)));
			} else {
				resolve(localStorage.removeItem(key))
			}
		});
	},
}
