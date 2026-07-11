/* FFBox Article 2 - ECharts chart configurations
 * 数据基于 VMAF v1.0 模型
 */

(function () {
  'use strict';

  /* ===== Chart 1: Encoder VMAF Score Comparison Bar Chart ===== */
  var chart1Dom = document.getElementById('chart-encoder-vmaf');
  if (chart1Dom) {
    var chart1 = echarts.init(chart1Dom);

    // VMAF 1.0 数据
    var encoderNames = ['libx265', 'libx264', 'hevc_nvenc', 'libsvtav1', 'libaomav1', 'libvpx-vp9', 'mpeg4', 'mjpeg'];
    var highData   = [96.86, 97.15, 97.20, 96.44, 96.59, 96.58, 97.08, null];
    var goodData   = [93.44, 93.48, 93.03, 92.56, 93.25, 93.22, 95.85, 86.82];
    var fairData   = [87.19, 86.96, 87.03, 85.51, 86.40, 87.31, 92.66, 85.63];
    var lowData    = [76.66, 75.77, 78.36, 75.76, 77.28, 77.41, 87.83, 82.23];

    chart1.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: function (params) {
          var s = '<strong>' + params[0].name + '</strong><br/>';
          params.forEach(function (p) {
            if (p.value === null || p.value === undefined) return;
            s += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + p.color + ';margin-right:6px;"></span>';
            s += p.seriesName + ': <strong>' + p.value.toFixed(2) + '</strong><br/>';
          });
          return s;
        }
      },
      legend: {
        data: ['高画质档 (97)', '良画质档 (93)', '一般画质档 (86)', '低画质档 (76)'],
        bottom: 0,
        textStyle: { color: '#6B7280', fontSize: 11 }
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '8%', containLabel: true },
      xAxis: {
        type: 'category',
        data: encoderNames,
        axisLabel: {
          color: '#1A1A2E',
          fontSize: 11,
          rotate: 20,
          fontFamily: '"JetBrainsMono","Noto Sans SC","Microsoft YaHei",sans-serif'
        },
        axisTick: { alignWithLabel: true }
      },
      yAxis: {
        type: 'value',
        name: 'VMAF 分数',
        min: 70,
        max: 100,
        axisLabel: { color: '#6B7280' },
        nameTextStyle: { color: '#6B7280', fontSize: 12 },
        splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } }
      },
      series: [
        {
          name: '高画质档 (97)',
          type: 'bar',
          data: highData,
          itemStyle: { color: '#4F46E5', borderRadius: [4, 4, 0, 0] },
          barWidth: '10%'
        },
        {
          name: '良画质档 (93)',
          type: 'bar',
          data: goodData,
          itemStyle: { color: '#818CF8', borderRadius: [4, 4, 0, 0] },
          barWidth: '10%'
        },
        {
          name: '一般画质档 (86)',
          type: 'bar',
          data: fairData,
          itemStyle: { color: '#FF6B35', borderRadius: [4, 4, 0, 0] },
          barWidth: '10%'
        },
        {
          name: '低画质档 (76)',
          type: 'bar',
          data: lowData,
          itemStyle: { color: '#FCA5A5', borderRadius: [4, 4, 0, 0] },
          barWidth: '10%'
        }
      ]
    });

    window.addEventListener('resize', function () { chart1.resize(); });
  }

})();
