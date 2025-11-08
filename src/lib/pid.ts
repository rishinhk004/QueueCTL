import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PID_FILE = path.join(os.tmpdir(), 'queuectl.pid');

export function writePidFile(): void {
  fs.writeFileSync(PID_FILE, process.pid.toString());
}

export function readPidFile(): number | null {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
    return pid;
  } catch (e) {
    return null;
  }
}

export function removePidFile(): void {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}