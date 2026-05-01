<script setup lang="ts">
import { h } from 'vue';
import { useAppStore } from '../../../../stores/appStore';
import Button, { ButtonType } from '../../../../components/Button/Button';
import Popup from '../../../../components/Popup/Popup';
import Msgbox from '../../../../components/Msgbox/Msgbox';
import IconMsi from './msi.svg?component';
import IconApp from './app.svg?component';
import IconNodejs from './nodejs.svg?component';
import IconWeb from './web.svg?component';
import IconZip from './zip.svg?component';
import IconPointOut from '../../../../assets/warnings/pointOut.svg?component';

const appStore = useAppStore();

const handleDownloadClick = (os: 'Windows' | 'MacOS' | 'Linux' | 'web', selection: 0 | 1 | 2) => {
	if (!appStore.termsAgreed) {
		Popup({
			message: '请先同意条款后再来下载～',
		});
		appStore.selectedPanelIndex = 3;
		return;
	}
	fetch('https://github.com/ttqftech/download-count-test/releases/download/1/test').then(async (s) => s.text());	// 仅供测试
	let url;
	switch (os) {
		case 'Windows':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/Windows_x86-64_FFBox_5.3.exe',
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/Windows_x86-64_FFBoxService+webUI_5.3.zip',
				'./directDownload/ffmpegOnekey_Windows.ps1'
			][selection];
			if (selection === 2) {
				Msgbox({
					image: h(IconPointOut),
					title: '使用说明',
					content: h('div', { style: `text-align: center` }, ['本脚本只是备选方案，请优先使用 winget install ffmpeg --version 7.1 命令进行安装！', h('br'), h('br'), '一般情况下，Windows 会对从互联网上下载的 Powershell 脚本在运行前进行询问，同意后即可运行', h('br'), '如果您的 Windows 安全设置较高，则会提示“此系统上禁止运行脚本”。您需要使用管理员身份执行 Set-ExecutionPolicy RemoteSigned 后才可运行该脚本']),
					buttons: [
						{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => {
							const a = document.createElement('a');
							a.href = url;
							a.download = 'ffmpegOnekey_Windows.ps1';
							document.body.appendChild(a);
							a.click();
							document.body.removeChild(a);
						} },
					]
				});
			}
			window.open(url, '__blank');
			break;
		case 'MacOS':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/macOS_ARM64_FFBox_5.3.dmg',
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/macOS_ARM64_FFBoxService+webUI_5.3.zip',
			][selection];
			Msgbox({
				image: h(IconPointOut),
				title: 'macOS 使用须知',
				content: h('div', { style: `text-align: center` }, [
					'由于 macOS 应用的签名与公证要求 Apple 开发者账号，而 Apple 开发者账号要求启用账户的双重认证', h('br'),
					'FFBox 开发者并未同意此要求，故无法对 FFBox 进行签名与公证', h('br'),
					'这将会导致您在运行 FFBox 时提示“无法打开”或“已损坏”', h('br'),
					'建议参考', h('a', { href: 'https://zhuanlan.zhihu.com/p/135948430', target: '_blank' }, '此文' ), '指示进行白名单处理', h('br'),
					'另外，ffmpeg 官方下载站并未提供 ARM 架构的 ffmpeg 二进制文件', h('br'),
					'如果您在使用 ARM 架构的 macOS，您可在 ', h('a', { href: 'http://www.osxexperts.net/', target: '_blank' }, 'OSXExperts' ), ' 等网站上另行下载 ffmpeg',
				]),
				buttons: [
					{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open(url, '__blank') && true },
				]
			});
			break;
		case 'Linux':
			url = [
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/Linux_x86-64_FFBox_5.3.deb',
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/Linux_x86-64_FFBox_5.3.AppImage',
				'https://github.com/ttqftech/FFBox/releases/download/v5.3/Linux_x86-64_FFBoxService+webUI_5.3.zip',
			][selection];
			window.open(url, '__blank');
			break;
		case 'web':
			url = [
				'./online-v5.3',
				'./FFBox_v5.3_web.zip',
			][selection];
			if (selection === 0) {
				Msgbox({
					image: h(IconPointOut),
					title: '您将要使用一个尚未完善的网页版～',
					content: h('div', { style: `text-align: center` }, ['FFBox 是优先为客户端环境进行开发的，网页运行功能相对受限且可能存在更多 bug，建议您有条件时优先使用客户端', h('br'), '同时，建议自行部署以获得更佳体验～']),
					buttons: [
						{ text: `我已知悉，继续`, type: ButtonType.Primary, callback: () => window.open(url, '__blank') && true },
					]
				});
			} else {
				window.open(url, '__blank');
			}
			break;
		default:
			break;
	}
};

