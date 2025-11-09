# QueueCTL

A robust CLI-based background job queue system with retry logic, exponential backoff, and Dead Letter Queue (DLQ) support.

## Features

- **Persistent Job Storage**: SQLite database ensures jobs survive application restarts
- **Multiple Workers**: Process jobs in parallel with automatic locking
- **Retry Logic**: Failed jobs automatically retry with exponential backoff
- **Dead Letter Queue**: Track and manage jobs that exceed retry limits
- **Configuration Management**: Easily configure retry behavior via CLI
- **Graceful Shutdown**: Workers finish current jobs before exiting

###  Bonus Features

- **Job Timeouts**: Configurable timeout limits to prevent hanging jobs
- **Priority Queues**: Higher priority jobs are processed first
- **Scheduled/Delayed Jobs**: Schedule jobs to run at a specific future time
- **Job Output Logging**: View detailed output and execution info for any job
- **Metrics & Stats**: Comprehensive execution statistics and performance metrics

---

## Demo Video

**[Watch the CLI Demo](https://drive.google.com/file/d/14wdb7y16OxV9tbYmZ6ty59C6ixx_ZZ4K/view?usp=sharing)**

A working demonstration of all QueueCTL features including configuration, job enqueuing, worker management, priority queues, timeouts, scheduled jobs, and monitoring.

---

## 1. Setup Instructions

### Prerequisites
- Node.js 18+ 
- pnpm (or npm/yarn)

### Installation

```bash
# Navigate to project directory
cd queuectl

# Install dependencies
pnpm install

# Run database migrations
pnpm prisma migrate dev --name init

# Build the project
pnpm build

# Link globally (makes 'queuectl' available system-wide)
pnpm link --global
```

### Verify Installation

```bash
queuectl --help
queuectl --version
```

Now `queuectl` is available globally from any directory!

---

## 2. Usage Examples

### Basic Workflow

```bash
# 1. Set configuration
queuectl config set max_retries 2
queuectl config set backoff_base 2

# 2. Enqueue jobs
queuectl enqueue "echo 'Job 1: Success'"
queuectl enqueue "echo 'Job 2: Another Task'"
queuectl enqueue "exit 1"  # This will fail and retry

# 3. Start workers
queuectl worker start --count 2

# 4. Check status (in another terminal)
queuectl status

# 5. List jobs
queuectl list --state all

# 6. View Dead Letter Queue
queuectl dlq list

# 7. Stop workers
queuectl worker stop
```

### Command Reference with Examples

#### Configuration Management

```bash
# Set maximum retry attempts
queuectl config set max_retries 3
# Output: Config updated: max_retries = 3

# Set exponential backoff base
queuectl config set backoff_base 2
# Output: Config updated: backoff_base = 2
```

#### Enqueuing Jobs

```bash
# Simple command
queuectl enqueue "echo 'Hello World'"
# Output: Enqueued job abc-123-def: echo 'Hello World'

# With priority (higher = runs first)
queuectl enqueue "important-task.sh" --priority 10

# With timeout (30 seconds)
queuectl enqueue "long-task.sh" --timeout 30

# Schedule for later (run in 5 minutes)
queuectl enqueue "backup.sh" --run-at +5m

# Combine all options
queuectl enqueue "critical-backup.sh" --priority 10 --timeout 300 --run-at +1h

# Script execution
queuectl enqueue "node scripts/process-data.js"

# API calls
queuectl enqueue "curl -X POST https://api.example.com/webhook"

# Windows commands
queuectl enqueue "timeout /t 5 && echo 'Delayed task'"
```

#### Worker Management

```bash
# Start single worker
queuectl worker start
# Output: [Primary 12345] Starting 1 workers...

# Start multiple workers
queuectl worker start --count 4
# Output: [Primary 12345] Starting 4 workers...
#         [Worker 12346] Starting...
#         [Worker 12347] Starting...
#         [Worker 12348] Starting...
#         [Worker 12349] Starting...

# Stop all workers
queuectl worker stop
# Output: Sent stop signal to primary process (PID: 12345).
```

#### Monitoring & Status

```bash
# View queue status
queuectl status
# Output:
# --- Job Queue Status ---
# ┌─────────┬─────────────┬───────┐
# │ (index) │ State       │ Count │
# ├─────────┼─────────────┼───────┤
# │ 0       │ 'pending'   │ 5     │
# │ 1       │ 'processing'│ 2     │
# │ 2       │ 'completed' │ 10    │
# │ 3       │ 'failed'    │ 1     │
# │ 4       │ 'dead'      │ 1     │
# └─────────┴─────────────┴───────┘
# 
# Workers are RUNNING (Primary PID: 12345)

# View execution statistics and metrics
queuectl stats
# Output:
# --- Queue Statistics ---
# Total Jobs: 150
# Completed: 120
# Failed: 15
# Dead: 5
# Success Rate: 80.00%
#
# --- Execution Time Statistics ---
# Average: 1234.56ms
# Median: 987ms
# Min: 123ms
# Max: 5678ms
#
# --- Top 5 Slowest Jobs ---
# abc12345: long-running-task.sh - 5678ms
# ...
#
# --- Priority Distribution ---
# Priority 10: 25 jobs
# Priority 0: 60 jobs

# View detailed job output
queuectl output <job-id>
# Output:
# --- Job abc123 ---
# Command: echo "test"
# State: completed
# Priority: 5
# Attempts: 1/3
# Timeout: 30s
# Started: 2025-11-08T13:00:00.000Z
# Completed: 2025-11-08T13:00:01.000Z
# Duration: 1234ms
# Created: 2025-11-08T12:59:00.000Z
#
# --- Output ---
# STDOUT:
# test
#
# STDERR:

# List all jobs (with priority and duration info)
queuectl list --state all

# List only pending jobs
queuectl list --state pending

# List only completed jobs
queuectl list --state completed
```

#### Dead Letter Queue Management

```bash
# View failed jobs in DLQ
queuectl dlq list
# Output:
# --- Showing jobs (state: dead) ---
# ┌─────────┬──────────────┬────────┬──────────┬──────────┬─────────────────┐
# │ (index) │ id           │ state  │ command  │ attempts │ updated_at      │
# ├─────────┼──────────────┼────────┼──────────┼──────────┼─────────────────┤
# │ 0       │ 'abc-123'    │ 'dead' │ 'exit 1' │ 2        │ '2025-11-08...' │
# └─────────┴──────────────┴────────┴──────────┴──────────┴─────────────────┘

# Retry a specific job from DLQ
queuectl dlq retry abc-123
# Output: Job abc-123 moved from DLQ to 'pending' queue.
```

### Real-World Use Cases

```bash
# High-priority critical tasks
queuectl enqueue "node scripts/process-payments.js" --priority 10 --timeout 300

# Batch data processing with timeout protection
queuectl enqueue "node scripts/import-users.js" --timeout 600
queuectl enqueue "node scripts/generate-reports.js" --timeout 300
queuectl enqueue "node scripts/cleanup-temp-files.js"

# Scheduled maintenance tasks
queuectl enqueue "node scripts/database-backup.js" --run-at +2h --priority 5
queuectl enqueue "node scripts/cleanup-old-logs.js" --run-at +1d

# Email notifications (with retry on failure)
queuectl enqueue "node scripts/send-newsletter.js" --priority 3

# API integrations with timeout
queuectl enqueue "curl -X POST https://webhook.site/... -d '{\"status\":\"completed\"}'" --timeout 30

# Image processing
queuectl enqueue "convert input.jpg -resize 800x600 output.jpg"
```

---

## 3. Architecture Overview

### Job Lifecycle

```
┌─────────┐
│ PENDING │ ◄─── Job enqueued with default state
└────┬────┘
     │
     │ Worker picks up job (transaction lock)
     ▼
┌────────────┐
│ PROCESSING │ ◄─── State updated within transaction
└──┬─────┬───┘
   │     │
   │     │ Exit code = 0 (Success)
   │     ▼
   │   ┌───────────┐
   │   │ COMPLETED │ ◄─── Job finished successfully
   │   └───────────┘
   │
   │ Exit code ≠ 0 (Failure)
   ▼
┌────────┐
│ FAILED │ ◄─── Scheduled for retry with exponential backoff
└───┬────┘      (delay = backoff_base ^ attempts)
    │
    │ Retry after delay (next_run_at)
    │
    ├─── If attempts < max_retries ──► Back to PENDING
    │
    │ If attempts >= max_retries
    ▼
┌──────┐
│ DEAD │ ◄─── Moved to Dead Letter Queue
└──────┘
    │
    │ Manual intervention
    │
    └─── queuectl dlq retry <job-id> ──► Back to PENDING
```

### Data Persistence

**Database**: SQLite (via Prisma ORM)  
**Location**: `prisma/prisma/dev.db`

**Schema**:
```prisma
model Configuration {
  key   String @id      // Configuration key (e.g., "max_retries")
  value String          // Configuration value (stored as string)
}

model Job {
  id           String    @id @default(uuid())  // Unique job identifier
  command      String                          // Shell command to execute
  state        String    @default("pending")   // Current state
  priority     Int       @default(0)           // Job priority (higher = runs first)
  attempts     Int       @default(0)           // Number of retry attempts
  max_retries  Int                             // Maximum allowed retries
  timeout      Int?                            // Timeout in seconds (null = no timeout)
  output       String?                         // Command stdout/stderr
  next_run_at  DateTime  @default(now())       // Scheduled execution time
  started_at   DateTime?                       // When job started processing
  completed_at DateTime?                       // When job finished
  duration     Int?                            // Execution time in milliseconds
  created_at   DateTime  @default(now())       // Job creation timestamp
  updated_at   DateTime  @updatedAt            // Last update timestamp
}
```

### Worker Logic

**Architecture**: Multi-process using Node.js `cluster` module

**Primary Process**:
- Manages worker lifecycle
- Forks worker processes
- Handles graceful shutdown
- Maintains PID file for process tracking

**Worker Processes**:
- Poll database for jobs (1-second interval when idle)
- Use transactions to lock jobs (prevent duplicate processing)
- Execute commands via `child-process-promise` with optional timeout
- Track execution time (started_at, completed_at, duration)
- Update job state based on exit code
- Calculate retry delays with exponential backoff

**Locking Mechanism**:
```typescript
// Transaction-based optimistic locking with priority
await prisma.$transaction(async (tx) => {
  // 1. Find next eligible job (ordered by priority, then creation time)
  const job = await tx.job.findFirst({
    where: {
      state: { in: ['pending', 'failed'] },
      next_run_at: { lte: new Date() }
    },
    orderBy: [
      { priority: 'desc' },
      { created_at: 'asc' }
    ]
  });
  
  // 2. Lock by updating state and track start time
  await tx.job.update({
    where: { id: job.id, state: job.state },
    data: { 
      state: 'processing',
      started_at: new Date()
    }
  });
});
```

### Retry Logic

**Exponential Backoff Formula**:
```
delay_seconds = backoff_base ^ attempts
```

**Example** (max_retries=2, backoff_base=2):
```
Initial attempt  → Fails (exit code ≠ 0)
Attempt 1        → Wait 2^1 = 2 seconds → Retry → Fails
Attempt 2        → Wait 2^2 = 4 seconds → Retry → Fails
Exceeded max     → Move to DLQ (state='dead')
```

---

## 4. Assumptions & Trade-offs

### Design Decisions

1. **SQLite vs. Redis/PostgreSQL**
   - **Chosen**: SQLite
   - **Rationale**: Simpler setup, no external dependencies, sufficient for single-machine use cases
   - **Trade-off**: Not suitable for distributed systems or high-throughput scenarios

2. **Polling vs. Event-Driven**
   - **Chosen**: Database polling (1-second interval)
   - **Rationale**: Simpler implementation, reliable job discovery
   - **Trade-off**: Slight latency (up to 1 second), more database queries

3. **Transaction-Based Locking**
   - **Chosen**: Prisma transactions with optimistic locking
   - **Rationale**: Prevents race conditions, works with SQLite
   - **Trade-off**: Possible transaction conflicts under high concurrency

4. **Job State as String vs. Enum**
   - **Chosen**: String (SQLite doesn't support native enums)
   - **Rationale**: Compatibility with SQLite
   - **Trade-off**: Less type safety at database level (mitigated by TypeScript enum)

5. **Cluster Module vs. Worker Threads**
   - **Chosen**: Node.js `cluster` (multi-process)
   - **Rationale**: Full process isolation, better for running shell commands
   - **Trade-off**: Higher memory overhead than threads

6. **Graceful Shutdown**
   - **Chosen**: SIGTERM/SIGINT handlers with 1-second timeout
   - **Rationale**: Allow current jobs to finish
   - **Trade-off**: Workers may be forcefully killed if jobs take too long

### Simplifications Made

1. ~~**No Job Priorities**~~: ✅ **IMPLEMENTED** - Jobs can have priority levels (higher = runs first)
2. **No Job Dependencies**: Jobs cannot wait for other jobs to complete
3. ~~**No Job Timeout**~~: ✅ **IMPLEMENTED** - Jobs can have configurable timeout limits
4. ~~**No Cron/Scheduling**~~: ✅ **IMPLEMENTED** - Jobs can be scheduled for future execution
5. ~~**No Job Output Streaming**~~: ✅ **IMPLEMENTED** - Output is captured and can be viewed via CLI
6. **No Authentication**: CLI assumes trusted local environment
7. **Basic Error Handling**: Limited retry strategies (only exponential backoff)

### Known Limitations

1. **Windows Command Compatibility**: Some Unix commands (e.g., `sleep`) not available
   - Solution: Use Windows equivalents (`timeout`, `ping`, etc.)

2. **Database Concurrency**: SQLite has limited write concurrency
   - Impact: May bottleneck with many workers (>10)

3. **No Distributed Workers**: All workers must run on same machine
   - Impact: Cannot scale horizontally across multiple servers

4. **PID File Location**: Stored in OS temp directory
   - Impact: May be cleaned up by system, causing stale PID issues

5. **No Job History Cleanup**: Completed/dead jobs accumulate in database
   - Impact: Database grows indefinitely without manual cleanup

---

## 5. Testing Instructions

### Automated Test Suite (Windows)

Run the PowerShell test script:

```bash
.\test-suite.ps1
```

This will:
1. Clean database
2. Set configuration
3. Enqueue test jobs
4. Start workers
5. Verify all scenarios

### Manual Testing

#### Test 1: Basic Job Completion

```bash
# Enqueue a simple successful job
queuectl enqueue "echo 'Hello World'"

# Start a worker
queuectl worker start

# Wait a few seconds, then check status
queuectl status

# Verify job is completed
queuectl list --state completed
```

**Expected**: Job completes with state='completed', attempts=0

#### Test 2: Failed Job with Retry

```bash
# Set retry configuration
queuectl config set max_retries 2
queuectl config set backoff_base 2

# Enqueue a failing job
queuectl enqueue "exit 1"

# Start worker (keep it running)
queuectl worker start

# Watch worker logs for:
# - [Failed] Job <id> (attempt 1). Retrying in 2s
# - [Failed] Job <id> (attempt 2). Retrying in 4s
# - [Dead] Job <id> (max retries)

# Verify job is in DLQ
queuectl dlq list
```

**Expected**: Job fails, retries twice (2s, 4s delays), then moves to DLQ

#### Test 3: Multiple Workers (No Overlap)

```bash
# Enqueue multiple jobs
queuectl enqueue "echo 'Job 1'"
queuectl enqueue "echo 'Job 2'"
queuectl enqueue "echo 'Job 3'"
queuectl enqueue "echo 'Job 4'"

# Start 2 workers
queuectl worker start --count 2

# Watch logs to verify:
# - Worker <pid1> processes some jobs
# - Worker <pid2> processes other jobs
# - No job processed by both workers
```

**Expected**: Jobs distributed across workers, no duplicates

#### Test 4: Invalid Command Handling

```bash
# Enqueue an invalid command
queuectl enqueue "nonexistent-command-xyz"

# Start worker
queuectl worker start

# Check job fails gracefully
queuectl list --state dead
```

**Expected**: Job fails with "Command not found" error, moves to DLQ after retries

#### Test 5: Persistence Across Restarts

```bash
# Enqueue jobs
queuectl enqueue "echo 'Job 1'"
queuectl enqueue "echo 'Job 2'"

# Check status (workers not started)
queuectl status

# Restart your terminal or reboot

# Check status again
queuectl status

# Start workers
queuectl worker start
```

**Expected**: Jobs still in database, process successfully after restart

#### Test 6: DLQ Retry

```bash
# Get a job ID from DLQ
queuectl dlq list

# Retry the job
queuectl dlq retry <job-id>

# Start worker to process it
queuectl worker start

# Verify job state changed
queuectl list --state all
```

**Expected**: Job moves from 'dead' → 'pending', attempts reset to 0

---

## 6. Bonus Features Testing

### Test 7: Job Timeout

```bash
# Set configuration
queuectl config set max_retries 2

# Enqueue a job that will exceed timeout (Windows)
queuectl enqueue "timeout /t 30" --timeout 5

# Start worker
queuectl worker start

# Watch worker logs for:
# - [Worker <pid>] [Processing] Job <id>
# - [Worker <pid>] [Failed] Job <id> (attempt 1). Retrying in 2s
# After retries:
# - [Worker <pid>] [Dead] Job <id> (timeout)

# Verify job output shows timeout message
queuectl output <job-id>
```

**Expected**: Job times out after 5 seconds, retries, then moves to DLQ

### Test 8: Priority Queues

```bash
# Enqueue jobs with different priorities
queuectl enqueue "echo 'Low priority'" --priority 0
queuectl enqueue "echo 'Medium priority'" --priority 5
queuectl enqueue "echo 'High priority'" --priority 10
queuectl enqueue "echo 'Critical priority'" --priority 20

# Start worker
queuectl worker start

# Watch worker logs - jobs should execute in order:
# - Critical (priority 20)
# - High (priority 10)
# - Medium (priority 5)
# - Low (priority 0)

# Verify execution order
queuectl list --state completed
```

**Expected**: Jobs execute in priority order (highest first), not FIFO

### Test 9: Scheduled/Delayed Jobs

```bash
# Schedule a job for 30 seconds from now
queuectl enqueue "echo 'Future job'" --run-at +30s

# Verify job is pending but not processing
queuectl status
queuectl list --state pending

# Start worker
queuectl worker start

# Watch logs - job should NOT process immediately
# Wait 30+ seconds - job should then process

# Alternative: Schedule with different time units
queuectl enqueue "echo '5 minute delay'" --run-at +5m
queuectl enqueue "echo '2 hour delay'" --run-at +2h
queuectl enqueue "echo '1 day delay'" --run-at +1d
```

**Expected**: Jobs remain pending until scheduled time, then process normally

### Test 10: Job Output Logging

```bash
# Enqueue jobs with different outputs
queuectl enqueue "echo 'Success message'" --priority 5
queuectl enqueue "echo 'Error' 1>&2 && exit 1" --priority 5

# Start worker
queuectl worker start

# Wait for completion
queuectl list --state all

# View detailed output
queuectl output <successful-job-id>
# Should show:
# - Command, state, priority, timing info
# - STDOUT with "Success message"

queuectl output <failed-job-id>
# Should show:
# - Failed state
# - STDERR with "Error"
```

**Expected**: Full job metadata and output (stdout/stderr) displayed

### Test 11: Execution Statistics

```bash
# Enqueue variety of jobs with different characteristics
queuectl enqueue "timeout /t 1" --priority 10  # Fast
queuectl enqueue "timeout /t 3" --priority 5   # Medium
queuectl enqueue "timeout /t 5" --priority 0   # Slow
queuectl enqueue "timeout /t 10" --timeout 15  # With timeout
queuectl enqueue "exit 1"                      # Will fail

# Start workers
queuectl worker start --count 2

# Wait for completion
# View comprehensive statistics
queuectl stats

# Verify output includes:
# - Total jobs, completed, failed, dead counts
# - Success rate percentage
# - Execution time stats (avg, median, min, max)
# - Top 5 slowest jobs
# - Priority distribution
# - Jobs with timeout configured
```

**Expected**: Detailed metrics showing performance and distribution data

### Test 12: Combined Features

```bash
# Enqueue a high-priority, timeout-protected, scheduled job
queuectl enqueue "timeout /t 20" \
  --priority 10 \
  --timeout 25 \
  --run-at +1m

# Start worker
queuectl worker start

# Job should:
# 1. Wait 1 minute before starting (scheduled)
# 2. Start processing (high priority if other jobs present)
# 3. Complete within 25s timeout
# 4. Have timing metrics tracked

# Verify with:
queuectl status
queuectl list --state all
queuectl output <job-id>
queuectl stats
```

**Expected**: All features work together seamlessly


### Database Inspection

```bash
# Open Prisma Studio to view data
pnpm prisma studio

# Or query directly with SQLite
sqlite3 prisma/prisma/dev.db
.tables
SELECT * FROM Job;
SELECT * FROM Configuration;
.quit
```

### Cleanup

```bash
# Stop workers
queuectl worker stop

# Reset database (⚠️ deletes all data)
pnpm prisma migrate reset

# Or just delete the database file
rm prisma/prisma/dev.db
pnpm prisma migrate dev
```

---

## Author

Created by Rishiraj Saha
