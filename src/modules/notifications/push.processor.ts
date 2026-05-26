import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PUSH_QUEUE, PushJobData } from './dto/push-job';
import { ExpoPushService } from './expo-push.service';
import { WebPushService } from './web-push.service';
import { PushSubscriptionService } from '_root/modules/push-subscription/push-subscription.service';
import { PushPlatform } from '../../../prisma/generated/enums';

@Processor(PUSH_QUEUE, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(
    private readonly expo: ExpoPushService,
    private readonly webPush: WebPushService,
    private readonly subscriptions: PushSubscriptionService,
  ) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    const { userIds, payload } = job.data;
    this.logger.debug(`Job ${job.id} → ${userIds.length} user(s)`);

    const subs = await this.subscriptions.forUsers(userIds);
    const mobile = subs.filter((s) => s.platform === PushPlatform.MOBILE_EXPO);
    const web = subs.filter((s) => s.platform === PushPlatform.WEB);

    await Promise.all([
      mobile.length ? this.expo.send(mobile, payload) : Promise.resolve(),
      web.length ? this.webPush.send(web, payload) : Promise.resolve(),
    ]);
  }
}
