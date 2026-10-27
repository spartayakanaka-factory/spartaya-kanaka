import { describe, expect, it } from "vitest";
import { assertCompatibleDatabaseVersion } from "./database-engine";

describe("staging database engine compatibility", () => {
  it("accepts the verified Hostinger MariaDB 11.8.9 version string", () => {
    expect(assertCompatibleDatabaseVersion("11.8.9-MariaDB-log")).toEqual({
      engine: "MariaDB",
      version: "11.8.9",
      minimumVersion: "10.2.1",
    });
  });

  it("extracts the MariaDB version from a MySQL-compatible version prefix", () => {
    expect(assertCompatibleDatabaseVersion("5.5.5-11.8.9-MariaDB-log").version).toBe("11.8.9");
  });

  it("accepts only engines new enough to enforce the inventory CHECK constraints", () => {
    expect(assertCompatibleDatabaseVersion("10.2.1-MariaDB").engine).toBe("MariaDB");
    expect(assertCompatibleDatabaseVersion("8.0.16").engine).toBe("MySQL");
    expect(() => assertCompatibleDatabaseVersion("10.2.0-MariaDB")).toThrow(/10\.2\.1/);
    expect(() => assertCompatibleDatabaseVersion("8.0.15")).toThrow(/8\.0\.16/);
  });

  it("fails closed for an unknown version string", () => {
    expect(() => assertCompatibleDatabaseVersion("MariaDB current")).toThrow(/Unrecognized/);
  });
});
