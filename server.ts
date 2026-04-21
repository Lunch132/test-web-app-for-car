import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for "incoming messages" from the internet
  let messages: any[] = [
    { id: 1, text: "System starting up. Checking sensors.", sender: "Hardware", timestamp: new Date().toISOString() },
    { id: 2, text: "Wait, there's an unusual heat signature from the motor.", sender: "Sensor-04", timestamp: new Date().toISOString() },
  ];

  // Store for real telemetry data
  let telemetry = {
    speed: 0.42,
    cpu: 25,
    temp: 24.5,
    humidity: 62,
    soil: 15,
    battery: 88,
    lat: 35.6895,
    lon: 139.6917
  };

  // API to get current telemetry
  app.get("/api/telemetry", (req, res) => {
    res.json(telemetry);
  });

  // API to update telemetry (The "Entrance" for the car)
  app.post("/api/telemetry", (req, res) => {
    telemetry = { ...telemetry, ...req.body };
    console.log("[SERVER] Telemetry Updated:", telemetry);
    res.json({ status: "success", data: telemetry });
  });

  // API to get recent messages
  app.get("/api/messages", (req, res) => {
    res.json(messages);
  });

  // AI Analysis Proxy for Ollama (Local AI)
  app.post("/api/analyze", async (req, res) => {
    const { text } = req.body;
    try {
      const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3", // 你本地安装的模型名字
          prompt: `你是一个智能小车分析助手。请分析指令并在JSON中返回: sentiment, urgency (low, medium, high), summary (中文总结), recommendation (中文建议)。指令内容: "${text}"`,
          stream: false,
          format: "json"
        }),
      });

      if (ollamaResponse.ok) {
        const data = await ollamaResponse.json();
        const result = JSON.parse(data.response);
        return res.json(result);
      }
      throw new Error("Ollama connection failed");
    } catch (err) {
      console.error("[SERVER] AI Analysis Error:", err);
      res.status(502).json({ error: "Local AI Offline" });
    }
  });

  // API to "receive" a message from the internet (e.g. from another bot or user)
  app.post("/api/receive", (req, res) => {
    const { text, sender } = req.body;
    console.log(`[SERVER] Received message from ${sender}: ${text}`);
    if (!text) return res.status(400).json({ error: "Message text is required" });
    
    const newMessage = {
      id: Date.now(),
      text,
      sender: sender || "Anonymous",
      timestamp: new Date().toISOString(),
    };
    messages.push(newMessage);
    // Keep last 50 messages
    if (messages.length > 50) messages.shift();
    
    res.json(newMessage);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
