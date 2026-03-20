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
    <span className="text-xs text-muted">
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
        <span className="text-xs px-1.5 py-0.5 rounded bg-tint-warning text-text border border-warning/30 font-medium">
          {weather.isSnow ? "Snow" : "Rain"} {weather.precipitation.toFixed(1)} mm/h
        </span>
      )}
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="text-xs px-1.5 py-0.5 rounded bg-surface-alt text-muted border border-border"
          >
            {item}
          </span>
        ))}
      </div>
      <WeatherSummary weather={weather} />
    </div>
  );
}
