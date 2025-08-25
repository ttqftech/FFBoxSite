/// <reference types="vite/client" />
// export {} // 使 ts 认为这个文件是一个 module 而不是 script，否则不能 extend global

declare global {
	interface Element {
		focus(): void;
		readonly offsetLeft: number;
		readonly offsetTop: number;
		readonly offsetWidth: number;
		readonly offsetHeight: number;
	}
	interface EventTarget {
		focus(): void;
		readonly offsetLeft: number;
		readonly offsetTop: number;
		readonly offsetWidth: number;
		readonly offsetHeight: number;
		getBoundingClientRect(): DOMRect;
		className: string;
		parentElement?: Element;
		selectionStart: number;
		selectionEnd: number;
		value: any;
	}
}

export {};
