export enum JobState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD = 'dead'
}

export function isJobState(value: string): value is JobState {
  return Object.values(JobState).includes(value as JobState);
}
