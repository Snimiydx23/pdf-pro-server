const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const ILovePDFApi = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');

const app = express();
app.use(cors());

// =====================================================================
// CONFIG — apni keys yahan daal
// =====================================================================
const ILOVEPDF_PUBLIC_KEY = process.env.ILOVEPDF_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const ILOVEPDF_SECRET_KEY = process.env.ILOVEPDF_SECRET_KEY || 'YOUR_SECRET_KEY';

const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

// =====================================================================
// HEALTH CHECK
// =====================================================================
app.get('/', (req, res) => {
  let loStatus = 'NOT FOUND';
  try {
    const { execSync } = require('child_process');
    loStatus = execSync('libreoffice --version').toString().trim();
  } catch(e) {}
  res.json({
    service: 'PDF Converter Server',
    status: 'running',
    libreoffice: loStatus,
    ilovepdf: ILOVEPDF_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY' ? 'configured' : 'NOT CONFIGURED'
  });
});

// =====================================================================
// HELPER: LibreOffice conversion (to PDF)
// =====================================================================
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

// =====================================================================
// HELPER: ILovePDF conversion (from PDF)
// =====================================================================
async function convertWithILovePDF(inputPath, task, outputExt) {
  const instance = new ILovePDFApi(ILOVEPDF_PUBLIC_KEY, ILOVEPDF_SECRET_KEY);
  const myTask = instance.newTask(task);
  await myTask.start();

  const pdfFile = new ILovePDFFile(inputPath);
  await myTask.addFile(pdfFile);
  await myTask.process();

  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });

  await myTask.download(outputDir);

  // Find downloaded file
  const files = fs.readdirSync(outputDir);
  const outFile = files.find(f => f.endsWith(outputExt) || f.endsWith('.zip'));
  if (!outFile) throw new Error('Output file not found');

  return path.join(outputDir, outFile);
}

// =====================================================================
// TO PDF — LibreOffice (perfect for office files)
// =====================================================================

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

// =====================================================================
// FROM PDF — ILovePDF (perfect quality)
// =====================================================================

// PDF to WORD
app.post('/convert/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputPath = null;
  let outputDir = null;
  try {
    outputPath = await convertWithILovePDF(inputPath, 'pdfword', '.docx');
    outputDir = path.dirname(outputPath);
    const originalName = path.basename(req.file.originalname, '.pdf');

    // Check if zip
    if (outputPath.endsWith('.zip')) {
      res.download(outputPath, originalName + '.zip', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    } else {
      res.download(outputPath, originalName + '.docx', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    }
  } catch(e) {
    try { if(inputPath) fs.unlinkSync(inputPath); } catch(e2) {}
    try { if(outputDir) fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PDF to PPT
app.post('/convert/pdf-to-ppt', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputPath = null;
  let outputDir = null;
  try {
    outputPath = await convertWithILovePDF(inputPath, 'pdfpowerpoint', '.pptx');
    outputDir = path.dirname(outputPath);
    const originalName = path.basename(req.file.originalname, '.pdf');

    if (outputPath.endsWith('.zip')) {
      res.download(outputPath, originalName + '.zip', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    } else {
      res.download(outputPath, originalName + '.pptx', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    }
  } catch(e) {
    try { if(inputPath) fs.unlinkSync(inputPath); } catch(e2) {}
    try { if(outputDir) fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PDF to EXCEL
app.post('/convert/pdf-to-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputPath = null;
  let outputDir = null;
  try {
    outputPath = await convertWithILovePDF(inputPath, 'pdfexcel', '.xlsx');
    outputDir = path.dirname(outputPath);
    const originalName = path.basename(req.file.originalname, '.pdf');

    if (outputPath.endsWith('.zip')) {
      res.download(outputPath, originalName + '.zip', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    } else {
      res.download(outputPath, originalName + '.xlsx', () => {
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
      });
    }
  } catch(e) {
    try { if(inputPath) fs.unlinkSync(inputPath); } catch(e2) {}
    try { if(outputDir) fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
