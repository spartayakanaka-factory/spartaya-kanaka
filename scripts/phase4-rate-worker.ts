import { allowReportRequest } from "../src/lib/server/commerce/report-rate";
import { getDatabase } from "../src/lib/server/database";
async function main() {
  try {
    console.log((await allowReportRequest(process.argv[2], 2, 60000)) ? "ALLOW" : "DENY");
  } finally {
    await getDatabase().$disconnect();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
