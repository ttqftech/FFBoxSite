import { VNode } from 'vue';

export type MenuItem<E = any> = {
	type: 'normal';
	value: any;
	label: string;
	icon?: VNode;
	tooltip?: string;
	disabled?: boolean;
	onClick?: (event: Event, value: any) => boolean | void;
	extra?: E;
} | {
	type: 'separator';
} | {
	type: 'submenu';
	label: string;
	tooltip?: string;
	subMenu: MenuItem<E>[];
	disabled?: boolean;
	key?: number;
} | {
	type: 'checkbox' | 'radio';
	value: any;
	checked: boolean;
	label: string;
	tooltip?: string;
	disabled?: boolean;
	onClick?: (event: Event, checked: boolean) => boolean | void;
};
export type NarrowedMenuItem = Extract<MenuItem, { type: 'normal' }> & Record<string, any>;

export function getMenuItemByValue<E>(menu: MenuItem<E>[], value: any, compareFunc?: (itemValue: any, yourValue: any) => boolean) {
	function dfs(menu: MenuItem<E>[]): Extract<MenuItem<E>, { type: 'normal' | 'checkbox' | 'radio' }> | undefined {
		for (const menuItem of menu) {
			if (menuItem.type === 'submenu') {
				const result = dfs(menuItem.subMenu);
				if (result) {
					return result;
				}
			} else if ('value' in menuItem && (compareFunc ? compareFunc(menuItem.value, value) : menuItem.value === value)) {
				return menuItem;
			}
		}
	}
	return dfs(menu);
}
