/**
 * SMHI Open Data API — point forecast (SNOW1g).
 * Free, no API key, CORS-enabled. Returns hourly forecasts ~10 days out.
 */

export interface SMHIWeather {
  /** Temperature in Celsius */
  temp: number;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Wind gust in m/s */
  windGust: number;
  /** Precipitation in mm/h (mean) */
  precipitation: number;
  /** Precipitation category: SMHI SNOW1g 0=none, 1=rain, 2=thunderstorm, 3=freezing rain, 4=mixed/ice, 5=snow, 6=wet snow, 7=rain+snow, 8=ice pellets, 9=graupel, 10=hail, 11=drizzle, 12=freezing drizzle */
  precipCategory: number;
  /** "Feels like" temperature accounting for wind chill */
  feelsLike: number;
  /** ISO timestamp of the forecast point */
  validTime: string;
}

// Hardcoded coordinates — Kallhäll, Stockholm
const LAT = 59.45;
const LON = 17.81;

const SMHI_URL = `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${LON}/lat/${LAT}/data.json`;

interface SMHIData {
  air_temperature: number;
  wind_speed: number;
  wind_speed_of_gust: number;
  precipitation_amount_mean: number;
  predominant_precipitation_type_at_surface: number;
  [key: string]: number;
}

interface SMHITimeSeries {
  time: string;
  data: SMHIData;
}

interface SMHIResponse {
  timeSeries: SMHITimeSeries[];
}

/**
 * Wind chill / "feels like" approximation.
 * Uses the North American wind chill formula for temp <= 10°C and wind > 4.8 km/h.
 * Otherwise returns air temperature.
 */
export function calcFeelsLike(tempC: number, windMs: number): number {
  const windKmh = windMs * 3.6;
  if (tempC > 10 || windKmh <= 4.8) return tempC;
  const wc =
    13.12 +
    0.6215 * tempC -
    11.37 * Math.pow(windKmh, 0.16) +
    0.3965 * tempC * Math.pow(windKmh, 0.16);
  return Math.round(wc * 10) / 10;
}

function parseTimeSeries(entry: SMHITimeSeries): SMHIWeather {
  const d = entry.data;
  const temp = d.air_temperature;
  const windSpeed = d.wind_speed;
  const windGust = d.wind_speed_of_gust;
  const precipitation = d.precipitation_amount_mean;
  const precipCategory = d.predominant_precipitation_type_at_surface;
  return {
    temp,
    windSpeed,
    windGust,
    precipitation,
    precipCategory,
    feelsLike: calcFeelsLike(temp, windSpeed),
    validTime: entry.time,
  };
}

let cachedForecast: { data: SMHIWeather[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function resetForecastCache(): void {
  cachedForecast = null;
}

export async function fetchForecast(): Promise<SMHIWeather[]> {
  if (cachedForecast && Date.now() - cachedForecast.fetchedAt < CACHE_TTL) {
    return cachedForecast.data;
  }

  const res = await fetch(SMHI_URL);
  if (!res.ok) throw new Error(`SMHI API error: ${res.status}`);
  const json = (await res.json()) as SMHIResponse;
  const data = json.timeSeries.map(parseTimeSeries);
  cachedForecast = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Get weather for a specific date/time. Finds the closest forecast hour.
 * Returns null if the date is beyond the forecast range.
 */
export function getWeatherForTime(
  forecast: SMHIWeather[],
  target: Date,
): SMHIWeather | null {
  if (forecast.length === 0) return null;

  const targetMs = target.getTime();
  let closest: SMHIWeather | null = null;
  let closestDiff = Infinity;

  for (const entry of forecast) {
    const diff = Math.abs(new Date(entry.validTime).getTime() - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = entry;
    }
  }

  // Don't return if closest point is more than 3 hours away
  if (closestDiff > 3 * 60 * 60 * 1000) return null;
  return closest;
}
