/**
 * ANIQUEST backend — email delivery.
 *
 * Provider precedence: Gmail/any SMTP > Mailer To Go > Brevo > Resend.
 * Only the one you configure is used — set one set of env vars.
 *
 * 1. SMTP (recommended, free, delivers to everyone):
 *    SMTP_USER + SMTP_PASS (Gmail App Password) — no domain, no card,
 *    ~500 emails/day via your own Gmail account.
 *      - SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465)
 *      - SMTP_SECURE (default true)
 *      - EMAIL_FROM (defaults to SMTP_USER)
 * 2. MAILERTOGO_API_KEY — Mailer To Go (zero-config, no domain)
 * 3. BREVO_API_KEY       — Brevo (300/day, verify sender)
 * 4. RESEND_API_KEY      — Resend (100/day, needs verified domain for others)
 *
 * Shared: EMAIL_FROM, EMAIL_FROM_NAME, APP_URL.
 */

import nodemailer from 'nodemailer';

const MAILERTOGO_URL = 'https://api.mailertogo.com/v1/send';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RESEND_URL = 'https://api.resend.com/emails';

function whichProvider() {
  if ((process.env.SMTP_USER || '').trim()) return 'smtp';
  if ((process.env.MAILERTOGO_API_KEY || '').trim()) return 'mailertogo';
  if ((process.env.BREVO_API_KEY || '').trim()) return 'brevo';
  if ((process.env.RESEND_API_KEY || '').trim()) return 'resend';
  return null;
}

export function isEmailConfigured() {
  return whichProvider() !== null;
}

function fromName() {
  return (process.env.EMAIL_FROM_NAME || '').trim() || 'AniQuest';
}

function parseSender(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([^<]+)<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: fromName(), email: s };
}

/** Build the verification link (works with the app's hash router). */
function trimTrailingSlash(s) {
  let out = String(s || '');
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

export function buildVerifyUrl(req, token) {
  const base = trimTrailingSlash(process.env.APP_URL)
    || `https://${req.headers?.host || 'localhost:4000'}`;
  return `${base}/#/verify?token=${encodeURIComponent(token)}`;
}

function htmlTemplate(verifyUrl) {
  return `
<div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1a1713;">
  <div style="text-align:center;padding:32px 24px;background:#faf8f5;border:1px solid #e6e0d8;border-radius:16px;">
    <div style="width:48px;height:48px;line-height:48px;margin:0 auto 12px;background:#e60023;color:#fff;border-radius:12px;font-size:26px;font-weight:800;">A</div>
    <h1 style="font-size:22px;margin:0 0 6px;">Welcome to AniQuest</h1>
    <p style="margin:0 0 20px;color:#6b645c;font-size:14px;">
      Confirm your email address to activate your account.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;background:#e60023;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;">
      Confirm my email
    </a>
    <p style="margin:20px 0 0;color:#6b645c;font-size:12px;word-break:break-all;">
      Button not working? Copy and paste this link:<br/>
      <a href="${verifyUrl}" style="color:#e60023;">${verifyUrl}</a>
    </p>
    <p style="margin:14px 0 0;color:#6b645c;font-size:12px;">
      This link expires in 24 hours. If you didn't create this account, you can ignore this email.
    </p>
  </div>
</div>`;
}

/* ---------------- SMTP (Gmail etc.) ---------------- */
async function sendViaSmtp({ to, subject, html }) {
  const user = process.env.SMTP_USER.trim();
  const pass = process.env.SMTP_PASS || '';
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = (process.env.SMTP_SECURE || 'true') !== 'false';

  const from = parseSender(process.env.EMAIL_FROM).email || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `${fromName()} <${from}>`,
    to,
    subject,
    html,
  });
}

/* ---------------- Mailer To Go ---------------- */
async function sendViaMailerToGo({ to, subject, html }) {
  const key = process.env.MAILERTOGO_API_KEY.trim();
  const from = parseSender(process.env.EMAIL_FROM).email || 'noreply@aniquest.app';
  const res = await fetch(MAILERTOGO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MailerToGo error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ---------------- Brevo ---------------- */
async function sendViaBrevo({ to, subject, html }) {
  const key = process.env.BREVO_API_KEY.trim();
  const sender = parseSender(process.env.EMAIL_FROM);
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ---------------- Resend ---------------- */
async function sendViaResend({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY.trim();
  const from = (process.env.EMAIL_FROM || '').trim() || 'AniQuest <onboarding@resend.dev>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Send the verification email. Throws on failure. */
export async function sendVerificationEmail(to, verifyUrl) {
  const provider = whichProvider();
  if (!provider) {
    throw new Error('Email service is not configured (no API key / SMTP set).');
  }

  const recipient = String(to).toLowerCase();
  const subject = 'Confirm your AniQuest account';
  const html = htmlTemplate(verifyUrl);

  switch (provider) {
    case 'smtp':
      return sendViaSmtp({ to: recipient, subject, html });
    case 'mailertogo':
      return sendViaMailerToGo({ to: recipient, subject, html });
    case 'brevo':
      return sendViaBrevo({ to: recipient, subject, html });
    case 'resend':
      return sendViaResend({ to: recipient, subject, html });
    default:
      throw new Error('Unknown email provider.');
  }
}
