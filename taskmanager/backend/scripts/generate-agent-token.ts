/**
 * Új agent token generálása és kiírása.
 * Futtatás: npx ts-node scripts/generate-agent-token.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  const agent = await prisma.user.findFirst({
    where: { email: 'sophon-agent@taskmanager.local' },
  });

  if (!agent) {
    console.error('Hiba: sophon-agent user nem található. Futtasd először: npm run prisma:seed');
    process.exit(1);
  }

  const plainToken = `tm_${uuidv4().replace(/-/g, '')}`;
  const tokenHash = await bcrypt.hash(plainToken, 10);

  await prisma.agentToken.create({
    data: {
      tokenHash,
      userId: agent.id,
      scopes: ['tasks:read', 'tasks:write', 'projects:read', 'comments:write', 'cron:read', 'cron:write'],
      allowedIps: '23.88.58.202',
    },
  });

  console.log('\n=== ÚJ AGENT TOKEN ===');
  console.log(plainToken);
  console.log('======================\n');
  console.log('Mentsd el biztonságosan! A taskmanager-api scripthez kell.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
