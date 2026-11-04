import { randomBytes } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

// This explicitly opt-in test creates and deletes only uniquely named schemas
// and two uniquely named accounts on the existing isolated loopback server.
async function main() {
  if (process.env.SR1_ISOLATION_TEST !== "1")
    throw new Error("Explicit local isolation-test opt-in required.");
  const runtime = process.env.SR1_DB_SERVICE_DIR;
  const approved = path.resolve(process.cwd(), "../../phase3/runtime/database");
  if (runtime !== approved || !lstatSync(runtime + "/mariadb.sock").isSocket())
    throw new Error("The exact local disposable MariaDB service is required.");
  const credentials = JSON.parse(readFileSync(runtime + "/credentials.json", "utf8"));
  const root = await mariadb.createConnection({
    socketPath: runtime + "/mariadb.sock",
    user: "root",
    password: credentials.root,
  });
  const suffix = randomBytes(8).toString("hex");
  const staging = "sr1_stage_" + suffix;
  const decoy = "sr1_decoy_" + suffix;
  const user = "sr1_" + suffix;
  const decoyUser = "sr1_d_" + suffix;
  const password = randomBytes(32).toString("hex");
  const decoyPassword = randomBytes(32).toString("hex");
  let stagingCreated = false,
    decoyCreated = false,
    userCreated = false,
    decoyUserCreated = false;
  let pool: mariadb.Pool | undefined;
  try {
    const identity = await root.query(
      "SELECT @@port AS port, @@bind_address AS binding, VERSION() AS version",
    );
    if (
      Number(identity[0].port) !== 33078 ||
      identity[0].binding !== "127.0.0.1" ||
      !identity[0].version.startsWith("11.8.9-MariaDB")
    )
      throw new Error("Unexpected database service; no test objects created.");
    const occupied = await root.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)",
      [staging, decoy],
    );
    const users = await root.query("SELECT User FROM mysql.user WHERE User IN (?, ?)", [
      user,
      decoyUser,
    ]);
    if (occupied.length || users.length) throw new Error("Random test identity already exists.");
    await root.query(`CREATE DATABASE \`${staging}\``);
    stagingCreated = true;
    await root.query(`CREATE DATABASE \`${decoy}\``);
    decoyCreated = true;
    await root.query(
      `CREATE TABLE \`${staging}\`.fixture (id INT PRIMARY KEY, value INT NOT NULL)`,
    );
    await root.query(`CREATE TABLE \`${decoy}\`.fixture (id INT PRIMARY KEY, value INT NOT NULL)`);
    await root.query(`INSERT INTO \`${decoy}\`.fixture VALUES (1, 99)`);
    await root.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ?`, [password]);
    userCreated = true;
    await root.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${staging}\`.* TO '${user}'@'127.0.0.1'`,
    );
    await root.query(`CREATE USER '${decoyUser}'@'127.0.0.1' IDENTIFIED BY ?`, [decoyPassword]);
    decoyUserCreated = true;
    await root.query(`GRANT SELECT ON \`${decoy}\`.* TO '${decoyUser}'@'127.0.0.1'`);
    await assert.rejects(
      mariadb.createConnection({
        host: "127.0.0.1",
        port: 33078,
        user: decoyUser,
        password: decoyPassword,
        database: staging,
      }),
    );
    pool = mariadb.createPool({
      host: "127.0.0.1",
      port: 33078,
      user,
      password,
      database: staging,
      connectionLimit: 3,
    });
    const conns = await Promise.all([
      pool.getConnection(),
      pool.getConnection(),
      pool.getConnection(),
    ]);
    try {
      await Promise.all(
        conns.map(async (conn, i) => {
          const rows = await conn.query(
            "SELECT DATABASE() AS databaseName, CURRENT_USER() AS account",
          );
          assert.equal(rows[0].databaseName, staging);
          assert.equal(rows[0].account.split("@")[0], user);
          await assert.rejects(conn.query(`SELECT * FROM \`${decoy}\`.fixture`));
          await assert.rejects(
            conn.query(`INSERT INTO \`${decoy}\`.fixture VALUES (?, ?)`, [10 + i, 1]),
          );
          await assert.rejects(conn.query("CREATE TABLE forbidden (id INT)"));
          await assert.rejects(conn.query("SELECT User FROM mysql.user"));
          await assert.rejects(
            conn.query(`GRANT SELECT ON \`${decoy}\`.* TO '${user}'@'127.0.0.1'`),
          );
        }),
      );
      await conns[0].beginTransaction();
      await conns[0].query("INSERT INTO fixture VALUES (1, 10)");
      await assert.rejects(conns[0].query(`UPDATE \`${decoy}\`.fixture SET value = 0`));
      await conns[0].rollback();
      assert.equal(
        Number((await root.query(`SELECT COUNT(*) AS count FROM \`${staging}\`.fixture`))[0].count),
        0,
      );
      assert.equal(
        Number((await root.query(`SELECT value FROM \`${decoy}\`.fixture WHERE id = 1`))[0].value),
        99,
      );
    } finally {
      await Promise.all(conns.map((conn) => conn.release()));
    }
    const prisma = new PrismaClient({
      adapter: new PrismaMariaDb({
        host: "127.0.0.1",
        port: 33078,
        user,
        password,
        database: staging,
        connectionLimit: 3,
      }),
    });
    try {
      const results = await Promise.all(
        Array.from(
          { length: 3 },
          () => prisma.$queryRaw<{ databaseName: string }[]>`SELECT DATABASE() AS databaseName`,
        ),
      );
      assert.ok(results.every((rows) => rows[0].databaseName === staging));
      await assert.rejects(prisma.$queryRawUnsafe(`SELECT * FROM \`${decoy}\`.fixture`));
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`INSERT INTO fixture VALUES (2, 20)`;
          await tx.$queryRawUnsafe(`SELECT * FROM \`${decoy}\`.fixture`);
        }),
      );
      assert.equal(
        Number((await root.query(`SELECT COUNT(*) AS count FROM \`${staging}\`.fixture`))[0].count),
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
    await pool.end();
    pool = undefined;
    await root.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user}'@'127.0.0.1'`);
    const replacement = await mariadb.createConnection({
      host: "127.0.0.1",
      port: 33078,
      user,
      password,
      database: "information_schema",
    });
    try {
      await assert.rejects(replacement.query(`SELECT * FROM \`${staging}\`.fixture`));
    } finally {
      await replacement.end();
    }
  } finally {
    if (pool) await pool.end();
    if (decoyUserCreated) await root.query(`DROP USER '${decoyUser}'@'127.0.0.1'`);
    if (userCreated) await root.query(`DROP USER '${user}'@'127.0.0.1'`);
    if (stagingCreated) await root.query(`DROP DATABASE \`${staging}\``);
    if (decoyCreated) await root.query(`DROP DATABASE \`${decoy}\``);
    await root.end();
  }
  console.log(
    "PASS isolated database user: pool, transaction, denied cross-schema and DDL, rollback, revocation, replacement connection.",
  );
}
main().catch(() => {
  console.error("Isolation probe failed; private diagnostics withheld.");
  process.exitCode = 1;
});
