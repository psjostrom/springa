import { UploadCloud } from "lucide-react";

interface ActionBarProps {
	workoutCount: number;
	isUploading: boolean;
	onUpload: () => void;
}

export function ActionBar({
	workoutCount,
	isUploading,
	onUpload,
}: ActionBarProps) {
	return (
		<div className="fixed bottom-20 left-4 right-4 md:bottom-4 md:static z-50 flex items-center justify-between bg-[#1e1535] p-4 rounded-lg border border-[#3d2b5a] shadow-xl shadow-[#ff2d95]/10 backdrop-blur-sm">
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
				disabled={isUploading}
				className="flex items-center gap-2 bg-[#ff2d95] text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold hover:bg-[#e0207a] disabled:opacity-50 transition shadow-lg shadow-[#ff2d95]/20 text-sm md:text-base"
			>
				{isUploading ? (
					"Syncing..."
				) : (
					<>
						<UploadCloud size={18} /> Sync
					</>
				)}
			</button>
		</div>
	);
}
