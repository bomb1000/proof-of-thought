"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  ShieldCheck, CheckCircle, AlertTriangle, Network, MessageSquare,
  Search, Copy, Database, Link, Cpu, Zap, Clock, XCircle, Loader2,
  WifiOff, DollarSign,
} from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface Agent {
  name: string
  model: string
  provider: string
  status: "idle" | "thinking" | "verified" | "error"
  timings?: { inference: number; verification: number; signatureFetch: number; total: number }
}

interface FeedItem {
  time: string
  msg: string
  type: "info" | "pending" | "verified" | "consensus" | "stored" | "chain" | "error"
}

interface Claim {
  text: string
  modelsAgreeing: string[]
  confidence: number
}

interface Divergence {
  topic: string
  positions: { model: string; stance: string }[]
}

interface ProofStep {
  label: string
  time: string
  done: boolean
}

interface ConsensusData {
  agreementScore: number
  convergedClaims: Claim[]
  divergences: Divergence[]
  verifiedCount: number
  totalCount: number
}

interface PaymentInfo {
  price: string
  network: string
  payTo: string
  reportUrl: string
}

interface ReportData {
  id: string
  potHash: string
  storedOn?: string
}

function ts(): string {
  return new Date().toISOString().split("T")[1].slice(0, 12)
}

function StatusDot({ status }: { status: Agent["status"] }) {
  if (status === "verified") return <span className="inline-block w-2 h-2 rounded-full bg-emerald shrink-0 animate-pulse-glow" />
  if (status === "thinking") return <span className="inline-block w-2 h-2 rounded-full bg-amber shrink-0 animate-dot-pulse" />
  if (status === "error") return <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
  return <span className="inline-block w-2 h-2 rounded-full bg-muted shrink-0" />
}

function StatusBadge({ status }: { status: Agent["status"] }) {
  if (status === "verified")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald/15 text-emerald"><ShieldCheck size={10} /> VERIFIED</span>
  if (status === "thinking")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber/15 text-amber animate-pulse">THINKING</span>
  if (status === "error")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-500">ERROR</span>
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-border text-muted">IDLE</span>
}

