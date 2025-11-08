import { prisma } from '../lib/db.js';
import { readPidFile, isProcessRunning } from '../lib/pid.js';

export async function showStatus() {
  try {
    const counts = await prisma.job.groupBy({
      by: ['state'],
      _count: {
        _all: true,
      },
    });

    const status = counts.map((c) => ({
      State: c.state,
      Count: c._count._all,
    }));

    console.log('--- Job Queue Status ---');
    console.table(status);

    const pid = readPidFile();
    if (pid && isProcessRunning(pid)) {
      console.log(`\nWorkers are RUNNING (Primary PID: ${pid})`);
    } else {
      console.log('\nWorkers are STOPPED');
    }
  } finally {
    await prisma.$disconnect();
  }
}