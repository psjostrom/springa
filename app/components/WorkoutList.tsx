import { format } from "date-fns";
import type { WorkoutEvent } from "@/lib/types";

interface WorkoutListProps {
	events: WorkoutEvent[];
}

export function WorkoutList({ events }: WorkoutListProps) {
	return (
		<div className="space-y-4">
			<h3 className="text-sm font-bold uppercase text-muted tracking-wider">
				Preview
			</h3>
			{events.map((ev) => (
				<div
					key={ev.external_id}
					className="bg-surface p-4 rounded border border-border flex flex-col gap-2 hover:border-brand/50 transition"
				>
					<div className="flex justify-between items-baseline">
						<h4 className="font-bold text-white">{ev.name}</h4>
						<span className="text-muted text-sm font-mono">
							{format(ev.start_date_local, "yyyy-MM-dd")}
						</span>
					</div>
					<pre className="text-sm text-muted whitespace-pre-wrap font-sans bg-border p-3 rounded">
						{ev.description}
					</pre>
				</div>
			))}
		</div>
	);
}
