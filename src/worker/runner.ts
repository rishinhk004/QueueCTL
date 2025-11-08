import { Job } from '../generated/prisma/index.js';
import { prisma, getConfigInt } from '../lib/db.js';
import { executeCommand } from '../lib/executor.js';
import { JobState } from '../types/job-state.js';

async function fetchAndLockJob(): Promise<Job | null> {
  try {
    const job = await prisma.$transaction(async (tx) => {
      const nextJob = await tx.job.findFirst({
        where: {
          state: { in: [JobState.PENDING, JobState.FAILED] },
          next_run_at: { lte: new Date() },
        },
        orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
      });

      if (!nextJob) {
        return null;
      }

      const updatedJob = await tx.job.update({
        where: {
          id: nextJob.id,
          state: nextJob.state,
        },
        data: {
          state: JobState.PROCESSING,
          started_at: new Date(),
          updated_at: new Date(),
        },
      });
      return updatedJob;
    });
    return job;
  } catch (error) {
    return null;
  }
}

async function handleJobResult(
  job: Job,
  success: boolean,
  output: string,
  duration: number,
  timedOut: boolean = false,
) {
  const backoffBase = await getConfigInt('backoff_base', 2);
  const completedAt = new Date();

  if (success) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        state: JobState.COMPLETED,
        output,
        completed_at: completedAt,
        duration,
      },
    });
    console.log(
      `[Worker ${process.pid}] [Completed] Job ${job.id} (${duration}ms)`,
    );
  } else {
    const newAttempts = job.attempts + 1;
    const failureReason = timedOut ? 'timeout' : 'max retries';

    if (newAttempts >= job.max_retries) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          state: JobState.DEAD,
          output,
          completed_at: completedAt,
          duration,
        },
      });
      console.log(
        `[Worker ${process.pid}] [Dead] Job ${job.id} (${failureReason})`,
      );
    } else {
      const delaySeconds = Math.pow(backoffBase, newAttempts);
      const nextRunAt = new Date(Date.now() + delaySeconds * 1000);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          state: JobState.FAILED,
          attempts: newAttempts,
          next_run_at: nextRunAt,
          output,
          duration,
        },
      });
      console.log(
        `[Worker ${process.pid}] [Failed] Job ${job.id} (attempt ${newAttempts}). Retrying in ${delaySeconds}s`,
      );
    }
  }
}

export async function startWorker() {
  console.log(`[Worker ${process.pid}] Starting...`);

  let isShuttingDown = false;
  process.on('SIGTERM', () => {
    console.log(
      `[Worker ${process.pid}] Shutdown signal received. Finishing current job.`,
    );
    isShuttingDown = true;
  });

  while (!isShuttingDown) {
    const job = await fetchAndLockJob();

    if (job) {
      console.log(
        `[Worker ${process.pid}] [Processing] Job ${job.id} - ${job.command}`,
      );

      const startTime = Date.now();
      const { success, stdout, stderr, timedOut } = await executeCommand(
        job.command,
        job.timeout,
      );
      const duration = Date.now() - startTime;

      const output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
      await handleJobResult(job, success, output, duration, timedOut);
    } else {
      if (!isShuttingDown) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.log(`[Worker ${process.pid}] Exiting.`);
  await prisma.$disconnect();
}