import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HmoBrokerService } from '../broker/hmo-broker.service';

/**
 * Lightweight async claim status poller.
 * Runs on an interval when HMO_CLAIM_POLL_INTERVAL_MS > 0 (default 60s).
 * Set HMO_CLAIM_POLL_INTERVAL_MS=0 to disable.
 */
@Injectable()
export class HmoClaimPollProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HmoClaimPollProcessor.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly broker: HmoBrokerService) {}

  onModuleInit() {
    const raw = process.env.HMO_CLAIM_POLL_INTERVAL_MS;
    const intervalMs =
      raw === undefined || raw === ''
        ? 60_000
        : Number.parseInt(raw, 10);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.logger.log('HMO claim poller disabled (HMO_CLAIM_POLL_INTERVAL_MS <= 0)');
      return;
    }
    this.logger.log(`HMO claim poller every ${intervalMs}ms`);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.broker.pollOpenClaims(25);
      if (result.polled > 0) {
        this.logger.debug(`Polled ${result.polled} open HMO claim(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `HMO claim poll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
