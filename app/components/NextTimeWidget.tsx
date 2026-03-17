"use client";

import { Lightbulb } from "lucide-react";
import { parseNextTime } from "@/lib/parseNextTime";

interface NextTimeWidgetProps {
  analysis: string | null | undefined;
}

export function NextTimeWidget({ analysis }: NextTimeWidgetProps) {
  const bullets = parseNextTime(analysis);
  if (bullets.length === 0) return null;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Lightbulb className="w-4 h-4 text-warning" />
        <span className="text-sm font-semibold text-muted">Next Time</span>
      </div>
      <ul className="space-y-1">
        {bullets.map((bullet, i) => (
          <li key={i} className="text-sm text-muted flex gap-2">
            <span className="text-warning mt-0.5">-</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
