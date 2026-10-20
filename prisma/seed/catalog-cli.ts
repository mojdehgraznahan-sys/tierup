// Production-safe catalog seed. Run: npm run db:seed:catalog
import { PrismaClient } from "@prisma/client";
import { seedCatalog } from "./catalog";

const db = new PrismaClient();
seedCatalog(db)
  .then((r) => console.log("Catalog up to date", r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
