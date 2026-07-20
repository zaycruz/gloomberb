import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { initDataDir, saveConfig } from "./node";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("IJT config storage permissions", () => {
  test("creates owned config files without group or world access", async () => {
    const parent = await mkdtemp(join(tmpdir(), "ijt-config-"));
    createdDirs.push(parent);
    const dataDir = join(parent, "data");

    const config = await initDataDir(dataDir);
    await saveConfig(config);

    if (process.platform !== "win32") {
      expect((await stat(dataDir)).mode & 0o077).toBe(0);
      expect((await stat(join(dataDir, "config.json"))).mode & 0o077).toBe(0);
    }
  });

});
