import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  queued: true;
  delivered: boolean;
  id?: string;
}

/**
 * Outbound email via Resend when RESEND_API_KEY is set.
 * Without a key, messages are logged only (local/dev).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from =
      process.env.EMAIL_FROM?.trim() ||
      'Federal Neuro-Psychiatric Hospital, Aro <onboarding@resend.dev>';
  }

  /** True when Resend will actually deliver mail. */
  isConfigured(): boolean {
    return this.resend != null;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const to = input.to?.trim();
    if (!to) {
      this.logger.warn(`Skipped email "${input.subject}" — no recipient`);
      return { queued: true, delivered: false };
    }

    if (!this.resend) {
      this.logger.log(
        `Email (log-only) → ${to} | ${input.subject}${
          input.text ? ` | ${input.text.slice(0, 160)}` : ''
        }`,
      );
      return { queued: true, delivered: false };
    }

    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      if (result.error) {
        this.logger.error(
          `Resend failed → ${to} | ${input.subject}: ${result.error.message}`,
        );
        return { queued: true, delivered: false };
      }

      this.logger.log(
        `Email sent via Resend → ${to} | ${input.subject} | id=${result.data?.id ?? 'n/a'}`,
      );
      return { queued: true, delivered: true, id: result.data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Resend exception → ${to} | ${input.subject}: ${message}`);
      return { queued: true, delivered: false };
    }
  }
}
