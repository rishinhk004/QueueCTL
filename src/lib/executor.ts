import { exec } from 'child-process-promise';

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export async function executeCommand(
  command: string,
  timeoutSeconds?: number | null,
): Promise<ExecResult> {
  try {
    const options: any = {};
    if (timeoutSeconds) {
      options.timeout = timeoutSeconds * 1000; // Convert to milliseconds
    }

    const { stdout, stderr } = await exec(command, options);
    return {
      success: true,
      stdout: stdout?.toString() || '',
      stderr: stderr?.toString() || '',
      timedOut: false,
    };
  } catch (err: any) {
    const timedOut = err.killed && err.signal === 'SIGTERM';
    return {
      success: false,
      stdout: err.stdout?.toString() || '',
      stderr: timedOut
        ? `Command timed out after ${timeoutSeconds} seconds`
        : err.stderr?.toString() || 'Command not found or execution failed',
      timedOut,
    };
  }
}