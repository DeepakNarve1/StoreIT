import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "dev", "--workspace=apps/api"]],
  ["npm", ["run", "dev", "--workspace=apps/web"]],
];

const children = commands.map(([command, args]) =>
  spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      CSS_TRANSFORMER_WASM: "",
    },
  }),
);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    if (signal) {
      shutdown(signal);
      process.exit(1);
      return;
    }

    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exit(code);
    }
  });
}
