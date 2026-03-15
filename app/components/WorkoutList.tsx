import { format } from "date-fns";
import type { WorkoutEvent } from "@/lib/types";

interface WorkoutListProps {
	events: WorkoutEvent[];
}

export function WorkoutList({ events }: WorkoutListProps) {
	return (
		<div className="space-y-4">
			<h3 className="text-sm font-bold uppercase text-[#af9ece] tracking-wider">
				Preview
			</h3>
			{events.map((ev) => (
				<div
					key={ev.external_id}
					className="bg-[#1d1828] p-4 rounded border border-[#2e293c] flex flex-col gap-2 hover:border-[#f23b94]/50 transition"
				>
					<div className="flex justify-between items-baseline">
						<h4 className="font-bold text-white">{ev.name}</h4>
						<span className="text-[#af9ece] text-sm font-mono">
							{format(ev.start_date_local, "yyyy-MM-dd")}
						</span>
					</div>
					<pre className="text-sm text-[#af9ece] whitespace-pre-wrap font-sans bg-[#2e293c] p-3 rounded">
						{ev.description}
					</pre>
				</div>
			))}
		</div>
	);
}
