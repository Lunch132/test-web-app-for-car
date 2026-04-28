import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config"; // Important for local deployment to read .env

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

  // API to receive telemetry from the car
  app.post("/api/update_telemetry", (req, res) => {
    const newData = req.body;
    telemetry = { ...telemetry, ...newData };
    res.json({ status: "ok", telemetry });
  });

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

  // AI Analysis Proxy: Uses Volcengine (Doubao) Ark API
  app.post("/api/analyze", async (req, res) => {
    const { text, telemetry: currentTelemetry } = req.body;
    const apiKey = process.env.ARK_API_KEY;

    if (!apiKey) {
      console.error("[SERVER] ARK_API_KEY is missing");
      return res.status(503).json({ 
        error: "AI Config Missing", 
        details: "ARK_API_KEY is not configured in .env file." 
      });
    }

    try {
      console.log("[SERVER] Executing Cloud AI analysis via Volcengine Ark...");
      
      const telemetryContext = currentTelemetry ? 
        `当前硬件状态: 速度 ${currentTelemetry.speed}m/s, CPU负载 ${currentTelemetry.cpu}%, 电池 ${currentTelemetry.battery}%, 环境温度 ${currentTelemetry.temp}°C, 湿度 ${currentTelemetry.humidity}%, 土壤板结度 ${currentTelemetry.soil}%。` : 
        "";

      const prompt = `你是一个智能小车分析助手。${telemetryContext}请结合这些背景数据和用户的指令内容进行分析。指令内容: "${text}"。请在JSON中返回: sentiment, urgency (low, medium, high), summary (中文总结), recommendation (中文建议)。特别注意：如果硬件状态（如电池、负载、温度）存在异常，请在总结和建议中体现。请务必返回严格的 JSON 格式，不要包含任何 Markdown 格式。`;

      const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          // 注意：火山引擎的 model 字段通常填写的是您的“推理终端 ID”(Endpoint ID)
          // 如果报错 "model not found"，请将此处替换为您的 ep-xxxxx ID
          model: "doubao-seed-2-0-pro-260215",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMessage = errJson.error?.message || await response.text();
        console.error("[SERVER] Ark API Error Detail:", JSON.stringify(errJson));
        throw new Error(`火山引擎返回错误: ${errMessage}`);
      }

      const data = await response.json();
      console.log("[SERVER] Ark Response received:", JSON.stringify(data).substring(0, 200) + "...");

      let resultText = "";
      if (data.choices && data.choices[0] && data.choices[0].message) {
        resultText = data.choices[0].message.content;
      } else if (data.output && data.output.text) { 
        // 兼容 /api/v3/responses 格式
        resultText = data.output.text;
      } else {
        resultText = JSON.stringify(data);
      }
      
      // 更加彻底的 JSON 清洗正则
      const cleanedJson = resultText.replace(/```json\s?|```/g, '').trim();
      
      try {
        const analysisData = JSON.parse(cleanedJson);
        return res.json(analysisData);
      } catch (parseErr) {
        console.error("[SERVER] AI response is not valid JSON:", resultText);
        // 如果不是 JSON，尝试构建一个简单的 JSON 返回给前端
        return res.json({
          sentiment: "neutral",
          urgency: "medium",
          summary: "AI 返回格式异常",
          recommendation: resultText.substring(0, 100)
        });
      }
    } catch (err: any) {
      console.error("[SERVER] Ark Analysis Error:", err);
      res.status(500).json({ error: "Cloud AI Error", details: err.message });
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
