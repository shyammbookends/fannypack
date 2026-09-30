// Checks the SMTP settings in .env and sends a test email.
//   npm run mail:test                      -> sends to SMTP_USER
//   npm run mail:test -- someone@gmail.com -> sends to that address
import 'dotenv/config';
import nodemailer from 'nodemailer';

const to = process.argv[2] || process.env.SMTP_USER;
const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`Missing in .env: ${missing.join(', ')}`);
  if (missing.includes('SMTP_PASS')) console.log('Create a Gmail App Password at https://myaccount.google.com/apppasswords and paste it as SMTP_PASS.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

try {
  await transport.verify();
  console.log('SMTP login OK.');
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Bookends Fanny Pack - email is working',
    text: 'This is a test email. Order updates and password-reset links will be sent from this address.',
  });
  console.log(`Test email sent to ${to} (id ${info.messageId}). Check the inbox and Spam folder.`);
} catch (err) {
  console.error('Email failed:', err.message);
  if (/Invalid login|535|Username and Password not accepted/i.test(err.message)) {
    console.error('Gmail rejected the login. Use an App Password (not your normal password), with 2-Step Verification turned on.');
  }
  process.exitCode = 1;
}
