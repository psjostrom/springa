import { CalendarCheck } from "lucide-react";

export function EmptyState() {
	return (
		<div className="h-64 md:h-full flex flex-col items-center justify-center text-[#b8a5d4]">
			<CalendarCheck size={64} className="mb-4 opacity-30" />
			<p>Configure settings and generate your plan.</p>
		</div>
	);
}
