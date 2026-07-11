// FFBox Article 3 ECharts configurations
// 数据基于 VMAF v1.0 模型
(function() {
  'use strict';

  var accent = '#FF6B35';
  var accent2 = '#4F46E5';
  var ink = '#1A1A2E';
  var muted = '#6B7280';
  var rule = '#E5E7EB';

  // Color palette for encoders
  var encoderColors = [
    '#4F46E5', // libx265 - accent2
    '#6366F1', // libx264
    '#FF6B35', // hevc_nvenc - accent
    '#059669', // libsvtav1
    '#D97706', // libaomav1
    '#DC2626', // libvpx-vp9
    '#7C3AED', // mpeg4
    '#0891B2'  // mjpeg
  ];

  // ============================================================
  // Chart 1: Encoder VMAF comparison (grouped bar chart)
  // ============================================================
  (function() {
    var dom = document.getElementById('chart-encoder-compare');
    if (!dom) return;
    var chart = echarts.init(dom);

    var encoders = ['libx265', 'libx264', 'hevc_nvenc', 'libsvtav1', 'libaomav1', 'libvpx-vp9', 'mpeg4', 'mjpeg'];
    var qualityLabels = ['高画质 (97)', '良画质 (93)', '一般画质 (86)', '低画质 (76)'];

    // VMAF 1.0 数据 (null 表示该档位无有效数据)
    var data = {
      'libx265':     [96.86, 93.44, 87.19, 76.66],
      'libx264':     [97.15, 93.48, 86.96, 75.77],
      'hevc_nvenc':  [97.20, 93.03, 87.03, 78.36],
      'libsvtav1':   [96.44, 92.56, 85.51, 75.76],
      'libaomav1':   [96.59, 93.25, 86.40, 77.28],
      'libvpx-vp9':  [96.58, 93.22, 87.31, 77.41],
      'mpeg4':       [97.08, 95.85, 92.66, 87.83],
      'mjpeg':       [null,  86.82, 85.63, 82.23]
    };

    var series = encoders.map(function(enc, i) {
      return {
        name: enc,
        type: 'bar',
        data: data[enc],
        itemStyle: { color: encoderColors[i], borderRadius: [4, 4, 0, 0] },
        barGap: '10%',
        label: {
          show: true,
          position: 'top',
          fontSize: 9,
          color: ink,
          fontWeight: 600,
          formatter: function(p) {
            if (p.value === null || p.value === undefined) return '';
            return p.value.toFixed(1);
          }
        },
        emphasis: {
          itemStyle: { color: encoderColors[i], shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' }
        }
      };
    });

    var option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#fff',
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 },
        formatter: function(params) {
          var s = '<strong>' + params[0].name + '</strong><br/>';
          params.forEach(function(p) {
            if (p.value === null || p.value === undefined) return;
            s += '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + p.color + ';margin-right:6px;"></span>';
            s += p.seriesName + ': <strong>' + p.value.toFixed(2) + '</strong><br/>';
          });
          return s;
        }
      },
      legend: {
        data: encoders,
        bottom: 0,
        textStyle: { fontSize: 10, color: ink },
        itemWidth: 12,
        itemHeight: 9,
        itemGap: 10,
        type: 'scroll'
      },
      grid: {
        left: '3%',
        right: '4%',
        top: '10%',
        bottom: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: qualityLabels,
        axisLabel: { fontSize: 12, color: ink, fontWeight: 600 },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: rule } }
      },
      yAxis: {
        type: 'value',
        name: 'VMAF 分数',
        nameTextStyle: { fontSize: 11, color: muted },
        min: 70,
        max: 100,
        interval: 5,
        axisLabel: { fontSize: 11, color: muted },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      series: series
    };

    chart.setOption(option);
    window.addEventListener('resize', function() { chart.resize(); });
  })();

  // ============================================================
  // Chart 2: Radar chart - VMAF sub-feature contribution
  // ============================================================
  (function() {
    var dom = document.getElementById('chart-radar');
    if (!dom) return;
    var chart = echarts.init(dom);

    var option = {
      tooltip: {
        backgroundColor: '#fff',
        borderColor: rule,
        textStyle: { color: ink, fontSize: 13 }
      },
      legend: {
        data: ['真人电影', '2D动画', '游戏录屏', '低光视频'],
        bottom: 0,
        textStyle: { fontSize: 11, color: ink },
        itemWidth: 14,
        itemHeight: 10
      },
      radar: {
        center: ['50%', '48%'],
        radius: '65%',
        indicator: [
          { name: 'VIF\n信息保真度', max: 100 },
          { name: 'ADM\n细节损失', max: 100 },
          { name: 'Motion\n时域信息', max: 100 },
          { name: 'NEG\n抗噪信噪比', max: 100 },
          { name: 'CAMBI\n色带检测', max: 100 }
        ],
        axisName: { fontSize: 10, color: ink },
        splitArea: {
          areaStyle: { color: ['rgba(79,70,229,0.02)', 'rgba(79,70,229,0.02)', 'rgba(79,70,229,0.02)', 'rgba(79,70,229,0.02)'] }
        },
        splitLine: { lineStyle: { color: rule } },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        data: [
          {
            name: '真人电影',
            value: [85, 80, 65, 45, 30],
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: accent2, width: 2 },
            areaStyle: { color: 'rgba(79,70,229,0.12)' },
            itemStyle: { color: accent2 }
          },
          {
            name: '2D动画',
            value: [70, 55, 30, 25, 85],
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: accent, width: 2 },
            areaStyle: { color: 'rgba(255,107,53,0.12)' },
            itemStyle: { color: accent }
          },
          {
            name: '游戏录屏',
            value: [60, 75, 90, 40, 45],
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: '#059669', width: 2 },
            areaStyle: { color: 'rgba(5,150,105,0.12)' },
            itemStyle: { color: '#059669' }
          },
          {
            name: '低光视频',
            value: [50, 55, 40, 90, 35],
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: '#D97706', width: 2 },
            areaStyle: { color: 'rgba(217,119,6,0.12)' },
            itemStyle: { color: '#D97706' }
          }
        ]
      }]
    };

    chart.setOption(option);
    window.addEventListener('resize', function() { chart.resize(); });
  })();

})();
