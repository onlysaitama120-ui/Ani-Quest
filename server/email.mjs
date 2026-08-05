/**
 * ANIQUEST backend — email delivery via Brevo (free tier: hundreds of emails/day).
 *
 * Unlike Resend's unverified sender, Brevo lets you send to ANY recipient as
 * long as you verify a sender email address once (no domain required).
 *
 * Env vars:
 *   BREVO_API_KEY  — required. Get one at https://app.brevo.com (Settings -> SMTP & API).
 *   EMAIL_FROM     — a verified sender email, e.g. onlysaitama120@gmail.com
 *                    (verify it in Brevo: they email you a confirmation link).
 *   EMAIL_FROM_NAME— display name, defaults to "AniQuest".
 *   APP_URL        — public base URL of the app, e.g. https://aniquest.onrender.com
 *                    (if unset, derived from the request host).
 */

export function isEmailConfigured() {
  return Boolean((process.env.BREVO_API_KEY || '').trim());
}

/** Parse "Name <email>" or plain "email". */
function parseSender(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([^<]+)<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: (process.env.EMAIL_FROM_NAME || '').trim() || 'AniQuest', email: s };
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

/**
 * Send the verification email. Throws on failure (network, invalid key,
 * unverified sender, etc.).
 */
export async function sendVerificationEmail(to, verifyUrl) {
  if (!isEmailConfigured()) {
    throw new Error('Email service is not configured (BREVO_API_KEY missing).');
  }

  const sender = parseSender(process.env.EMAIL_FROM);
  if (!sender.email) {
    throw new Error('EMAIL_FROM is not configured.');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY.trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: String(to).toLowerCase() }],
      subject: 'Confirm your AniQuest account',
      htmlContent: `
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
</div>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
