import { prisma } from '../lib/db.js';

export async function viewJobOutput(jobId: string) {
  try {
    // Support partial ID matching (for the truncated IDs shown in list)
    const job = await prisma.job.findFirst({
      where: { id: { startsWith: jobId } },
    });

    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    console.log(`--- Job ${job.id} ---`);
    console.log(`Command: ${job.command}`);
    console.log(`State: ${job.state}`);
    console.log(`Priority: ${job.priority || 0}`);
    console.log(`Attempts: ${job.attempts}/${job.max_retries}`);
    if (job.timeout) {
      console.log(`Timeout: ${job.timeout}s`);
    }
    if (job.started_at) {
      console.log(`Started: ${job.started_at.toISOString()}`);
    }
    if (job.completed_at) {
      console.log(`Completed: ${job.completed_at.toISOString()}`);
    }
    if (job.duration) {
      console.log(`Duration: ${job.duration}ms`);
    }
    console.log(`Created: ${job.created_at.toISOString()}`);

    if (job.output) {
      console.log('\n--- Output ---');
      console.log(job.output);
    } else {
      console.log('\nNo output available yet.');
    }
  } finally {
    await prisma.$disconnect();
  }
}
