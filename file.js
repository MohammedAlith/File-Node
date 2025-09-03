// server.js
const dotenv= require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");

const app = express();
const port = process.env.port|| 8000;

const {PGHOST, PGDATABASE, PGUSER, PGPASSWORD}=process.env;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection
const pool = new Pool({
  host: PGHOST,
  user: PGUSER,
  password:PGPASSWORD,
  database: PGDATABASE,
  port: 5432,
  ssl:{
    require:true
  }
});


// app.get("/",async(req,res)=>{
//   const client = await pool.connect();
//   try{

//   }catch(errors){
//     console.log(errors);
//   }finally{
//     client.release();
//   }
// })

// Ensure uploads folder exists
const folderLocation = path.join(__dirname, "uploads");
if (!fs.existsSync(folderLocation)) fs.mkdirSync(folderLocation);



// Serve uploaded files
app.use("/uploads", express.static(folderLocation));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, folderLocation),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// POST: Upload files with descriptions
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

      const query = `
        INSERT INTO files (filename, filepath, description, filetype)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [file.originalname, `/uploads/${file.filename}`, description, filetype];
      const result = await pool.query(query, values);
      insertedFiles.push(result.rows[0]);
    }
    res.json({ message: "Files uploaded successfully!", files: insertedFiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving files to DB" });
  }

});

// GET: Fetch all uploaded files
app.get("/uploads/files", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM files ORDER BY id ");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching files" });
  }finally{
    client.release();
  }

});

// DELETE: Remove a file by ID
app.delete("/uploads/files/:id", async (req, res) => {
   const client = await pool.connect();

  const { id } = req.params;
  try {
    const fileRes = await client.query("SELECT * FROM files WHERE id=$1", [id]);
    if (fileRes.rows.length === 0) return res.status(404).json({ message: "File not found" });

    const filepath = path.join(__dirname, fileRes.rows[0].filepath);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath); // delete file from disk

    await pool.query("DELETE FROM files WHERE id=$1", [id]);
    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting file" });
  }finally{
    client.release();
  }
});

app.get("/uploads/download/:id", async (req, res) => {
   const client = await pool.connect();
  const { id } = req.params;

  try {
    // Fetch from DB
    const result = await client.query("SELECT filename, filepath FROM files WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).send("File not found in DB");

    const { filename, filepath } = result.rows[0];
    const fullPath = path.join(__dirname, filepath);

    if (!fs.existsSync(fullPath)) return res.status(404).send("File missing on server");

    res.download(fullPath, filename); // download with original name
  } catch (err) {
    console.error(err);
    res.status(500).send("Error downloading file");
  }finally{
    client.release();
  }
});


app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
