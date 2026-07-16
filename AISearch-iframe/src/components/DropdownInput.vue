<script lang="ts">
export type MenuItem = { type: 'normal'; value: string; label: string } | { type: 'separator' };
</script>
<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue';

interface NormalItem {
	type: 'normal';
	value: string;
	label: string;
}
interface SeparatorItem {
	type: 'separator';
}
type SimpleMenuItem = NormalItem | SeparatorItem;

interface Props {
	text?: string | number;
	list: SimpleMenuItem[];
	readonly?: boolean;
	disabled?: boolean;
	onChange?: (value: string) => any;
}

const props = defineProps<Props>();

const focused = ref(false);
const comboOpened = ref(false);
const inputText = ref('-');
const selectorRef = ref<HTMLElement>(null);

const selectorStyle = computed(() => {
	const ret: any = {};
	if (focused.value) {
		ret.background = 'var(--ff)';
	}
	if (props.disabled) {
		ret.opacity = 0.6;
		ret.color = 'var(--66)';
		ret.background = 'var(--f7)';
	}
	return ret;
});

const openMenu = () => {
	if (props.disabled) return;
	comboOpened.value = true;
};

const handleSelect = (item: NormalItem) => {
	inputText.value = item.value;
	props.onChange?.(item.value);
	comboOpened.value = false;
};

const handleClickOutside = (e: MouseEvent) => {
	if (selectorRef.value && !selectorRef.value.contains(e.target as Node)) {
		comboOpened.value = false;
	}
};

const handleBlur = () => {
	focused.value = false;
};

const handleFocus = () => {
	focused.value = true;
};

watch(() => props.text, (newValue) => {
	inputText.value = newValue !== undefined ? newValue + '' : '';
});

onMounted(() => {
	inputText.value = props.text !== undefined ? props.text + '' : '';
	document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
	document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
	<div class="combobox-selector" ref="selectorRef" :style="selectorStyle" @click="openMenu">
		<input
			type="text"
			v-model="inputText"
			:readonly="readonly || disabled"
			@blur="handleBlur"
			@focus="handleFocus"
		>
		<div class="combobox-selector-img"></div>
		<div v-if="comboOpened" class="combobox-dropdown">
			<template v-for="(item, idx) in list" :key="idx">
				<div v-if="item.type === 'separator'" class="dropdown-separator"></div>
				<div v-else class="dropdown-item" @click.stop="handleSelect(item)">{{ item.label }}</div>
			</template>
		</div>
	</div>
</template>

<style scoped>
	.combobox-selector {
		position: relative;
		height: 24px;
		flex-grow: 1;
		border-radius: 24px;
		background: var(--f7);
		border: #AAA 1px solid;
		box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
		cursor: pointer;
	}
	.combobox-selector:hover {
		background: var(--ff);
	}
	.combobox-selector:active {
		background: var(--e7);
	}
		.combobox-selector input {
			position: absolute;
			left: 6px;
			width: calc(100% - 28px);
			height: 24px;
			line-height: 24px;
			background: none;
			border: none;
			margin: 0;
			padding: 0;
			outline: none;
			font-family: inherit;
			font-size: 13px;
			color: inherit;
			cursor: pointer;
		}
		.combobox-selector-img {
			position: absolute;
			right: 6px;
			top: 4px;
			width: 16px;
			height: 16px;
			background: url(../assets/menu_button.svg) center/contain no-repeat;
		}
		.combobox-dropdown {
			position: absolute;
			top: calc(100% + 4px);
			left: 0;
			right: 0;
			z-index: 100;
			background: var(--ff);
			border-radius: 8px;
			border: 1px solid var(--e7);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
			overflow: hidden;
			padding: 4px 0;
		}
		.dropdown-item {
			padding: 4px 12px;
			font-size: 12px;
			cursor: pointer;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.dropdown-item:hover {
			background: var(--f7);
		}
		.dropdown-separator {
			height: 1px;
			margin: 4px 8px;
			background: var(--e7);
		}
</style>
