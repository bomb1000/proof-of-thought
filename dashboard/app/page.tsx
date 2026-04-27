"use client"

import {
  ShieldCheck, CheckCircle, AlertTriangle, Network, MessageSquare,
  Search, Copy, Database, Link, Cpu, Zap, Clock,
} from "lucide-react"

const agents = [
  { name: "Agent Alpha", model: "Qwen 3.6-Plus", provider: "0x992e...6db5", port: 9002, status: "verified" as const },
  { name: "Agent Beta", model: "DeepSeek V3", provider: "0x1B3A...5EB0", port: 9003, status: "verified" as const },
  { name: "Agent Gamma", model: "GLM-5-FP8", provider: "0xd996...471C", port: 9004, status: "thinking" as const },
]

const feedItems = [
  { time: "14:30:00.000", msg: "Query dispatched to 3 agents via AXL P2P", type: "info" as const },
  { time: "14:30:00.012", msg: "Agent Alpha receiving on port 9002...", type: "pending" as const },
  { time: "14:30:00.015", msg: "Agent Beta receiving on port 9003...", type: "pending" as const },
  { time: "14:30:01.644", msg: "Agent Alpha: TEE Verified — Smart contract vulnerabilities remain the primary risk factor for Aave v3 lenders...", type: "verified" as const },
  { time: "14:30:02.187", msg: "Agent Beta: TEE Verified — Key risk factors include liquidation cascades during high volatility periods...", type: "verified" as const },
  { time: "14:30:03.901", msg: "Agent Gamma: TEE Verified — Current lending risks center on oracle price feed manipulation...", type: "verified" as const },
  { time: "14:30:03.902", msg: "Consensus reached: 87% agreement across 3 models", type: "consensus" as const },
  { time: "14:30:07.512", msg: "PoT Report stored on 0G Storage — 0g://0x7d31b006...", type: "stored" as const },
  { time: "14:30:07.891", msg: "Report hash registered on 0G Chain — block 30035469", type: "chain" as const },
]

const claims = [
  { text: "Smart contract risk remains the dominant factor for Aave v3 lenders", models: "3/3" },
  { text: "Liquidation cascades during ETH volatility pose systemic risk", models: "3/3" },
  { text: "Current utilization rate is elevated above 80%", models: "2/3" },
]

const divergences = [
  { text: "Oracle risk severity — Alpha rates high, Beta rates medium" },
]

const proofSteps = [
  { label: "Query", time: "0ms", done: true },
  { label: "Alpha ✓", time: "1.6s", done: true },
  { label: "Beta ✓", time: "2.2s", done: true },
  { label: "Gamma ✓", time: "3.9s", done: true },
  { label: "Consensus", time: "<1ms", done: true },
  { label: "0G Storage", time: "3.6s", done: true },
  { label: "On-Chain", time: "0.4s", done: true },
]

function StatusDot({ status }: { status: "verified" | "thinking" | "idle" }) {
  if (status === "verified") return <span className="inline-block w-2 h-2 rounded-full bg-emerald shrink-0 animate-pulse-glow" />
  if (status === "thinking") return <span className="inline-block w-2 h-2 rounded-full bg-amber shrink-0 animate-dot-pulse" />
  return <span className="inline-block w-2 h-2 rounded-full bg-muted shrink-0" />
}

function StatusBadge({ status }: { status: "verified" | "thinking" | "idle" }) {
  if (status === "verified")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald/15 text-emerald"><ShieldCheck size={10} /> VERIFIED</span>
  if (status === "thinking")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber/15 text-amber animate-pulse">THINKING</span>
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-border text-muted">IDLE</span>
}

function FeedBadge({ type }: { type: string }) {
  if (type === "verified") return <ShieldCheck size={14} className="text-emerald shrink-0" />
  if (type === "consensus") return <CheckCircle size={14} className="text-emerald shrink-0" />
  if (type === "pending") return <Clock size={14} className="text-amber shrink-0 animate-dot-pulse" />
  if (type === "stored") return <Database size={14} className="text-accent shrink-0" />
  if (type === "chain") return <Link size={14} className="text-accent shrink-0" />
  return <Zap size={14} className="text-accent shrink-0" />
}

function CircularProgress({ value }: { value: number }) {
  const r = 54
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <svg width="140" height="140" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke="#10b981" strokeWidth="8"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
      />
      <text x="60" y="56" textAnchor="middle" className="fill-emerald text-3xl font-bold font-mono">{value}%</text>
      <text x="60" y="74" textAnchor="middle" className="fill-muted text-[10px]">agreement</text>
    </svg>
  )
}

