import nodemailer from 'nodemailer';

// Email is optional: configure SMTP_* in .env. Without it, mails are logged to the console.
let transport;
export const mailEnabled = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && (!process.env.SMTP_USER || process.env.SMTP_PASS));

export async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled()) {
    // Development: print the mail so links can be tested. Production: never log contents (reset links).
    if (process.env.NODE_ENV === 'production') console.warn(`[mail disabled] Not sent to ${to}: ${subject} (set SMTP_* in .env)`);
    else console.log(`[mail disabled] To: ${to} | ${subject}\n${text}`);
    return false;
  }
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
  return true;
}
