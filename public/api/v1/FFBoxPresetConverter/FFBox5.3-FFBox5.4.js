/**
 * FFBox 预设转换器：5.3 → 5.4
 *
 * 接收 PresetFileJSON 格式：
 * {
 *   FFBoxPresetVersion: "5.3",
 *   presets: [{ name: string, params: OutputParams }, ...]
 * }
 *
 * 其中每个 OutputParams 的结构为：
 * { input, filter, outputs: [{ video, audio, mux }, ...], extra }
 *
 * 5.3 格式：video/audio 使用 ratevalue（滑杆位置）+ ratecontrol
 * 5.4 格式：video/audio 的 detail 中存放实际 ffmpeg 参数值
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
				if (v.ratevalue !== undefined && v.ratecontrol && v.vcodec) {
					var detail = convertVideoRateValueToDetail(v.vcodec, v.ratecontrol, v.ratevalue);
					if (detail) {
						if (!v.detail) v.detail = {};
						var paramNames = getVideoParamNames(v.vcodec, v.ratecontrol);
						for (var k = 0; k < paramNames.length; k++) {
							delete v.detail[paramNames[k]];
						}
						Object.assign(v.detail, detail);
					}
				}
				delete v.ratevalue;
			}

			// ---- 音频转换 ----
			if (output.audio) {
				var a = output.audio;
				if (a.ratecontrol === 'CBR/ABR') {
					a.ratecontrol = 'CBR';
				}
				if (a.ratevalue !== undefined && a.ratecontrol && a.acodec) {
					var detail = convertAudioRateValueToDetail(a.acodec, a.ratecontrol, a.ratevalue);
					if (detail) {
						if (!a.detail) a.detail = {};
						var paramNames = getAudioParamNames(a.acodec, a.ratecontrol);
						for (var k = 0; k < paramNames.length; k++) {
							delete a.detail[paramNames[k]];
						}
						Object.assign(a.detail, detail);
					}
				}
				delete a.ratevalue;
				delete a.vol;
			}
		}
	}

	return data;
}

// ==================== 视频 ====================

function convertVideoRateValueToDetail(vcodec, ratecontrol, ratevalue) {
	var sv = Number(ratevalue);
	if (!isFinite(sv)) return null;

	// AV1
	if (vcodec === 'libaom-av1') {
		if (ratecontrol === 'CRF') return { crf: 63 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'libsvtav1') {
		if (ratecontrol === 'CRF') return { crf: 63 - sv };
		if (ratecontrol === 'CQP') return { qp: 63 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'av1_qsv') {
		if (ratecontrol === 'Q') return { q: 255 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}

	// HEVC
	if (vcodec === 'libx265') {
		if (ratecontrol === 'CRF') return { crf: 51 - sv };
		if (ratecontrol === 'CQP') return { qp: 70 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'hevc_qsv') {
		if (ratecontrol === 'Q') return { q: sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'hevc_nvenc') {
		if (ratecontrol === 'VBR') return { rc: 'vbr', cq: 51 - sv };
		if (ratecontrol === 'VBR_HQ') return { rc: 'vbr_hq', cq: 51 - sv };
		if (ratecontrol === 'CQP') return { qp: 51 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'hevc_amf') {
		if (ratecontrol === 'CQP') return { qp_i: 51 - sv, qp_p: 51 - sv };
		if (ratecontrol === 'CBR') return { rc: 'vbr', 'b:v': Math.round(62500 * Math.pow(2, sv)) };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'hevc_videotoolbox') {
		if (ratecontrol === 'Q') return { q: sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}

	// H.264
	if (vcodec === 'libx264' || vcodec === 'libx264rgb') {
		if (ratecontrol === 'CRF') return { crf: 51 - sv };
		if (ratecontrol === 'CQP') return { qp: 70 - sv };
		if (ratecontrol === 'CBR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)), minrate: Math.round(62500 * Math.pow(2, sv)), maxrate: Math.round(62500 * Math.pow(2, sv)) };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'h264_qsv') {
		if (ratecontrol === 'Q') return { q: sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'h264_nvenc') {
		if (ratecontrol === 'VBR') return { rc: 'vbr', cq: 51 - sv };
		if (ratecontrol === 'VBR_HQ') return { rc: 'vbr_hq', cq: 51 - sv };
		if (ratecontrol === 'CQP') return { qp: 51 - sv };
		if (ratecontrol === 'CBR') return { cbr: 'true', 'b:v': Math.round(62500 * Math.pow(2, sv)) };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'h264_amf') {
		if (ratecontrol === 'CQP') return { qp_i: 51 - sv, qp_p: 51 - sv };
		if (ratecontrol === 'CBR') return { rc: 'vbr', 'b:v': Math.round(62500 * Math.pow(2, sv)) };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}
	if (vcodec === 'h264_videotoolbox') {
		if (ratecontrol === 'Q') return { q: sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}

	// VP9 / VP8
	if (vcodec === 'libvpx-vp9' || vcodec === 'libvpx') {
		if (ratecontrol === 'CRF') return { crf: 63 - sv };
		if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };
	}

	// 通用
	if (ratecontrol === 'Q') return { q: sv };
	if (ratecontrol === 'ABR') return { 'b:v': Math.round(62500 * Math.pow(2, sv)) };

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

function convertAudioRateValueToDetail(acodec, ratecontrol, ratevalue) {
	var sv = Number(ratevalue);
	if (!isFinite(sv)) return null;

	if (ratecontrol === 'CBR/ABR' || ratecontrol === 'CBR') {
		return { 'b:a': Math.round(8000 * Math.pow(2, sv)) };
	}
	if (ratecontrol === 'Q') {
		return { 'q:a': sv };
	}
	return null;
}

function getAudioParamNames(acodec, ratecontrol) {
	if (ratecontrol === 'CBR/ABR' || ratecontrol === 'CBR') return ['b:a'];
	if (ratecontrol === 'Q') return ['q:a'];
	return [];
}
