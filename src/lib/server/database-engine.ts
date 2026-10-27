export type CompatibleDatabaseEngine = "MySQL" | "MariaDB";

export type CompatibleDatabaseVersion = {
  engine: CompatibleDatabaseEngine;
  version: string;
  minimumVersion: string;
};

function atLeast(actual: number[], minimum: number[]) {
  for (let index = 0; index < minimum.length; index++) {
    if ((actual[index] ?? 0) > minimum[index]!) return true;
    if ((actual[index] ?? 0) < minimum[index]!) return false;
  }
  return true;
}

export function assertCompatibleDatabaseVersion(serverVersion: string): CompatibleDatabaseVersion {
  const engine: CompatibleDatabaseEngine = /mariadb/i.test(serverVersion) ? "MariaDB" : "MySQL";
  const versionMatches = [...serverVersion.matchAll(/(\d+)\.(\d+)\.(\d+)/g)];
  const matchedVersion = engine === "MariaDB" ? versionMatches.at(-1) : versionMatches[0];
  if (!matchedVersion) {
    throw new Error(`Unrecognized ${engine} server version; staging preflight stopped.`);
  }

  const actual = matchedVersion.slice(1).map(Number);
  const version = actual.join(".");
  const minimum = engine === "MariaDB" ? [10, 2, 1] : [8, 0, 16];
  const minimumVersion = minimum.join(".");
  if (!atLeast(actual, minimum)) {
    throw new Error(
      `${engine} ${version} is below ${minimumVersion}, the minimum for the committed inventory CHECK constraints.`,
    );
  }

  return { engine, version, minimumVersion };
}
