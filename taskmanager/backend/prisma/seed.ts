import { PrismaClient, TaskStatus, TaskPriority, TaskSourceType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Create sophon-agent user
  const agentPasswordHash = await bcrypt.hash('change-me-in-prod', 10);
  const agent = await prisma.user.upsert({
    where: { email: 'sophon-agent@taskmanager.local' },
    update: {},
    create: {
      email: 'sophon-agent@taskmanager.local',
      passwordHash: agentPasswordHash,
      name: 'Sophon Agent',
      role: 'agent',
    },
  });

  // Create human user for task assignment
  const humanPasswordHash = await bcrypt.hash('change-me-in-prod', 10);
  await prisma.user.upsert({
    where: { email: 'szilamer@taskmanager.local' },
    update: {},
    create: {
      email: 'szilamer@taskmanager.local',
      passwordHash: humanPasswordHash,
      name: 'Szilamér',
      role: 'user',
    },
  });

  // Create agent API token (plain token for initial setup - store securely!)
  const plainToken = `tm_${uuidv4().replace(/-/g, '')}`;
  const tokenHash = await bcrypt.hash(plainToken, 10);
  const existingToken = await prisma.agentToken.findFirst({ where: { userId: agent.id } });
  if (!existingToken) {
    await prisma.agentToken.create({
      data: {
        tokenHash,
        userId: agent.id,
        scopes: ['tasks:read', 'tasks:write', 'projects:read', 'comments:write', 'cron:read', 'cron:write'],
        allowedIps: '23.88.58.202',
      },
    });
    console.log('Agent token (save this!):', plainToken);
  }

  // Default labels (Trello mapping)
  const labels = [
    { name: '🤖 Sophon feladata', color: '#2563eb' },
    { name: '👤 Szilamér', color: '#3b82f6' },
    { name: '⏳ Várakozás', color: '#eab308' },
    { name: '📧 Email válasz', color: '#dc2626' },
  ];
  for (const l of labels) {
    await prisma.taskLabel.upsert({
      where: { name: l.name },
      update: {},
      create: l,
    });
  }

  // Demo project
  let project = await prisma.project.findFirst({ where: { name: 'Demo Projekt' } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: 'Demo Projekt', description: 'TaskManager MVP teszt' },
    });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: agent.id, role: 'owner' },
    });
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
