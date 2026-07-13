import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Cpu, KeyRound, Loader2 } from "lucide-react";
import type { ProviderInfo, ProvidersStatus } from "../../types";

const API = "http://127.0.0.1:8765/api/providers";

/** Onglet CERVEAU — sélection du provider LLM (local, Anthropic, ou n'importe
 *  quelle API OpenAI-compatible). Les clés API sont write-only : envoyées au
 *  serveur, jamais relues. */
export function ProvidersTab() {
  const [status, setStatus] = useState<ProvidersStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    fetch(API)
      .then((r) => r.json())
      .then((d: ProvidersStatus) => setStatus(d))
      .catch(() => setError("Serveur injoignable"));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openEditor = (p: ProviderInfo) => {
    setSelected(p.name);
    setApiKey("");
    setModel(p.model);
    setBaseUrl(p.base_url);
    setError("");
  };

  const submit = async (name: string, activate: boolean) => {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { name, activate };
      if (name !== "local" && selected === name) {
        if (apiKey) body.api_key = apiKey;
        if (model) body.model = model;
        if (baseUrl) body.base_url = baseUrl;
      }
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(String(data.detail ?? "Erreur de configuration"));
      } else {
        setStatus(data as ProvidersStatus);
        setApiKey("");
        if (activate) setSelected(null);
      }
    } catch {
      setError("Serveur injoignable");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[10px] text-blue-400/40">
        <Loader2 size={12} className="animate-spin" /> Chargement…
      </div>
    );
  }

  const allProviders: (ProviderInfo & { isLocal?: boolean })[] = [
    {
      name: "local",
      label: "Local (Mistral GGUF)",
      kind: "openai",
      needs_key: false,
      base_url: "",
      model: "Mistral-7B",
      api_key_masked: "",
      configured: status.local_available,
      isLocal: true,
    },
    ...status.providers,
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 p-2.5 rounded"
        style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
        <Cpu size={13} className="text-cyan-400 shrink-0" />
        <div className="text-[9px] text-blue-400/60">
          Cerveau actif : <span className="text-cyan-400 font-bold">{status.active_label}</span>
          {status.active_model && <span className="text-blue-400/40"> · {status.active_model}</span>}
        </div>
      </div>

      {error && (
        <div className="text-[9px] text-red-400 px-1">{error}</div>
      )}

      <div className="flex flex-col gap-1.5">
        {allProviders.map((p) => {
          const isActive = status.active === p.name;
          const isEditing = selected === p.name;
          return (
            <div key={p.name}>
              <button
                onClick={() => (p.isLocal ? void submit("local", true) : openEditor(p))}
                className="w-full flex items-center gap-3 p-2.5 rounded text-left transition-all"
                style={{
                  background: isActive ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: isActive ? "#00d4ff" : p.configured ? "#00ff8855" : "transparent",
                    border: `1px solid ${isActive ? "#00d4ff" : p.configured ? "#00ff88" : "rgba(255,255,255,0.2)"}`,
                    boxShadow: isActive ? "0 0 6px #00d4ff" : "none",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold tracking-wider truncate"
                    style={{ color: isActive ? "#00d4ff" : "#ffffff77" }}>
                    {p.label}
                  </div>
                  <div className="text-[8px] text-blue-400/30 truncate">
                    {p.isLocal ? "100 % privé · hors-ligne" : p.model || "modèle à définir"}
                    {p.api_key_masked && ` · clé ${p.api_key_masked}`}
                  </div>
                </div>
                {isActive && <CheckCircle size={12} className="text-cyan-400 shrink-0" />}
              </button>

              {isEditing && !p.isLocal && (
                <div className="flex flex-col gap-2 mt-1.5 mb-1 p-3 rounded"
                  style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.12)" }}>
                  {p.needs_key && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[8px] tracking-widest text-blue-400/40 flex items-center gap-1">
                        <KeyRound size={9} /> CLÉ API {p.api_key_masked && `(actuelle : ${p.api_key_masked})`}
                      </span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={p.api_key_masked ? "Laisser vide pour conserver" : "sk-…"}
                        className="bg-black/40 border border-cyan-900/40 rounded px-2 py-1.5 text-[10px] text-cyan-100 outline-none focus:border-cyan-500/50"
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-[8px] tracking-widest text-blue-400/40">MODÈLE</span>
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="nom-du-modele"
                      className="bg-black/40 border border-cyan-900/40 rounded px-2 py-1.5 text-[10px] text-cyan-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[8px] tracking-widest text-blue-400/40">BASE URL (OpenAI-compatible)</span>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://…/v1"
                      className="bg-black/40 border border-cyan-900/40 rounded px-2 py-1.5 text-[10px] text-cyan-100 outline-none focus:border-cyan-500/50"
                    />
                  </label>
                  <div className="flex gap-2 mt-1">
                    <button
                      disabled={busy}
                      onClick={() => void submit(p.name, false)}
                      className="flex-1 py-1.5 rounded text-[9px] tracking-widest transition-all disabled:opacity-40"
                      style={{ border: "1px solid rgba(0,212,255,0.25)", color: "#00d4ff88" }}
                    >
                      ENREGISTRER
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void submit(p.name, true)}
                      className="flex-1 py-1.5 rounded text-[9px] tracking-widest font-bold transition-all disabled:opacity-40"
                      style={{ background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff" }}
                    >
                      {busy ? "…" : "ACTIVER"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-blue-400/25 leading-relaxed px-1">
        Toute API compatible OpenAI fonctionne (OpenAI, Gemini, Ollama, Groq, DeepSeek,
        xAI, OpenRouter, Mistral, LM Studio, vLLM…) via « API personnalisée ».
        Les clés restent sur votre machine, côté serveur. En cas de panne du provider
        cloud, JARVIS bascule automatiquement sur le cerveau local.
      </p>
    </div>
  );
}
