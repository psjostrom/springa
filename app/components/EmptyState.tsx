import { CalendarCheck } from "lucide-react";

export function EmptyState() {
	return (
		<div className="h-64 md:h-full flex flex-col items-center justify-center text-[#6b5a8a]">
			<CalendarCheck size={64} className="mb-4 opacity-30" />
			<p>Configure settings and generate your plan.</p>
		</div>
	);
}
