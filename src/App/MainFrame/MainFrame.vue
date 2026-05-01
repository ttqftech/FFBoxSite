<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useAppStore } from '../../stores/appStore';
import Button, { ButtonType } from '../../components/Button/Button';
import Popup from '../../components/Popup/Popup';
import Msgbox from '../../components/Msgbox/Msgbox';
import MenuCenter from './MenuCenter/MenuCenter.vue';
import AISearch from './AISearch/AISearchWithConfig.vue';
import MobileScreen from './MobileScreen.vue';
import IconPointOut from '../../assets/warnings/pointOut.svg?component';

const appStore = useAppStore();

const windowWidth = ref(0);
const bigDownloadButtonZoomValue = ref(1);
const showBigDownloadButton = ref(false);
const screenshotClickCount = ref(0);
const lastScreenshotClickTime = ref(new Date().getTime());

const FFBoxTopWrapperStyle = computed(() => {
	if (appStore.showMenuCenter) {
		return {
			top: `calc(10vh + 40px)`,
		};
	} else {
		return {
			top: 'calc(0vh + 450px)',
		};
	}
});

const handleTopBarButtonClicked = (index: number) => {
	if (index === 0) {
		// API 文档
		window.open('./apiRefrence/swagger.html', '_blank');
	} else if (index === 1) {
		// 开发日志
		window.open('https://github.com/ttqftech/FFBox/blob/5.0%2B/日志.md', '_blank');
	// } else if (index === 2) {
	// 	// 使用条款
	// 	appStore.showMenuCenter = 2;
	// 	appStore.selectedPanelIndex = 3;
	} else if (index === 3) {
		// 网页版
		if (!appStore.termsAgreed) {
			Popup({
				message: '请先同意条款后再使用～',
			});
			appStore.showMenuCenter = 2;
			appStore.selectedPanelIndex = 3;
		} else {
			Msgbox({
				image: h(IconPointOut),
				title: '您将要使用一个尚未完善的网页版～',
				content: h('div', ['FFBox 是优先为客户端环境进行开发的，网页运行功能相对受限且可能存在更多 bug，建议您有条件时优先使用客户端', h('br'), '如果要使用 webUI，建议自行部署以获得更佳体验～']),
				buttons: [
					{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open('./online-v5.3', '__blank') && true },
				]
			});
		}
	} else if (index === 4) {
		// 下载
		appStore.showMenuCenter = 2;
		appStore.selectedPanelIndex = 1;
		showBigDownloadButton.value = false;
	}
};

const handleScreenshotClicked = () => {
	const n = new Date().getTime() - lastScreenshotClickTime.value > 10000 ? 0 : screenshotClickCount.value;
	if (n === 0) {
		Popup({ message: '这个是截图，点了也不会动的啦～' });
	} else if (n === 1) {
		Popup({ message: '都说了是截图咯～🌚' });
	} else if (n === 2) {
		Popup({ message: '哎呀你还想怎样让截图动起来😔' });
	} else if (n === 3) {
		Popup({ message: '您其实可以亲自把软件装到电脑里跑，这样它就能动起来了☺️' });
	} else if (n === 4) {
		Popup({ message: '您知道不，您看到的是一张截图，但我要对大、中、小、掌上四种屏幕大小分别做适配，每种尺寸要做浅色和深色两种模式，所以一共要截 8 张图🙂‍↕️' });
	} else if (n === 5) {
		Popup({ message: '问就是懒🌝，现在我连网页版都做出来了，我就不给大家做演示视频了，何况是 8 个视频' });
	} else if (n === 6) {
		Popup({ message: '我不乐意～🙂‍↔️' });
	} else if (n === 7) {
		Popup({ message: '您说以前啊，以前截图的位置确实是个视频，但今时不同往日了呢🤔' });
	} else if (n >= 8) {
		Popup({ message: '这倒是可以看看的🙂‍↕️' });
		Msgbox({
			image: h(IconPointOut),
			content: '您想要探寻曾经的 FFBox 吗？',
			buttons: [
				{ text: `穿越`, type: ButtonType.Primary, callback: () => window.open('./FFBoxSite-v1') && true },
				{ text: `不了`, role: 'cancel' }
			]
		});
	}
	screenshotClickCount.value = n + 1;
	lastScreenshotClickTime.value = new Date().getTime();
}

