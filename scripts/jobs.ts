// Local stand-in for Vercel Cron: calls the running app's cron endpoint.
//   npm run jobs          every minute, until Ctrl+C
//   npm run jobs -- once  a single run (add "digest" to also send the daily hours digest)
// Needs `npm run dev` running and CRON_SECRET in .env.
const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .env first.");
  process.exit(1);
}
const args = process.argv.slice(2);

async function call(job: string) {
  const res = await fetch(`${base}/api/cron/${job}`, { headers: { Authorization: `Bearer ${secret}` } });
  const body = await res.json().catch(() => ({}));
  console.log(new Date().toLocaleTimeString(), job, res.status, JSON.stringify(body.results ?? body));
}

async function tick() {
  try {
    await call("all");
    if (args.includes("digest")) await call("hours-digest");
  } catch (err) {
    console.error("Couldn't reach the app. Is `npm run dev` running?", (err as Error).message);
  }
}

await tick();
if (!args.includes("once")) setInterval(tick, 60000);

export {};
