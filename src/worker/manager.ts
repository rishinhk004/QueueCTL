import cluster from 'cluster';
import { startWorker } from './runner.js';
import { prisma } from '../lib/db.js';
import {
  writePidFile,
  readPidFile,
  removePidFile,
  isProcessRunning,
} from '../lib/pid.js';

export async function startWorkers(count: number) {
  if (cluster.isPrimary) {
    const pid = readPidFile();
    if (pid && isProcessRunning(pid)) {
      console.error(
        `Workers are already running (PID: ${pid}). Use 'worker stop' first.`,
      );
      await prisma.$disconnect();
      return;
    }

    writePidFile();
    console.log(`[Primary ${process.pid}] Starting ${count} workers...`);

    for (let i = 0; i < count; i++) {
      cluster.fork();
    }

    const shutdown = () => {
      console.log('[Primary] Shutting down all workers...');
      removePidFile();
      for (const id in cluster.workers) {
        cluster.workers[id]?.process.kill('SIGTERM');
      }
      setTimeout(() => process.exit(0), 1000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    startWorker();
  }
}

export async function stopWorkers() {
  try {
    const pid = readPidFile();
    if (!pid) {
      console.log('Workers are not running.');
      return;
    }

    if (!isProcessRunning(pid)) {
      console.log('Stale PID file found. Cleaning up.');
      removePidFile();
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent stop signal to primary process (PID: ${pid}).`);
    } catch (err: any) {
      console.error(`Error stopping workers: ${err.message}`);
      if (err.code === 'ESRCH') {
        removePidFile();
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}