onMounted(async () => {
	const sleep = (ms: number) => new Promise((r) => setTimeout(() => r, ms));

	// 窗口大小变更监听
	const listener = () => {
		windowWidth.value = document.body.clientWidth;
		bigDownloadButtonZoomValue.value = document.body.clientWidth / window.innerHeight < 180 / 160 ? document.body.clientWidth / 180 * 0.8 : window.innerHeight / 160 * 0.8;
	}
	listener();
	window.addEventListener('resize', listener);

	// 浏览器检查
	// if (navigator.userAgent.includes('Firefox')) {
	// 	Popup({ message: 'Firefox 浏览器在浏览本页的时候，可能会出现部分元素缩放不正常的现象' });
	// 	sleep(1);
	// 	Popup({ message: '如影响到浏览，烦请更换 Chromium 内核的浏览器～' });
	// }
})

</script>

<template>
	<div class="mainFrame" :data-color_theme="appStore.colorTheme">
		<div class="topBar">
			<a class="nav" style="float: left;" href="http://www.ttqf.tech/" title="滔滔清风科技馆主页">
				<div class="ttqftechlogo"></div>
			</a>
			<a class="nav" style="float: right;" href="https://github.com/ttqftech/FFBox/" target="_blank" title="FFBox GitHub 主页">
				<svg height="40" width="40" viewBox="0 0 16 16" version="1.1" style="fill: #333;">
					<path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
				</svg>
			</a>
			<a class="nav" style="float: right;" href="https://qm.qq.com/cgi-bin/qm/qr?k=_WWZtiJw9-f-g66gcuDKx56P_yz8HbHq&jump_from=webapi&authKey=847BMyymWgCq9L1kBB7jLr7l5hhoelPtlUOSBYZuKfHUY3C+W4i1CY6GZ8+POMyB" target="_blank" title="FFBox 吐槽催更群">
				<svg viewBox="0 0 1024 1024" version="1.1" width="40" height="40">
					<path d="M511.09761 957.257c-80.159 0-153.737-25.019-201.11-62.386-24.057 6.702-54.831 17.489-74.252 30.864-16.617 11.439-14.546 23.106-11.55 27.816 13.15 20.689 225.583 13.211 286.912 6.767v-3.061z" fill="#FAAD08" p-id="1598"></path><path d="M496.65061 957.257c80.157 0 153.737-25.019 201.11-62.386 24.057 6.702 54.83 17.489 74.253 30.864 16.616 11.439 14.543 23.106 11.55 27.816-13.15 20.689-225.584 13.211-286.914 6.767v-3.061z" fill="#FAAD08" p-id="1599"></path><path d="M497.12861 474.524c131.934-0.876 237.669-25.783 273.497-35.34 8.541-2.28 13.11-6.364 13.11-6.364 0.03-1.172 0.542-20.952 0.542-31.155C784.27761 229.833 701.12561 57.173 496.64061 57.162 292.15661 57.173 209.00061 229.832 209.00061 401.665c0 10.203 0.516 29.983 0.547 31.155 0 0 3.717 3.821 10.529 5.67 33.078 8.98 140.803 35.139 276.08 36.034h0.972z" fill="#000000" p-id="1600"></path><path d="M860.28261 619.782c-8.12-26.086-19.204-56.506-30.427-85.72 0 0-6.456-0.795-9.718 0.148-100.71 29.205-222.773 47.818-315.792 46.695h-0.962C410.88561 582.017 289.65061 563.617 189.27961 534.698 185.44461 533.595 177.87261 534.063 177.87261 534.063 166.64961 563.276 155.56661 593.696 147.44761 619.782 108.72961 744.168 121.27261 795.644 130.82461 796.798c20.496 2.474 79.78-93.637 79.78-93.637 0 97.66 88.324 247.617 290.576 248.996a718.01 718.01 0 0 1 5.367 0C708.80161 950.778 797.12261 800.822 797.12261 703.162c0 0 59.284 96.111 79.783 93.637 9.55-1.154 22.093-52.63-16.623-177.017" fill="#000000" p-id="1601"></path><path d="M434.38261 316.917c-27.9 1.24-51.745-30.106-53.24-69.956-1.518-39.877 19.858-73.207 47.764-74.454 27.875-1.224 51.703 30.109 53.218 69.974 1.527 39.877-19.853 73.2-47.742 74.436m206.67-69.956c-1.494 39.85-25.34 71.194-53.24 69.956-27.888-1.238-49.269-34.559-47.742-74.435 1.513-39.868 25.341-71.201 53.216-69.974 27.909 1.247 49.285 34.576 47.767 74.453" fill="#FFFFFF" p-id="1602"></path><path d="M683.94261 368.627c-7.323-17.609-81.062-37.227-172.353-37.227h-0.98c-91.29 0-165.031 19.618-172.352 37.227a6.244 6.244 0 0 0-0.535 2.505c0 1.269 0.393 2.414 1.006 3.386 6.168 9.765 88.054 58.018 171.882 58.018h0.98c83.827 0 165.71-48.25 171.881-58.016a6.352 6.352 0 0 0 1.002-3.395c0-0.897-0.2-1.736-0.531-2.498" fill="#FAAD08" p-id="1603"></path><path d="M467.63161 256.377c1.26 15.886-7.377 30-19.266 31.542-11.907 1.544-22.569-10.083-23.836-25.978-1.243-15.895 7.381-30.008 19.25-31.538 11.927-1.549 22.607 10.088 23.852 25.974m73.097 7.935c2.533-4.118 19.827-25.77 55.62-17.886 9.401 2.07 13.75 5.116 14.668 6.316 1.355 1.77 1.726 4.29 0.352 7.684-2.722 6.725-8.338 6.542-11.454 5.226-2.01-0.85-26.94-15.889-49.905 6.553-1.579 1.545-4.405 2.074-7.085 0.242-2.678-1.834-3.786-5.553-2.196-8.135" fill="#000000" p-id="1604"></path><path d="M504.33261 584.495h-0.967c-63.568 0.752-140.646-7.504-215.286-21.92-6.391 36.262-10.25 81.838-6.936 136.196 8.37 137.384 91.62 223.736 220.118 224.996H506.48461c128.498-1.26 211.748-87.612 220.12-224.996 3.314-54.362-0.547-99.938-6.94-136.203-74.654 14.423-151.745 22.684-215.332 21.927" fill="#FFFFFF" p-id="1605"></path><path d="M323.27461 577.016v137.468s64.957 12.705 130.031 3.91V591.59c-41.225-2.262-85.688-7.304-130.031-14.574" fill="#EB1C26" p-id="1606"></path><path d="M788.09761 432.536s-121.98 40.387-283.743 41.539h-0.962c-161.497-1.147-283.328-41.401-283.744-41.539l-40.854 106.952c102.186 32.31 228.837 53.135 324.598 51.926l0.96-0.002c95.768 1.216 222.4-19.61 324.6-51.924l-40.855-106.952z" fill="#EB1C26" p-id="1607"></path>
				</svg>
			</a>
		</div>
		<div v-if="windowWidth >= 640" class="firstScreen">
			<div class="lrCenter">
				<img class="title-1" src="../../assets/软件图标v1.0.png" alt="FFBox 图标" width="368" height="184" />
				<div class="actions">
					<button @click="handleTopBarButtonClicked(0)">API 文档</button>
					<div class="seperator"></div>
					<button @click="handleTopBarButtonClicked(1)">涩话草坪</button>
				</div>
				<div class="versionInfo">
					<div>版本：5.3&nbsp;&nbsp;(2026-05-01)</div>
				</div>
			</div>
			<div class="FFBox-topWrapper" :style="FFBoxTopWrapperStyle">
				<div class="FFBox-wrapper">
					<div class="img" @click="() => handleScreenshotClicked()">
						<img v-if="appStore.colorTheme === 'themeLight' && windowWidth < 1000" alt="FFBox 软件截图" src="../../assets/软件截图_小_浅色.webp" />
						<img v-if="appStore.colorTheme === 'themeDark' && windowWidth < 1000" alt="FFBox 软件截图" src="../../assets/软件截图_小_深色.webp" />
						<img v-if="appStore.colorTheme === 'themeLight' && windowWidth >= 1000 && windowWidth < 1320" alt="FFBox 软件截图" src="../../assets/软件截图_中_浅色.webp" />
						<img v-if="appStore.colorTheme === 'themeDark' && windowWidth >= 1000 && windowWidth < 1320" alt="FFBox 软件截图" src="../../assets/软件截图_中_深色.webp" />
						<img v-if="appStore.colorTheme === 'themeLight' && windowWidth >= 1320" alt="FFBox 软件截图" src="../../assets/软件截图_大_浅色.webp" />
						<img v-if="appStore.colorTheme === 'themeDark' && windowWidth >= 1320" alt="FFBox 软件截图" src="../../assets/软件截图_大_深色.webp" />
					</div>
					<div class="FFBox">
						<button @click="handleTopBarButtonClicked(3)" class="startbutton startbutton2 startbutton-cyan">🌐网页版</button>
						<button @click="handleTopBarButtonClicked(4)" class="startbutton startbutton1 startbutton-green">⬇️下载</button>
						<div class="AISearch" v-if="windowWidth >= 1000">
							<div>
								<AISearch />
							</div>
						</div>
						<MenuCenter />
					</div>
				</div>
			</div>
		</div>
		<div v-else class="mobileScreen">
			<MobileScreen :onScreenshotClicked="handleScreenshotClicked" />
		</div>
		<div class="AISearchFixed" v-if="windowWidth < 1000">
			<div>
				<AISearch />
			</div>
		</div>
		<div class="bigDownloadButton" v-if="showBigDownloadButton">
			<div class="mask"></div>
			<div class="box" :style="{ zoom: bigDownloadButtonZoomValue }">
				<p class="line1">上面那么大个按钮找不到<br />倒要来这找小按钮🤣</p>
				<button @click="handleTopBarButtonClicked(3)" class="startbutton startbutton-green">⬇️下载</button>
				<p>嗱，够唔够大啊？</p>
			</div>
		</div>
	</div>
