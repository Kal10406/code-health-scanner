# 🚀 Code Health Scanner

**Elevator Pitch:**  
A robust CLI tool that scans JavaScript, HTML, and CSS files for modern web features and risky patterns, helping developers write secure, maintainable, and modern web code.

---

## 📝 Project Story

### Inspiration
We noticed that developers often use risky patterns like `eval()` or `document.write()` unintentionally, which can compromise security.  
**Code Health Scanner** aims to automatically detect these patterns and highlight modern web APIs being used.

### What it does
- Scans files and directories for known modern web features (Fetch API, CSS Grid, IntersectionObserver, Async/Await, etc.).
- Detects risky code patterns like `eval()`, `document.write()`, and unsafe `innerHTML` usage.
- Provides a **baseline status** for features to check compatibility and modernity.
- Generates a summary report highlighting safe code ✅ and risky code ⚠️.

### How we built it
- **Language:** JavaScript (Node.js CLI)  
- **Libraries:** `acorn`, `acorn-walk`, `chalk`, `web-features`  
- **Pattern detection:** Regex + AST parsing  
- **Tested on:** `.js`, `.html`, `.css` files  

### Challenges we ran into
- Handling multiple file types with different syntax.
- Detecting risky patterns reliably without false positives.
- Aligning quick pattern detection with AST-based parsing for accuracy.

### Accomplishments
- Fully automated CLI tool with live scanning.
- Risky pattern detection + feature baseline status integrated.
- Ready for hackathon submission with demo-ready scripts.

### What we learned
- AST parsing can catch issues that regex alone misses.
- Node.js CLI tools are powerful for static analysis.
- Proper project structuring and documentation improves usability.

### What's next
- Extend support for frameworks like React, Vue, and Angular.
- Add customizable pattern definitions.
- Include a scoring system for overall “code health.”

---

## 🛠 Built With

- **Languages:** JavaScript, Node.js  
- **Libraries & Tools:** `acorn`, `acorn-walk`, `chalk`, `web-features`  
- **Platforms:** CLI (Windows/Mac/Linux)  
- **File types supported:** `.js`, `.jsx`, `.ts`, `.tsx`, `.html`, `.css`  

---

## ⚡ Demo

1. Clone the repository:  
```bash
git clone https://github.com/<your-username>/code-health-scanner.git
cd code-health-scanner
npm install

