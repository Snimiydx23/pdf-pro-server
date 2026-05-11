const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Adobe PDF Services SDK v4
const {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExportPDFJob,
  ExportPDFParams,
  ExportPDFTargetFormat,
  ExportPDFResult,       // ✅ Fix: resultType ke liye ye use karein
  CreatePDFJob,
  CreatePDFParams,
  CreatePDFResult,       // ✅ Fix: resultType ke liye ye use karein
  SDKError,
  ServiceUsageError,
  ServiceApiError
} = require('@adobe/pdfservices-node-sdk');

const app = express();
app.use(cors());

// =====================================================================
// CONFIG
// =====================================================================
const ADOBE_CLIENT_ID     = process.env.ADOBE_CLIENT_ID     || 'fbfe27005aac4a5e8e7aca3384bbd072';
const ADOBE_CLIENT_SECRET = process.env.ADOBE_CLIENT_SECRET || 'p8e-2zJ3HpxnDa3CnBSnIZ2SvJ-7xJHn2I18';

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
    adobe: ADOBE_CLIENT_ID !== 'YOUR_CLIENT_ID' ? 'configured' : 'NOT CONFIGURED'
  });
});

// =====================================================================
// HELPER: Adobe PDF Services credentials
// =====================================================================
function getAdobeCredentials() {
  return new ServicePrincipalCredentials({
    clientId: ADOBE_CLIENT_ID,
    clientSecret: ADOBE_CLIENT_SECRET
  });
}

// =====================================================================
// HELPER: LibreOffice (Office → PDF ke liye)
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
// HELPER: Adobe Export PDF (PDF → Word/PPT/Excel)
// ✅ Fix: ExportPDFResult class directly pass karein, ExportPDFJob.resultType nahi
// =====================================================================
async function adobeExportPDF(inputPath, targetFormat) {
  const credentials = getAdobeCredentials();
  const pdfServices = new PDFServices({ credentials });

  const inputStream = fs.createReadStream(inputPath);
  const inputAsset = await pdfServices.upload({
    readStream: inputStream,
    mimeType: MimeType.PDF
  });

  const params = new ExportPDFParams({ targetFormat });
  const job = new ExportPDFJob({ inputAsset, params });
  const pollingURL = await pdfServices.submit({ job });

  // ✅ Fix: resultType = ExportPDFResult (class reference), not ExportPDFJob.resultType
  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: ExportPDFResult
  });

  const resultAsset = pdfServicesResponse.result.asset;
  const streamAsset = await pdfServices.getContent({ asset: resultAsset });

  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });

  const extMap = {
    [ExportPDFTargetFormat.DOCX]: '.docx',
    [ExportPDFTargetFormat.PPTX]: '.pptx',
    [ExportPDFTargetFormat.XLSX]: '.xlsx'
  };
  const ext = extMap[targetFormat] || '.docx';
  const outputFile = path.join(outputDir, 'output' + ext);

  const writeStream = fs.createWriteStream(outputFile);
  await new Promise((resolve, reject) => {
    streamAsset.readStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { outputFile, outputDir };
}

// =====================================================================
// HELPER: Adobe Create PDF (Office → PDF)
// ✅ Fix: CreatePDFResult class directly pass karein
// =====================================================================
async function adobeCreatePDF(inputPath, mimeType) {
  const credentials = getAdobeCredentials();
  const pdfServices = new PDFServices({ credentials });

  const inputStream = fs.createReadStream(inputPath);
  const inputAsset = await pdfServices.upload({
    readStream: inputStream,
    mimeType
  });

  const params = new CreatePDFParams({});
  const job = new CreatePDFJob({ inputAsset, params });
  const pollingURL = await pdfServices.submit({ job });

  // ✅ Fix: resultType = CreatePDFResult
  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: CreatePDFResult
  });

  const resultAsset = pdfServicesResponse.result.asset;
  const streamAsset = await pdfServices.getContent({ asset: resultAsset });

  const outputDir = path.resolve('outputs', Date.now().toString());
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'output.pdf');

  const writeStream = fs.createWriteStream(outputFile);
  await new Promise((resolve, reject) => {
    streamAsset.readStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { outputFile, outputDir };
}

// =====================================================================
// TO PDF ROUTES
// =====================================================================

// WORD to PDF — Adobe (perfect formatting) → LibreOffice fallback
app.post('/convert/word-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));

    if (ADOBE_CLIENT_ID !== 'YOUR_CLIENT_ID') {
      try {
        const { outputFile, outputDir: oDir } = await adobeCreatePDF(inputPath, MimeType.DOCX);
        outputDir = oDir;
        return res.download(outputFile, originalName + '.pdf', () => {
          try { fs.unlinkSync(inputPath); } catch(e) {}
          try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
        });
      } catch(adobeErr) {
        console.warn('Adobe failed, falling back to LibreOffice:', adobeErr.message);
      }
    }

    outputDir = path.resolve('outputs', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });

  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// EXCEL to PDF — Adobe → LibreOffice fallback
app.post('/convert/excel-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));

    if (ADOBE_CLIENT_ID !== 'YOUR_CLIENT_ID') {
      try {
        const { outputFile, outputDir: oDir } = await adobeCreatePDF(inputPath, MimeType.XLSX);
        outputDir = oDir;
        return res.download(outputFile, originalName + '.pdf', () => {
          try { fs.unlinkSync(inputPath); } catch(e) {}
          try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
        });
      } catch(adobeErr) {
        console.warn('Adobe failed, falling back to LibreOffice:', adobeErr.message);
      }
    }

    outputDir = path.resolve('outputs', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });

  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// PPT to PDF — Adobe → LibreOffice fallback
app.post('/convert/ppt-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));

    if (ADOBE_CLIENT_ID !== 'YOUR_CLIENT_ID') {
      try {
        const { outputFile, outputDir: oDir } = await adobeCreatePDF(inputPath, MimeType.PPTX);
        outputDir = oDir;
        return res.download(outputFile, originalName + '.pdf', () => {
          try { fs.unlinkSync(inputPath); } catch(e) {}
          try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
        });
      } catch(adobeErr) {
        console.warn('Adobe failed, falling back to LibreOffice:', adobeErr.message);
      }
    }

    outputDir = path.resolve('outputs', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });
    const outFile = await convertWithLibreOffice(inputPath, outputDir, 'pdf');
    res.download(outFile, originalName + '.pdf', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });

  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: e.message });
  }
});

