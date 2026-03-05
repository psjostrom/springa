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
  const [minutesBefore, setMinutesBefore] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editG, setEditG] = useState("");
  const [editMin, setEditMin] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(normalizedId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: { carbsG: number | null; minutesBefore: number | null }) => {
        if (cancelled) return;
        setCarbsG(data.carbsG);
        setMinutesBefore(data.minutesBefore);
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
    setEditMin(minutesBefore != null ? String(minutesBefore) : "");
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    const g = editG ? parseInt(editG, 10) : null;
    const min = editMin ? parseInt(editMin, 10) : null;
    try {
      const res = await fetch("/api/prerun-carbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: normalizedId, carbsG: g, minutesBefore: min }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      setError(null);
      setCarbsG(g);
      setMinutesBefore(min);
      setIsEditing(false);
    } catch {
      setError("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-[#2a1f3d]">
        <div className="skeleton h-5 w-32" />
      </div>
    );
  }

  const displayValue = (() => {
    if (carbsG != null && minutesBefore != null) return `${carbsG}g, ${minutesBefore} min before`;
    if (carbsG != null) return `${carbsG}g`;
    return null;
  })();

  return (
    <div className="mb-4 px-4 py-3 rounded-lg bg-[#2a1f3d]">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#b8a5d4]">Pre-run carbs</div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={editG}
              onChange={(e) => { setEditG(e.target.value); }}
              placeholder="g"
              className="w-14 border border-[#3d2b5a] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setIsEditing(false);
              }}
            />
            <span className="text-sm text-[#b8a5d4]">g</span>
            <input
              type="number"
              min="0"
              value={editMin}
              onChange={(e) => { setEditMin(e.target.value); }}
              placeholder="min"
              className="w-14 border border-[#3d2b5a] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setIsEditing(false);
              }}
            />
            <span className="text-sm text-[#b8a5d4]">min before</span>
            <button
              onClick={() => { void save(); }}
              disabled={isSaving}
              className="px-2 py-1 text-xs bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded transition disabled:opacity-50"
            >
              {isSaving ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setIsEditing(false); }}
              disabled={isSaving}
              className="px-2 py-1 text-xs bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#ff2d95] transition"
          >
            {displayValue ?? "Add"}
            <Pencil className="w-3 h-3 text-[#b8a5d4]" />
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-[#ff3366] mt-1">{error}</p>
      )}
    </div>
  );
}
