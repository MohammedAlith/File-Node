const dotenv = require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

// ---------------- CORS ----------------
const corsOptions = {
  origin: ["http://localhost:3000", "https://file-node.vercel.app"], // frontend URLs
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions)); // handles OPTIONS too

// ---------------- Middleware ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- PostgreSQL ----------------
const pool = new Pool({
  host: PGHOST,
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

// ---------------- Multer ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------------- Routes ----------------

// POST: Upload files
app.post("/uploads/files", upload.array("datas", 10), async (req, res) => {
  const files = req.files;
  let descriptions = [];

  try {
    const raw = req.body.descriptions || "[]";
    descriptions = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(descriptions)) descriptions = [descriptions];
  } catch (err) {
    return res.status(400).json({ message: "Descriptions must be a valid JSON array" });
  }

  if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });

  while (descriptions.length < files.length) descriptions.push("");
  descriptions = descriptions.slice(0, files.length);

  try {
    const insertedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const description = descriptions[i];
      const filetype = file.mimetype;

      // Dummy file URL (replace with cloud storage later if needed)
      const fileUrl = `https://example.com/${Date.now()}-${file.originalname}`;

      const query = `
        INSERT INTO files (filename, filepath, description, filetype)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [file.originalname, fileUrl, description, filetype];
      const result = await pool.query(query, values);
      insertedFiles.push(result.rows[0]);
    }

    res.json({ message: "Files uploaded successfully!", files: insertedFiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving files to DB" });
  }
});

// GET all files
app.get("/uploads/files", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM files ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching files" });
  }
});

// DELETE file by ID
app.delete("/uploads/files/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const fileRes = await pool.query("SELECT * FROM files WHERE id=$1", [id]);
    if (fileRes.rows.length === 0) return res.status(404).json({ message: "File not found" });

    await pool.query("DELETE FROM files WHERE id=$1", [id]);
    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting file" });
  }
});

// DOWNLOAD file by ID
app.get("/uploads/download/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT filename, filepath FROM files WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).send("File not found in DB");

    const { filepath } = result.rows[0];
    res.redirect(filepath);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading file");
  }
});

// UPDATE file by ID
app.put("/uploads/files/:id", async (req, res) => {
  const { id } = req.params;
  const { filename, description } = req.body;
  try {
    const result = await pool.query(
      "UPDATE files SET filename=$1, description=$2 WHERE id=$3 RETURNING *",
      [filename, description, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "File not found" });
    res.json({ message: "File updated successfully!", file: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating file" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// ---------------- Start server (for local dev) ----------------
if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
