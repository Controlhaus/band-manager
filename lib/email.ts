import nodemailer from "nodemailer";
import { env } from "./env";

/**
 * SMTP email via nodemailer (§3). If SMTP is not configured, sending is a
 * no-op that returns `false` so callers can surface "email failed to send"
 * without breaking the flow (§15.6).
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth:
        env.smtp.user || env.smtp.pass
          ? { user: env.smtp.user, pass: env.smtp.pass }
          : undefined,
    });
  }
  return transporter;
}

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail(args: SendArgs): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    console.warn(`[email] SMTP not configured; skipped email to ${args.to}`);
    return false;
  }
  try {
    await tx.sendMail({
      from: env.smtp.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
    <h2 style="margin:0 0 12px">${title}</h2>${body}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
    <p style="color:#64748b;font-size:12px">Band Manager</p>
  </body></html>`;
}

export async function sendInvitationEmail(
  to: string,
  acceptUrl: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "You've been invited to Band Manager",
    text: `You've been invited to Band Manager. Accept your invitation: ${acceptUrl}\n\nThis link expires in 14 days.`,
    html: layout(
      "You've been invited to Band Manager",
      `<p>You've been invited to join Band Manager.</p>
       <p><a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
       <p style="color:#64748b;font-size:13px">This link expires in 14 days. If the button doesn't work, paste this URL into your browser:<br/>${acceptUrl}</p>`,
    ),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Reset your Band Manager password",
    text: `Reset your password: ${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password.</p>
       <p><a href="${resetUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Reset password</a></p>
       <p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
    ),
  });
}
