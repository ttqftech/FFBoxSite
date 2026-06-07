/**
 * FFBox 预设转换器：5.4 → 5.3
 *
 * 接收 PresetFileJSON 格式：
 * {
 *   FFBoxPresetVersion: "5.4",
 *   presets: [{ name: string, params: OutputParams }, ...]
 * }
 *
 * 其中每个 OutputParams 的结构为：
 * { input, filter, outputs: [{ video, audio, mux }, ...], extra }
 *
 * 5.4 格式：video/audio 的 detail 中存放实际 ffmpeg 参数值
 * 5.3 格式：video/audio 使用 ratevalue（滑杆位置）+ ratecontrol
 */
function convert(data) {
	if (typeof data === 'string') {
		try {
			data = JSON.parse(data);
		} catch (error) {
			return data;
		}
	}

	if (!data || !Array.isArray(data.presets)) return data;

	for (var i = 0; i < data.presets.length; i++) {
		var params = data.presets[i].params;
		if (!params || !Array.isArray(params.outputs)) continue;

		for (var j = 0; j < params.outputs.length; j++) {
			var output = params.outputs[j];

			// ---- 视频转换 ----
			if (output.video) {
				var v = output.video;
				if (v.ratecontrol && v.vcodec && v.ratecontrol !== '自动') {
					var result = convertVideoDetailToRateValue(v.vcodec, v.ratecontrol, v.detail || {});
					if (result !== null) {
						v.ratevalue = result;
						var paramNames = getVideoParamNames(v.vcodec, v.ratecontrol);
						if (!v.detail) v.detail = {};
						for (var k = 0; k < paramNames.length; k++) {
							delete v.detail[paramNames[k]];
						}
					}
				}
				if (v.ratecontrol === '自动') {
					delete v.ratecontrol;
				}
			}

			// ---- 音频转换 ----
			if (output.audio) {
				var a = output.audio;
				if (a.ratecontrol && a.acodec && a.ratecontrol !== '自动') {
					var result = convertAudioDetailToRateValue(a.acodec, a.ratecontrol, a.detail || {});
					if (result !== null) {
						a.ratevalue = result;
						var paramNames = getAudioParamNames(a.acodec, a.ratecontrol);
						if (!a.detail) a.detail = {};
						for (var k = 0; k < paramNames.length; k++) {
							delete a.detail[paramNames[k]];
						}
					}
				}
				if (a.ratecontrol === '自动') {
					delete a.ratecontrol;
				}
				// 5.3 音频有 vol 字段，默认 0
				if (a.vol === undefined) {
					a.vol = 0;
				}
			}
		}
	}

	return data;
}

// ==================== 视频 ====================

/**
 * 反向计算 5.3 的 ratevalue（滑杆位置）。
 * 当 detail 中缺少对应参数时，返回该编码器+模式的默认滑杆值。
 */
function convertVideoDetailToRateValue(vcodec, ratecontrol, detail) {

	// AV1
	if (vcodec === 'libaom-av1') {
		if (ratecontrol === 'CRF') return toSlider(detail['crf'], 63, 27);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'libsvtav1') {
		if (ratecontrol === 'CRF') return toSlider(detail['crf'], 63, 27);
		if (ratecontrol === 'CQP') return toSlider(detail['qp'], 63, 27);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'av1_qsv') {
		if (ratecontrol === 'Q') return toSlider(detail['q'], 255, 88);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}

	// HEVC
	if (vcodec === 'libx265') {
		if (ratecontrol === 'CRF') return toSlider(detail['crf'], 51, 28);
		if (ratecontrol === 'CQP') return toSlider(detail['qp'], 70, 40);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'hevc_qsv') {
		if (ratecontrol === 'Q') return toSliderDirect(detail['q'], 50);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'hevc_nvenc') {
		if (ratecontrol === 'VBR' || ratecontrol === 'VBR_HQ') return toSlider(detail['cq'], 51, 23);
		if (ratecontrol === 'CQP') return toSlider(detail['qp'], 51, 28);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'hevc_amf') {
		if (ratecontrol === 'CQP') return toSlider(detail['qp_i'] || detail['qp_p'] || detail['qp'], 51, 28);
		if (ratecontrol === 'CBR') return bitrateToSlider(detail['b:v'], 62500, 6);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'hevc_videotoolbox') {
		if (ratecontrol === 'Q') return toSliderDirect(detail['q'], 50);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}

	// H.264
	if (vcodec === 'libx264' || vcodec === 'libx264rgb') {
		if (ratecontrol === 'CRF') return toSlider(detail['crf'], 51, 28);
		if (ratecontrol === 'CQP') return toSlider(detail['qp'], 70, 40);
		if (ratecontrol === 'CBR') return bitrateToSlider(detail['b:v'], 62500, 6);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'h264_qsv') {
		if (ratecontrol === 'Q') return toSliderDirect(detail['q'], 50);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'h264_nvenc') {
		if (ratecontrol === 'VBR' || ratecontrol === 'VBR_HQ') return toSlider(detail['cq'], 51, 23);
		if (ratecontrol === 'CQP') return toSlider(detail['qp'], 51, 28);
		if (ratecontrol === 'CBR') return bitrateToSlider(detail['b:v'], 62500, 6);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'h264_amf') {
		if (ratecontrol === 'CQP') return toSlider(detail['qp_i'] || detail['qp_p'] || detail['qp'], 51, 28);
		if (ratecontrol === 'CBR') return bitrateToSlider(detail['b:v'], 62500, 6);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}
	if (vcodec === 'h264_videotoolbox') {
		if (ratecontrol === 'Q') return toSliderDirect(detail['q'], 50);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}

	// VP9 / VP8
	if (vcodec === 'libvpx-vp9' || vcodec === 'libvpx') {
		if (ratecontrol === 'CRF') return toSlider(detail['crf'], 63, 40);
		if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);
	}

	// 通用
	if (ratecontrol === 'Q') return toSliderDirect(detail['q'], 50);
	if (ratecontrol === 'ABR') return bitrateToSlider(detail['b:v'], 62500, 6);

	return null;
}

