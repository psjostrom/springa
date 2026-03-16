import { UploadCloud, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";

interface ActionBarProps {
	workoutCount: number;
	isUploading: boolean;
	statusMsg: string;
	onUpload: () => void;
}

const POSITION = "fixed bottom-14 left-4 right-4 md:bottom-4 md:static z-50";

export function ActionBar({
	workoutCount,
	isUploading,
	statusMsg,
	onUpload,
}: ActionBarProps) {
	if (isUploading) {
		return (
			<div className={`${POSITION} bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#f23b94] rounded-lg flex items-center justify-between p-4`}>
					<div>
						<h3 className="font-bold text-white text-sm md:text-base">
							Syncing to Intervals.icu...
						</h3>
						<p className="text-sm text-[#af9ece]">
							{workoutCount} workouts uploading
						</p>
					</div>
					<button
						disabled
						className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[#d42c85] opacity-60 cursor-not-allowed"
					>
						<span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
						Syncing
					</button>
			</div>
		);
	}

	if (statusMsg.includes("Error")) {
		return (
			<div className={`${POSITION} bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#ff4d6a] rounded-lg flex items-center justify-between p-4`}>
					<div className="flex items-center gap-3 min-w-0">
						<AlertTriangle size={22} className="text-[#ff4d6a] shrink-0" />
						<div className="min-w-0">
							<h3 className="font-bold text-[#ff4d6a] text-sm md:text-base">
								Sync failed
							</h3>
							<p className="text-sm text-[#af9ece] truncate">
								{statusMsg.replace(/^Error:\s*/, "")}
							</p>
						</div>
					</div>
					<button
						onClick={onUpload}
						className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[#f23b94] hover:bg-[#d42f7e] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
					>
						<RotateCcw size={16} /> Retry
					</button>
			</div>
		);
	}

	if (statusMsg) {
		return (
			<div className={`${POSITION} bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#4ade80] rounded-lg flex items-center justify-between p-4`}>
					<div className="flex items-center gap-3">
						<CheckCircle size={22} className="text-[#4ade80] shrink-0" />
						<div>
							<h3 className="font-bold text-[#4ade80] text-sm md:text-base">
								Upload complete
							</h3>
							<p className="text-sm text-[#af9ece]">
								{statusMsg}
							</p>
						</div>
					</div>
			</div>
		);
	}

	return (
		<div className={`${POSITION} flex items-center justify-between bg-[#1d1828] p-4 rounded-lg border border-[#2e293c] shadow-xl shadow-[#f23b94]/10 backdrop-blur-sm`}>
			<div>
				<h3 className="font-bold text-white text-sm md:text-base">
					Ready to sync?
				</h3>
				<p className="text-sm text-[#af9ece]">
					{workoutCount} workouts generated.
				</p>
			</div>
			<button
				onClick={onUpload}
				className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[#f23b94] hover:bg-[#d42f7e] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
			>
				<UploadCloud size={18} /> Sync
			</button>
		</div>
	);
}
