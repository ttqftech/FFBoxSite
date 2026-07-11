/**
 * FFBox 画质标定 VMAF 分数对比柱状图
 * 依赖: echarts.min.js (通过 <script src="./_shared/js/echarts.min.js"></script> 引入)
 * 数据基于 VMAF v1.0 模型
 */

(function () {
  'use strict';

  var chartDom = document.getElementById('vmaf-chart');
  if (!chartDom) return;

  var myChart = echarts.init(chartDom);

  var categories = ['肉眼无损', '高画质', '良画质', '一般画质', '低画质'];
  var scores = [null, 97, 93, 86, 76];
  var colors = ['#4F46E5', '#6366F1', '#818CF8', '#F59E0B', '#FF6B35'];
  var descriptions = [
    '分数无意义（大量场景满分）',
    '小屏近乎完美，大屏极细微差异',
    '轻微失真，普通观众可接受',
    '明显感知失真，但仍可接受',
    '可见明显失真，适合预览'
  ];

  var option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1A1A2E',
      borderColor: '#1A1A2E',
      textStyle: { color: '#FAF9F6', fontFamily: '"Noto Sans SC","Microsoft YaHei",sans-serif', fontSize: 13 },
      formatter: function (params) {
        var idx = params[0].dataIndex;
        var scoreText = scores[idx] !== null ? '<b>' + scores[idx] + '</b>' : '<b style="color:#EF4444;">N/A（分数无意义）</b>';
        return '<strong>' + categories[idx] + '</strong><br/>'
          + 'VMAF 平均分: ' + scoreText + '<br/>'
          + '<span style="color:#9CA3AF;">' + descriptions[idx] + '</span>';
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '8%',
      top: '8%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#1A1A2E',
        fontFamily: '"Noto Sans SC","Microsoft YaHei",sans-serif',
        fontSize: 13,
        fontWeight: 600
      }
    },
    yAxis: {
      type: 'value',
      name: 'VMAF 分数',
      min: 60,
      max: 105,
      interval: 10,
      nameTextStyle: {
        color: '#6B7280',
        fontFamily: '"Noto Sans SC","Microsoft YaHei",sans-serif',
        fontSize: 12
      },
      axisLabel: {
        color: '#6B7280',
        fontFamily: 'JetBrainsMono,monospace',
        fontSize: 11,
        formatter: '{value}'
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#F3F4F6', type: 'dashed' } }
    },
    series: [
      {
        type: 'bar',
        data: scores.map(function (val, i) {
          var item = {
            value: val !== null ? val : 0,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: colors[i] },
                { offset: 1, color: colors[i] + '88' }
              ]),
              borderRadius: [6, 6, 0, 0],
              shadowBlur: 4,
              shadowColor: 'rgba(0,0,0,0.1)',
              shadowOffsetY: 2
            }
          };
          // 肉眼无损使用特殊样式
          if (val === null) {
            item.itemStyle.color = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#D1D5DB' },
              { offset: 1, color: '#D1D5DB88' }
            ]);
            item.itemStyle.borderColor = '#EF4444';
            item.itemStyle.borderWidth = 2;
            item.itemStyle.borderType = 'dashed';
            item._specialLabel = 'N/A';
          }
          return item;
        }),
        barWidth: '50%',
        label: {
          show: true,
          position: 'top',
          color: '#1A1A2E',
          fontFamily: 'JetBrainsMono,monospace',
          fontSize: 12,
          fontWeight: 'bold',
          formatter: function (params) {
            if (params.data._specialLabel) {
              return params.data._specialLabel;
            }
            return params.value;
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.2)',
            shadowOffsetY: 4
          }
        }
      }
    ]
  };

  myChart.setOption(option);

  // 响应式
  window.addEventListener('resize', function () {
    myChart.resize();
  });
})();
