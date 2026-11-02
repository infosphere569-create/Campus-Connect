import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Aliases for icons directory to guarantee icons resolve whether requested as /icon/* or /icons/*
app.use('/icons', express.static(path.join(__dirname, 'icon')));
app.use('/icon', express.static(path.join(__dirname, 'icon')));

// Serve static files with html extension support
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html'
}));

// Route fallback for extensionless navigation or unknown routes
app.get('*', (req, res) => {
  const possibleHtml = path.join(__dirname, `${req.path}.html`);
  res.sendFile(possibleHtml, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Campus Connect running at http://${HOST}:${PORT}`);
});
