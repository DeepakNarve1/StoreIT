import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";
const rawUrl =
  process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
const APP_URL = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

// ─── INVITE EMAIL ─────────────────────────────────────────────────────────────
export const sendInviteEmail = async ({
  email,
  invitedByName,
  tenantName,
  token,
  role,
}: {
  email: string;
  invitedByName: string;
  tenantName: string;
  token: string;
  role: string;
}) => {
  const inviteUrl = `${APP_URL}/invite/${token}`;

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `You've been invited to join ${tenantName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;
                    border:1px solid #e5e7eb;overflow:hidden;">

          <!-- Header -->
          <div style="background:#1d4ed8;padding:24px 32px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;background:white;border-radius:8px;
                          display:flex;align-items:center;justify-content:center;">
                <span style="color:#1d4ed8;font-weight:700;font-size:16px;">F</span>
              </div>
              <span style="color:white;font-weight:600;font-size:16px;">StoreIT  </span>
            </div>
          </div>

          <!-- Body -->
          <div style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
              You've been invited!
            </h1>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              <strong>${invitedByName}</strong> has invited you to join
              <strong>${tenantName}</strong> as a <strong>${role.replace("_", " ")}</strong>.
            </p>

            <!-- CTA Button -->
            <a href="${inviteUrl}"
               style="display:inline-block;background:#1d4ed8;color:white;
                      font-size:14px;font-weight:600;padding:12px 24px;
                      border-radius:8px;text-decoration:none;margin-bottom:24px;">
              Accept Invitation →
            </a>

            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;
                      background:#f9fafb;padding:10px 12px;border-radius:6px;
                      border:1px solid #e5e7eb;">
              ${inviteUrl}
            </p>
          </div>

          <!-- Footer -->
          <div style="padding:16px 32px;border-top:1px solid #f3f4f6;
                      background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This invite expires in 7 days. If you didn't expect this email, you can ignore it.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error("Email send error:", error);
    throw new Error("Failed to send invite email");
  }

  return data;
};

export const sendPasswordResetEmail = async ({
  email,
  token,
  name,
}: {
  email: string;
  token: string;
  name: string;
}) => {
  const resetUrl = `${APP_URL}/reset-password/${token}`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Reset your StoreIT password",
    html: `
      <body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
        <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <div style="background:#1d4ed8;padding:24px 32px;">
            <span style="color:white;font-weight:600;font-size:16px;">StoreIT</span>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              Hi <strong>${name}</strong>, we received a request to reset your password.
              This link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;background:#1d4ed8;color:white;font-size:14px;
                      font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin-bottom:24px;">
              Reset password →
            </a>
            <p style="margin:0;font-size:13px;color:#9ca3af;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        </div>
      </body>`,
  });

  if (error) throw new Error("Failed to send reset email");
};
