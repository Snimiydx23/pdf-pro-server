const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

// Health check
app.get('/', (req, res) => {
  let loStatus = 'NOT FOUND';
  try {
    const { execSync } = require('child_process');
    loStatus = execSync('libreoffice --version').toString().trim();
  } catch(e) {}
  res.json({ service: 'PDF Converter Server', status: 'running', libreoffice: loStatus });
});

// Generic LibreOffice converter
function convertWithLibreOffice(inputPath, outputDir, format) {
  return new Promise((resolve, reject) => {
    const cmd = `libreoffice --headless --convert-to ${format} --outdir "${outputDir}" "${inputPath}"`;
    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      const files = fs.readdirSync(outputDir);
      const outFile = files.find(f => f !== path.basename(inputPath));
      if (!outFile) return reject(new Error('Output file not generated'));
      resolve(path.join(outputDir, outFile));
    });
  });
}

// WORD to PDF
app.post('/convert/word-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// EXCEL to PDF
app.post('/convert/excel-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PPT to PDF
app.post('/convert/ppt-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PDF to WORD
app.post('/convert/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'docx');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.docx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PDF to PPT (impress)
app.post('/convert/pdf-to-ppt', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pptx');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.pptx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PDF to EXCEL
app.post('/convert/pdf-to-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'xlsx');
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    res.download(outFile, originalName + '.xlsx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
