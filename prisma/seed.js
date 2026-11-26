import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const developmentAccount = {
  username: "dev_test",
  email: "dev-test@shocialgram.test",
  password: "ShocialgramDev123!",
  fullName: "Shocialgram Development Tester",
};

if (process.env.NODE_ENV === "production") {
  throw new Error("The development seed cannot run when NODE_ENV is production.");
}

if (process.env.SHOCIALGRAM_ENABLE_DEV_SEED !== "1") {
  throw new Error("Set SHOCIALGRAM_ENABLE_DEV_SEED=1 to enable the development seed.");
}

const prisma = new PrismaClient();

try {
  const [emailMatch, usernameMatch] = await Promise.all([
    prisma.user.findUnique({
      where: { email: developmentAccount.email },
      select: { id: true, username: true, password_hash: true },
    }),
    prisma.user.findUnique({
      where: { username: developmentAccount.username },
      select: { id: true, email: true, password_hash: true },
    }),
  ]);

  if (emailMatch || usernameMatch) {
    const sameAccount = emailMatch && usernameMatch && emailMatch.id === usernameMatch.id;
    const passwordMatches = sameAccount
      && await bcrypt.compare(developmentAccount.password, emailMatch.password_hash);

    if (!passwordMatches) {
      throw new Error("A conflicting development account exists; refusing to modify any user.");
    }

    console.info(`Development account already exists: ${developmentAccount.email}`);
  } else {
    const password_hash = await bcrypt.hash(developmentAccount.password, 12);
    await prisma.user.create({
      data: {
        username: developmentAccount.username,
        email: developmentAccount.email,
        password_hash,
        fullName: developmentAccount.fullName,
      },
    });

    console.info(`Created development account: ${developmentAccount.email}`);
  }
} finally {
  await prisma.$disconnect();
}
