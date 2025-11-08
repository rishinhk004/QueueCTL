import { prisma } from '../lib/db.js';
import { JobState } from '../types/job-state.js';

export async function showStats() {
  try {
    // Overall stats
    const totalJobs = await prisma.job.count();
    const completedJobs = await prisma.job.count({
      where: { state: JobState.COMPLETED },
    });
    const failedJobs = await prisma.job.count({
      where: { state: JobState.FAILED },
    });
    const deadJobs = await prisma.job.count({
      where: { state: JobState.DEAD },
    });

    console.log('--- Queue Statistics ---\n');
    console.log(`Total Jobs: ${totalJobs}`);
    console.log(`Completed: ${completedJobs}`);
    console.log(`Failed: ${failedJobs}`);
    console.log(`Dead: ${deadJobs}`);

    if (completedJobs > 0) {
      const successRate = ((completedJobs / totalJobs) * 100).toFixed(2);
      console.log(`Success Rate: ${successRate}%`);
    }

    // Execution time stats for completed jobs
    const completedWithDuration = await prisma.job.findMany({
      where: {
        state: JobState.COMPLETED,
        duration: { not: null },
      },
      select: { duration: true },
    });

    if (completedWithDuration.length > 0) {
      const durations = completedWithDuration
        .map((j) => j.duration!)
        .sort((a, b) => a - b);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = durations[0];
      const maxDuration = durations[durations.length - 1];
      const medianDuration =
        durations[Math.floor(durations.length / 2)];

      console.log('\n--- Execution Time Statistics ---');
      console.log(`Average: ${avgDuration.toFixed(2)}ms`);
      console.log(`Median: ${medianDuration}ms`);
      console.log(`Min: ${minDuration}ms`);
      console.log(`Max: ${maxDuration}ms`);
    }

    // Top 5 slowest jobs
    const slowestJobs = await prisma.job.findMany({
      where: {
        state: JobState.COMPLETED,
        duration: { not: null },
      },
      orderBy: { duration: 'desc' },
      take: 5,
      select: {
        id: true,
        command: true,
        duration: true,
        completed_at: true,
      },
    });

    if (slowestJobs.length > 0) {
      console.log('\n--- Top 5 Slowest Jobs ---');
      slowestJobs.forEach((job) => {
        console.log(
          `${job.id.substring(0, 8)}: ${job.command.substring(0, 40)} - ${job.duration}ms`,
        );
      });
    }

    // Priority distribution
    const priorityStats = await prisma.job.groupBy({
      by: ['priority'],
      _count: { _all: true },
      orderBy: { priority: 'desc' },
    });

    if (priorityStats.length > 0 && priorityStats.some((p) => p.priority !== 0)) {
      console.log('\n--- Priority Distribution ---');
      priorityStats.forEach((stat) => {
        console.log(`Priority ${stat.priority}: ${stat._count._all} jobs`);
      });
    }

    // Jobs with timeouts
    const timeoutJobs = await prisma.job.count({
      where: {
        timeout: { not: null },
      },
    });

    if (timeoutJobs > 0) {
      console.log(`\nJobs with timeout configured: ${timeoutJobs}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
