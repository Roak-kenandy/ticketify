import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PushType =
  | 'TICKET_ASSIGNED'
  | 'TICKET_REASSIGNED'
  | 'PAYMENT_RECEIVED'
  | 'NEW_REVIEW'
  | 'TICKETS_WAITING';

export type PushMessage = {
  title: string;
  body: string;
  /** Delivered to the app; `ticket_id` opens that ticket when the notification is tapped. */
  data?: { type: PushType; ticket_id?: string };
};

const ONESIGNAL_URL = 'https://onesignal.com/api/v1/notifications';
const MAX_RECIPIENTS = 2000;

/**
 * Sends push notifications through the OneSignal REST API. Recipients are
 * Ticketify user ids (the app calls `OneSignal.login(user.id)`).
 * Never throws: a failed push must not fail the business action that caused it.
 */
@Injectable()
export default class NotificationService {
  private readonly logger = new Logger('PushNotifications');

  constructor(private configService: ConfigService) {}

  async publishNotification(
    message: PushMessage,
    ids: string[],
  ): Promise<boolean> {
    const appId = this.configService.get<string>('ONE_SIGNAL_APP_ID')?.trim();
    const apiKey = this.configService.get<string>('ONE_SIGNAL_API_KEY')?.trim();
    const externalIds = [
      ...new Set((ids ?? []).filter(Boolean).map(String)),
    ].slice(0, MAX_RECIPIENTS);
    if (!appId || !apiKey) {
      this.logger.warn('OneSignal is not configured; push skipped');
      return false;
    }
    if (!externalIds.length) return false;

    try {
      const response = await fetch(ONESIGNAL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // v2 keys use the "Key" scheme; legacy REST keys use "Basic".
          Authorization: `${apiKey.startsWith('os_v2_') ? 'Key' : 'Basic'} ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: 'push',
          include_aliases: { external_id: externalIds },
          headings: { en: message.title },
          contents: { en: message.body },
          data: message.data ?? {},
          priority: 10,
          ttl: 60 * 60 * 24,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        this.logger.warn(
          `OneSignal rejected ${message.data?.type ?? 'push'} (HTTP ${response.status})`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `OneSignal request failed for ${message.data?.type ?? 'push'}: ${String(error)}`,
      );
      return false;
    }
  }
}
