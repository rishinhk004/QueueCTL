import { prisma } from '../lib/db.js';
import { JobState } from '../types/job-state.js';
import { CliState } from '../types.js';

export async function listJobs(state: CliState) {
  try {
    const where = state === 'all' ? {} : { state: state as JobState };

    const jobs = await prisma.job.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { created_at: 'desc' },
      ],
      take: 50,
    });

    console.log(`--- Showing jobs (state: ${state}) ---`);
    console.table(
      jobs.map((j) => ({
        id: j.id.substring(0, 8),
        state: j.state,
        priority: j.priority || 0,
        command: j.command.substring(0, 40),
        attempts: j.attempts,
        duration: j.duration ? `${j.duration}ms` : '-',
        next_run: j.next_run_at.toISOString(),
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}