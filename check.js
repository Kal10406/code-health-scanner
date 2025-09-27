// check.js  (drop-in replacement)
// Node.js ESM file. Requires: web-features, acorn, acorn-walk, chalk
import fs from "fs";
import path from "path";
import { features } from "web-features";
import * as acorn from "acorn";

import { simple as walk } from "acorn-walk";
import chalk from "chalk";

/* -------------------------
   Configuration: Patterns
   ------------------------- */
// Regex-based quick patterns (HTML/CSS or fallback)
const REGEX_PATTERNS = [
  { name: "Fetch API", re: /\bfetch\(/i, id: "fetch" },
  { name: "Service Workers", re: /\bnavigator\.serviceWorker\b|serviceWorker\.register/i, id: "service-workers" },
  { name: "CSS Grid", re: /display:\s*grid\b/i, id: "css-grid" },
  { name: "IntersectionObserver", re: /\bIntersectionObserver\b/i, id: "intersection-observer" },
  { name: "Web Animations API", re: /\bElement\.animate\(|new\s+Animation\b|AnimationEvent\b/i, id: "web-animations" },
  { name: "OffscreenCanvas", re: /\bOffscreenCanvas\b/i, id: "offscreen-canvas" },
  { name: "WebRTC", re: /\bRTCPeerConnection\b|\bgetUserMedia\b/i, id: "webrtc" },
  { name: "WebSocket", re: /\bnew\s+WebSocket\b/i, id: "websocket" },
  { name: "CSS container queries", re: /container-type:\s*\w+/i, id: "container-queries" },
  { name: "Async/Await", re: /\basync\b|\bawait\b/, id: "async-await" },
  { name: "ES Modules", re: /\bimport\b.+from\b|\bexport\b/, id: "es-modules" }
];

// Risky regex signatures (quick fallback for non-JS files)
const RISKY_REGEX = [
  { name: "eval()", re: /\beval\s*\(/i, id: "eval" },
  { name: "document.write()", re: /document\.write\s*\(/i, id: "document-write" },
  { name: "innerHTML assignment", re: /\.innerHTML\s*=/i, id: "innerHTML" },
  { name: "new Function()", re: /new\s+Function\s*\(/i, id: "new-function" },
  { name: "setTimeout/setInterval with string", re: /\bset(Time|Interval)\s*\(\s*['"`]/i, id: "timer-string" }
];

/* -------------------------
   Helpers
   ------------------------- */
function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    console.error(chalk.red("Cannot read file:"), file);
    process.exit(2);
  }
}

function reportHeader(file) {
  console.log(chalk.blueBright(`\n🔎 Scanning: ${file}\n`));
}

/* Get baseline status for a feature id (from web-features) */
function getBaseline(featureId) {
  const f = features[featureId];
  if (!f) return null;
  return f.status?.baseline ?? null;
}

/* Pretty print baseline results */
function printBaselineResults(featureIds) {
  if (featureIds.length === 0) {
    console.log(chalk.gray("No modern Baseline-mapped features detected."));
    return;
  }
  console.log(chalk.yellowBright("\n=== Baseline status for detected features ==="));
  for (const id of featureIds) {
    const baseline = getBaseline(id);
    if (!baseline) {
      console.log(chalk.magenta(`• ${id}: ⚠️ (feature ID not found in web-features package)`));
    } else if (typeof baseline === "string") {
      // common labels: 'high', 'low', etc.
      const label = baseline.toString();
      if (label.match(/high|widely|available/i)) {
        console.log(chalk.green(`• ${id}: ${label}`));
      } else if (label.match(/new|partial|medium|recent/i)) {
        console.log(chalk.yellow(`• ${id}: ${label}`));
      } else {
        console.log(chalk.cyan(`• ${id}: ${label}`));
      }
    } else {
      console.log(chalk.cyan(`• ${id}: ${JSON.stringify(baseline)}`));
    }
  }
}

/* -------------------------
   JS AST analysis
   ------------------------- */
function analyzeJS(code, filename) {
  const riskyFindings = new Set();
  const modernFeatures = new Set();
  const declared = new Set();
  const referenced = new Set();

  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: "module" });
  } catch (e) {
    // Try script mode if module parse fails
    try {
      ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: "script" });
    } catch (err) {
      console.error(chalk.red("⚠️ Failed to parse JS AST:"), err.message);
      // fall back to regex scanning below
      return { risky: Array.from(riskyFindings), modern: Array.from(modernFeatures), unused: [] };
    }
  }

  // Walk AST to detect patterns
  walk(ast, {
    // Call expressions: eval(...), setTimeout("..."), document.write(...)
    CallExpression(node) {
      // callee could be Identifier or MemberExpression
      if (node.callee && node.callee.type === "Identifier") {
        const name = node.callee.name;
        if (name === "eval") riskyFindings.add("eval()");
        if (name === "fetch") modernFeatures.add("fetch");
      } else if (node.callee && node.callee.type === "MemberExpression") {
        const prop = node.callee.property && node.callee.property.name;
        const obj = node.callee.object && node.callee.object.name;
        if (obj === "document" && prop === "write") riskyFindings.add("document.write()");
        if ((prop === "setTimeout" || prop === "setInterval") && node.arguments.length > 0) {
          const first = node.arguments[0];
          if (first.type === "Literal" && typeof first.value === "string") {
            riskyFindings.add(`${prop} with string`);
          }
        }
        if (prop === "observe" && obj === "IntersectionObserver") {
          modernFeatures.add("intersection-observer");
        }
        // detect new WebSocket usage like new WebSocket(...) (not via CallExpression usually)
      }
    },

    // NewExpression: new Function(...), new WebSocket(...)
    NewExpression(node) {
      if (node.callee && node.callee.type === "Identifier") {
        const name = node.callee.name;
        if (name === "Function") riskyFindings.add("new Function()");
        if (name === "WebSocket") modernFeatures.add("websocket");
        if (name === "OffscreenCanvas") modernFeatures.add("offscreen-canvas");
      }
    },

    // Assignment: element.innerHTML = ...
    AssignmentExpression(node) {
      if (node.left && node.left.type === "MemberExpression") {
        const propName = node.left.property && (node.left.property.name || node.left.property.value);
        if (propName === "innerHTML" || propName === "outerHTML") {
          riskyFindings.add("innerHTML assignment");
        }
      }
    },

    // MemberExpression: navigator.serviceWorker (detect service workers)
    MemberExpression(node) {
      if (node.object && node.property) {
        const obj = node.object.name || (node.object.type === "MemberExpression" && node.object.property && node.object.property.name);
        const prop = node.property.name;
        if (obj === "navigator" && prop === "serviceWorker") modernFeatures.add("service-workers");
      }
    },

    // Identifier usage (collect references)
    Identifier(node, state, ancestors) {
      // skip if this identifier is part of a declaration that defines it
      const parent = (ancestors && ancestors.length >= 2) ? ancestors[ancestors.length - 2] : null;

      if (parent) {
        // variable declaration
        if (parent.type === "VariableDeclarator" && parent.id === node) {
          declared.add(node.name);
          return;
        }
        // function declaration name
        if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression") && parent.id === node) {
          declared.add(node.name);
          return;
        }
      }
      // otherwise count as a reference
      referenced.add(node.name);
    },

    // Detect async/await
    AwaitExpression() {
      modernFeatures.add("async-await");
    },

    // ImportDeclaration / ExportDeclaration => ES modules
    ImportDeclaration() {
      modernFeatures.add("es-modules");
    },
    ExportNamedDeclaration() {
      modernFeatures.add("es-modules");
    }
  });

  // Heuristic: find unused variables = declared - referenced
  const unused = [];
  for (const d of declared) {
    if (!referenced.has(d)) unused.push(d);
  }

  return { risky: Array.from(riskyFindings), modern: Array.from(modernFeatures), unused };
}

