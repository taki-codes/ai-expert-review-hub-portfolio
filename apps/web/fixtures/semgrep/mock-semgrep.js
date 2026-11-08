const fs = require("node:fs");
const path = require("node:path");

const reportPath = path.resolve(__dirname, "sample-report.json");
const report = fs.readFileSync(reportPath, "utf8");

process.stdout.write(report);
