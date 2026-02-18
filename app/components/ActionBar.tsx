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
			<div className={`${POSITION} retro-upload-border rounded-lg`}>
				<div className="bg-[#1e1535] flex items-center justify-between p-4 rounded-[0.4rem]">
					<div>
						<h3 className="font-bold text-[#00ffff] text-sm md:text-base retro-text-flicker">
							Syncing to Intervals.icu...
						</h3>
						<p className="text-sm text-[#c4b5fd]">
							{workoutCount} workouts uploading
						</p>
					</div>
					<button
						disabled
						className="relative flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold transition text-sm md:text-base retro-btn-uploading"
					>
						<span className="relative z-10">Syncing...</span>
					</button>
				</div>
			</div>
		);
	}

	if (statusMsg?.includes("Error")) {
		return (
			<div className={`${POSITION} retro-error-border rounded-lg`}>
				<div className="bg-[#1e1535] flex items-center justify-between p-4 rounded-[0.4rem]">
					<div className="flex items-center gap-3 min-w-0">
						<AlertTriangle size={22} className="text-[#ff6b8a] shrink-0" />
						<div className="min-w-0">
							<h3 className="font-bold text-[#ff6b8a] text-sm md:text-base">
								Sync failed
							</h3>
							<p className="text-sm text-[#c4b5fd] truncate">
								{statusMsg.replace(/^Error:\s*/, "")}
							</p>
						</div>
					</div>
					<button
						onClick={onUpload}
						className="relative overflow-hidden flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[linear-gradient(135deg,#ff6b8a,#ff2d95)] shadow-[0_0_12px_rgba(255,107,138,0.4)] hover:shadow-[0_0_18px_rgba(255,107,138,0.6)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 retro-scanline-static"
					>
						<span className="relative z-10 flex items-center gap-2">
							<RotateCcw size={16} /> Retry
						</span>
					</button>
				</div>
			</div>
		);
	}

	if (statusMsg) {
		return (
			<div className={`${POSITION} retro-success-border rounded-lg`}>
				<div className="bg-[#1e1535] flex items-center justify-between p-4 rounded-[0.4rem]">
					<div className="flex items-center gap-3">
						<CheckCircle size={22} className="text-[#39ff14] shrink-0" />
						<div>
							<h3 className="font-bold text-[#39ff14] text-sm md:text-base">
								Upload complete
							</h3>
							<p className="text-sm text-[#c4b5fd]">
								{statusMsg}
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={`${POSITION} flex items-center justify-between bg-[#1e1535] p-4 rounded-lg border border-[#3d2b5a] shadow-xl shadow-[#ff2d95]/10 backdrop-blur-sm`}>
			<div>
				<h3 className="font-bold text-[#00ffff] text-sm md:text-base">
					Ready to sync?
				</h3>
				<p className="text-sm text-[#c4b5fd]">
					{workoutCount} workouts generated.
				</p>
			</div>
			<button
				onClick={onUpload}
				className="relative overflow-hidden flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[linear-gradient(135deg,#ff2d95,#d946ef)] shadow-[0_0_12px_rgba(255,45,149,0.4),0_0_24px_rgba(255,45,149,0.15)] hover:shadow-[0_0_18px_rgba(255,45,149,0.6),0_0_36px_rgba(217,70,239,0.3)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 retro-scanline-static"
			>
				<span className="relative z-10 flex items-center gap-2">
					<UploadCloud size={18} /> Sync
				</span>
			</button>
		</div>
	);
}
