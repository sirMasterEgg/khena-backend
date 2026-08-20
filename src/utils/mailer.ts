import { logger } from "./logger";

interface MailInput {
  to: string;
  subject: string;
  text: string;
}

const driver = process.env.MAIL_DRIVER ?? "console";
const from = process.env.MAIL_FROM ?? "no-reply@khena.local";

/**
 * Driver `console`: isi email hanya ditulis ke log server. Cukup untuk
 * development — link reset password bisa dibaca langsung dari terminal.
 * TODO: tambahkan driver SMTP/provider asli sebelum production.
 */
export async function sendMail(input: MailInput): Promise<void> {
  if (driver === "console") {
    logger.info(
      { mail: { from, ...input } },
      "outgoing email (console driver)",
    );
    return;
  }

  // Gagal keras daripada diam-diam menelan email: konfigurasi salah harus
  // kelihatan, bukan jadi user yang tidak pernah menerima link reset.
  throw new Error(`unsupported MAIL_DRIVER: ${driver}`);
}
