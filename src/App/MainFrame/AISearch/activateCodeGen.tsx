import { defineComponent, onMounted, ref } from 'vue';
import CryptoJS from 'crypto-js';
import Msgbox from '../../../components/Msgbox/Msgbox';
// import { useAppStore } from '../../../stores/appStore';
import Popup from '../../../components/Popup/Popup';
import BoxedNormalInput from '../../../components/NormalInput/BoxedNormalInput.vue';
import Button from '../../../components/Button/Button';

export function showActivateCodeGen(functionLevel: number) {
	(document.activeElement as any)?.blur();
	// 如果是从菜单通过 Enter 进入的，不加延迟的情况下，会连带触发 Msgbox 的键盘事件监听，因此需要加延迟
	setTimeout(() => {
		Msgbox({
			container: document.body,
			title: '😉 领奖环节',
			content: <Comp functionLevel={functionLevel} />,
			buttons: [
				{ text: '关闭', role: 'cancel' },
			]
		});
	}, 0);
}

const Comp = defineComponent((props: { functionLevel: number }) => {
	// const store = useAppStore();
	const machineCode = ref<string>();
	const activationCode = ref<string>();

	const handleCodeGen = () => {
		const fixedCode = 'd324c697ebfc42b7';
		const key = machineCode.value + fixedCode;
		const min = CryptoJS.enc.Utf8.parse(props.functionLevel + '');
		const userInput = CryptoJS.AES.encrypt(min, key).toString();
		activationCode.value = userInput;
	};

	const handleActivationCodeClick = () => {
		navigator.clipboard.writeText(activationCode.value);
		Popup({ message: '已复制激活码🫡', level: 0 });
	};
	
	onMounted(() => {
	});	
	
	return () => (
		activationCode.value ? (
			<div>
				<p>请保管好您的激活码～</p>
				<p>
					激活码：<span style="user-select: all;" onClick={handleActivationCodeClick}>
						{activationCode.value}
					</span>
				</p>
			</div>
		) : (
			<div>
				<BoxedNormalInput title='机器码' value={machineCode.value} onChange={(value) => machineCode.value = value} style={{ width: '300px' }} />
				<Button onClick={() => handleCodeGen()}>生成激活码</Button>
			</div>
		)
	);
}, {
	props: ['functionLevel'],
});
