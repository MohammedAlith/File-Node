const dotenv = require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

const app = express();
const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

// ---------------- CORS ----------------
const corsOptions = {
  origin: ["http://localhost:3000", "https://file-node.vercel.app, "], 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
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

// ---------------- Multer (diskStorage) ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ---------------- Static Files ----------------
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------------- Routes ----------------

// ✅ Upload files
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

      const filePath = `/uploads/${file.filename}`;

      const query = `
        INSERT INTO files (filename, filepath, description, filetype)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [file.originalname, filePath, description, filetype];
      const result = await pool.query(query, values);
      insertedFiles.push(result.rows[0]);
    }

    res.json({ message: "Files uploaded successfully!", files: insertedFiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving files to DB" });
  }
});

// ✅ Get all files
app.get("/files", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM files ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching files" });
  }
});


// ✅ Delete file
app.delete("/files/:id", async (req, res) => {
  try {
    const { id } = req.params;
 
    const result = await db`SELECT * FROM files WHERE id = ${id};`;
     await db`DELETE FROM files WHERE id = ${id};`;
   
   const __filename = fileURLToPath(import.meta.url)
    const file = result[0];
    const filePath = path.join(path.dirname(__filename),file.pathname.replace("/uploads/", "uploads/"));
      console.log(filePath,"ljjk")
    fs.unlinkSync(filePath);
    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.warn(err)
    res.json({ message: "File deleted successfully in db" });
  }
});
// ✅ Download file
app.get("/files/:id/download", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT filename, filepath FROM files WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).send("File not found in DB");

    const { filename, filepath } = result.rows[0];
    const absolutePath = path.join(__dirname, filepath);

    res.download(absolutePath, filename);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading file");
  }
});

// ✅ Update file
app.put("/files/:id", async (req, res) => {
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

// Root
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// ---------------- Start server (for local dev) ----------------
if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
