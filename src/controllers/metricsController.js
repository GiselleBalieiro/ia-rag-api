import { getWhatsappStatus } from './whatsapp.js';

export function healthCheck(req, res) {
  const memUsage = process.memoryUsage();

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: `${(process.uptime() / 60).toFixed(2)} minutos`,
    memory: {
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
    },
  };

  res.status(200).json(health);
}

export function getMetrics(req, res) {
  try {
    const memUsage = process.memoryUsage();
    const connectionMetrics = getConnectionMetrics();

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        minutes: `${(process.uptime() / 60).toFixed(2)} min`,
        hours: `${(process.uptime() / 3600).toFixed(2)} h`,
      },
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
        percentUsed: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2)}%`,
      },
      connections: connectionMetrics,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    };

    res.status(200).json(metrics);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Erro ao obter métricas',
      error: err.message,
    });
  }
}

function getConnectionMetrics() {
  const allStatuses = getWhatsappStatus();
  const metrics = {
    total: Object.keys(allStatuses).length,
    byStatus: {},
  };

  for (const id in allStatuses) {
    const status = allStatuses[id]?.status || 'unknown';
    metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
  }

  return metrics;
}
