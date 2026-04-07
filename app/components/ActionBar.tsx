import { UploadCloud, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";

interface ActionBarProps {
	workoutCount: number;
	isUploading: boolean;
	statusMsg: string;
	onUpload: () => void;
	onViewCalendar?: () => void;
}

const POSITION = "fixed bottom-14 left-4 right-4 md:bottom-4 md:static z-50";

export function ActionBar({
	workoutCount,
	isUploading,
	statusMsg,
	onUpload,
	onViewCalendar,
}: ActionBarProps) {
	if (isUploading) {
		return (
			<div className={`${POSITION} bg-surface border border-border border-l-[3px] border-l-brand rounded-lg flex items-center justify-between p-4`}>
					<div>
						<h3 className="font-bold text-text text-sm md:text-base">
							Syncing...
						</h3>
						<p className="text-sm text-muted">
							{workoutCount} workouts uploading
						</p>
					</div>
					<button
						disabled
						className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-brand-btn opacity-60 cursor-not-allowed"
					>
						<span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
						Syncing
					</button>
			</div>
		);
	}

	if (statusMsg.includes("Error")) {
		return (
			<div className={`${POSITION} bg-surface border border-border border-l-[3px] border-l-error rounded-lg flex items-center justify-between p-4`}>
					<div className="flex items-center gap-3 min-w-0">
						<AlertTriangle size={22} className="text-error shrink-0" />
						<div className="min-w-0">
							<h3 className="font-bold text-error text-sm md:text-base">
								Sync failed
							</h3>
							<p className="text-sm text-muted truncate">
								{statusMsg.replace(/^Error:\s*/, "")}
							</p>
						</div>
					</div>
					<button
						onClick={onUpload}
						className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-brand hover:bg-brand-hover hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
					>
						<RotateCcw size={16} /> Retry
					</button>
			</div>
		);
	}

	if (statusMsg) {
		return (
			<div className={`${POSITION} bg-surface border border-border border-l-[3px] border-l-success rounded-lg flex items-center justify-between p-4`}>
					<div className="flex items-center gap-3">
						<CheckCircle size={22} className="text-success shrink-0" />
						<div>
							<h3 className="font-bold text-success text-sm md:text-base">
								Upload complete
							</h3>
							<p className="text-sm text-muted">
								{statusMsg}
							</p>
						</div>
					</div>
					{onViewCalendar && (
						<button
							onClick={onViewCalendar}
							className="flex items-center gap-1 text-brand px-4 py-2 rounded-md font-bold text-sm hover:bg-brand/10 transition"
						>
							View in Calendar <span aria-hidden="true">&rarr;</span>
						</button>
					)}
			</div>
		);
	}

	return (
		<div className={`${POSITION} flex items-center justify-between bg-surface p-4 rounded-lg border border-border shadow-xl shadow-brand/10 backdrop-blur-sm`}>
			<div>
				<h3 className="font-bold text-text text-sm md:text-base">
					Ready to sync?
				</h3>
				<p className="text-sm text-muted">
					{workoutCount} workouts generated.
				</p>
			</div>
			<button
				onClick={onUpload}
				className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-brand hover:bg-brand-hover hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
			>
				<UploadCloud size={18} /> Sync
			</button>
		</div>
	);
}
