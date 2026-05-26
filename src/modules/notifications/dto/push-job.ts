// src/notifications/interfaces/push-job.interface.ts
export const PUSH_QUEUE = 'push-notifications';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
}

export interface PushJobData {
  userIds: string[];
  payload: PushPayload;
}
