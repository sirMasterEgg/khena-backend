import type { UserAuthRepository } from "../repositories/user-auth.repository";
import { BadRequestError, ConflictError } from "../utils/errors";

// Pesan error di bawah ini dipakai apa adanya oleh frontend — bunyinya sudah
// dikunci di contract.md Bagian 5a. Jangan diubah tanpa mengubah contract.
const MSG_EMAIL = "invalid email format";
const MSG_PASSWORD =
  "password must be at least 8 characters and contain a letter and a number";
const MSG_NAME = "name must be between 2 and 255 characters";
const MSG_PHONE = "invalid phone number format";
const MSG_PHONE_TAKEN = "phone already exists";

// Sengaja sederhana: better-auth tetap melakukan validasi email-nya sendiri.
// Ini cuma penjaga awal + alasan untuk menolak string kosong/ngawur.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mengizinkan awalan +, spasi, dan strip sebagai pemisah. Panjang total dibatasi
// terpisah karena kolomnya varchar(20)-setara di sisi domain.
const PHONE_PATTERN = /^\+?[0-9][0-9 -]{6,18}$/;

interface SignUpInput {
  email: string;
  password: string;
  name: string;
  phone: string;
}

interface UpdateProfileInput {
  name?: string;
  phone?: string;
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

export class UserAuthService {
  constructor(private readonly repo: UserAuthRepository) {}

  /**
   * Email dinormalisasi (lowercase + trim), bukan sekadar divalidasi —
   * kalau tidak, `Budi@X.com` dan `budi@x.com` jadi dua akun berbeda.
   */
  private normalizeEmail(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestError(MSG_EMAIL);
    }
    const email = value.trim().toLowerCase();
    if (
      email.length === 0 ||
      email.length > 255 ||
      !EMAIL_PATTERN.test(email)
    ) {
      throw new BadRequestError(MSG_EMAIL);
    }
    return email;
  }

  private normalizeName(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestError(MSG_NAME);
    }
    const name = value.trim();
    if (name.length < 2 || name.length > 255) {
      throw new BadRequestError(MSG_NAME);
    }
    return name;
  }

  private normalizePhone(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestError(MSG_PHONE);
    }
    const phone = value.trim();
    if (phone.length > 20 || !PHONE_PATTERN.test(phone)) {
      throw new BadRequestError(MSG_PHONE);
    }
    return phone;
  }

  private validatePassword(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestError(MSG_PASSWORD);
    }
    const hasLetter = /[a-zA-Z]/.test(value);
    const hasDigit = /[0-9]/.test(value);
    if (value.length < 8 || value.length > 128 || !hasLetter || !hasDigit) {
      throw new BadRequestError(MSG_PASSWORD);
    }
    return value;
  }

  /**
   * Keunikan nomor telepon. Index `auth_users_phone_unique` di database adalah
   * pengaman terakhir untuk dua request bersamaan; pengecekan di sini yang
   * membuat pesan errornya enak dibaca, bukan error mentah Postgres.
   */
  private async assertPhoneAvailable(phone: string, excludeUserId?: string) {
    const owner = await this.repo.findByPhone(phone, excludeUserId);
    if (owner) {
      throw new ConflictError(MSG_PHONE_TAKEN);
    }
  }

  /** Validasi + normalisasi body /sign-up/email. */
  async validateSignUp(body: unknown): Promise<SignUpInput> {
    const raw = asRecord(body);
    const email = this.normalizeEmail(raw.email);
    const password = this.validatePassword(raw.password);
    const name = this.normalizeName(raw.name);
    const phone = this.normalizePhone(raw.phone);

    await this.assertPhoneAvailable(phone);

    // Duplikasi email sengaja tidak dicek di sini — better-auth sudah
    // menanganinya secara native, termasuk supaya tidak bocor mana email yang
    // sudah terdaftar.
    return { email, password, name, phone };
  }

  /** Validasi + normalisasi body /update-user. Semua field opsional. */
  async validateUpdateProfile(
    body: unknown,
    currentUserId: string,
  ): Promise<UpdateProfileInput> {
    const raw = asRecord(body);
    const result: UpdateProfileInput = {};

    if (raw.name !== undefined) {
      result.name = this.normalizeName(raw.name);
    }
    if (raw.phone !== undefined) {
      const phone = this.normalizePhone(raw.phone);
      // Kecualikan diri sendiri: menyimpan ulang nomor yang sama bukan duplikat.
      await this.assertPhoneAvailable(phone, currentUserId);
      result.phone = phone;
    }

    return result;
  }

  /** Validasi kekuatan password baru pada /reset-password. */
  validateNewPassword(password: unknown): string {
    return this.validatePassword(password);
  }
}