/* -------------------------
   Main CLI flow
   ------------------------- */

if (process.argv.length < 3) {
  console.log("Usage: node check.js <file-or-folder>");
  process.exit(0);
}

const target = process.argv[2];
let stat;
try {
  stat = fs.statSync(target);
} catch (e) {
  console.error(chalk.red("Target not found:"), target);
  process.exit(2);
}

let files = [];
if (stat.isDirectory()) {
  const all = fs.readdirSync(target);
  files = all
    .filter(f => /\.(js|jsx|ts|tsx|html|css)$/.test(f))
    .map(f => path.join(target, f));
} else {
  files = [target];
}

/* Aggregate results across files */
const globalModern = new Set();
const globalRisky = new Map(); // map pattern -> Set(files)
const globalUnused = new Map(); // file -> [vars]

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  const text = readText(file);
  reportHeader(file);

  // 1) Regex-based quick scan for features & risky items
  const foundRegexFeatures = new Set();
  for (const p of REGEX_PATTERNS) {
    if (p.re.test(text)) {
      foundRegexFeatures.add(p.id);
      console.log(chalk.green(`  ✅ Found pattern: ${p.name}`));
      globalModern.add(p.id);
    }
  }
  for (const r of RISKY_REGEX) {
    if (r.re.test(text)) {
      console.log(chalk.red(`  ⚠️ Found risky pattern: ${r.name}`));
      if (!globalRisky.has(r.name)) globalRisky.set(r.name, new Set());
      globalRisky.get(r.name).add(file);
    }
  }

  // 2) If it's a .js/.jsx/.ts file — do AST analysis for robust detection
  if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") {
    const analysis = analyzeJS(text, file);

    // Modern features found via AST
    for (const m of analysis.modern) {
      if (!globalModern.has(m)) {
        console.log(chalk.green(`  ✅ Detected modern feature (AST): ${m}`));
      }
      globalModern.add(m);
    }

    // Risky patterns found via AST
    for (const r of analysis.risky) {
      console.log(chalk.red(`  ⚠️ Detected risky pattern (AST): ${r}`));
      if (!globalRisky.has(r)) globalRisky.set(r, new Set());
      globalRisky.get(r).add(file);
    }

    // Unused vars
    if (analysis.unused && analysis.unused.length > 0) {
      console.log(chalk.yellow(`  ⚠️ Possible unused variables: ${analysis.unused.join(", ")}`));
      globalUnused.set(file, analysis.unused);
    }
  } else {
    // For HTML/CSS files: also try to extract <script> blocks and analyze them as JS
    if (ext === ".html") {
      // Very simple extraction of inline <script>...</script>
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = scriptRegex.exec(text)) !== null) {
        const scriptContent = match[1];
        const analysis = analyzeJS(scriptContent, file + " (inline script)");
        for (const m of analysis.modern) {
          if (!globalModern.has(m)) {
            console.log(chalk.green(`  ✅ Detected modern feature in inline script: ${m}`));
          }
          globalModern.add(m);
        }
        for (const r of analysis.risky) {
          console.log(chalk.red(`  ⚠️ Detected risky pattern in inline script: ${r}`));
          if (!globalRisky.has(r)) globalRisky.set(r, new Set());
          globalRisky.get(r).add(file);
        }
        if (analysis.unused && analysis.unused.length > 0) {
          console.log(chalk.yellow(`  ⚠️ Possible unused variables in inline script: ${analysis.unused.join(", ")}`));
          if (!globalUnused.has(file)) globalUnused.set(file, []);
          globalUnused.set(file, (globalUnused.get(file) || []).concat(analysis.unused));
        }
      }
    }
  }
}

/* -------------------------
   Final consolidated report
   ------------------------- */

console.log(chalk.bold("\n\n======== Summary Report ========\n"));

// Modern features summary (print baseline statuses)
const modernList = Array.from(globalModern);
if (modernList.length > 0) {
  printBaselineResults(modernList);
} else {
  console.log(chalk.gray("No modern Baseline-mapped features detected across scanned files."));
}

// Risky patterns summary
if (globalRisky.size > 0) {
  console.log(chalk.redBright("\n=== Risky patterns detected ==="));
  for (const [pattern, filesSet] of globalRisky.entries()) {
    console.log(chalk.red(`• ${pattern} — ${Array.from(filesSet).join(", ")}`));
  }
} else {
  console.log(chalk.green("\nNo risky patterns detected."));
}

// Unused variables summary
if (globalUnused.size > 0) {
  console.log(chalk.yellowBright("\n=== Possible unused variables ==="));
  for (const [file, vars] of globalUnused.entries()) {
    console.log(chalk.yellow(`• ${file}: ${vars.join(", ")}`));
  }
} else {
  console.log(chalk.green("\nNo obvious unused variables detected."));
}

console.log(chalk.bold("\nScan complete.\n"));
