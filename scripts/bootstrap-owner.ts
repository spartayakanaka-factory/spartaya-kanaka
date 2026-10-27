import { stdin, stdout } from "node:process";
import { hashPassword } from "better-auth/crypto";
import { createRuntimeDatabase } from "./runtime-db";
import { assertSafeDatabaseTarget } from "./database-target";
import { consumeOwnerBootstrapPassword } from "./owner-bootstrap-secret";

async function hiddenInput(label: string) {
  if (!stdin.isTTY || !stdin.setRawMode)
    throw new Error(
      "Run this one-time bootstrap from an interactive terminal so the password is not echoed.",
    );
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (character: string) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (character === "\r" || character === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (character >= " ") value += character;
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

async function main() {
  assertSafeDatabaseTarget({
    allowHostingerPhase2Test: process.argv.includes("--confirm-hostinger-phase2-test"),
  });
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3]?.trim();
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !name ||
    name.length < 2 ||
    name.length > 120
  )
    throw new Error('Usage: pnpm admin:bootstrap -- "owner@example.com" "Owner name"');
  const authorizedEmail = process.env.OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!authorizedEmail || email !== authorizedEmail)
    throw new Error(
      "Set OWNER_BOOTSTRAP_EMAIL to the exact authorized owner identity and use that email in the command.",
    );
  const environmentPassword = consumeOwnerBootstrapPassword(
    process.env,
    process.argv,
    Boolean(stdin.isTTY && stdin.setRawMode),
  );
  const password =
    environmentPassword ?? (await hiddenInput("New owner password (12+ characters): "));
  const confirm = environmentPassword ? password : await hiddenInput("Confirm password: ");
  if (password.length < 12 || password.length > 128 || password !== confirm)
    throw new Error("Passwords must match and be between 12 and 128 characters.");
  const db = createRuntimeDatabase();
  try {
    const created = await db.$transaction(async (tx) => {
      const users = await tx.adminUser.count();
      if (users !== 0)
        throw new Error("Owner bootstrap only works before any administrative users exist.");
      if (
        await tx.storeSetting.findUnique({
          where: { key: "owner.bootstrap.completed" },
          select: { key: true },
        })
      )
        throw new Error("Owner bootstrap is already locked.");
      const passwordHash = await hashPassword(password);
      const user = await tx.adminUser.create({
        data: { name, email, emailVerified: true, roleCode: "OWNER", forcePasswordChange: true },
      });
      await tx.authAccount.create({
        data: {
          id: crypto.randomUUID(),
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
        },
      });
      await tx.storeSetting.create({
        data: {
          key: "owner.bootstrap.completed",
          value: { completed: true, ownerId: user.id, email: user.email },
          updatedBy: user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          actorLabel: user.name,
          action: "owner.bootstrapped",
          entity: "AdminUser",
          entityId: user.id,
          afterData: { email: user.email, roleCode: user.roleCode },
        },
      });
      return user;
    });
    process.stdout.write(
      `Owner account created for ${created.email}. Sign in once to choose a new password.\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : "Owner bootstrap failed.") + "\n");
  process.exitCode = 1;
});
