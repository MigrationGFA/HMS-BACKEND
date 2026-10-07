import { Injectable } from '@nestjs/common';

/**
 * SMS delivery — disabled for now (email-only via Resend / EmailService).
 * Uncomment and wire a provider (e.g. Termii) when SMS is approved.
 */
@Injectable()
export class SmsService {
  // async send(_to: string, _body: string): Promise<{ delivered: boolean }> {
  //   return { delivered: false };
  // }
}
