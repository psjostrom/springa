"use client";

import { useState } from "react";

interface ImportResult {
  success: boolean;
  totalInserted?: number;
  filesProcessed?: number;
  error?: string;
}

export default function ImportGlookoPage() {
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setStatus("Uploading...");
    setResult(null);

    fetch("/api/debug/import-glooko", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json() as Promise<ImportResult>)
      .then((data) => {
        setResult(data);
        setStatus(data.success ? "Import complete!" : "Import failed");
      })
      .catch((err: unknown) => {
        setStatus("Error: " + String(err));
      });
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>Import Glooko CGM Data</h1>
      <form onSubmit={handleSubmit}>
        <input type="file" name="files" multiple accept=".csv" />
        <button type="submit" style={{ marginLeft: "1rem" }}>
          Import
        </button>
      </form>

      {status && <p style={{ marginTop: "1rem" }}>{status}</p>}

      {result && (
        <pre style={{ marginTop: "1rem", background: "#f0f0f0", padding: "1rem" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
