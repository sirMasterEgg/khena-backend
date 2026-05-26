import { Injectable } from '@nestjs/common';
import { doubleCsrf } from 'csrf-csrf';

@Injectable()
export class CsrfService {
  private csrf: ReturnType<typeof doubleCsrf>;

  constructor() {
    this.csrf = doubleCsrf({
      getSecret: () => 'your-secret-key', // TODO: load from env
    });
  }

  generateToken(): string {
    return this.csrf.generateToken();
  }

  validateToken(token: string, secret: string): boolean {
    try {
      return this.csrf.validateToken(token, secret);
    } catch {
      return false;
    }
  }
}