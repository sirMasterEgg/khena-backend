import { signAccessToken } from "../auth/access-token";
import { generateCsrfToken } from "../auth/csrf";
import { generateRefreshToken, hashToken } from "../auth/refresh-token";
import { authConfig } from "../config/auth.config";
import type { AuthRepository } from "../repositories/auth.repository";
import { BadRequestError } from "../utils/errors";

interface LoginInput {
  email: string;
  password: string;
  deviceInfo?: string;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  private async issueSession(
    administratorId: string,
    deviceInfo?: string | null,
  ) {
    const refreshTokenRaw = generateRefreshToken();
    const session = await this.repo.createSession({
      administratorId,
      tokenHash: hashToken(refreshTokenRaw),
      deviceInfo,
      expiredAt: new Date(Date.now() + authConfig.refreshTtl * 1000),
      revoked: false,
    });
    const accessToken = await signAccessToken({
      sub: administratorId,
      sessionId: session.id,
    });
    // CSRF token terikat ke sesi login yang baru.
    const csrfToken = generateCsrfToken(session.id);
    return { session, refreshTokenRaw, accessToken, csrfToken };
  }

  async login(input: LoginInput) {
    const admin = await this.repo.findAdministratorByEmail(input.email);
    if (!admin) {
      throw new BadRequestError("invalid credentials");
    }
    const valid = await Bun.password.verify(input.password, admin.password);
    if (!valid) {
      // Pesan generic yang sama untuk mencegah user enumeration.
      throw new BadRequestError("invalid credentials");
    }

    const issued = await this.issueSession(admin.id, input.deviceInfo);
    return { ...issued, admin };
  }

  async refresh(refreshTokenRaw: string) {
    const session = await this.repo.findSessionByTokenHash(
      hashToken(refreshTokenRaw),
    );
    if (!session || session.revoked || session.expiredAt <= new Date()) {
      throw new BadRequestError("invalid refresh token");
    }

    // Rotasi: refresh token lama langsung tidak berlaku (mencegah replay).
    await this.repo.revokeSession(session.id);
    return await this.issueSession(session.administratorId, session.deviceInfo);
  }

  async logout(refreshTokenRaw: string) {
    const session = await this.repo.findSessionByTokenHash(
      hashToken(refreshTokenRaw),
    );
    if (session) {
      await this.repo.revokeSession(session.id);
    }
    // Idempotent: selalu sukses walau token tidak ditemukan.
  }
}
