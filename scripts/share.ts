import { spawn } from "node:child_process";
import fs from "node:fs";
import { bin, install, Tunnel } from "cloudflared";
import qrcode from "qrcode-terminal";
import { startServer } from "../server.js";

async function ensureCloudflared(): Promise<void> {
  if (fs.existsSync(bin)) return;
  console.log("Downloading cloudflared binary (first-time setup)...");
  try {
    await install(bin);
    console.log("cloudflared installed.");
  } catch (err) {
    console.error("\nFailed to download cloudflared automatically.");
    console.error(
      "Install it manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    );
    throw err;
  }
}

async function waitForTunnelUrl(tunnel: Tunnel): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const onUrl = (url: string) => {
      tunnel.off("exit", onExit);
      resolve(url);
    };
    const onExit = (code: number | null) => {
      tunnel.off("url", onUrl);
      reject(new Error(`cloudflared exited (code ${code}) before url was received`));
    };
    tunnel.once("url", onUrl);
    tunnel.once("exit", onExit);
  });
}

function renderQrCode(url: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(url, { small: true }, (qr: string) => resolve(qr));
  });
}

function indent(block: string, prefix = "  "): string {
  return block
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");
}

function printBanner(localUrl: string, tunnelUrl: string, qr: string): void {
  const rule = "─".repeat(64);
  console.log(`\n${rule}`);
  console.log("  Ephemeral Board is live");
  console.log("");
  console.log(`  Local:    ${localUrl}`);
  console.log(`  Tunnel:   ${tunnelUrl}`);
  console.log("");
  console.log(indent(qr));
  console.log("  ⚠ Anyone with this URL can read & write the board.");
  console.log("");
  console.log("  [b] open in browser   [c] copy URL   [q | Ctrl+C] stop");
  console.log(`${rule}\n`);
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];
  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      console.error(`\n→ failed to open browser (${command}): ${err.message}`);
    });
    child.unref();
  } catch (err) {
    console.error("\n→ failed to open browser:", err);
  }
}

function copyToClipboard(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[] = [];
  if (platform === "darwin") {
    command = "pbcopy";
  } else if (platform === "win32") {
    command = "clip";
  } else if (process.env.WAYLAND_DISPLAY) {
    command = "wl-copy";
  } else {
    command = "xclip";
    args = ["-selection", "clipboard"];
  }
  try {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    child.on("error", (err) => {
      console.error(
        `\n→ failed to copy via ${command}: ${err.message} ` +
          `(install ${command} or use [b] to open in browser instead)`,
      );
    });
    child.stdin.write(url);
    child.stdin.end();
  } catch (err) {
    console.error("\n→ failed to copy to clipboard:", err);
  }
}

const CTRL_C = String.fromCharCode(3);

function setupInteractiveKeys(url: string, shutdown: () => void): () => void {
  if (!process.stdin.isTTY) return () => undefined;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  const onData = (data: string) => {
    const key = data.toLowerCase();
    if (key === "b") {
      console.log("→ opening in browser…");
      openInBrowser(url);
    } else if (key === "c") {
      console.log("→ copying URL to clipboard…");
      copyToClipboard(url);
    } else if (key === "q" || data === CTRL_C) {
      shutdown();
    }
  };
  process.stdin.on("data", onData);
  return () => {
    process.stdin.off("data", onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}

async function main(): Promise<void> {
  await ensureCloudflared();

  const { port, close } = await startServer();
  const localUrl = `http://localhost:${port}`;
  console.log("Starting Cloudflare Tunnel…");

  const tunnel = Tunnel.quick(localUrl);

  let publicUrl: string;
  try {
    publicUrl = await waitForTunnelUrl(tunnel);
  } catch (err) {
    console.error(err);
    await close();
    process.exit(1);
  }

  const qr = await renderQrCode(publicUrl);
  printBanner(localUrl, publicUrl, qr);

  let stopping = false;
  let teardownKeys: () => void = () => undefined;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    teardownKeys();
    console.log("\nShutting down…");
    void (async () => {
      try {
        tunnel.stop();
      } catch {
        // best-effort
      }
      try {
        await close();
      } catch {
        // best-effort
      }
      process.exit(0);
    })();
  };

  teardownKeys = setupInteractiveKeys(publicUrl, shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
