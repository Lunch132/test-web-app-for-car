/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Bot, 
  Wifi, 
  AlertTriangle, 
  Activity, 
  Send, 
  MessageSquare, 
  Terminal, 
  RefreshCcw,
  Zap,
  ShieldCheck,
  Cpu,
  Settings,
  Battery,
  Gauge,
  Thermometer,
  Droplets,
  Sprout
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- AI Initialization ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Types ---
interface Message {
  id: number;
  text: string;
  sender: string;
  timestamp: string;
  analysis?: {
    sentiment: string;
    urgency: "low" | "medium" | "high";
    summary: string;
    recommendation: string;
  };
}

interface SystemStat {
  time: string;
  load: number;
}

interface Telemetry {
  speed: number;
  cpu: number;
  temp: number;
  humidity: number;
  soil: number;
  battery: number;
  lat: number;
  lon: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStat[]>([]);
  const [status, setStatus] = useState<"idle" | "busy" | "alert">("idle");
  const [telemetry, setTelemetry] = useState<Telemetry>({
    speed: 0,
    cpu: 0,
    temp: 0,
    battery: 0,
    lat: 0,
    lon: 0
  });
  const [showSimulator, setShowSimulator] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Fetch Telemetry ---
  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) throw new Error("Telemetry fetch failed");
      const data = await res.json();
      setTelemetry(data);
      
      const now = new Date();
      const newStat = {
        time: `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`,
        load: data.cpu,
      };
      setSystemStats(prev => [...prev.slice(-19), newStat]);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Simulate Telemetry Update ---
  const simulateUpdate = async (updates: Partial<Telemetry>) => {
    try {
      const res = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) fetchTelemetry();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Fetch Messages ---
  const fetchMessages = async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  // --- Send Message and Analyze ---
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isAnalyzing) return;

    const text = inputText;
    const tempId = Date.now();
    setInputText("");
    setStatus("busy");

    // 1. Locally add message immediately for better UX
    const pendingMsg: Message = {
      id: tempId,
      text,
      sender: "User",
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, pendingMsg]);

    try {
      console.log("Sending message to server...");
      // 2. Real networking part
      const res = await fetch("/api/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: "User" }),
      });
      
      if (!res.ok) throw new Error("Server communication failed");
      const newMessage = await res.json();
      
      console.log("Analyzing message with AI...");
      setIsAnalyzing(true);
      
      const analysisRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!analysisRes.ok) throw new Error("AI analysis service unavailable");
      const analysisData = await analysisRes.json();

      console.log("Analysis complete:", analysisData);

      setMessages(prev => prev.map(m => 
        (m.id === tempId || m.id === newMessage.id) ? { ...m, ...newMessage, analysis: analysisData } : m
      ));

      if (analysisData.urgency === "high") {
        setStatus("alert");
        setTimeout(() => setStatus("idle"), 5000);
      } else {
        setStatus("idle");
      }

    } catch (err: any) {
      console.error("Operation failed:", err);
      // Mark error on the specific message
      setMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, analysis: { sentiment: "Error", urgency: "low", summary: `Error: ${err.message}` } } : m
      ));
      setStatus("idle");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Combined Init and Polling ---
  useEffect(() => {
    fetchMessages();
    fetchTelemetry();
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // --- Scroll to bottom ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="min-h-screen bg-[#05070A] text-slate-200 font-sans p-6 flex flex-col gap-4 overflow-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* --- Header --- */}
      <header className="flex justify-between items-center px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-3 h-3 rounded-full status-pulse",
            status === "idle" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : status === "busy" ? "bg-yellow-400 shadow-[0_0_8px_#fbbf24]" : "bg-red-400 shadow-[0_0_8px_#f87171]"
          )} />
          <h1 className="text-xl font-bold tracking-widest uppercase glow-text">
            AXON-01 <span className="text-cyan-400">{process.env.BOT_NAME || "任务控制台"}</span>
          </h1>
        </div>
        <div className="flex gap-6 text-[10px] font-mono text-slate-400 uppercase tracking-widest relative">
          <button 
            onClick={() => setShowSimulator(!showSimulator)}
            className={cn(
              "flex items-center gap-2 hover:text-cyan-400 transition-colors",
              showSimulator && "text-cyan-400"
            )}
          >
            <Settings size={12} className={showSimulator ? "animate-spin-slow" : ""} />
            硬件模拟器
          </button>
          
          <AnimatePresence>
            {showSimulator && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-8 right-0 glass p-4 z-50 w-64 rounded-xl border-cyan-500/30 flex flex-col gap-4"
              >
                <div className="text-[10px] text-cyan-400 font-bold border-b border-cyan-500/20 pb-2">本地设备模拟器 [SIM_v1.0]</div>
                
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>移动速度 (m/s)</span>
                      <span>{telemetry.speed}</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="0.1" 
                      value={telemetry.speed * 10} 
                      onChange={(e) => simulateUpdate({ speed: parseFloat(e.target.value) / 10 })}
                      className="w-full accent-cyan-500 h-1 rounded-lg"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>电池电量 (%)</span>
                      <span>{telemetry.battery}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={telemetry.battery} 
                      onChange={(e) => simulateUpdate({ battery: parseInt(e.target.value) })}
                      className="w-full accent-emerald-500 h-1 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>CPU 负载 (%)</span>
                      <span>{telemetry.cpu}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={telemetry.cpu} 
                      onChange={(e) => simulateUpdate({ cpu: parseInt(e.target.value) })}
                      className="w-full accent-cyan-500 h-1 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>环境温度 (°C)</span>
                      <span>{telemetry.temp}°C</span>
                    </div>
                    <input 
                      type="range" min="-10" max="60" step="0.1" 
                      value={telemetry.temp} 
                      onChange={(e) => simulateUpdate({ temp: parseFloat(e.target.value) })}
                      className="w-full accent-orange-500 h-1 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>空气湿度 (%)</span>
                      <span>{telemetry.humidity}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={telemetry.humidity} 
                      onChange={(e) => simulateUpdate({ humidity: parseInt(e.target.value) })}
                      className="w-full accent-blue-500 h-1 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-slate-400 uppercase font-mono">
                      <span>土壤板结度 (%)</span>
                      <span>{telemetry.soil}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      value={telemetry.soil} 
                      onChange={(e) => simulateUpdate({ soil: parseInt(e.target.value) })}
                      className="w-full accent-amber-700 h-1 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button 
                      onClick={() => simulateUpdate({ lat: telemetry.lat + 0.001 })}
                      className="py-1 bg-white/5 rounded border border-white/10 text-[8px] hover:bg-white/10"
                    >
                      向北移动
                    </button>
                    <button 
                      onClick={() => simulateUpdate({ lon: telemetry.lon + 0.001 })}
                      className="py-1 bg-white/5 rounded border border-white/10 text-[8px] hover:bg-white/10"
                    >
                      向东移动
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            网络: <span className="text-emerald-400">已连接 [5G_卫星]</span>
          </div>
          <div className="flex items-center gap-2">
            AI 状态: <span className="text-cyan-400">运行中 [v4.2.0]</span>
          </div>
          <div className="flex items-center gap-2">
            电量: <span className={cn(telemetry.battery < 20 ? "text-red-400 animate-pulse" : "text-cyan-400")}>{telemetry.battery}%</span>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 overflow-hidden min-h-0">
        {/* --- Left Column: Messaging --- */}
        <section className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="glass p-4 flex-1 flex flex-col gap-3 rounded-xl min-h-0">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-tighter border-b border-white/5 pb-2">网络通信日志</h2>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "p-2 rounded bg-slate-800/30 border-l-2",
                      msg.sender === "User" ? "border-cyan-500" : "border-emerald-500"
                    )}
                  >
                    <div className={cn(
                      "text-[10px] font-bold mb-1 uppercase font-mono",
                      msg.sender === "User" ? "text-cyan-400" : "text-emerald-400"
                    )}>
                      {msg.sender === "User" ? "上行指令" : "下行数据"} // {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false })}
                    </div>
                    <p className="text-[11px] italic text-slate-300 leading-relaxed capitalize">"{msg.text}"</p>
                    {msg.analysis && (
                      <div className="mt-2 text-[9px] opacity-60 font-mono flex items-center gap-2">
                        <Zap size={8} className="text-yellow-400" />
                        AI 分析: {msg.analysis.summary}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <form onSubmit={handleSend} className="glass rounded-lg flex items-center px-3 gap-2 border-white/5 h-12">
              <input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="键入系统指令..."
                className="flex-1 bg-transparent border-none text-[11px] font-mono focus:outline-none placeholder:text-slate-600 text-slate-300"
              />
              <button 
                type="submit" 
                disabled={isAnalyzing || !inputText.trim()}
                className="w-6 h-6 rounded bg-cyan-500 flex items-center justify-center hover:bg-cyan-400 transition-colors disabled:opacity-20"
              >
                <Send size={12} className="text-black" />
              </button>
            </form>
          </div>
        </section>

        {/* --- Middle Column: Telemetry & Analysis --- */}
        <section className="col-span-6 flex flex-col gap-4 min-h-0">
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-cyan-500/20 glow-blue min-h-0 bg-slate-900/40">
            <div className="absolute top-4 left-4 z-10 space-y-1">
              <div className="text-[10px] uppercase text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-500/30">实时遥测数据流</div>
              <div className="text-3xl font-mono text-white glow-text">
                {telemetry.speed.toFixed(2)} <span className="text-xs text-slate-400">m/s</span>
              </div>
            </div>
            
            {/* Visual Grid Decor */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <svg className="w-64 h-64 text-cyan-500" viewBox="0 0 200 200" fill="none">
                <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="1" strokeDasharray="10 10"/>
                <rect x="60" y="80" width="80" height="40" rx="4" stroke="currentColor" strokeWidth="2"/>
                <circle cx="75" cy="125" r="8" stroke="currentColor" strokeWidth="2"/>
                <circle cx="125" cy="125" r="8" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
              <div className="flex gap-4">
                <div className="space-y-1 font-mono text-[10px] text-slate-400 bg-black/40 p-2 rounded backdrop-blur-sm border border-white/5">
                  <div className="flex items-center gap-2"><div className="w-1 h-1 bg-cyan-400 rounded-full" /> LAT: {telemetry.lat.toFixed(4)}° N</div>
                  <div className="flex items-center gap-2"><div className="w-1 h-1 bg-cyan-400 rounded-full" /> LON: {telemetry.lon.toFixed(4)}° E</div>
                </div>
                {/* Environment Pill */}
                <div className="flex gap-3 font-mono text-[10px] text-slate-300 bg-black/40 p-2 rounded backdrop-blur-sm border border-white/5">
                   <div className="flex items-center gap-1.5"><Thermometer size={10} className="text-orange-400"/> {telemetry.temp}°C</div>
                   <div className="flex items-center gap-1.5"><Droplets size={10} className="text-blue-400"/> {telemetry.humidity}%</div>
                   <div className="flex items-center gap-1.5"><Sprout size={10} className="text-amber-500"/> {telemetry.soil}%</div>
                </div>
              </div>
              <div className="w-48 h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/5 shadow-inner">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: `${telemetry.battery}%` }}
                  className={cn("h-full glow-blue", telemetry.battery < 20 ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-cyan-500")}
                />
              </div>
            </div>
          </div>

          <div className="h-56 grid grid-cols-3 gap-4 min-h-0">
            <div className="col-span-2 glass p-4 rounded-xl flex flex-col gap-3 min-h-0 border-white/5">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                  <Activity size={14} className="text-cyan-400" /> 系统负载与带宽监控
                </h2>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-mono tracking-widest animate-pulse">AI_神经链路活跃</span>
              </div>
              
              <div className="flex-1 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={systemStats}>
                      <defs>
                        <linearGradient id="colorCyan" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" opacity={0.05} />
                      <XAxis dataKey="time" hide />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }}
                        itemStyle={{ color: "#22d3ee" }}
                      />
                      <Area type="monotone" dataKey="load" stroke="#22d3ee" fillOpacity={1} fill="url(#colorCyan)" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass p-4 rounded-xl border-white/5 flex flex-col gap-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                <Sprout size={14} className="text-emerald-400" /> 环境传感器数据
              </h2>
              <div className="flex-1 grid grid-rows-3 gap-2">
                <div className="bg-white/5 rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Thermometer size={14} className="text-orange-400" />
                    <span className="text-[10px] text-slate-400 font-mono">温度</span>
                  </div>
                  <span className="text-xs font-mono text-white">{telemetry.temp}°C</span>
                </div>
                <div className="bg-white/5 rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets size={14} className="text-blue-400" />
                    <span className="text-[10px] text-slate-400 font-mono">湿度</span>
                  </div>
                  <span className="text-xs font-mono text-white">{telemetry.humidity}%</span>
                </div>
                <div className="bg-white/5 rounded p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sprout size={14} className="text-emerald-500" />
                    <span className="text-[10px] text-slate-400 font-mono">土壤板结</span>
                  </div>
                  <span className="text-xs font-mono text-white">{telemetry.soil}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Right Column: Analysis Summary --- */}
        <section className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="glass p-4 rounded-xl flex flex-col gap-4 h-full border-white/5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                <Cpu size={14} className="text-cyan-400" /> AI 决策执行摘要
              </h2>
              <div className="h-px bg-white/10 mt-1 opacity-50"></div>
            </div>

            <div className="flex-1 flex flex-col gap-5 pt-2 overflow-y-auto custom-scrollbar">
              {messages.filter(m => m.analysis).slice(-1).map((m) => (
                <div key={m.id} className="space-y-6">
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase italic tracking-widest flex items-center gap-2">
                      <div className="w-1 h-3 bg-cyan-400" /> 最近接收目标:
                    </div>
                    <p className="text-xs text-white font-medium leading-relaxed bg-white/5 p-3 rounded border border-white/5">
                      {m.text}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase italic tracking-widest flex items-center gap-2">
                      <div className="w-1 h-3 bg-emerald-400" /> AI 分析洞察:
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal font-mono">
                      {m.analysis?.summary} 系统识别情绪为 <span className="text-cyan-400">{m.analysis?.sentiment}</span>。 
                      紧急程度评定为 <span className={cn(m.analysis?.urgency === "high" ? "text-red-400" : "text-emerald-400")}>{m.analysis?.urgency === "high" ? "极高" : m.analysis?.urgency === "medium" ? "中等" : "正常"}</span>。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase italic tracking-widest flex items-center gap-2">
                      <div className="w-1 h-3 bg-yellow-400" /> 推荐执行预案:
                    </div>
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-[11px] text-cyan-50 italic leading-relaxed">
                      {m.analysis?.recommendation || "正在评估最优执行路径..."}
                    </div>
                  </div>
                </div>
              ))}
              
              {messages.filter(m => m.analysis).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-4 py-20">
                  <Bot size={48} className="animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em]">神经链路等待数据接入</span>
                </div>
              )}
            </div>

            <button 
              onClick={() => fetchMessages()}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded transition-all shadow-[0_4px_12px_rgba(8,145,178,0.4)] flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <RefreshCcw size={12} /> 授权数据同步刷新
            </button>
          </div>
        </section>
      </main>

      <footer className="h-8 flex items-center justify-between px-4 text-[9px] font-mono text-slate-500 border-t border-white/5 uppercase tracking-widest">
        <div className="flex gap-4">
          <span>核心内核: 5.15.0-76-generic</span>
          <span className="opacity-40">|</span>
          <span>系统状态: 稳定 (Nominal)</span>
        </div>
        <div>最后同步: {new Date().toLocaleTimeString([], { hour12: false })} GMT+8</div>
      </footer>

      {/* Global Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34, 211, 238, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34, 211, 238, 0.4); }
      `}</style>
    </div>
  );
}
