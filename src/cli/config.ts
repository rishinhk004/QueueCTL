import { prisma } from '../lib/db.js';

export async function setConfig(key: string, value: string) {
  try {
    await prisma.configuration.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    console.log(`Config updated: ${key} = ${value}`);
  } finally {
    await prisma.$disconnect();
  }
}