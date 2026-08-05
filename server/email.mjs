/**
 * ANIQUEST backend — email delivery via Resend (free tier: 100 emails/day).
 *
 * Env vars:
 *   RESEND_API_KEY   — required. Get one at https://resend.com/api-keys
 *   EMAIL_FROM       — sender. Defaults to onboarding@resend.dev (Resend's
 *                      testing sender, which only delivers to YOUR email).
 *                      For real users you must verify a domain in Resend and
 *                      set EMAIL_FROM to something like "AniQuest <hi@yourdomain>".
 *   APP_URL          — public base URL of the app, e.g. https://aniquest.onrender.com
 *                      (if unset, derived from the request host).
 */

export function isEmailConfigured() {
  return Boolean((process.env.RESEND_API_KEY || '').trim());
}

function getFrom() {
  return (process.env.EMAIL_FROM || '').trim() || 'AniQuest <onboarding@resend.dev>';
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
    throw new Error('Email service is not configured (RESEND_API_KEY missing).');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFrom(),
      to: [String(to).toLowerCase()],
      subject: 'Confirm your AniQuest account',
      html: `
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
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}
