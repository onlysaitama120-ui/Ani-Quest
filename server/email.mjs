/**
 * ANIQUEST backend — email delivery.
 *
 * Supports three providers so you can use whichever free tier suits you.
 * Precedence: Mailer To Go > Brevo > Resend. Only the key you set is used.
 *
 *   1. MAILERTOGO_API_KEY  -> Mailer To Go  (ZERO-config, no domain/DNS,
 *                            free tier, emails anyone. Recommended.)
 *   2. BREVO_API_KEY       -> Brevo         (300/day, needs sender verified)
 *   3. RESEND_API_KEY      -> Resend        (100/day, needs a verified domain
 *                            to email anyone; onboarding@resend.dev only emails you)
 *
 * Shared vars:
 *   EMAIL_FROM       — sender address / "Name <email>".
 *   EMAIL_FROM_NAME  — display name if EMAIL_FROM is a bare address.
 *   APP_URL          — public URL used in the verification link.
 */

const MAILERTOGO_URL = 'https://api.mailertogo.com/v1/send';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RESEND_URL = 'https://api.resend.com/emails';

function whichProvider() {
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

/**
 * Send the verification email. Throws on failure.
 */
export async function sendVerificationEmail(to, verifyUrl) {
  const provider = whichProvider();
  if (!provider) {
    throw new Error('Email service is not configured (no API key set).');
  }
  const recipient = String(to).toLowerCase();
  const subject = 'Confirm your AniQuest account';
  const html = htmlTemplate(verifyUrl);

  if (provider === 'mailertogo') {
    const key = process.env.MAILERTOGO_API_KEY.trim();
    const from = parseSender(process.env.EMAIL_FROM).email || `noreply@${fromName().toLowerCase()}.app`;
    const res = await fetch(MAILERTOGO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipient, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`MailerToGo error ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  if (provider === 'brevo') {
    const key = process.env.BREVO_API_KEY.trim();
    const sender = parseSender(process.env.EMAIL_FROM);
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: recipient }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo error ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  // Resend
  const key = process.env.RESEND_API_KEY.trim();
  const from = (process.env.EMAIL_FROM || '').trim() || 'AniQuest <onboarding@resend.dev>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [recipient], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
