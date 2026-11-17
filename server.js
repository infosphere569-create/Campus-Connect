import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));


// Gemini Chat API Proxy
app.post('/api/chat', async (req, res) => {
  const { messages, history } = req.body;
  
  if (!messages || !messages.length) {
    return res.status(400).json({ error: "No messages provided" });
  }

  const lastMessage = messages[messages.length - 1].content;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'YOUR_API_KEY') {
    console.error('[Gemini API Error]: GEMINI_API_KEY is missing or using placeholder.');
    return res.status(500).json({ error: "AI assistant is not configured. Please select your Gemini API key in the **Settings > Secrets** panel to enable the Campus Assistant." });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const chat = ai.chats.create({
      model: "gemini-3.8-flash",
      config: {
        systemInstruction: "You are the Campus Connect One Assistant. Your role is to help university students discover clubs, events, and campus life on our platform. Be helpful, enthusiastic, and concise. If asked about technical issues, suggest contacting support@campusconnectone.online. You can also provide small suggestions for student activities, study tips, or how to get involved in the campus community.",
      },
      history: history || []
    });

    const result = await chat.sendMessage({
      message: lastMessage
    });

    res.json({ 
      content: result.text,
      history: await chat.getHistory()
    });
  } catch (err) {
    console.error('[Gemini API Error Detail]:', err);
    let errorMessage = "Failed to connect to AI assistant. Please try again later.";
    
    const errStr = String(err).toLowerCase();
    if (errStr.includes('api_key_invalid') || errStr.includes('400') || errStr.includes('invalid api key')) {
      errorMessage = "The AI Assistant's API key is invalid or not set. Please go to the **Settings > Secrets** panel in AI Studio and select a valid Gemini API key to enable this feature.";
    } else if (errStr.includes('403') || errStr.includes('permission_denied')) {
      errorMessage = "AI assistant permission denied. Please verify your API key selection in the **Settings > Secrets** panel.";
    } else if (errStr.includes('429') || errStr.includes('resource_exhausted')) {
      errorMessage = "AI assistant is busy (rate limit reached). Please wait a moment and try again.";
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Aliases for icons directory to guarantee icons resolve whether requested as /icon/* or /icons/*
app.use('/icons', express.static(path.join(__dirname, 'icon')));
app.use('/icon', express.static(path.join(__dirname, 'icon')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

// Serve static files with html extension support
app.use(express.static(__dirname, {
  extensions: ['html'],
  index: 'index.html'
}));

// Clean public URLs for shared hackathons
app.get(['/h/:id', '/hackathon/:id'], (req, res) => {
  res.sendFile(path.join(__dirname, 'hackathon.html'));
});

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
  console.log(`Campus Connect One running at http://${HOST}:${PORT}`);
});
