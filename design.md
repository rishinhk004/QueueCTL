# QueueCTL - System Design Document

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Models](#data-models)
5. [Job Lifecycle & State Machine](#job-lifecycle--state-machine)
6. [Concurrency & Locking](#concurrency--locking)
7. [Retry & Backoff Strategy](#retry--backoff-strategy)
8. [Bonus Features](#bonus-features)
9. [Design Decisions & Trade-offs](#design-decisions--trade-offs)
10. [Performance Considerations](#performance-considerations)
11. [Security & Limitations](#security--limitations)
12. [Future Enhancements](#future-enhancements)

---

## Overview

**QueueCTL** is a lightweight, CLI-based background job queue system built with Node.js, TypeScript, and SQLite. It provides persistent job storage, multi-worker processing, automatic retries with exponential backoff, and dead letter queue (DLQ) support.

### Key Features
- ✅ **Persistent Storage**: SQLite database ensures jobs survive restarts
- ✅ **Multi-Worker Processing**: Parallel job execution using Node.js cluster
- ✅ **Automatic Retries**: Exponential backoff on failures
- ✅ **Dead Letter Queue**: Track and manage permanently failed jobs
- ✅ **Priority Queues**: Higher priority jobs processed first
- ✅ **Job Timeouts**: Prevent hanging processes
- ✅ **Scheduled Jobs**: Delay execution to specific future times
- ✅ **Output Logging**: Capture and view stdout/stderr
- ✅ **Execution Metrics**: Performance statistics and analytics

### Target Use Cases
- Background task processing (data imports, report generation)
- API webhook retries
- Email/notification queues
- Scheduled maintenance jobs
- Batch processing pipelines

---

## Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Interface                           │
│  (Commander.js - User Commands: enqueue, worker, status, etc.)  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Libraries                             │
├─────────────────┬───────────────┬───────────────┬───────────────┤
│   db.ts         │  executor.ts  │   pid.ts      │  output.ts    │
│ (Prisma Client) │ (Command Exec)│ (Process Mgmt)│ (Formatting)  │
└─────────────────┴───────────────┴───────────────┴───────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Worker Manager (Primary)                     │
│  - Fork worker processes using cluster module                   │
│  - Maintain PID file for process tracking                       │
│  - Handle graceful shutdown (SIGTERM/SIGINT)                    │
│  - Coordinate worker lifecycle                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ├─────────────┬─────────────┬─────────────┐
                  ▼             ▼             ▼             ▼
          ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
          │  Worker 1   │ │  Worker 2   │ │  Worker N   │
          │  (Process)  │ │  (Process)  │ │  (Process)  │
          └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                 │               │               │
                 └───────────────┼───────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   SQLite Database       │
                    │  ┌─────────────────┐    │
                    │  │  Job Table      │    │
                    │  │  - id, command  │    │
                    │  │  - state        │    │
                    │  │  - priority     │    │
                    │  │  - attempts     │    │
                    │  │  - next_run_at  │    │
                    │  │  - ...          │    │
                    │  └─────────────────┘    │
                    │  ┌─────────────────┐    │
                    │  │  Configuration  │    │
                    │  │  - max_retries  │    │
                    │  │  - backoff_base │    │
                    │  └─────────────────┘    │
                    └─────────────────────────┘
```

### Process Model

**Primary Process (Manager)**
- Spawns N worker child processes via `cluster.fork()`
- Writes PID to temp file for status tracking
- Listens for shutdown signals
- Does NOT process jobs directly

**Worker Processes (Runners)**
- Independent Node.js processes
- Poll database for available jobs
- Execute commands via child process
- Update job state in database
- Handle SIGTERM for graceful shutdown

---

## Core Components

### 1. CLI Interface (`src/index.ts`)

**Technology**: Commander.js  
**Responsibility**: Parse user commands and route to appropriate handlers

**Command Structure**:
```typescript
queuectl
├── config
│   └── set <key> <value>      // Set configuration
├── enqueue <command>           // Add job to queue
│   ├── --priority <num>
│   ├── --timeout <seconds>
│   └── --run-at <time>
├── worker
│   ├── start [--count <num>]  // Start workers
│   └── stop                    // Stop all workers
├── status                      // Show queue status
├── list [--state <state>]      // List jobs
├── stats                       // Show execution metrics
├── output <job-id>             // View job details
└── dlq
    ├── list                    // Show dead jobs
    └── retry <job-id>          // Retry failed job
```

### 2. Database Layer (`src/lib/db.ts`)

**Technology**: Prisma ORM + SQLite  
**Responsibility**: Database client initialization and configuration helpers

```typescript
// Prisma Client Singleton
export const prisma = new PrismaClient({
  datasources: {
    db: { url: 'file:./prisma/prisma/dev.db' }
  }
});

// Configuration helpers
export async function getConfigInt(key: string, defaultValue: number): Promise<number>
export async function setConfig(key: string, value: string): Promise<void>
```

**Key Functions**:
- Initialize Prisma client with SQLite connection
- Fetch configuration values (max_retries, backoff_base)
- Set/update configuration

### 3. Command Executor (`src/lib/executor.ts`)

**Technology**: child-process-promise  
**Responsibility**: Execute shell commands with timeout support

```typescript
interface ExecResult {
  success: boolean;   // Exit code === 0
  stdout: string;     // Standard output
  stderr: string;     // Standard error
  timedOut: boolean;  // Whether timeout was triggered
}

export async function executeCommand(
  command: string,
  timeoutSeconds?: number | null
): Promise<ExecResult>
```

**Implementation Details**:
- Uses `exec()` from child-process-promise
- Timeout enforced via `options.timeout` (milliseconds)
- Detects timeout via `err.killed && err.signal === 'SIGTERM'`
- Captures both stdout and stderr streams
- Returns success=false on non-zero exit codes

### 4. Process Management (`src/lib/pid.ts`)

**Responsibility**: Track primary process for worker management

```typescript
// PID file location: OS temp directory
const PID_FILE = path.join(tmpdir(), 'queuectl.pid');

export function writePidFile(): void          // Save current process.pid
export function readPidFile(): number | null  // Read saved PID
export function removePidFile(): void         // Delete PID file
export function isProcessRunning(pid: number): boolean // Check if PID exists
```

**Use Cases**:
- Prevent multiple worker groups from running simultaneously
- Allow `queuectl status` to check if workers are active
- Enable `queuectl worker stop` to find and signal primary process

### 5. Worker Manager (`src/worker/manager.ts`)

**Technology**: Node.js cluster module  
**Responsibility**: Spawn and manage worker processes

```typescript
export async function startWorkers(count: number): Promise<void>
export async function stopWorkers(): Promise<void>
```

**Startup Flow**:
1. Check if workers already running (via PID file)
2. Write current PID to file
3. Fork N worker processes using `cluster.fork()`
4. Register shutdown handlers (SIGINT, SIGTERM)

**Shutdown Flow**:
1. Read PID file to find primary process
2. Send SIGTERM to primary (propagates to workers)
3. Workers finish current jobs
4. Force exit after 1-second timeout
5. Clean up PID file

### 6. Worker Runner (`src/worker/runner.ts`)

**Responsibility**: Core job processing logic

```typescript
export async function startWorker(): Promise<void>

async function fetchAndLockJob(): Promise<Job | null>
async function handleJobResult(
  job: Job, 
  success: boolean, 
  output: string, 
  duration: number,
  timedOut: boolean
): Promise<void>
```

**Main Loop**:
```typescript
while (!isShuttingDown) {
  // 1. Fetch and lock next job (transaction)
  const job = await fetchAndLockJob();
  
  if (job) {
    // 2. Execute command with timeout
    const startTime = Date.now();
    const result = await executeCommand(job.command, job.timeout);
    const duration = Date.now() - startTime;
    
    // 3. Update job state based on result
    await handleJobResult(job, result.success, output, duration, result.timedOut);
  } else {
    // 4. Wait 1 second before next poll
    await sleep(1000);
  }
}
```

---

## Data Models

### Job Table Schema

```prisma
model Job {
  id           String    @id @default(uuid())
  command      String                          // Shell command to execute
  state        String    @default("pending")   // Current state
  priority     Int       @default(0)           // Higher = runs first
  attempts     Int       @default(0)           // Retry count
  max_retries  Int                             // Max retry limit
  timeout      Int?                            // Timeout (seconds, null = none)
  output       String?                         // Captured stdout/stderr
  next_run_at  DateTime  @default(now())       // Scheduled execution time
  started_at   DateTime?                       // When processing started
  completed_at DateTime?                       // When finished (success/fail)
  duration     Int?                            // Execution time (ms)
  created_at   DateTime  @default(now())       // Job creation time
  updated_at   DateTime  @updatedAt            // Last update time
}
```

**Field Purpose**:
- `id`: Unique identifier (UUID v4)
- `command`: Shell command string (e.g., `echo 'hello'`, `node script.js`)
- `state`: One of: `pending`, `processing`, `completed`, `failed`, `dead`
- `priority`: Integer (0-100+), higher values processed first
- `attempts`: Increments on each retry
- `max_retries`: Captured from config at enqueue time (immutable per job)
- `timeout`: Optional execution time limit
- `output`: Combined stdout/stderr from last execution
- `next_run_at`: Controls delayed/scheduled jobs and retry timing
- `started_at`/`completed_at`: Track job lifecycle timing
- `duration`: Actual execution time for metrics

### Configuration Table Schema

```prisma
model Configuration {
  key   String @id    // Configuration key
  value String        // Configuration value (stored as string)
}
```

**Key-Value Pairs**:
- `max_retries`: Default maximum retry attempts (e.g., `"3"`)
- `backoff_base`: Exponential backoff base (e.g., `"2"`)

---

## Job Lifecycle & State Machine

### State Diagram

```
     [User enqueues job]
             │
             ▼
       ┌──────────┐
       │ PENDING  │◄─────────────────┐
       └────┬─────┘                  │
            │                        │
            │ Worker picks up job    │
            │ (next_run_at <= now)   │
            ▼                        │
      ┌────────────┐                 │
      │ PROCESSING │                 │
      └──┬─────┬───┘                 │
         │     │                     │
    ┌────┘     └────┐                │
    │               │                │
    │ Success       │ Failure        │
    │ (exit 0)      │ (exit ≠ 0)     │
    ▼               ▼                │
┌───────────┐   ┌────────┐           │
│ COMPLETED │   │ FAILED │           │
└───────────┘   └───┬────┘           │
                    │                │
                    ├─ attempts < max_retries ──┘
                    │  (set next_run_at = now + backoff)
                    │
                    └─ attempts >= max_retries
                       │
                       ▼
                   ┌──────┐
                   │ DEAD │ (Dead Letter Queue)
                   └──┬───┘
                      │
                      │ Manual retry
                      ▼
                [Reset to PENDING]
```

### State Descriptions

| State | Description | Next States |
|-------|-------------|-------------|
| `pending` | Job waiting to be processed | `processing` |
| `processing` | Currently being executed by a worker | `completed`, `failed` |
| `completed` | Successfully executed (exit code 0) | *(terminal state)* |
| `failed` | Failed execution, eligible for retry | `pending`, `dead` |
| `dead` | Exceeded max retries, in DLQ | `pending` (manual) |

### State Transitions

**1. PENDING → PROCESSING**
```typescript
await prisma.job.update({
  where: { id: job.id, state: 'pending' },  // Optimistic lock
  data: { 
    state: 'processing',
    started_at: new Date()
  }
});
```

**2. PROCESSING → COMPLETED** (Success)
```typescript
await prisma.job.update({
  where: { id: job.id },
  data: {
    state: 'completed',
    output: stdout + stderr,
    completed_at: new Date(),
    duration: executionTimeMs
  }
});
```

**3. PROCESSING → FAILED** (Failure, retries remaining)
```typescript
const newAttempts = job.attempts + 1;
const delaySeconds = Math.pow(backoffBase, newAttempts);
const nextRunAt = new Date(Date.now() + delaySeconds * 1000);

await prisma.job.update({
  where: { id: job.id },
  data: {
    state: 'failed',
    attempts: newAttempts,
    next_run_at: nextRunAt,
    output: stdout + stderr,
    duration: executionTimeMs
  }
});
```

**4. PROCESSING → DEAD** (Failure, max retries exceeded)
```typescript
await prisma.job.update({
  where: { id: job.id },
  data: {
    state: 'dead',
    output: stdout + stderr,
    completed_at: new Date(),
    duration: executionTimeMs
  }
});
```

**5. DEAD → PENDING** (Manual retry via DLQ)
```typescript
await prisma.job.update({
  where: { id: jobId, state: 'dead' },
  data: {
    state: 'pending',
    attempts: 0,
    next_run_at: new Date()
  }
});
```

---

## Concurrency & Locking

### Problem Statement

**Challenge**: Multiple workers polling the same database must not process the same job twice.

**Requirements**:
- Prevent duplicate processing (race conditions)
- Ensure fair distribution across workers
- Maintain job priority ordering
- Handle worker crashes gracefully

### Solution: Transaction-Based Optimistic Locking

**Implementation** (PostgreSQL/MySQL would use `SELECT FOR UPDATE SKIP LOCKED`):

```typescript
async function fetchAndLockJob(): Promise<Job | null> {
  try {
    const job = await prisma.$transaction(async (tx) => {
      // 1. Find next eligible job (READ)
      const nextJob = await tx.job.findFirst({
        where: {
          state: { in: ['pending', 'failed'] },
          next_run_at: { lte: new Date() }  // Only jobs ready to run
        },
        orderBy: [
          { priority: 'desc' },   // High priority first
          { created_at: 'asc' }   // FIFO within same priority
        ]
      });

      if (!nextJob) return null;

      // 2. Lock by updating state (WRITE)
      const updatedJob = await tx.job.update({
        where: {
          id: nextJob.id,
          state: nextJob.state  // Optimistic lock: only update if state unchanged
        },
        data: {
          state: 'processing',
          started_at: new Date()
        }
      });

      return updatedJob;
    });

    return job;
  } catch (error) {
    // Transaction conflict: another worker got this job
    return null;
  }
}
```

**How It Works**:

1. **Atomic Transaction**: `findFirst` + `update` execute as single unit
2. **Optimistic Lock**: `where: { state: nextJob.state }` ensures no race condition
3. **Conflict Detection**: If state changed between READ and WRITE, transaction fails
4. **Graceful Handling**: Worker ignores conflict and tries next job

**Example Race Condition (Prevented)**:

```
Time  | Worker A                   | Worker B
------|----------------------------|----------------------------
t0    | BEGIN TRANSACTION          | BEGIN TRANSACTION
t1    | Find job X (state=pending) | Find job X (state=pending)
t2    | UPDATE job X SET state=    |
      | processing WHERE state=    |
      | pending ✅                 |
t3    | COMMIT ✅                  | UPDATE job X SET state=
      |                            | processing WHERE state=
      |                            | pending ❌ (state is now 
      |                            | 'processing', not 'pending')
t4    |                            | ROLLBACK ❌
```

### Why Not Row-Level Locking?

**SQLite Limitations**:
- No `SELECT FOR UPDATE` support
- No row-level locks (table-level only)
- Transactions serialize writes automatically

**Alternative Considered**: Advisory locks (PostgreSQL `pg_advisory_lock`)
- **Rejected**: Adds complexity, not portable to SQLite

---

## Retry & Backoff Strategy

### Exponential Backoff Formula

```
delay_seconds = backoff_base ^ attempts
```

**Example** (backoff_base=2, max_retries=3):

| Attempt | Calculation | Delay | Total Wait |
|---------|-------------|-------|------------|
| 1       | 2^1         | 2s    | 2s         |
| 2       | 2^2         | 4s    | 6s         |
| 3       | 2^3         | 8s    | 14s        |
| 4       | -           | DLQ   | -          |

### Implementation

```typescript
// On failure
const newAttempts = job.attempts + 1;

if (newAttempts >= job.max_retries) {
  // Move to DLQ
  job.state = 'dead';
} else {
  // Schedule retry
  const backoffBase = await getConfigInt('backoff_base', 2);
  const delaySeconds = Math.pow(backoffBase, newAttempts);
  job.next_run_at = new Date(Date.now() + delaySeconds * 1000);
  job.state = 'failed';
  job.attempts = newAttempts;
}
```

### Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_retries` | 3 | Maximum retry attempts before DLQ |
| `backoff_base` | 2 | Exponential growth factor |

**Customization**:
```bash
# More aggressive retries
queuectl config set max_retries 5
queuectl config set backoff_base 1.5

# Longer delays
queuectl config set backoff_base 3

# No retries
queuectl config set max_retries 0
```

### Why Exponential Backoff?

**Benefits**:
- ✅ Reduces load on failing systems (e.g., down API)
- ✅ Gives transient errors time to resolve
- ✅ Prevents thundering herd on retry

**Trade-offs**:
- ❌ Long delays for higher attempts (2^5 = 32s)
- ❌ May delay urgent jobs if all workers busy

---

## Bonus Features

### 1. Job Timeouts

**Purpose**: Prevent hanging processes from blocking workers indefinitely.

**Usage**:
```bash
queuectl enqueue "long-running-task.sh" --timeout 300  # 5 minutes
```

**Implementation**:
```typescript
// executor.ts
const options: any = {};
if (timeoutSeconds) {
  options.timeout = timeoutSeconds * 1000;  // Convert to ms
}

const { stdout, stderr } = await exec(command, options);

// Detection
if (err.killed && err.signal === 'SIGTERM') {
  return {
    success: false,
    stderr: `Command timed out after ${timeoutSeconds} seconds`,
    timedOut: true
  };
}
```

**Behavior**:
- Process killed via SIGTERM after timeout
- Counted as failed attempt (retries still apply)
- Marked as `timedOut` in result for logging

### 2. Priority Queues

**Purpose**: Critical jobs processed before low-priority tasks.

**Usage**:
```bash
queuectl enqueue "critical-backup.sh" --priority 10
queuectl enqueue "routine-cleanup.sh" --priority 0
```

**Implementation**:
```typescript
// Worker fetches jobs ordered by priority
orderBy: [
  { priority: 'desc' },   // Higher priority first
  { created_at: 'asc' }   // Then FIFO
]
```

**Priority Scale**:
- `0`: Default (normal priority)
- `1-9`: Medium priority
- `10+`: High priority

**Example Execution Order**:
```
Job A: priority=10, created_at=2025-11-08 10:00:00  ← Runs 1st
Job B: priority=10, created_at=2025-11-08 10:00:05  ← Runs 2nd
Job C: priority=5,  created_at=2025-11-08 09:00:00  ← Runs 3rd
Job D: priority=0,  created_at=2025-11-08 08:00:00  ← Runs 4th
```

### 3. Scheduled/Delayed Jobs

**Purpose**: Run jobs at specific future times (cron-like scheduling).

**Usage**:
```bash
# Relative delays
queuectl enqueue "backup.sh" --run-at +30s   # 30 seconds
queuectl enqueue "report.sh" --run-at +5m    # 5 minutes
queuectl enqueue "cleanup.sh" --run-at +2h   # 2 hours
queuectl enqueue "billing.sh" --run-at +1d   # 1 day
```

**Implementation**:
```typescript
// enqueue.ts - Parse relative time
function parseRelativeTime(input: string): Date {
  const match = input.match(/^\+(\d+)(s|m|h|d)$/);
  if (!match) throw new Error('Invalid format');
  
  const [, amount, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = parseInt(amount) * multipliers[unit];
  
  return new Date(Date.now() + seconds * 1000);
}

// runner.ts - Only fetch jobs ready to run
where: {
  next_run_at: { lte: new Date() }  // Only jobs where time has passed
}
```

**Behavior**:
- Job created with `next_run_at` in the future
- Workers ignore job until `next_run_at <= now()`
- No separate scheduler needed (poll-based)

### 4. Job Output Logging

**Purpose**: Inspect detailed execution results for debugging.

**Usage**:
```bash
queuectl output abc-123-def
```

**Output Example**:
```
--- Job abc-123-def ---
Command: node scripts/process-data.js
State: completed
Priority: 5
Attempts: 1/3
Timeout: 30s
Started: 2025-11-08T10:30:45.123Z
Completed: 2025-11-08T10:30:47.456Z
Duration: 2333ms
Created: 2025-11-08T10:30:40.000Z

--- Output ---
STDOUT:
Processing 1000 records...
Success!

STDERR:
Warning: Deprecated API used
```

**Implementation**:
```typescript
// Capture output during execution
const { stdout, stderr } = await exec(command);
const output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

// Store in database
await prisma.job.update({
  where: { id: job.id },
  data: { output }
});

// Display via CLI
const job = await prisma.job.findUnique({ where: { id } });
console.log(formatJobOutput(job));
```

### 5. Execution Metrics & Statistics

**Purpose**: Performance monitoring and bottleneck identification.

**Usage**:
```bash
queuectl stats
```

**Output Example**:
```
--- Queue Statistics ---
Total Jobs: 150
Completed: 120 (80.00%)
Failed: 15 (10.00%)
Dead: 5 (3.33%)
Pending: 10 (6.67%)

--- Execution Time Statistics ---
Average: 1234.56ms
Median: 987ms
Min: 123ms
Max: 5678ms
P95: 3456ms

--- Top 5 Slowest Jobs ---
1. abc12345: long-task.sh - 5678ms
2. def67890: report.sh - 4321ms
...

--- Priority Distribution ---
Priority 10: 25 jobs (16.67%)
Priority 5: 40 jobs (26.67%)
Priority 0: 85 jobs (56.67%)

--- Jobs with Timeout ---
Total: 35 (23.33%)
Average Timeout: 120s
```

**Implementation**:
```typescript
// Aggregate queries
const totalJobs = await prisma.job.count();
const completed = await prisma.job.count({ where: { state: 'completed' } });

// Duration statistics
const jobs = await prisma.job.findMany({
  where: { duration: { not: null } },
  select: { duration: true }
});

const durations = jobs.map(j => j.duration).sort((a, b) => a - b);
const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
const median = durations[Math.floor(durations.length / 2)];
const p95 = durations[Math.floor(durations.length * 0.95)];

// Priority distribution
const priorityGroups = await prisma.job.groupBy({
  by: ['priority'],
  _count: true
});
```

---

## Design Decisions & Trade-offs

### 1. SQLite vs. Redis/PostgreSQL

**Chosen**: SQLite

**Rationale**:
- ✅ Zero configuration (no external dependencies)
- ✅ File-based (portable, easy backups)
- ✅ Sufficient for single-machine workloads
- ✅ ACID transactions (data integrity)
- ✅ Good performance for <10 workers

**Trade-offs**:
- ❌ No distributed workers (single-machine only)
- ❌ Limited write concurrency (table-level locks)
- ❌ Not suitable for high-throughput (>1000 jobs/sec)
- ❌ No pub/sub for real-time notifications

**Alternatives Considered**:
- **PostgreSQL**: Better concurrency (`SELECT FOR UPDATE SKIP LOCKED`), but requires server setup
- **Redis**: Faster, pub/sub support, but no relational queries or foreign keys
- **MongoDB**: Document-based flexibility, but overkill for simple queue

### 2. Polling vs. Event-Driven

**Chosen**: Database polling (1-second interval)

**Rationale**:
- ✅ Simple implementation (no event bus)
- ✅ Works with any database (no LISTEN/NOTIFY)
- ✅ Reliable (no missed events)
- ✅ Easy to reason about

**Trade-offs**:
- ❌ ~1 second latency before job pickup
- ❌ Constant database queries (even when idle)
- ❌ Scales poorly to many workers (N queries/second)

**Alternatives Considered**:
- **PostgreSQL LISTEN/NOTIFY**: Real-time, but PostgreSQL-specific
- **Redis Pub/Sub**: Fast, but adds dependency
- **WebSockets**: Requires persistent connections

**Mitigation**:
- Use `setTimeout(1000)` to reduce load during idle
- Future: exponential backoff on empty polls

### 3. Transaction-Based Locking

**Chosen**: Optimistic locking via transactions

**Rationale**:
- ✅ Prevents race conditions
- ✅ Works with SQLite (no `SELECT FOR UPDATE`)
- ✅ Automatic rollback on conflicts
- ✅ No deadlocks

**Trade-offs**:
- ❌ Wasted work on transaction conflicts
- ❌ Retries needed if conflict
- ❌ Doesn't scale to high contention

**Alternatives Considered**:
- **Pessimistic Locking**: `SELECT FOR UPDATE`, but not in SQLite
- **Application-Level Locks**: Complex, error-prone
- **Distributed Locks**: Redis/Zookeeper, overkill

### 4. Node.js Cluster vs. Worker Threads

**Chosen**: Multi-process (`cluster` module)

**Rationale**:
- ✅ Full process isolation (failures don't affect others)
- ✅ Better for shell command execution (separate env)
- ✅ Familiar Unix process model
- ✅ Easier debugging (separate PIDs)

**Trade-offs**:
- ❌ Higher memory overhead (~30MB per worker)
- ❌ No shared memory (must use database)
- ❌ Slower startup than threads

**Alternatives Considered**:
- **Worker Threads**: Lower overhead, but shared memory complexity
- **Child Processes**: Similar to cluster, but less ergonomic

### 5. Exponential Backoff

**Chosen**: `delay = base ^ attempts`

**Rationale**:
- ✅ Industry standard (AWS, GCP, Kafka)
- ✅ Reduces load on failing services
- ✅ Self-healing for transient errors
- ✅ Simple to implement

**Trade-offs**:
- ❌ Long delays for high attempts (2^5 = 32s)
- ❌ May not suit all failure types (e.g., permanent errors)

**Alternatives Considered**:
- **Fixed Delay**: Simpler, but can cause thundering herd
- **Linear Backoff**: More predictable, but less effective
- **Jittered Exponential**: Avoids synchronized retries, but more complex

### 6. Graceful Shutdown

**Chosen**: SIGTERM handler with 1-second timeout

**Rationale**:
- ✅ Allows current jobs to finish
- ✅ Prevents partial state
- ✅ Works with Docker/Kubernetes

**Trade-offs**:
- ❌ May kill long-running jobs prematurely
- ❌ Fixed timeout (not configurable)

**Implementation**:
```typescript
process.on('SIGTERM', () => {
  isShuttingDown = true;
});

// In worker loop
while (!isShuttingDown) {
  await processJob();
}

// In manager
setTimeout(() => process.exit(0), 1000);
```

---

## Performance Considerations

### Scalability Limits

| Metric | Limit | Bottleneck |
|--------|-------|------------|
| Workers | ~10 | SQLite write concurrency |
| Jobs/sec | ~100 | Database locking contention |
| Queue size | 100K+ | Query performance on large tables |
| Job output | 1MB | SQLite `TEXT` column limit |

### Optimization Strategies

**1. Database Indexing**
```sql
-- Accelerate job lookup
CREATE INDEX idx_jobs_state_priority ON Job(state, priority, created_at);
CREATE INDEX idx_jobs_next_run_at ON Job(next_run_at);
```

**2. Connection Pooling**
```typescript
// Prisma default: single connection per process
// For more workers, increase SQLite timeout
const prisma = new PrismaClient({
  datasources: {
    db: { 
      url: 'file:./dev.db?timeout=5000'  // 5s instead of 2s
    }
  }
});
```

**3. Batch Operations**
- Enqueue multiple jobs: `prisma.job.createMany()`
- Bulk status updates: Use `whereIn` queries

**4. Output Truncation**
```typescript
// Prevent massive outputs from bloating database
const MAX_OUTPUT_SIZE = 100000;  // 100KB
const truncated = output.substring(0, MAX_OUTPUT_SIZE);
```

### Monitoring Recommendations

**Key Metrics**:
- Queue depth (pending jobs count)
- Average job duration
- Failure rate (failed/total)
- Worker utilization (processing/total time)
- Transaction conflict rate

**Tools**:
- `queuectl stats` for built-in metrics
- SQLite query logs for slow queries
- System monitoring (CPU, memory) for workers

---

## Security & Limitations

### Security Considerations

**⚠️ CRITICAL WARNINGS**:

1. **Arbitrary Command Execution**
   - Jobs execute shell commands with full user permissions
   - **Risk**: Malicious commands can damage system
   - **Mitigation**: Run workers with restricted user account

2. **No Authentication**
   - CLI assumes trusted local environment
   - **Risk**: Any user can enqueue/manage jobs
   - **Mitigation**: Use file permissions on database

3. **Output Logging**
   - Command output stored in plaintext
   - **Risk**: Sensitive data (passwords, tokens) may leak
   - **Mitigation**: Sanitize output or disable logging

4. **Database Encryption**
   - SQLite database is unencrypted
   - **Risk**: Database file readable by anyone
   - **Mitigation**: Use disk encryption or SQLite encryption extension

### Known Limitations

**1. Windows Command Compatibility**
```bash
# ❌ Unix commands don't work
queuectl enqueue "sleep 5"  # Fails

# ✅ Use Windows equivalents
queuectl enqueue "timeout /t 5"
queuectl enqueue "ping localhost -n 6 > nul"
```

**2. No Job Dependencies**
- Cannot chain jobs (Job B waits for Job A)
- Workaround: Use scheduled delays or external orchestration

**3. No Job Cancellation**
- Processing jobs cannot be stopped mid-execution
- Workaround: Use timeouts

**4. No Job History Cleanup**
- Completed/dead jobs accumulate forever
- Workaround: Manual deletion via Prisma Studio or SQL

**5. Single Database**
- All jobs share one SQLite file
- Workaround: Use separate databases for different apps

**6. No Rate Limiting**
- Workers process jobs as fast as possible
- Workaround: Use scheduled delays or external throttling

---

## Future Enhancements

### Short-Term (Easy Wins)

1. **Job Cancellation**
   ```typescript
   queuectl cancel <job-id>
   // Kill process, mark as cancelled
   ```

2. **Job History Cleanup**
   ```typescript
   queuectl cleanup --older-than 7d --state completed
   // Delete old jobs to reduce database size
   ```

3. **Retry Delay Configuration**
   ```typescript
   queuectl config set retry_delay_type linear|exponential|fixed
   queuectl config set fixed_retry_delay 60  // Always 60s
   ```

4. **Worker Health Checks**
   ```typescript
   queuectl worker status
   // Show last heartbeat, current job, uptime per worker
   ```

5. **JSON Output**
   ```bash
   queuectl status --format json | jq
   # For programmatic access
   ```

### Medium-Term (More Effort)

1. **Job Dependencies**
   ```typescript
   queuectl enqueue "step2.sh" --after <job-id>
   // Chain jobs in sequence
   ```

2. **Cron-like Scheduling**
   ```typescript
   queuectl schedule "backup.sh" --cron "0 2 * * *"
   // Daily at 2 AM
   ```

3. **Web Dashboard**
   - Real-time job monitoring UI
   - Job management (cancel, retry, inspect)
   - Performance charts

4. **Job Templates**
   ```bash
   queuectl template create backup --command "backup.sh" --priority 10
   queuectl enqueue --template backup
   ```

5. **Email Notifications**
   ```typescript
   queuectl enqueue "long-task.sh" --notify-on-failure user@example.com
   ```

### Long-Term (Significant Refactoring)

1. **PostgreSQL/Redis Support**
   - Abstract database layer
   - Better concurrency and performance

2. **Distributed Workers**
   - Workers on multiple machines
   - Shared queue via network database

3. **Job Plugins**
   ```typescript
   // Custom job types beyond shell commands
   queuectl enqueue --type http-webhook --url https://...
   queuectl enqueue --type python-function --module tasks.process
   ```

4. **Dead Letter Queue Actions**
   - Auto-retry after N hours
   - Webhook on DLQ entry
   - Alert integrations (Slack, PagerDuty)

5. **Job Batching**
   ```typescript
   queuectl enqueue-batch jobs.json
   // Process thousands of jobs from file
   ```

6. **Multi-Tenancy**
   - Separate queues per user/project
   - Resource quotas

---

**Document Version**: 1.0  
**Last Updated**: November 8, 2025  
**Author**: Rishiraj Saha
