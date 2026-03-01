"use client";

import { useState } from "react";
import { Key, Radio, Copy, RefreshCw } from "lucide-react";

interface ApiKeySetupProps {
  onSubmit: (keys: { intervalsApiKey: string; xdripSecret?: string }) => void;
}

export function ApiKeySetup({ onSubmit }: ApiKeySetupProps) {
  const [intervalsKey, setIntervalsKey] = useState("");
  const [xdripSecret, setXdripSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generateSecret = () => {
    setXdripSecret(crypto.randomUUID());
  };

  const nightscoutUrl = xdripSecret
    ? `https://${xdripSecret}@springa.vercel.app/api/v1/`
    : "";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(nightscoutUrl);
    setCopied(true);
    setTimeout(() => { setCopied(false); }, 2000);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!intervalsKey.trim()) {
      setError("Intervals.icu API key is required");
      return;
    }
    onSubmit({
      intervalsApiKey: intervalsKey.trim(),
      ...(xdripSecret.trim() && { xdripSecret: xdripSecret.trim() }),
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0a1a] flex items-center justify-center p-4">
      <div className="bg-[#1e1535] rounded-xl p-8 max-w-md w-full shadow-lg shadow-[#ff2d95]/10 border border-[#3d2b5a]">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#2a1f3d] p-3 rounded-lg border border-[#3d2b5a]">
            <Key className="text-[#00ffff]" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Connect Your Keys
            </h1>
            <p className="text-sm text-[#c4b5fd]">
              API keys are stored securely per account
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="intervalsKey"
              className="block text-sm font-semibold text-[#c4b5fd] mb-2"
            >
              Intervals.icu API Key
            </label>
            <input
              id="intervalsKey"
              type="text"
              value={intervalsKey}
              onChange={(e) => {
                setIntervalsKey(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#b8a5d4]"
              placeholder="Paste your Intervals.icu API key"
              autoFocus
            />
            {error && <p className="text-sm text-[#ff3366] mt-1">{error}</p>}
          </div>

          <div className="bg-[#2a1f3d] rounded-lg p-3 text-sm text-[#c4b5fd] border border-[#3d2b5a]">
            <p className="font-semibold mb-1">Intervals.icu:</p>
            <ol className="list-decimal list-inside space-y-1 text-[#c4b5fd]">
              <li>Go to intervals.icu</li>
              <li>Settings &rarr; Developer</li>
              <li>Copy your API key</li>
            </ol>
          </div>

          {/* xDrip Integration */}
          <div className="border-t border-[#3d2b5a] pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="text-[#39ff14]" size={18} />
              <span className="text-sm font-semibold text-[#c4b5fd]">
                xDrip Integration <span className="font-normal text-[#b8a5d4]">(optional)</span>
              </span>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                id="xdripSecret"
                type="text"
                value={xdripSecret}
                onChange={(e) => { setXdripSecret(e.target.value); }}
                className="flex-1 px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#39ff14] focus:border-transparent placeholder:text-[#b8a5d4] text-sm font-mono"
                placeholder="Secret for xDrip sync"
              />
              <button
                type="button"
                onClick={generateSecret}
                className="px-3 py-2 bg-[#2a1f3d] border border-[#3d2b5a] rounded-lg text-[#39ff14] hover:bg-[#3d2b5a] transition"
                title="Generate secret"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {xdripSecret && (
              <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
                <p className="text-xs text-[#b8a5d4] mb-1">Nightscout URL for xDrip:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-[#39ff14] break-all flex-1">
                    {nightscoutUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => { void copyUrl(); }}
                    className="shrink-0 p-1.5 rounded bg-[#2a1f3d] border border-[#3d2b5a] text-[#c4b5fd] hover:text-[#39ff14] transition"
                    title="Copy URL"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-[#39ff14] mt-1">Copied!</p>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20"
          >
            Save &amp; Continue
          </button>
        </form>
      </div>
    </div>
  );
}
