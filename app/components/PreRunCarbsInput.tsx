"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";

interface PreRunCarbsInputProps {
  eventId: string;
}

// Strip "event-" prefix to get raw numeric ID for storage
// This ensures the ID matches activity.paired_event_id from Intervals.icu
function normalizeEventId(id: string): string {
  return id.startsWith("event-") ? id.slice(6) : id;
}

export function PreRunCarbsInput({ eventId }: PreRunCarbsInputProps) {
  const normalizedId = normalizeEventId(eventId);
  const [carbsG, setCarbsG] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editG, setEditG] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(normalizedId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: { carbsG: number | null }) => {
        if (cancelled) return;
        setCarbsG(data.carbsG);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [normalizedId]);

  const startEdit = () => {
    setError(null);
    setEditG(carbsG != null ? String(carbsG) : "");
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    const g = editG ? parseInt(editG, 10) : null;
    try {
      const res = await fetch("/api/prerun-carbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: normalizedId, carbsG: g }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      setError(null);
      setCarbsG(g);
      setIsEditing(false);
    } catch {
      setError("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-border">
        <div className="skeleton h-5 w-32" />
      </div>
    );
  }

  const displayValue = carbsG != null ? `${carbsG}g` : null;

  return (
    <div className="mb-4 px-4 py-3 rounded-lg bg-border">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">Pre-run carbs</div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={editG}
              onChange={(e) => { setEditG(e.target.value); }}
              placeholder="g"
              className="w-16 border border-border bg-bg text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setIsEditing(false);
              }}
            />
            <span className="text-sm text-muted">g</span>
            <button
              onClick={() => { void save(); }}
              disabled={isSaving}
              className="px-2 py-1 text-xs bg-brand hover:bg-brand-hover text-white rounded transition disabled:opacity-50"
            >
              {isSaving ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setIsEditing(false); }}
              disabled={isSaving}
              className="px-2 py-1 text-xs bg-border hover:bg-border text-muted rounded transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-brand transition"
          >
            {displayValue ?? "Add"}
            <Pencil className="w-3 h-3 text-muted" />
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-error mt-1">{error}</p>
      )}
    </div>
  );
}
