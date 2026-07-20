import { signAccessToken, verifyAccessToken } from "../auth/access-token";
import { generateCsrfToken } from "../auth/csrf";
import { generateRefreshToken, hashToken } from "../auth/refresh-token";
import { authConfig } from "../config/auth.config";
import type { AuthRepository } from "../repositories/auth.repository";
import { runWithActor } from "../utils/actor-context";
import { BadRequestError, UnauthorizedError } from "../utils/errors";
import { logger } from "../utils/logger";

interface LoginInput {
  email: string;
  password: string;
  deviceInfo?: string;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  /**
   * Rute login/refresh/logout TIDAK memakai `requirePermission`, jadi authPlugin
   * tidak pernah mengeset actor untuk request-nya. Tanpa ini audit columns di
   * administrator_sessions akan selalu NULL. Email diambil dari administrator
   * pemilik sesi supaya jejaknya konsisten dengan actor di rute ter-guard.
   */
  private async actorEmailOf(administratorId: string): Promise<string> {
    const admin = await this.repo.findAdministratorById(administratorId);
    return admin?.email ?? "system:auth";
  }

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
    const admin = await this.repo.findAdministratorWithRoleByEmail(input.email);
    if (!admin) {
      // Log email untuk troubleshooting; JANGAN pernah log password/token.
      logger.warn({ email: input.email }, "login failed: unknown email");
      throw new BadRequestError("invalid credentials");
    }
    const valid = await Bun.password.verify(input.password, admin.password);
    if (!valid) {
      logger.warn({ email: input.email }, "login failed: wrong password");
      // Pesan generic yang sama untuk mencegah user enumeration.
      throw new BadRequestError("invalid credentials");
    }

    const issued = await runWithActor(admin.email, () =>
      this.issueSession(admin.id, input.deviceInfo),
    );
    // Sukses login: catat administratorId untuk audit. Session id sensitif —
    // simpan hash-nya, bukan nilai aslinya (AWS best practice #4).
    logger.info(
      {
        administratorId: admin.id,
        sessionHash: hashToken(issued.session.id),
      },
      "login succeeded",
    );
    return { ...issued, admin };
  }

  async refresh(refreshTokenRaw: string) {
    const session = await this.repo.findSessionByTokenHash(
      hashToken(refreshTokenRaw),
    );
    if (!session || session.revoked || session.expiredAt <= new Date()) {
      throw new BadRequestError("invalid refresh token");
    }

    const actorEmail = await this.actorEmailOf(session.administratorId);
    return await runWithActor(actorEmail, async () => {
      // Rotasi: refresh token lama langsung tidak berlaku (mencegah replay).
      await this.repo.revokeSession(session.id);
      return await this.issueSession(
        session.administratorId,
        session.deviceInfo,
      );
    });
  }

  async logout(refreshTokenRaw: string) {
    const session = await this.repo.findSessionByTokenHash(
      hashToken(refreshTokenRaw),
    );
    if (session) {
      const actorEmail = await this.actorEmailOf(session.administratorId);
      await runWithActor(actorEmail, () => this.repo.revokeSession(session.id));
    }
    // Idempotent: selalu sukses walau token tidak ditemukan.
  }

  async me(accessToken: string | undefined) {
    const payload = await verifyAccessToken(accessToken);
    if (!payload) throw new UnauthorizedError();

    const session = await this.repo.findSessionById(payload.sessionId);
    if (!session || session.revoked || session.expiredAt <= new Date()) {
      throw new UnauthorizedError();
    }

    const admin = await this.repo.findAdministratorWithRoleById(payload.sub);
    if (!admin) throw new UnauthorizedError();

    return admin; // { id, name, email, role }
  }
}
