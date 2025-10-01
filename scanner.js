// scanner.js
// Exported function: scanText(code, filename)
// Returns an object: { file, modern: [{id,name,baseline}], risky: [name], unused: [varNames] }

import * as acorn from "acorn";
import { simple as walk } from "acorn-walk";
import { features } from "web-features";

// Quick regex-based patterns mapped to feature ids
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

// Risky quick regex patterns (fallback)
const RISKY_REGEX = [
  { name: "eval()", re: /\beval\s*\(/i },
  { name: "document.write()", re: /document\.write\s*\(/i },
  { name: "innerHTML assignment", re: /\.innerHTML\s*=/i },
  { name: "new Function()", re: /new\s+Function\s*\(/i },
  { name: "setTimeout/setInterval with string", re: /\bset(Time|Interval)\s*\(\s*['"`]/i },
  { name: "with statement", re: /\bwith\s*\(/i }
];

function getBaseline(featureId) {
  const f = features[featureId];
  if (!f) return null;
  return f.status?.baseline ?? null;
}

/* AST-based JS analysis returns { modern: [], risky: [], unused: [] } */
function analyzeJS(code) {
  const risky = new Set();
  const modern = new Set();
  const declared = new Set();
  const referenced = new Set();

  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: "module", locations: false });
  } catch (err) {
    // fallback to script parsing if module parse fails
    try {
      ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: "script", locations: false });
    } catch (err2) {
      // parsing failed, return empty arrays (regex fallback will catch many things)
      return { modern: [], risky: [], unused: [] };
    }
  }

  walk(ast, {
    CallExpression(node, state, ancestors) {
      ancestors = ancestors || [];
      const callee = node.callee;
      if (callee.type === "Identifier") {
        if (callee.name === "eval") risky.add("eval()");
        if (callee.name === "fetch") modern.add("fetch");
        if (callee.name === "setTimeout" || callee.name === "setInterval") {
          if (node.arguments && node.arguments[0] && node.arguments[0].type === "Literal" && typeof node.arguments[0].value === "string") {
            risky.add("timer-string");
          }
        }
      } else if (callee.type === "MemberExpression") {
        const prop = callee.property && (callee.property.name || callee.property.value);
        const obj = callee.object && (callee.object.name || (callee.object.object && callee.object.object.name));
        if (obj === "document" && prop === "write") risky.add("document.write()");
        // detect navigator.serviceWorker.register(...) via MemberExpression chain
      }
    },

    NewExpression(node) {
      if (node.callee && node.callee.type === "Identifier") {
        const name = node.callee.name;
        if (name === "Function") risky.add("new Function()");
        if (name === "WebSocket") modern.add("websocket");
        if (name === "OffscreenCanvas") modern.add("offscreen-canvas");
      }
    },

    AssignmentExpression(node) {
      if (node.left && node.left.type === "MemberExpression") {
        const prop = node.left.property && (node.left.property.name || node.left.property.value);
        if (prop === "innerHTML" || prop === "outerHTML") risky.add("innerHTML assignment");
      }
    },

    MemberExpression(node) {
      if (node.object && node.property && node.object.type === "Identifier" && node.property.type === "Identifier") {
        if (node.object.name === "navigator" && node.property.name === "serviceWorker") modern.add("service-workers");
      }
    },

    VariableDeclarator(node) {
      if (node.id && node.id.type === "Identifier") {
        declared.add(node.id.name);
      }
    },

    Identifier(node, state, ancestors) {
      // mark references, but avoid counting declaration identifiers again
      ancestors = ancestors || [];
      const parent = ancestors.length >= 1 ? ancestors[ancestors.length - 1] : null;
      if (parent && (parent.type === "VariableDeclarator" && parent.id === node)) {
        // declaration — don't mark as reference
        return;
      }
      // function declaration name
      if (parent && (parent.type === "FunctionDeclaration" && parent.id === node)) return;
      // otherwise count as reference
      referenced.add(node.name);
    },

    AwaitExpression() {
      modern.add("async-await");
    },

    ImportDeclaration() {
      modern.add("es-modules");
    },

    ExportNamedDeclaration() {
      modern.add("es-modules");
    }
  });

  // compute unused variables heuristic: declared - referenced
  const unused = [];
  for (const d of declared) {
    if (!referenced.has(d)) unused.push(d);
  }

  return { modern: Array.from(modern), risky: Array.from(risky), unused };
}

/* scanText: entry point for UI & server */
export function scanText(text, filename = "input") {
  const ext = (filename && filename.toLowerCase().split('.').pop()) || "";
  const modernSet = new Set();
  const riskySet = new Set();
  const unusedByFile = [];

  // 1) quick regex scans
  for (const p of REGEX_PATTERNS) {
    if (p.re.test(text)) {
      modernSet.add(p.id);
    }
  }
  for (const r of RISKY_REGEX) {
    if (r.re.test(text)) {
      riskySet.add(r.name);
    }
  }

  // 2) if JS/TS, run AST analysis for robust detection
  if (["js", "jsx", "ts", "tsx"].includes(ext) || filename === "input") {
    const analysis = analyzeJS(text);
    for (const id of analysis.modern) modernSet.add(id);
    for (const r of analysis.risky) riskySet.add(r);
    if (analysis.unused && analysis.unused.length) {
      unusedByFile.push(...analysis.unused);
    }
  } else if (ext === "html") {
    // extract inline <script> blocks and analyze them
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = scriptRegex.exec(text)) !== null) {
      const script = m[1];
      const analysis = analyzeJS(script);
      for (const id of analysis.modern) modernSet.add(id);
      for (const r of analysis.risky) riskySet.add(r);
      if (analysis.unused && analysis.unused.length) unusedByFile.push(...analysis.unused);
    }
  }

  // Map modern feature ids to readable name + baseline
  const modern = [];
  for (const id of modernSet) {
    const entry = REGEX_PATTERNS.find(p => p.id === id);
    const name = entry ? entry.name : id;
    const baseline = getBaseline(id);
    modern.push({ id, name, baseline });
  }

  return {
    file: filename,
    modern,
    risky: Array.from(riskySet),
    unused: unusedByFile
  };
}
