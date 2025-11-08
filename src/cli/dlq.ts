import { prisma } from '../lib/db.js';
import { listJobs } from './list.js';
import { JobState } from '../types/job-state.js';

export async function listDlq() {
  await listJobs(JobState.DEAD);
}

export async function retryDlqJob(jobId: string) {
  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId, state: JobState.DEAD },
    });

    if (!job) {
      console.error(`Error: Job ${jobId} not found in DLQ.`);
      return;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        state: JobState.PENDING,
        attempts: 0,
        next_run_at: new Date(),
      },
    });

    console.log(`Job ${jobId} moved from DLQ to 'pending' queue.`);
  } catch (e) {
    console.error(`Error retrying job ${jobId}:`, e);
  } finally {
    await prisma.$disconnect();
  }
}