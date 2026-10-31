import "dotenv/config";

let stopping = false;

function stop(signal: string): void {
  if (stopping) {
    return;
  }

  stopping = true;
  console.log(`[worker] ${signal} received; worker stopped safely.`);
  process.exit(0);
}

console.log("[worker] Stage 0 worker started. PostgreSQL queue polling will be added in task 2.");
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

// Keep the dedicated process alive until it receives a shutdown signal.
setInterval(() => undefined, 60_000);
