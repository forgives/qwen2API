import { useEffect, useRef, useState } from "react"
import { Button } from "../components/ui/button"
import { Send, RefreshCw, Bot } from "lucide-react"
import { getAuthHeader } from "../lib/auth"
import { API_BASE } from "../lib/api"
import { toast } from "sonner"

export default function TestPage() {
  const [messages, setMessages] = useState<{ role: string; content: string; error?: boolean }[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState("qwen3.6-plus")
  const [stream, setStream] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: "user", content: input }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      if (!stream) {
        // ── 非流式 ──────────────────────────────────────────
        const res = await fetch(`${API_BASE}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ model, messages: [...messages, userMsg], stream: false })
        })
        const data = await res.json()
        if (data.error) {
          setMessages(prev => [...prev, { role: "assistant", content: `❌ ${data.error}`, error: true }])
        } else if (data.choices?.[0]) {
          setMessages(prev => [...prev, data.choices[0].message])
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: `❌ 未知响应: ${JSON.stringify(data)}`, error: true }])
        }
      } else {
        // ── 流式 ──────────────────────────────────────────
        const res = await fetch(`${API_BASE}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ model, messages: [...messages, userMsg], stream: true })
        })

        if (!res.ok) {
          const errText = await res.text()
          setMessages(prev => [...prev, { role: "assistant", content: `❌ HTTP ${res.status}: ${errText}`, error: true }])
          return
        }

        if (!res.body) throw new Error("No response body")

        // 先插一个带加载占位的 assistant 气泡
        setMessages(prev => [...prev, { role: "assistant", content: "" }])

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let hasContent = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || line.startsWith(":")) continue  // 跳过注释和 keepalive
            if (line === "data: [DONE]") continue

            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))

                // 显式错误
                if (data.error) {
                  setMessages(prev => {
                    const msgs = [...prev]
                    msgs[msgs.length - 1] = { role: "assistant", content: `❌ ${data.error}`, error: true }
                    return msgs
                  })
                  hasContent = true
                  break
                }

                const content: string = data.choices?.[0]?.delta?.content ?? ""
                if (content) {
                  hasContent = true
                  setMessages(prev => {
                    const msgs = [...prev]
                    const last = msgs[msgs.length - 1]
                    msgs[msgs.length - 1] = { ...last, content: last.content + content }
                    return msgs
                  })
                }
              } catch (_) {
                // 跳过无法解析的行
              }
            }
          }
        }

        // 如果整个流结束都没有任何内容，显示友好错误
        if (!hasContent) {
          setMessages(prev => {
            const msgs = [...prev]
            msgs[msgs.length - 1] = { role: "assistant", content: "❌ 响应为空（账号可能未激活或无可用账号）", error: true }
            return msgs
          })
        }
      }
    } catch (err: any) {
      toast.error(`网络错误: ${err.message}`)
      setMessages(prev => [...prev, { role: "assistant", content: `❌ 网络错误: ${err.message}`, error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] space-y-4 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">接口测试</h2>
          <p className="text-muted-foreground">在此测试您的 API 分发是否正常工作。</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 text-sm bg-card border px-3 py-1.5 rounded-md">
            <span className="font-medium text-muted-foreground">模型:</span>
            <select value={model} onChange={e => setModel(e.target.value)} className="bg-transparent font-mono outline-none">
              <option value="qwen3.6-plus">qwen3.6-plus</option>
              <option value="qwen-max">qwen-max</option>
              <option value="qwen-turbo">qwen-turbo</option>
            </select>
          </div>
          <div
            className="flex items-center gap-2 text-sm bg-card border px-3 py-1.5 rounded-md cursor-pointer"
            onClick={() => setStream(!stream)}
          >
            <input type="checkbox" checked={stream} onChange={() => {}} className="cursor-pointer" />
            <span className="font-medium">流式传输 (Stream)</span>
          </div>
          <Button variant="outline" onClick={() => setMessages([])}>
            <RefreshCw className="mr-2 h-4 w-4" /> 清空对话
          </Button>
        </div>
      </div>

      <div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col shadow-sm">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <Bot className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm">发送一条消息以开始测试，系统将通过 /v1/chat/completions 进行调用。</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm shadow-sm
                ${msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.error
                    ? "bg-red-500/10 border border-red-500/30 text-red-400"
                    : "bg-muted/30 border text-foreground"}`}>
                {msg.role === "assistant" && !msg.content && loading ? (
                  <span className="animate-pulse flex items-center gap-2 text-muted-foreground">
                    <Bot className="h-4 w-4" /> 思考中...
                  </span>
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t bg-muted/30 flex gap-3 items-center">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            className="flex h-12 w-full rounded-md border border-input bg-background px-4 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="输入测试消息..."
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} className="h-12 px-6">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
