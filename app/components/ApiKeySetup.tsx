"use client";

import { useState } from "react";
import { Key } from "lucide-react";

interface ApiKeySetupProps {
  onSubmit: (key: string) => void;
}

export function ApiKeySetup({ onSubmit }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    onSubmit(apiKey.trim());
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
              Connect Intervals.icu
            </h1>
            <p className="text-sm text-[#a78bca]">
              Enter your API key to get started
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-semibold text-[#c4b5fd] mb-2"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-[#3d2b5a] rounded-lg text-white bg-[#1a1030] focus:outline-none focus:ring-2 focus:ring-[#ff2d95] focus:border-transparent placeholder:text-[#6b5a8a]"
              placeholder="Paste your API key here"
              autoFocus
            />
            {error && <p className="text-sm text-[#ff3366] mt-1">{error}</p>}
          </div>

          <div className="bg-[#2a1f3d] rounded-lg p-3 text-xs text-[#c4b5fd] border border-[#3d2b5a]">
            <p className="font-semibold mb-1">How to get your API key:</p>
            <ol className="list-decimal list-inside space-y-1 text-[#a78bca]">
              <li>Go to intervals.icu</li>
              <li>Navigate to Settings &rarr; Developer</li>
              <li>Copy your API key</li>
            </ol>
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
