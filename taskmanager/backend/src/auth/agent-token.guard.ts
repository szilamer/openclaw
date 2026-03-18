import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AgentTokenGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const clientIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.socket?.remoteAddress ||
      '';

    const queryToken = request.query?.token as string | undefined;

    if (!authHeader?.startsWith('Bearer ') && !queryToken) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken!;
    const tokens = await this.prisma.agentToken.findMany({
      include: { user: true },
    });

    for (const t of tokens) {
      if (await bcrypt.compare(token, t.tokenHash)) {
        const skipIpCheck = process.env.ALLOW_ALL_IPS === 'true';
        if (!skipIpCheck && t.allowedIps && !t.allowedIps.split(',').map((s) => s.trim()).some((ip) => clientIp === ip || clientIp.startsWith(ip))) {
          throw new UnauthorizedException('IP not allowed');
        }
        await this.prisma.agentToken.update({
          where: { id: t.id },
          data: { lastUsedAt: new Date() },
        });
        request.agentToken = t;
        request.user = t.user;
        return true;
      }
    }

    throw new UnauthorizedException('Invalid token');
  }
}
