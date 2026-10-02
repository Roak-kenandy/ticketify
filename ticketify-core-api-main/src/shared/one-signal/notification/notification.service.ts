import * as OneSignal from 'onesignal-node';
import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';

@Injectable()
export default class NotificationService {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  async publishNotification(
    newNotification: {
      title: string;
      body: string;
    },
    ids: string[],
  ) {
    const client = new OneSignal.Client(
      this.configService.get('ONE_SIGNAL_APP_ID'),
      this.configService.get('ONE_SIGNAL_API_KEY'),
    );

    const external_ids = ids || [];

    this.logger.log(
      'Notification Service',
      'Sending notification' +
        JSON.stringify(newNotification) +
        ' to ' +
        JSON.stringify(external_ids),
    );

    const notification = {
      include_aliases: {
        external_id: external_ids,
      },
      contents: {
        en: newNotification.body,
        tr: newNotification.body,
      },
      target_channel: ['push'],
    };

    try {
      await client.createNotification(notification);
      this.logger.log(
        'Notification Service',
        'Notification sent' + JSON.stringify(notification),
      );
    } catch (error) {
      this.logger.error(
        'Notification Service',
        'Error sending notification' + error,
      );
      if (error instanceof OneSignal.HTTPError) {
        // When status code of HTTP response is not 2xx, HTTPError is thrown.
      }
      throw new HttpException('Error sending notification', 500);
    }
  }
}