function FeedBadge({ type }: { type: string }) {
  if (type === "verified") return <ShieldCheck size={14} className="text-emerald shrink-0" />
  if (type === "consensus") return <CheckCircle size={14} className="text-emerald shrink-0" />
  if (type === "pending") return <Clock size={14} className="text-amber shrink-0 animate-dot-pulse" />
  if (type === "stored") return <Database size={14} className="text-accent shrink-0" />
  if (type === "chain") return <Link size={14} className="text-accent shrink-0" />
  if (type === "error") return <XCircle size={14} className="text-red-500 shrink-0" />
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

const DEFAULT_PROOF_STEPS: ProofStep[] = [
  { label: "Query", time: "-", done: false },
  { label: "Models", time: "-", done: false },
  { label: "Consensus", time: "-", done: false },
  { label: "0G Storage", time: "-", done: false },
  { label: "On-Chain", time: "-", done: false },
]

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [consensus, setConsensus] = useState<ConsensusData | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null)
  const [proofSteps, setProofSteps] = useState<ProofStep[]>(DEFAULT_PROOF_STEPS)
  const [query, setQuery] = useState("What are the top 3 risks of lending ETH on Aave v3 right now?")
  const [running, setRunning] = useState(false)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [walletInfo, setWalletInfo] = useState<{ address: string; balance: string } | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const addFeed = useCallback((item: FeedItem) => {
    setFeed((prev) => [...prev, item])
  }, [])

  const updateAgent = useCallback((model: string, update: Partial<Agent>) => {
    setAgents((prev) =>
      prev.map((a) => (a.model === model ? { ...a, ...update } : a))
    )
  }, [])

  const updateStep = useCallback((label: string, time: string, done: boolean) => {
    setProofSteps((prev) =>
      prev.map((s) => (s.label === label ? { ...s, time, done } : s))
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchStatus() {
      try {
        const res = await fetch(`${API_BASE}/api/status`)
        if (!res.ok) throw new Error("status fetch failed")
        const data = await res.json()
        if (cancelled) return
        setBackendOnline(true)
        setWalletInfo({ address: data.wallet, balance: data.balance })
        setAgents(
          data.agents.map((a: any) => ({
            name: a.name,
            model: a.model,
            provider: a.provider,
            status: "idle" as const,
          }))
        )
      } catch {
        if (!cancelled) {
          setBackendOnline(false)
        }
      }
    }

    fetchStatus()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [feed])

  function runConsensus() {
    if (running || !query.trim()) return

    setRunning(true)
    setFeed([])
    setConsensus(null)
    setReport(null)
    setPaymentInfo(null)
    setProofSteps(DEFAULT_PROOF_STEPS.map((s) => ({ ...s })))
    setAgents((prev) => prev.map((a) => ({ ...a, status: "idle" as const, timings: undefined })))

    const abort = new AbortController()
    abortRef.current = abort
    const pipelineT0 = performance.now()

    fetch(`${API_BASE}/api/consensus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, network: "testnet" }),
      signal: abort.signal,
    })
      .then((res) => {
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        function processEvents(text: string) {
          buffer += text
          const chunks = buffer.split("\n\n")
          buffer = chunks.pop() || ""

          for (const chunk of chunks) {
            const lines = chunk.split("\n")
            let eventType = ""
            let eventData = ""

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7)
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6)
              }
            }

            if (!eventType || !eventData) continue

            let data: any
            try {
              data = JSON.parse(eventData)
            } catch {
              continue
            }

            handleEvent(eventType, data, pipelineT0)
          }
        }

        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done) {
              if (buffer.trim()) processEvents("\n\n")
              setRunning(false)
              return
            }
            processEvents(decoder.decode(value, { stream: true }))
            return pump()
          })
        }

        return pump()
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          addFeed({ time: ts(), msg: `Error: ${err.message}`, type: "error" })
        }
        setRunning(false)
      })
  }

  function handleEvent(event: string, data: any, t0: number) {
    const elapsed = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`

    switch (event) {
      case "pipeline_started":
        addFeed({
          time: ts(),
          msg: `Query dispatched to ${data.modelCount} agent(s) on ${data.network}`,
          type: "info",
        })
        updateStep("Query", "0ms", true)
        break

      case "agent_thinking":
        updateAgent(data.model, { status: "thinking", name: data.name })
        addFeed({
          time: ts(),
          msg: `${data.name} (${data.model}) thinking...`,
          type: "pending",
        })
        break

      case "agent_responded": {
        const tee = data.teeVerified ? "TEE Verified" : "TEE unverified"
        const preview = data.content.slice(0, 120)
        updateAgent(data.model, {
          status: "verified",
          name: data.name,
          timings: data.timings,
        })
        addFeed({
          time: ts(),
          msg: `${data.name}: ${tee} — ${preview}...`,
          type: "verified",
        })
        updateStep("Models", elapsed(), true)
        break
      }

      case "agent_error":
        updateAgent(data.model, { status: "error", name: data.name })
        addFeed({
          time: ts(),
          msg: `${data.name} failed: ${data.error}`,
          type: "error",
        })
        break

      case "consensus_reached": {
        const pct = (data.agreementScore * 100).toFixed(1)
        setConsensus({
          agreementScore: data.agreementScore,
          convergedClaims: data.convergedClaims,
          divergences: data.divergences,
          verifiedCount: agents.filter((a) => a.status === "verified").length,
          totalCount: agents.length,
        })
        addFeed({
          time: ts(),
          msg: `Consensus reached: ${pct}% agreement`,
          type: "consensus",
        })
        updateStep("Consensus", `${data.timings.consensus.toFixed(0)}ms`, true)
        break
      }

      case "report_built":
        setReport({ id: data.id, potHash: data.potHash })
        break

      case "stored":
        setReport((prev) => prev ? { ...prev, storedOn: data.storedOn } : prev)
        addFeed({
          time: ts(),
          msg: `PoT Report stored on 0G Storage — ${data.storedOn}`,
          type: "stored",
        })
        updateStep("0G Storage", elapsed(), true)
        break

      case "storage_verified":
        if (data.verified) {
          addFeed({ time: ts(), msg: "Storage verified: potHash matches", type: "info" })
        } else {
          addFeed({ time: ts(), msg: `Storage verification failed: ${data.error}`, type: "error" })
        }
        break

      case "chain_registered":
        addFeed({
          time: ts(),
          msg: `Report hash registered on 0G Chain — block ${data.blockNumber}`,
          type: "chain",
        })
        updateStep("On-Chain", elapsed(), true)
        break

      case "chain_error":
        addFeed({ time: ts(), msg: `On-chain registration failed: ${data.error}`, type: "error" })
        updateStep("On-Chain", "failed", false)
        break

      case "store_error":
        addFeed({ time: ts(), msg: `Storage failed: ${data.error}`, type: "error" })
        updateStep("0G Storage", "failed", false)
        break

      case "report_complete":
        addFeed({
          time: ts(),
          msg: `Pipeline complete in ${(data.totalTime / 1000).toFixed(1)}s`,
          type: "info",
        })
        if (data.report?.consensus) {
          const r = data.report
          setConsensus((prev) => ({
            agreementScore: r.consensus.agreementScore,
            convergedClaims: r.consensus.convergedClaims,
            divergences: r.consensus.divergences,
            verifiedCount: r.proofChain.filter((p: any) => p.teeVerified).length,
            totalCount: r.proofChain.length,
          }))
        }
        if (data.paymentInfo && data.reportUrl) {
          setPaymentInfo({
            price: data.paymentInfo.price,
            network: data.paymentInfo.network,
            payTo: data.paymentInfo.payTo,
            reportUrl: data.reportUrl,
          })
        }
        break

      case "error":
        addFeed({ time: ts(), msg: `Error: ${data.message}`, type: "error" })
        break
    }
  }

  const agentCount = agents.length
  const shortAddr = walletInfo
    ? `${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-2)}`
    : ""

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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runConsensus() }}
                disabled={running}
                className="bg-transparent text-sm w-full outline-none placeholder:text-muted disabled:opacity-50"
                placeholder="Enter your query..."
              />
            </div>
            <button
              onClick={runConsensus}
              disabled={running || backendOnline === false}
              className="bg-accent text-background text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-accent/85 transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {running && <Loader2 size={14} className="animate-spin" />}
              {running ? "Running..." : "Run Consensus"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {backendOnline === false ? (
            <>
              <WifiOff size={14} className="text-red-500" />
              <span className="text-xs text-red-500">Backend offline</span>
            </>
          ) : backendOnline === true ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald animate-dot-pulse" />
              <span className="text-xs text-muted">{agentCount} Agent{agentCount !== 1 ? "s" : ""}</span>
              <span className="font-mono text-[10px] text-muted hidden lg:block">{shortAddr}</span>
            </>
          ) : (
            <span className="text-xs text-muted">Connecting...</span>
          )}
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

          {backendOnline === false ? (
            <div className="text-xs text-muted text-center py-8">
              <WifiOff size={24} className="mx-auto mb-2 text-red-500/50" />
              Backend offline. Start the API server on port 3001.
            </div>
          ) : agents.length === 0 ? (
            <div className="text-xs text-muted text-center py-8">Loading agents...</div>
          ) : (
            <div className="space-y-3">
              {agents.map((a) => (
                <div key={a.model} className={`rounded-lg border p-3 ${a.status === "verified" ? "border-emerald/30 bg-emerald/[0.03]" : a.status === "thinking" ? "border-amber/30 bg-amber/[0.03]" : a.status === "error" ? "border-red-500/30 bg-red-500/[0.03]" : "border-border bg-card"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={a.status} />
                      <span className="text-sm font-semibold">{a.name}</span>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="text-xs text-accent font-medium mb-0.5">{a.model}</div>
                  <div className="font-mono text-[10px] text-muted">{a.provider.slice(0, 6)}...{a.provider.slice(-4)}</div>
                  {a.timings && (
                    <div className="font-mono text-[10px] text-muted mt-1">
                      inference={a.timings.inference.toFixed(0)}ms verify={a.timings.verification.toFixed(0)}ms
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {walletInfo && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Wallet</div>
              <div className="font-mono text-[10px] text-accent truncate">{walletInfo.address}</div>
              <div className="font-mono text-[10px] text-muted">{walletInfo.balance} 0G</div>
            </div>
          )}
        </div>

        {/* CENTER — FEED */}
        <div className="border-r border-border flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
            <MessageSquare size={14} className="text-accent" />
            <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">Deliberation Feed</h2>
          </div>
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {feed.length === 0 && !running ? (
              <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-2">
                <MessageSquare size={32} className="opacity-30" />
                <span>Enter a query and click &quot;Run Consensus&quot; to begin.</span>
              </div>
            ) : (
              feed.map((item, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs ${item.type === "consensus" ? "bg-emerald/[0.06] border border-emerald/20 rounded-lg p-2" : item.type === "stored" || item.type === "chain" ? "bg-accent/[0.04] border border-accent/15 rounded-lg p-2" : item.type === "error" ? "bg-red-500/[0.04] border border-red-500/15 rounded-lg p-2" : ""} ${item.type === "verified" ? "pl-2" : ""}`}>
                  <span className="font-mono text-[10px] text-muted shrink-0 pt-0.5 w-20">{item.time}</span>
                  <FeedBadge type={item.type} />
                  <span className={`${item.type === "consensus" ? "text-emerald font-semibold" : item.type === "verified" ? "text-card-foreground" : item.type === "error" ? "text-red-400" : "text-muted"}`}>
                    {item.msg}
                  </span>
                </div>
              ))
            )}
            {running && feed.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted pl-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — CONSENSUS */}
        <div className="p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={14} className="text-accent" />
            <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">Consensus</h2>
          </div>

          {consensus ? (
            <>
              <div className="flex flex-col items-center mb-4">
                <CircularProgress value={Math.round(consensus.agreementScore * 100)} />
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald/15 text-emerald">
                  <ShieldCheck size={10} /> {consensus.verifiedCount}/{consensus.totalCount} Models Verified
                </span>
              </div>

              {consensus.convergedClaims.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-[10px] font-semibold tracking-widest text-muted uppercase mb-2">Converged Claims</h3>
                  <div className="space-y-2">
                    {consensus.convergedClaims.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle size={12} className="text-emerald shrink-0 mt-0.5" />
                        <span className="flex-1">{c.text}</span>
                        <span className="text-[10px] font-mono text-emerald bg-emerald/10 px-1.5 py-0.5 rounded shrink-0">
                          {c.modelsAgreeing.length}/{consensus.totalCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {consensus.divergences.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-[10px] font-semibold tracking-widest text-muted uppercase mb-2">Divergences</h3>
                  <div className="space-y-2">
                    {consensus.divergences.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle size={12} className="text-amber shrink-0 mt-0.5" />
                        <div>
                          <span className="text-amber/80 font-semibold">{d.topic}</span>
                          {d.positions.map((p, j) => (
                            <div key={j} className="text-muted ml-2 mt-0.5">{p.model}: {p.stance.slice(0, 80)}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted text-xs gap-2">
              <CheckCircle size={32} className="opacity-30" />
              <span>No consensus data yet.</span>
            </div>
          )}

          {report && (
            <div className="border-t border-border pt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">PoT Hash</span>
                <button
                  className="text-muted hover:text-foreground"
                  onClick={() => navigator.clipboard?.writeText(report.potHash)}
                >
                  <Copy size={10} />
                </button>
              </div>
              <div className="font-mono text-[10px] text-accent truncate">{report.potHash}</div>
              {report.storedOn && (
                <>
                  <div className="text-[10px] text-muted mt-1">Stored on</div>
                  <div className="font-mono text-[10px] text-accent truncate">{report.storedOn}</div>
                </>
              )}
            </div>
          )}

          {paymentInfo && report && (
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-accent" />
                <h3 className="text-[10px] font-semibold tracking-widest text-muted uppercase">View Full Report</h3>
              </div>
              <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Price</span>
                  <span className="font-semibold text-emerald">{paymentInfo.price} USDC</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Network</span>
                  <span className="font-mono text-[10px]">{paymentInfo.network}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Pay to</span>
                  <span className="font-mono text-[10px] truncate max-w-[140px]">{paymentInfo.payTo}</span>
                </div>
                <div className="text-[10px] text-muted mt-2">
                  Report ID: <span className="font-mono text-accent">{report.id}</span>
                </div>
                <div className="mt-2 p-2 bg-background rounded border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-muted uppercase tracking-wider">curl command</span>
                    <button
                      className="text-muted hover:text-foreground"
                      onClick={() => navigator.clipboard?.writeText(
                        `curl -s ${API_BASE}${paymentInfo.reportUrl}`
                      )}
                    >
                      <Copy size={10} />
                    </button>
                  </div>
                  <code className="text-[9px] text-accent break-all block">
                    curl -s {API_BASE}{paymentInfo.reportUrl}
                  </code>
                  <div className="text-[9px] text-muted mt-1.5">
                    Without payment header, returns HTTP 402 with payment requirements.
                    x402-compatible clients handle payment automatically.
                  </div>
                </div>
              </div>
            </div>
          )}
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
