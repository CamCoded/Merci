// A small helper for testing; it's not part of the app
import { prisma } from "./db.js";

// Reset failed attempts and remove every lock
const result = await prisma.user.updateMany({
  data: { failedLoginCount: 0, lockedUntil: null },
});

console.log(`Unlocked ${result.count} account(s).`);

// Close the database connection so the script can exit
await prisma.$disconnect();