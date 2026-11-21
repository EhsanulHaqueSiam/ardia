import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const LAUNCHER = fileURLToPath(new URL("./ardia-launch", import.meta.url));

function executable(path, body) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function launch(t, args, { command = "data", env = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ardia-launch-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtime = join(root, "lib/ardia");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, "ardia-launch"), readFileSync(LAUNCHER, "utf8").replaceAll("/proc/sys/", `${root}/proc/sys/`));
  chmodSync(join(runtime, "ardia-launch"), 0o755);
  executable(join(runtime, "chrome"), 'printf "browser %s\\n" "$@"');
  const homes = { data: join(root, "data/ardia/cli"), own: join(root, "own"), home: join(root, "home/.local/share/ardia/cli") };
  if (command) {
    executable(join(homes[command], "9.9.9/bin/ardia"), 'printf "command %s\\n" "$@"');
    symlinkSync("9.9.9", join(homes[command], "current"));
  }
  writeFileSync(join(root, "page"), "");
  const variables = { PATH: process.env.PATH, XDG_DATA_HOME: join(root, "data"), HOME: join(root, "home"), ...env };
  if (variables.ARDIA_CLI_HOME) variables.ARDIA_CLI_HOME = join(root, variables.ARDIA_CLI_HOME);
  const result = spawnSync(join(runtime, "ardia-launch"), args, { cwd: root, env: variables, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trimEnd().split("\n");
}

test("a command word reaches the installed ardia command, which this launcher shadows when it comes first on PATH", (t) => {
  assert.deepEqual(launch(t, ["browse", "open", "https://example.com"]), ["command browse", "command open", "command https://example.com"]);
});

test("the command is found where its installer puts it", (t) => {
  assert.deepEqual(launch(t, ["tabs"], { command: "own", env: { ARDIA_CLI_HOME: "own" } }), ["command tabs"]);
  assert.deepEqual(launch(t, ["notes"], { command: "home", env: { XDG_DATA_HOME: "relative" } }), ["command notes"]);
});

test("hosts, URLs, switches and files still open in the browser", (t) => {
  for (const argument of ["example.com", "https://example.com", "--new-window", "page"]) {
    assert.deepEqual(launch(t, [argument]), [`browser ${argument}`], argument);
  }
  assert.deepEqual(launch(t, []), ["browser"]);
});

test("without the command installed a word opens in the browser as before", (t) => {
  assert.deepEqual(launch(t, ["browse"], { command: null }), ["browser browse"]);
});
