import { FunctionalComponent, h } from 'vue';
import { colorTheme } from '../theme';
import css from './Button.module.less';

export interface ButtonProps {
	disabled?: boolean;
	onClick?: (event: MouseEvent) => any;
	type?: ButtonType;
	size?: 'small' | 'normal' | 'large';
}
export enum ButtonType {
	Normal = 'normal',
	Primary = 'primary',
	Danger = 'danger',
	NoBg = 'noBg',
}

const getButtonClass = (type?: ButtonType, disabled?: boolean, size?: ButtonProps['size']) => {
	let classText = css['button'];
	classText += ' ';
	if (type === ButtonType.Primary) {
		classText += css['primary'];
	} else if (type === ButtonType.Danger) {
		classText += css['danger'];
	} else if (type === ButtonType.NoBg) {
		classText += css['noBg'];
	}
	classText += ' ';
	if (size) {
		classText += css[size];
	}
	classText += ' ';
	if (disabled) {
		classText += css['disabled'];
	}
	return classText;
};

const ButtonComponent: FunctionalComponent<ButtonProps> = (props, ctx) => {
	const { type, disabled, size, onClick, ...restProps } = props;
	return h('button', {
		'data-color_theme': colorTheme.value,
		class: getButtonClass(type, disabled, size),
		disabled,
		onClick: (event: MouseEvent) => { (onClick || (() => {}))(event); event.stopImmediatePropagation(); },
		...restProps,
	}, ctx.slots.default ? h(ctx.slots.default) : undefined);
}

export default ButtonComponent;
