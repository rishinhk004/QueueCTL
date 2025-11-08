import { prisma, getConfigInt } from '../lib/db.js';

interface EnqueueOptions {
  priority?: string;
  timeout?: string;
  runAt?: string;
}

export async function enqueueJob(command: string, options: EnqueueOptions = {}) {
  try {
    const maxRetries = await getConfigInt('max_retries', 3);
    const priority = options.priority ? parseInt(options.priority) : 0;
    const timeout = options.timeout ? parseInt(options.timeout) : null;

    let nextRunAt = new Date();
    if (options.runAt) {
      // Parse run_at - supports relative (e.g., +30s, +5m, +2h) or ISO timestamp
      const runAtStr = options.runAt;
      if (runAtStr.startsWith('+')) {
        const match = runAtStr.match(/^\+(\d+)([smhd])$/);
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2];
          const multipliers: Record<string, number> = {
            s: 1000,
            m: 60000,
            h: 3600000,
            d: 86400000,
          };
          nextRunAt = new Date(Date.now() + amount * multipliers[unit]);
        } else {
          throw new Error(
            'Invalid run_at format. Use +30s, +5m, +2h, +1d or ISO timestamp',
          );
        }
      } else {
        nextRunAt = new Date(runAtStr);
        if (isNaN(nextRunAt.getTime())) {
          throw new Error('Invalid run_at timestamp');
        }
      }
    }

    const job = await prisma.job.create({
      data: {
        command: command,
        max_retries: maxRetries,
        priority: priority,
        timeout: timeout,
        next_run_at: nextRunAt,
      },
    });

    const scheduledMsg =
      options.runAt && nextRunAt > new Date()
        ? ` (scheduled for ${nextRunAt.toISOString()})`
        : '';
    const priorityMsg = priority !== 0 ? ` [priority: ${priority}]` : '';
    const timeoutMsg = timeout ? ` [timeout: ${timeout}s]` : '';

    console.log(
      `Enqueued job ${job.id}: ${job.command}${priorityMsg}${timeoutMsg}${scheduledMsg}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}