// =====================================================================
// FROM PDF ROUTES — Adobe Export
// =====================================================================

// PDF to WORD
app.post('/convert/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, '.pdf');
    const { outputFile, outputDir: oDir } = await adobeExportPDF(inputPath, ExportPDFTargetFormat.DOCX);
    outputDir = oDir;
    res.download(outputFile, originalName + '.docx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: 'Adobe conversion failed: ' + e.message });
  }
});

// PDF to PPT
app.post('/convert/pdf-to-ppt', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, '.pdf');
    const { outputFile, outputDir: oDir } = await adobeExportPDF(inputPath, ExportPDFTargetFormat.PPTX);
    outputDir = oDir;
    res.download(outputFile, originalName + '.pptx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: 'Adobe conversion failed: ' + e.message });
  }
});

// PDF to EXCEL
app.post('/convert/pdf-to-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const inputPath = path.resolve(req.file.path);
  let outputDir = null;

  try {
    const originalName = path.basename(req.file.originalname, '.pdf');
    const { outputFile, outputDir: oDir } = await adobeExportPDF(inputPath, ExportPDFTargetFormat.XLSX);
    outputDir = oDir;
    res.download(outputFile, originalName + '.xlsx', () => {
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.rmSync(outputDir, { recursive: true }); } catch(e) {}
    });
  } catch(e) {
    try { fs.unlinkSync(inputPath); } catch(e2) {}
    if (outputDir) try { fs.rmSync(outputDir, { recursive: true }); } catch(e2) {}
    res.status(500).json({ error: 'Adobe conversion failed: ' + e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