export default function Dashboard() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* HEADER */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Cpu size={20} className="text-accent" />
          <h1 className="font-mono font-bold text-sm tracking-wider">PROOF OF THOUGHT</h1>
        </div>
        <span className="text-[10px] text-muted hidden md:block">TEE-Verified Multi-Model Consensus</span>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 w-full max-w-xl">
            <div className="flex items-center flex-1 bg-card border border-border rounded-lg px-3 py-1.5">
              <Search size={14} className="text-muted mr-2 shrink-0" />
              <input
                type="text"
                defaultValue="What are the risks of lending ETH on Aave v3 right now?"
                className="bg-transparent text-sm w-full outline-none placeholder:text-muted"
              />
            </div>
            <button className="bg-accent text-background text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-accent/85 transition shrink-0">
              Run Consensus
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald animate-dot-pulse" />
          <span className="text-xs text-muted">3 Agents</span>
          <span className="font-mono text-[10px] text-muted hidden lg:block">0x77eA...8d</span>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-[280px_1fr_300px] gap-0 overflow-hidden">
        {/* LEFT — AGENTS */}
        <div className="border-r border-border p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Network size={14} className="text-accent" />
            <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">Agent Network</h2>
          </div>
          <div className="space-y-3">
            {agents.map((a) => (
              <div key={a.name} className={`rounded-lg border p-3 ${a.status === "verified" ? "border-emerald/30 bg-emerald/[0.03]" : a.status === "thinking" ? "border-amber/30 bg-amber/[0.03]" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={a.status} />
                    <span className="text-sm font-semibold">{a.name}</span>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="text-xs text-accent font-medium mb-0.5">{a.model}</div>
                <div className="font-mono text-[10px] text-muted">{a.provider} · port {a.port}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2">P2P Topology</div>
            <div className="flex items-center justify-center gap-1">
              {agents.map((a, i) => (
                <div key={a.name} className="flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full border border-emerald/40 flex items-center justify-center text-[8px] font-bold text-emerald">
                    {a.name.split(" ")[1][0]}
                  </span>
                  {i < agents.length - 1 && <span className="w-6 border-t border-dashed border-emerald/30" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER — FEED */}
        <div className="border-r border-border flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
            <MessageSquare size={14} className="text-accent" />
            <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">Deliberation Feed</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {feedItems.map((item, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${item.type === "consensus" ? "bg-emerald/[0.06] border border-emerald/20 rounded-lg p-2" : item.type === "stored" || item.type === "chain" ? "bg-accent/[0.04] border border-accent/15 rounded-lg p-2" : ""} ${item.type === "verified" ? "pl-2" : ""}`}>
                <span className="font-mono text-[10px] text-muted shrink-0 pt-0.5 w-20">{item.time}</span>
                <FeedBadge type={item.type} />
                <span className={`${item.type === "consensus" ? "text-emerald font-semibold" : item.type === "verified" ? "text-card-foreground" : "text-muted"}`}>
                  {item.msg}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — CONSENSUS */}
        <div className="p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={14} className="text-accent" />
            <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">Consensus</h2>
          </div>

          <div className="flex flex-col items-center mb-4">
            <CircularProgress value={87} />
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald/15 text-emerald">
              <ShieldCheck size={10} /> 3/3 Models Verified
            </span>
          </div>

          <div className="mb-4">
            <h3 className="text-[10px] font-semibold tracking-widest text-muted uppercase mb-2">Converged Claims</h3>
            <div className="space-y-2">
              {claims.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle size={12} className="text-emerald shrink-0 mt-0.5" />
                  <span className="flex-1">{c.text}</span>
                  <span className="text-[10px] font-mono text-emerald bg-emerald/10 px-1.5 py-0.5 rounded shrink-0">{c.models}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-[10px] font-semibold tracking-widest text-muted uppercase mb-2">Divergences</h3>
            <div className="space-y-2">
              {divergences.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle size={12} className="text-amber shrink-0 mt-0.5" />
                  <span className="text-amber/80">{d.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted">PoT Hash</span>
              <button className="text-muted hover:text-foreground"><Copy size={10} /></button>
            </div>
            <div className="font-mono text-[10px] text-accent truncate">0x778d49a507fa52bd9a0555c48ced5248...</div>
            <div className="text-[10px] text-muted mt-1">Stored on</div>
            <div className="font-mono text-[10px] text-accent truncate">0g://0x7d31b006b1a641b7e7525b626b1b08b9...</div>
          </div>
        </div>
      </div>

      {/* BOTTOM — PROOF CHAIN */}
      <div className="border-t border-border px-6 py-3 shrink-0">
        <div className="flex items-center justify-center gap-0">
          {proofSteps.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${step.done ? "border-emerald bg-emerald/15 text-emerald" : "border-border text-muted"}`}>
                  {step.done ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span className="text-[9px] font-semibold mt-1 text-card-foreground">{step.label}</span>
                <span className="text-[8px] font-mono text-muted">{step.time}</span>
              </div>
              {i < proofSteps.length - 1 && (
                <div className={`w-8 h-0.5 mx-0.5 mt-[-16px] ${step.done ? "bg-emerald/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
