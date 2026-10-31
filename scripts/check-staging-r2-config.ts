import { stagingR2ConfigIssues } from "../src/lib/commerce/staging-r2-config";

const issues = stagingR2ConfigIssues(process.env);
if (issues.length) {
  console.error("R2 configuration requires review:", issues.join(", "));
  process.exitCode = 1;
} else {
  console.log(
    "R2 configuration syntax passes. Ownership, isolation, private access, CORS, persistence, and credentials remain UNVERIFIED.",
  );
}
