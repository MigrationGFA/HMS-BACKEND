/**
 * Smoke-test Resend email (no SMS). Loads root .env and apps/api/.env.
 * Usage: node scripts/test-resend-email.mjs [recipient@example.com]
 * Or set EMAIL_TEST_TO in .env.
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import { Resend } from 'resend';

dotenv.config({ path: resolve('.env') });
dotenv.config({ path: resolve('apps/api/.env') });

const apiKey = process.env.RESEND_API_KEY?.trim();
const from =
  process.env.EMAIL_FROM?.trim() ||
  'Federal Neuro-Psychiatric Hospital, Aro <onboarding@resend.dev>';

const argTo = process.argv[2]?.trim();
const envTo = process.env.EMAIL_TEST_TO?.trim();
const to = argTo || envTo;

function parseFromEmail(fromHeader) {
  const m = fromHeader.match(/<([^>]+)>/);
  return m?.[1]?.trim() ?? null;
}

async function main() {
  if (!apiKey) {
    console.error('FAIL: RESEND_API_KEY is not set in .env');
    process.exit(1);
  }

  const recipient = to || parseFromEmail(from);
  if (!recipient) {
    console.error(
      'FAIL: No recipient. Pass an email argument or set EMAIL_TEST_TO in .env',
    );
    process.exit(1);
  }

  console.log('Resend configured: yes');
  console.log(`From header: ${from.replace(/@.+\./, '@***.')}`);
  console.log(`Sending test to: ${recipient.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);

  const resend = new Resend(apiKey);
  const subject = `FNPH Aro — Resend test ${new Date().toISOString()}`;
  const result = await resend.emails.send({
    from,
    to: [recipient],
    subject,
    html: '<p>This is a delivery test from HMS-BACKEND (Resend, email-only).</p>',
    text: 'This is a delivery test from HMS-BACKEND (Resend, email-only).',
  });

  if (result.error) {
    console.error('FAIL: Resend API error:', result.error.message);
    process.exit(1);
  }

  console.log('OK: Email accepted by Resend');
  console.log('Message id:', result.data?.id ?? 'n/a');
  console.log('Check the inbox (and spam) for the test message.');
}

main().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
