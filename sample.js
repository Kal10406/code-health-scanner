


import fs from "fs";
import path from "path";
import chalk from "chalk";

// ✅ Make sure a file is passed
const targetFile = process.argv[2];
if (!targetFile) {
  console.error(chalk.red("❌ Error: No target file provided."));
  process.exit(1);
}

const filePath = path.resolve(targetFile);
if (!fs.existsSync(filePath)) {
  console.error(chalk.red(`❌ Target not found: ${targetFile}`));
  process.exit(1);
}

// ✅ Read file contents
const content = fs.readFileSync(filePath, "utf-8");

console.log(chalk.blueBright(`\n🔍 Scanning: ${targetFile}\n`));

// Simple pattern checks
const patterns = [
  { name: "Fetch API", regex: /\bfetch\(/, id: "fetch", level: "high" },
  { name: "CSS Grid", regex: /display:\s*grid/, id: "css-grid", level: "medium" },
  { name: "IntersectionObserver", regex: /IntersectionObserver/, id: "intersection-observer", level: "high" },
  { name: "eval()", regex: /\beval\(/, id: "eval", level: "low" },
  { name: "Unused var x", regex: /\bvar x\b/, id: "unused-var", level: "warn" },
];

let found = [];

patterns.forEach(p => {
  if (p.regex.test(content)) {
    console.log(chalk.green(`  ✅ Found pattern: ${p.name}`));
    found.push(p);
  }
});

// ✅ Results section
console.log(chalk.yellowBright("\n=== Baseline status for detected features ==="));
found.forEach(p => {
  let status;
  if (p.level === "high") status = chalk.green("✅ High support");
  else if (p.level === "medium") status = chalk.yellow("⚠️ Medium support");
  else if (p.level === "low") status = chalk.red("❌ Avoid usage");
  else status = chalk.magenta("⚠️ Warning");

  console.log(`• ${chalk.cyan(p.id)}: ${status}`);
});
