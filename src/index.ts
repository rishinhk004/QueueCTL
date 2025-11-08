#!/usr/bin/env node
import { Command } from 'commander';
import { setConfig } from './cli/config.js';
import { enqueueJob } from './cli/enqueue.js';
import { showStatus } from './cli/status.js';
import { listJobs } from './cli/list.js';
import { listDlq, retryDlqJob } from './cli/dlq.js';
import { viewJobOutput } from './cli/output.js';
import { showStats } from './cli/stats.js';
import { startWorkers, stopWorkers } from './worker/manager.js';
import { CliState } from './types.js';

const program = new Command();
program
  .name('queuectl')
  .description('A CLI-based background job queue system')
  .version('1.0.0');

program
  .command('enqueue <command>')
  .description('Add a new job to the queue')
  .option('-p, --priority <number>', 'Job priority (higher = runs first)', '0')
  .option('-t, --timeout <seconds>', 'Job timeout in seconds')
  .option(
    '-r, --run-at <time>',
    'Schedule job (e.g., +30s, +5m, +2h, or ISO timestamp)',
  )
  .action(enqueueJob);

const worker = program.command('worker').description('Manage workers');

worker
  .command('start')
  .description('Start one or more workers')
  .option('-c, --count <number>', 'Number of workers', '1')
  .action((options) => startWorkers(parseInt(options.count)));

worker.command('stop').description('Stop all running workers').action(stopWorkers);

program
  .command('status')
  .description('Show summary of all job states & active workers')
  .action(showStatus);

program
  .command('stats')
  .description('Show execution statistics and metrics')
  .action(showStats);

program
  .command('output <job-id>')
  .description('View detailed output and info for a specific job')
  .action(viewJobOutput);

program
  .command('list')
  .description('List jobs by state')
  .option(
    '-s, --state <state>',
    'Job state (pending, processing, completed, failed, dead, all)',
    'all',
  )
  .action((options) => listJobs(options.state as CliState));

const dlq = program.command('dlq').description('Manage the Dead Letter Queue');

dlq.command('list').description('View all jobs in the DLQ').action(listDlq);

dlq
  .command('retry <job-id>')
  .description('Retry a specific job from the DLQ')
  .action(retryDlqJob);

const config = program
  .command('config')
  .description('Manage system configuration');

config
  .command('set <key> <value>')
  .description('Set a configuration value (e.g., max_retries, backoff_base)')
  .action(setConfig);

program.parse(process.argv);