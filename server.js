const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ dest: 'uploads/' });

// Folders create karo
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

app.get('/', (req, res) => {
  res.send('PDF Pro Server is running!');
});

app.post('/convert/word-to-pdf', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const inputPath = path.resolve(req.file.path);
  const outputDir = path.resolve('outputs');

  const cmd = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Error:', stderr);
      fs.unlinkSync(inputPath);
      return res.status(500).json({ error: 'Conversion failed' });
    }

    // LibreOffice output file ka naam
    const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const uploadedBaseName = path.basename(inputPath);
    
    // Find the generated PDF
    const files = fs.readdirSync(outputDir);
    const pdfFile = files.find(f => f.endsWith('.pdf'));

    if (!pdfFile) {
      fs.unlinkSync(inputPath);
      return res.status(500).json({ error: 'PDF not generated' });
    }

    const pdfPath = path.join(outputDir, pdfFile);

    res.download(pdfPath, `${originalName}.pdf`, (err) => {
      // Cleanup
      try { fs.unlinkSync(inputPath); } catch(e) {}
      try { fs.unlinkSync(pdfPath); } catch(e) {}
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));