function getVideoParamNames(vcodec, ratecontrol) {
	if ((vcodec === 'libaom-av1' || vcodec === 'libsvtav1' || vcodec === 'libvpx-vp9' || vcodec === 'libvpx') && ratecontrol === 'CRF') return ['crf'];
	if (vcodec === 'libsvtav1' && ratecontrol === 'CQP') return ['qp'];
	if (vcodec === 'av1_qsv' && ratecontrol === 'Q') return ['q'];
	if ((vcodec === 'libx265' || vcodec === 'libx264' || vcodec === 'libx264rgb') && ratecontrol === 'CRF') return ['crf'];
	if ((vcodec === 'libx265' || vcodec === 'libx264' || vcodec === 'libx264rgb') && ratecontrol === 'CQP') return ['qp'];
	if ((vcodec === 'libx264' || vcodec === 'libx264rgb') && ratecontrol === 'CBR') return ['b:v', 'minrate', 'maxrate'];
	if ((vcodec === 'hevc_nvenc' || vcodec === 'h264_nvenc') && (ratecontrol === 'VBR' || ratecontrol === 'VBR_HQ')) return ['cq', 'rc'];
	if ((vcodec === 'hevc_nvenc' || vcodec === 'h264_nvenc') && ratecontrol === 'CQP') return ['qp'];
	if (vcodec === 'h264_nvenc' && ratecontrol === 'CBR') return ['cbr', 'b:v'];
	if ((vcodec === 'hevc_amf' || vcodec === 'h264_amf') && ratecontrol === 'CQP') return ['qp_i', 'qp_p'];
	if ((vcodec === 'hevc_amf' || vcodec === 'h264_amf') && ratecontrol === 'CBR') return ['rc', 'b:v'];
	if (ratecontrol === 'ABR' || ratecontrol === 'CBR') return ['b:v'];
	if (ratecontrol === 'Q') return ['q'];
	return [];
}

// ==================== 音频 ====================

function convertAudioDetailToRateValue(acodec, ratecontrol, detail) {
	if (ratecontrol === 'CBR/ABR' || ratecontrol === 'CBR') {
		return bitrateToSlider(detail['b:a'], 8000, 4);
	}
	if (ratecontrol === 'Q') {
		return toSliderDirect(detail['q:a'], 50);
	}
	return null;
}

function getAudioParamNames(acodec, ratecontrol) {
	if (ratecontrol === 'CBR/ABR' || ratecontrol === 'CBR') return ['b:a'];
	if (ratecontrol === 'Q') return ['q:a'];
	return [];
}

// ==================== 工具函数 ====================

/**
 * 反转整数型滑杆：slider = max - value
 * 用于 CRF、CQP 等（值越小画质越高，滑杆越右画质越高）
 */
function toSlider(paramValue, max, defaultSlider) {
	if (paramValue === undefined || paramValue === null || paramValue === '') return defaultSlider;
	var v = Number(paramValue);
	return isFinite(v) ? max - v : defaultSlider;
}

/**
 * 正向滑杆：slider = value（直接映射）
 * 用于 Q100 等质量参数
 */
function toSliderDirect(paramValue, defaultSlider) {
	if (paramValue === undefined || paramValue === null || paramValue === '') return defaultSlider;
	var v = Number(paramValue);
	return isFinite(v) ? Math.round(v) : defaultSlider;
}

/**
 * 码率反向转换为对数滑杆位置。
 * 5.3 码率滑杆公式：actualBitrate = base * 2^sliderValue
 * 反向：sliderValue = round(log2(actualBitrate / base))
 */
function bitrateToSlider(bitrateValue, base, defaultSlider) {
	if (bitrateValue === undefined || bitrateValue === null || bitrateValue === '') return defaultSlider;
	var bitrate = Number(bitrateValue);
	if (!isFinite(bitrate) || bitrate <= 0) return defaultSlider;
	return Math.round(Math.log(bitrate / base) / Math.log(2));
}
