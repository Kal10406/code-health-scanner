// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import { scanText } from "./scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage() });

// Scan code pasted in textarea
app.post("/api/scan", (req, res) => {
  const { code, filename } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });
  const result = scanText(code, filename || "input");
  res.json(result);
});

// Scan uploaded file
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const content = req.file.buffer.toString("utf-8");
  const result = scanText(content, req.file.originalname);
  res.json(result);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
