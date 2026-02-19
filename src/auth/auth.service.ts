import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
}

@Injectable()
export class AuthService {
  // In-memory store (replace with DB in production)
  private users: Map<string, User> = new Map();

  constructor(private jwtService: JwtService) {}

  async validateGoogleUser(profile: any): Promise<User> {
    const { id, emails, displayName, photos } = profile;
    const email = emails[0].value;

    const user: User = {
      id,
      email,
      name: displayName,
      picture: photos[0]?.value || '',
      accessToken: '',
    };

    this.users.set(id, user);
    return user;
  }

  generateJwt(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };
    return this.jwtService.sign(payload);
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  verifyToken(token: string) {
    return this.jwtService.verify(token);
  }
}
