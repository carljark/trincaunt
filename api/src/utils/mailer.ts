import nodemailer from 'nodemailer';

// SMTP desde el entorno (ver .env.example). Sin SMTP_HOST, en desarrollo el
// correo se escribe en el log en vez de enviarse; en producción no se envía.
export const sendMail = async (to: string, subject: string, text: string): Promise<void> => {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') {
      console.log('mail not sent: SMTP_HOST is not set');
    } else {
      console.log(`mail (SMTP_HOST not set) to ${to}\n${subject}\n${text}`);
    }
    return;
  }
  const user = process.env.SMTP_USER;
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass: process.env.SMTP_PASS } : undefined
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM || user,
    to,
    subject,
    text
  });
};
