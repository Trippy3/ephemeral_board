import fs from "node:fs";
import { bin, install, Tunnel } from "cloudflared";
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

async function main(): Promise<void> {
  await ensureCloudflared();

  const { port, close } = await startServer();
  const localUrl = `http://localhost:${port}`;
  console.log(`\n  Local:   ${localUrl}`);
  console.log("  Starting Cloudflare Tunnel...");

  const tunnel = Tunnel.quick(localUrl);

  let publicUrl: string;
  try {
    publicUrl = await waitForTunnelUrl(tunnel);
  } catch (err) {
    console.error(err);
    await close();
    process.exit(1);
  }

  console.log(`  Tunnel:  ${publicUrl}\n`);
  console.log("  ⚠ Anyone with this URL can read & write the board.\n");
  console.log("  Press Ctrl+C to stop.");

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\nShutting down...");
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
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
