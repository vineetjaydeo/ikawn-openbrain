// src/tools/generate_chart.tool.js
'use strict';

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { uploadToR2 } = require('../utils/storage');

const DEFAULT_PALETTE = [
  '#FFC01C', '#0A0F2E', '#3B82F6', '#10B981',
  '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
];

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildDatasets(datasets, chartType) {
  return datasets.map((ds, i) => {
    const color = ds.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    const isPieType = chartType === 'pie' || chartType === 'doughnut';

    const base = {
      label: ds.label || `Dataset ${i + 1}`,
      data: ds.data,
    };

    if (isPieType) {
      // Pie/doughnut: each segment gets its own color
      base.backgroundColor = ds.data.map((_, j) =>
        hexToRgba(DEFAULT_PALETTE[j % DEFAULT_PALETTE.length], 0.85)
      );
      base.borderColor = '#ffffff';
      base.borderWidth = 2;
    } else if (chartType === 'line') {
      base.borderColor = color;
      base.backgroundColor = hexToRgba(color, 0.1);
      base.borderWidth = 2.5;
      base.pointBackgroundColor = color;
      base.pointRadius = 4;
      base.pointHoverRadius = 6;
      base.tension = 0.3;
      base.fill = true;
    } else if (chartType === 'radar') {
      base.borderColor = color;
      base.backgroundColor = hexToRgba(color, 0.2);
      base.borderWidth = 2;
      base.pointBackgroundColor = color;
      base.pointRadius = 3;
    } else {
      // bar
      base.backgroundColor = hexToRgba(color, 0.85);
      base.borderColor = color;
      base.borderWidth = 1;
      base.borderRadius = 4;
    }

    return base;
  });
}

function buildChartConfig(config) {
  const { title, type, labels, datasets, width, height } = config;
  const isPieType = type === 'pie' || type === 'doughnut';
  const isRadar = type === 'radar';

  const chartConfig = {
    type,
    data: {
      labels,
      datasets: buildDatasets(datasets, type),
    },
    options: {
      responsive: false,
      animation: false,
      layout: {
        padding: { top: 10, bottom: 10, left: 10, right: 10 },
      },
      plugins: {
        title: {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          color: '#1F2937',
          padding: { top: 10, bottom: 20 },
        },
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { size: 12 },
            color: '#4B5563',
            padding: 16,
            usePointStyle: true,
          },
        },
        tooltip: {
          enabled: true,
        },
      },
    },
  };

  // Configure scales
  if (!isPieType) {
    chartConfig.options.scales = {
      x: {
        grid: {
          display: !isRadar,
          color: 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          font: { size: 11 },
          color: '#6B7280',
        },
      },
      y: {
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          font: { size: 11 },
          color: '#6B7280',
        },
        beginAtZero: true,
      },
    };

    if (isRadar) {
      delete chartConfig.options.scales;
      chartConfig.options.scales = {
        r: {
          grid: { color: 'rgba(0, 0, 0, 0.08)' },
          pointLabels: { font: { size: 11 }, color: '#4B5563' },
          ticks: { font: { size: 10 }, color: '#6B7280', backdropColor: 'transparent' },
          beginAtZero: true,
        },
      };
    }
  }

  return chartConfig;
}

module.exports = {
  name: 'generate_chart',
  description: 'Generate a chart image (bar, line, pie, doughnut, radar) from data and upload it as a PNG. Returns a downloadable URL.',
  tier: 'direct',
  costTier: 'low',
  parameters: {
    title: { type: 'string', required: true, description: 'Chart title displayed at the top' },
    type: {
      type: 'string',
      required: true,
      description: 'Chart type',
      enum: ['bar', 'line', 'pie', 'doughnut', 'radar'],
    },
    labels: { type: 'array', required: true, description: 'Labels for x-axis or pie segments' },
    datasets: {
      type: 'array',
      required: true,
      description: 'Array of dataset objects with label, data, and optional color',
    },
    width: { type: 'number', required: false, description: 'Image width in pixels (default: 800)' },
    height: { type: 'number', required: false, description: 'Image height in pixels (default: 500)' },
  },
  async execute(config, context) {
    const { title, type, labels, datasets } = config;
    const width = config.width || 800;
    const height = config.height || 500;
    const { brandId = 'ikawn', userId } = context;

    if (!labels || !Array.isArray(labels) || labels.length === 0) {
      return { success: false, data: null, summary: 'No labels provided.' };
    }
    if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
      return { success: false, data: null, summary: 'No datasets provided.' };
    }

    try {
      const chartCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: '#ffffff',
      });

      const chartConfig = buildChartConfig({ title, type, labels, datasets, width, height });
      const pngBuffer = await chartCanvas.renderToBuffer(chartConfig);

      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
      const filename = `${safeTitle}_${Date.now()}.png`;
      const key = `artifacts/${brandId}/${userId}/${Date.now()}_${filename}`;

      const url = await uploadToR2(key, pngBuffer, 'image/png', brandId);

      return {
        success: true,
        data: { url, filename, type, width, height },
        summary: `Generated ${type} chart "${title}" (${width}x${height}) with ${datasets.length} dataset(s).`,
      };
    } catch (err) {
      return { success: false, data: null, summary: `Chart generation failed: ${err.message}` };
    }
  },
};