</script>

<template>
	<div class="downloadPanel">
		<h2>完整客户端<span>(含转码服务和网页版)</span></h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 0)"><IconMsi />安装包</Button>
			</div>
			<div class="os">
				<span>macOS (ARM64)</span>
				<Button size="large" @click="handleDownloadClick('MacOS', 0)"><IconApp />dmg 包</Button>
			</div>
			<div class="os">
				<span>Linux (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Linux', 0)"><IconMsi />deb 安装包</Button>
				<Button size="large" @click="handleDownloadClick('Linux', 1)"><IconApp />AppImage</Button>
			</div>
		</div>
		<h2>转码服务</h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 1)"><IconNodejs />转码服务</Button>
			</div>
			<div class="os">
				<span>macOS (ARM64)</span>
				<Button size="large" @click="handleDownloadClick('MacOS', 1)"><IconNodejs />转码服务</Button>
			</div>
			<div class="os">
				<span>Linux (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Linux', 2)"><IconNodejs />转码服务</Button>
			</div>
		</div>
		<h2>网页版</h2>
		<div class="oss">
			<div class="os">
				<span>在线试用</span>
				<Button size="large" @click="handleDownloadClick('web', 0)"><IconWeb />v5.1 版本</Button>
			</div>
			<div class="os">
				<span>压缩包</span>
				<Button size="large" @click="handleDownloadClick('web', 1)"><IconZip />v5.1 版本</Button>
			</div>
		</div>
		<h2>ffmpeg 一键安装脚本<span>(但从下载到运行脚本的操作不是一键的)</span></h2>
		<div class="oss">
			<div class="os">
				<span>Windows (x86-64)</span>
				<Button size="large" @click="handleDownloadClick('Windows', 2)"><img src="./gyan.dev.png">gyan.dev<br/>release essentials</Button>
			</div>
		</div>
		<div style="height: 32px;"></div>
	</div>
</template>

<style scoped lang="less">
	.downloadPanel {
		padding: 0 5%;
		font-size: 14px;
		// overflow: auto;
		// font-family: "苹方 中等", "PingFang SC", 苹方, 微软雅黑, "Segoe UI", Consolas, Avenir, Arial, Helvetica, sans-serif, 黑体;
		font-weight: 500;
		text-align: left;
		p {
			margin-bottom: 4px;
		}
		h2>span {
			font-size: 0.5em;
			opacity: 0.5;
			margin-left: 1em;
		}
		.oss {
			display: flex;
			flex-wrap: wrap;
			gap: 24px;
			.os {
				width: 190px;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 16px;
				padding: 24px;
				border-radius: 12px;
				// border: 1.5px solid hwb(var(--highlight));
				background-color: hwb(var(--hoverLightBg) / 0.15);
				box-shadow: 0 4px 12px hwb(var(--opposite) / 0.05),	// 外发光
							0 0 1px 1px hwb(var(--opposite) / 0.1) inset;	// 内边缘
				span {
					font-size: 12px;
					opacity: 0.5;
				}
				button {
					letter-spacing: 0px;
					margin: 0;
					&>svg, &>img {
						width: 20px;
						height: 20px;
						vertical-align: -4px;
						margin-right: 6px;
					}
				}
			}
		}
	}
</style>