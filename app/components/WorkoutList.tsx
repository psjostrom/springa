import { format } from "date-fns";
import { WorkoutEvent } from "@/lib/plannerLogic";

interface WorkoutListProps {
	events: WorkoutEvent[];
}

export function WorkoutList({ events }: WorkoutListProps) {
	return (
		<div className="space-y-4">
			<h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">
				Preview
			</h3>
			{events.map((ev, i) => (
				<div
					key={i}
					className="bg-white p-4 rounded border border-slate-100 flex flex-col gap-2 hover:border-blue-200 transition"
				>
					<div className="flex justify-between items-baseline">
						<h4 className="font-bold text-slate-900">{ev.name}</h4>
						<span className="text-slate-400 text-xs font-mono">
							{format(ev.start_date_local, "yyyy-MM-dd")}
						</span>
					</div>
					<pre className="text-xs text-slate-500 whitespace-pre-wrap font-sans bg-slate-50 p-3 rounded">
						{ev.description}
					</pre>
				</div>
			))}
		</div>
	);
}
