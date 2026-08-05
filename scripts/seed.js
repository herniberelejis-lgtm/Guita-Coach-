/** Runner de datos demo — independiente de cualquier microservicio.
 * Uso: npm run db:seed (desde la raíz del monorepo).
 */
import { prisma } from "@guita-coach/db";
import { seedDemoData } from "./seedData.js";

async function main() {
  await prisma.user.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const count = await prisma.transaction.count({ where: { userId: 1 } });
  if (count > 0) {
    console.log("Ya hay transacciones cargadas, no se vuelve a sembrar.");
    return;
  }
  await seedDemoData();
  console.log("Datos demo cargados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
