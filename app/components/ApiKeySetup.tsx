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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Key className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Connect Intervals.icu
            </h1>
            <p className="text-sm text-slate-600">
              Enter your API key to get started
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-semibold text-slate-700 mb-2"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
              placeholder="Paste your API key here"
              autoFocus
            />
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700">
            <p className="font-semibold mb-1">How to get your API key:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to intervals.icu</li>
              <li>Navigate to Settings &rarr; Developer</li>
              <li>Copy your API key</li>
            </ol>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
          >
            Save &amp; Continue
          </button>
        </form>
      </div>
    </div>
  );
}
