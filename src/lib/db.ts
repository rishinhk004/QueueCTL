import { PrismaClient } from '../generated/prisma/index.js';

export const prisma = new PrismaClient();

export async function getConfig(key: string, defaultValue: string): Promise<string> {
  const config = await prisma.configuration.findUnique({ where: { key } });
  return config?.value ?? defaultValue;
}

export async function getConfigInt(key: string, defaultValue: number): Promise<number> {
  const value = await getConfig(key, defaultValue.toString());
  return parseInt(value, 10);
}