</template>

<style scoped lang="less">
	/* 顶栏自适应 */
	@media only screen and (max-width: 1079.9px) {
		.topBar {
			width: 100%;
		}
	}
	@media only screen and (min-width: 1080px) {
		.topBar {
			padding-left: calc(30% - 300px);
			padding-right: calc(30% - 300px);
		}
	}
	@media only screen and (max-width: 599.9px) {
		.ttqftechlogo {
			width: 40px;
		}
	}
	@media only screen and (min-width: 600px) {
		.ttqftechlogo {
			width: 240px;
		}
	}

	/* FFBox 自适应（小：640~999，使用 600　中：1000~1320，使用 960　大：1320~，使用 1280） */
	@media only screen and (max-width: 999.9px) {
		.FFBox-wrapper {
			width: 600px;
		}
		.FFBox {
			width: 598px;
		}
	}
	@media only screen and (min-width: 1000px) and (max-width: 1319.9px) {
		.FFBox-wrapper {
			width: 960px;
		}
		.FFBox {
			width: 958px;
		}
	}
	@media only screen and (min-width: 1320px) {
		.FFBox-wrapper {
			width: 1280px;
		}
		.FFBox {
			width: 1278px;
		}
	}

	/* 固定布局项——顶栏 */
	.topBar {
		position: fixed;
		top: 0;
		width: 100%;
		height: 80px;
		box-sizing: border-box;
		background-color: hwb(var(--bg94) / 0.8);
		z-index: 10;
		.nav {
			display: inline-block;
			height: 80px;
			transform: translateY(-4px);
			padding: 0px 16px;
			opacity: 0.95;
			color: inherit;
			transition: transform 0.2s ease, background 0.2s ease;
			&:hover {
				transform: translateY(0px);
				background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0));
			}
			&>* {
				height: 40px;
				line-height: 40px;
				margin-top: 24px;
			}
		}
		.ttqftechlogo {
			background-image: url(../../assets/ttqftechlogo.png);
			background-repeat: no-repeat;
			background-size: cover;
		}
	}
	.firstScreen {
		position: relative;
		// height: calc(100vh + 64px);
		// max-height: 1280px;
		height: 100vh;
		overflow: hidden;
		isolation: isolate;
		.lrCenter {
			text-align: center;
			.title-1 {
				width: 368px;
				margin-top: 160px;
			}
			.actions {
				display: flex;
				justify-content: center;
				align-items: center;
				isolation: isolate;
				button {
					padding: 6px 14px 6px calc(14px + 0.2em);
					letter-spacing: 0.2em;
					color: var(--66);
					background: none;
					border-radius: 6px;
					border: 1px solid transparent;
					z-index: 1;
					transition: all 0.1s linear;
					&:hover {
						border-top: 1px solid rgba(0, 0, 0, 0.1);
						border-left: 1px solid rgba(0, 0, 0, 0.1);
						border-right: 1px solid rgba(0, 0, 0, 0.1);
						border-bottom: 1px solid rgba(0, 0, 0, 0.2);
						background-color: hwb(var(--bg100));
						color: var(--primaryColor);
						transition: all 0.5s cubic-bezier(0.1, 2.5, 0.3, 1);
						cursor: pointer;
					}
				}
				.seperator {
					display: inline-block;
					width: 1px;
					height: 16px;
					margin: 0 -1px;
					background-color: #777;
				}
			}
			.versionInfo {
				margin-top: 12px;
				div {
					display: inline-block;
					padding: 12px 80px 0;
					color: var(--66);
					border-top: 1px solid hwb(var(--opposite80) / 0.5);
					font-size: 12px;
					opacity: 0.7;
				}
			}
		}
		.FFBox-topWrapper {
			position: absolute;
			width: 100%;
			transition: top 1.0s cubic-bezier(0.6, 0.2, 0.3, 1) 0.1s;
			.FFBox-wrapper {
				position: absolute;
				height: 800px;
				max-height: calc(90vh - 40px);
				left: 0;
				right: 0;
				margin: auto;
				box-shadow: 0 10px 28px hwb(0 0% 100% / 0.3);
				border-radius: 8px;
				overflow: hidden;
				&>.img {
					position: absolute;
					width: 100%;
					user-select: none;
					img {
						width: 100%;
						pointer-events: none;
					}
				}
				.FFBox {
					position: absolute;
					left: 1px;
					top: 1px;
					height: calc(100% - 2px);
					border-radius: 8px;
					text-align: center;
					overflow: hidden;
					pointer-events: none;
					:deep(&>*) {
						pointer-events: initial;
					}
					.startbutton {
						position: absolute;
						top: 46px;
						width: 120px;
						height: 36px;
						text-align: center;
						line-height: 36px;
						font-size: 20px;
						letter-spacing: 4px;
						text-indent: 2px;
						color: #FFF;
						text-shadow: 0px 1px 1px rgba(0, 0, 0, 0.5);
						border-radius: 10px;
						border: none;
						outline: none;
						cursor: pointer;
						&:hover:before {
							position: absolute;
							left: 0;
							content: "";
							width: 100%;
							height: 100%;
							border-radius: 10px;
							background: -webkit-linear-gradient(-90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
						}
					}
					.startbutton1 {
						right: 16px;
					}
					.startbutton2 {
						right: 160px;
						width: 140px;
					}
					.AISearch {
						position: absolute;
						top: 46px;
						left: 250px;
						right: 316px;
						height: 36px;
						display: flex;
						justify-content: center;
						align-items: center;
						&>div {
							width: clamp(104px, calc(40px + 50%), 100%);
						}
					}
				}
			}
		}
	}
	.AISearchFixed {
		position: fixed;
		bottom: 72px;
		left: 0;
		right: 0;
		height: 36px;
		display: flex;
		justify-content: center;
		align-items: center;
		&>div {
			width: clamp(104px, calc(40px + 50%), 100%);
		}
	}
	.bigDownloadButton {
		position: fixed;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #00000077;
		z-index: 5;
		.box {
			width: 180px;
			height: 160px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			border-radius: 8px;
			background-color: hwb(var(--bg97) / 0.8);
			box-shadow: 0 3px 2px -2px hwb(var(--highlight)) inset,	// 上亮光
						0 16px 32px 0px hwb(var(--hoverShadow) / 0.02),
						0 6px 6px 0px hwb(var(--hoverShadow) / 0.02),
						0 0 0 1px hwb(var(--highlight) / 0.9);	// 包边
			text-align: center;
			.line1 {
				font-size: 10px;
			}
			.startbutton {
				position: relative;
				width: 120px;
				height: 36px;
				text-align: center;
				line-height: 36px;
				font-size: 20px;
				letter-spacing: 4px;
				text-indent: 2px;
				color: #FFF;
				text-shadow: 0px 1px 1px rgba(0, 0, 0, 0.5);
				border-radius: 10px;
				border: none;
				outline: none;
				cursor: pointer;
				&:hover:before {
					position: absolute;
					left: 0;
					content: "";
					width: 100%;
					height: 100%;
					border-radius: 10px;
					background: -webkit-linear-gradient(-90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0));
				}
			}

		}
	}

	// 主题
	.mainFrame[data-color_theme="themeLight"] {
		.涩话草坪 {
			color: hsl(120, 40%, 40%) !important;
		}
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 40% 10%), hwb(120 20% 20%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(120 10% 40%), hwb(120 20% 20%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(120 40% 10%);
			}
		}
		.startbutton-cyan {
			background: linear-gradient(180deg, hwb(180 20% 15%), hwb(180 10% 30%));
			box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),	// 去除上方阴影
						0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(180 20% 15%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(180 10% 40%), hwb(180 10% 30%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(180 40% 10%);
			}
		}
	}
	.mainFrame[data-color_theme="themeDark"] {
		.涩话草坪 {
			color: hsl(120, 40%, 65%) !important;
		}
		.startbutton-green {
			background: linear-gradient(180deg, hwb(120 20% 10%), hwb(120 10% 30%));
			box-shadow: 0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(120 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(120 5% 50%), hwb(120 10% 30%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(120 20% 10%);
			}
		}
		.startbutton-cyan {
			background: linear-gradient(180deg, hwb(180 15% 10%), hwb(180 10% 35%));
			box-shadow: 0px 1px 1px 0px rgba(16, 16, 16, 0.15),	// 按钮厚度
						0px 2px 6px 0px rgba(0, 0, 0, 0.1),	// 按钮阴影
						0px 4px 16px -4px hwb(180 40% 10%);	// 按钮发光和远距阴影
			&:active {
				background: linear-gradient(180deg, hwb(180 5% 50%), hwb(180 10% 35%));
			}
			&:hover {
				box-shadow: 0px -1px 1px 0px rgba(255, 255, 255, 0.3),
							0px 1px 1px 0px rgba(16, 16, 16, 0.15),
							0px 2px 6px 0px rgba(0, 0, 0, 0.1),
							0px 4px 24px 0px hwb(180 15% 10%);
			}
		}
	}

</style>