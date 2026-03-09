import type { ClothingRecommendation as ClothingRec } from "@/lib/clothingCalculator";

interface Props {
  recommendation: ClothingRec;
}

function WeatherSummary({ weather }: { weather: ClothingRec["weather"] }) {
  const parts: string[] = [
    `${Math.round(weather.temp)}°C`,
  ];
  if (Math.round(weather.feelsLike) !== Math.round(weather.temp)) {
    parts.push(`(feels ${Math.round(weather.feelsLike)}°)`);
  }
  if (weather.windSpeed >= 3) {
    parts.push(`${weather.windSpeed.toFixed(0)} m/s`);
  }

  return (
    <span className="text-xs text-[#b8a5d4]">
      {parts.join(" · ")}
    </span>
  );
}

export function ClothingRecommendation({ recommendation }: Props) {
  const { upper, lower, accessories, weather } = recommendation;
  const items = [...lower, ...upper, ...accessories];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(weather.isRain || weather.isSnow) && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a3352] text-[#93c5fd] border border-[#93c5fd]/30 font-medium">
          {weather.isSnow ? "Snow" : "Rain"} {weather.precipitation.toFixed(1)} mm/h
        </span>
      )}
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="text-xs px-1.5 py-0.5 rounded bg-[#1a2a3d] text-[#7dd3fc] border border-[#7dd3fc]/20"
          >
            {item}
          </span>
        ))}
      </div>
      <WeatherSummary weather={weather} />
    </div>
  );
}
