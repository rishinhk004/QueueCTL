# QueueCTL Test Suite with Bonus Features
Write-Host "=== QueueCTL Test Suite (Including Bonus Features) ===" -ForegroundColor Cyan

# Clean up any existing data
Write-Host "`n1. Cleaning up..." -ForegroundColor Yellow
Remove-Item "D:\ENGINEERING NOTES\GDSC\interview\queuectl\prisma\prisma\dev.db" -ErrorAction SilentlyContinue
cd "D:\ENGINEERING NOTES\GDSC\interview\queuectl"
pnpm prisma migrate dev --name init --skip-generate | Out-Null
pnpm build | Out-Null

Write-Host "2. Setting config..." -ForegroundColor Yellow
queuectl config set max_retries 2
queuectl config set backoff_base 2

Write-Host "`n3. Enqueuing test jobs (Core Features)..." -ForegroundColor Yellow
Write-Host "   - Job 1: Success job"
queuectl enqueue "echo 'Job 1: Success'"

Write-Host "   - Job 2: Long running job"
queuectl enqueue "timeout /t 3 >nul && echo Job 2: Long Task"

Write-Host "   - Job 3: Failing job (exit 1)"
queuectl enqueue "exit 1"

Write-Host "   - Job 4: Another task"
queuectl enqueue "echo 'Job 4: Another Task'"

Write-Host "`n4. Enqueuing test jobs (Bonus Features)..." -ForegroundColor Yellow
Write-Host "   - Job 5: High priority job"
queuectl enqueue "echo 'Job 5: HIGH PRIORITY'" --priority 10

Write-Host "   - Job 6: Low priority job"
queuectl enqueue "echo 'Job 6: Low priority'" --priority -5

Write-Host "   - Job 7: Job with timeout (will succeed)"
queuectl enqueue "timeout /t 2 >nul && echo 'Job 7: Within timeout'" --timeout 5

Write-Host "   - Job 8: Job with timeout (will timeout)"
queuectl enqueue "timeout /t 10 >nul && echo 'Job 8: Will timeout'" --timeout 3

Write-Host "   - Job 9: Scheduled job (runs in 5 seconds)"
queuectl enqueue "echo 'Job 9: Scheduled job'" --run-at +5s

Write-Host "   - Job 10: Scheduled job (runs in 15 seconds)"
queuectl enqueue "echo 'Job 10: Future job'" --run-at +15s

Write-Host "   - Job 11: Combined features (priority + timeout + scheduled)"
queuectl enqueue "echo 'Job 11: All features'" --priority 5 --timeout 10 --run-at +8s

Write-Host "`n5. Initial status:" -ForegroundColor Yellow
queuectl status

Write-Host "`n6. Starting 2 workers (will run for 20 seconds to test scheduled jobs)..." -ForegroundColor Yellow
$job = Start-Job -ScriptBlock {
    Set-Location "D:\ENGINEERING NOTES\GDSC\interview\queuectl"
    queuectl worker start --count 2
}

Write-Host "   Waiting 20 seconds for jobs to process (including scheduled jobs)..."
Start-Sleep -Seconds 20

Write-Host "`n7. Stopping workers..." -ForegroundColor Yellow
queuectl worker stop
Start-Sleep -Seconds 2
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -ErrorAction SilentlyContinue

Write-Host "`n8. Final status:" -ForegroundColor Yellow
queuectl status

Write-Host "`n9. Execution statistics:" -ForegroundColor Yellow
queuectl stats

Write-Host "`n10. Listing all jobs (showing priority and duration):" -ForegroundColor Yellow
queuectl list --state all

Write-Host "`n11. Checking DLQ:" -ForegroundColor Yellow
queuectl dlq list

Write-Host "`n12. Job output viewing:" -ForegroundColor Yellow
Write-Host "   Run 'queuectl list --state completed' to get a job ID"
Write-Host "   Then run 'queuectl output <job-id>' to view details"

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
Write-Host "`nExpected Results:" -ForegroundColor Gray
Write-Host "`nCore Features:" -ForegroundColor Gray
Write-Host "  Job 1 & 4 (echo commands): Should be COMPLETED" -ForegroundColor Gray
Write-Host "  Job 2 (timeout command): Should be COMPLETED" -ForegroundColor Gray
Write-Host "  Job 3 (exit 1): Should be in DLQ (DEAD) after 2 retry attempts" -ForegroundColor Gray
Write-Host "  Failed jobs should show exponential backoff (2s, 4s delays)" -ForegroundColor Gray
Write-Host "  Multiple workers should process jobs in parallel" -ForegroundColor Gray
Write-Host "`nBonus Features:" -ForegroundColor Gray
Write-Host "  Job 5 (priority 10): Should process BEFORE Job 6" -ForegroundColor Gray
Write-Host "  Job 6 (priority -5): Should process LAST among queued jobs" -ForegroundColor Gray
Write-Host "  Job 7 (timeout 5s, runs 2s): Should COMPLETE successfully" -ForegroundColor Gray
Write-Host "  Job 8 (timeout 3s, runs 10s): Should FAIL/DEAD due to timeout" -ForegroundColor Gray
Write-Host "  Job 9 (scheduled +5s): Should not start immediately, waits 5 seconds" -ForegroundColor Gray
Write-Host "  Job 10 (scheduled +15s): Should process near the end" -ForegroundColor Gray
Write-Host "  Job 11 (combined): Should work with all features together" -ForegroundColor Gray
