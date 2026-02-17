import { format } from "date-fns";
import { WorkoutEvent } from "@/lib/plannerLogic";

interface WorkoutListProps {
	events: WorkoutEvent[];
}

export function WorkoutList({ events }: WorkoutListProps) {
	return (
		<div className="space-y-4">
			<h3 className="text-sm font-bold uppercase text-[#b8a5d4] tracking-wider">
				Preview
			</h3>
			{events.map((ev, i) => (
				<div
					key={i}
					className="bg-[#1e1535] p-4 rounded border border-[#3d2b5a] flex flex-col gap-2 hover:border-[#ff2d95]/50 transition"
				>
					<div className="flex justify-between items-baseline">
						<h4 className="font-bold text-white">{ev.name}</h4>
						<span className="text-[#b8a5d4] text-sm font-mono">
							{format(ev.start_date_local, "yyyy-MM-dd")}
						</span>
					</div>
					<pre className="text-sm text-[#c4b5fd] whitespace-pre-wrap font-sans bg-[#2a1f3d] p-3 rounded">
						{ev.description}
					</pre>
				</div>
			))}
		</div>
	);
}
