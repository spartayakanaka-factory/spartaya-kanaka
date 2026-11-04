try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { url, cookie } = JSON.parse(input);
  const results = [];
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    const response = await fetch(url, { headers: { cookie } });
    results.push({ status: response.status, ms: Math.round(performance.now() - started) });
  }
  process.stdout.write(JSON.stringify(results));
} catch {
  process.stderr.write("Synthetic HTTP worker failed");
  process.exitCode = 1;
}
