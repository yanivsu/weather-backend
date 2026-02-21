import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Injectable, HttpException, HttpStatus, Inject } from "@nestjs/common";
import { Cache } from "cache-manager";
import axios from "axios";

function accuIconFromText(text: string) {
  const t = (text || "").toLowerCase();
  if (t.includes("sun") || t.includes("clear")) return "☀️";
  if (t.includes("cloud")) return "☁️";
  if (t.includes("rain") || t.includes("shower")) return "🌧️";
  if (t.includes("storm") || t.includes("thunder")) return "⛈️";
  if (t.includes("snow") || t.includes("sleet")) return "❄️";
  if (t.includes("fog") || t.includes("mist")) return "🌫️";
  return "🌡️";
}

function accuDescriptionToHebrew(text: string) {
  const t = (text || "").toLowerCase();
  if (t.includes("sun") || t.includes("clear")) return "שמיים בהירים";
  if (t.includes("partly") && t.includes("cloud")) return "מעונן חלקית";
  if (t.includes("mostly") && t.includes("sun")) return "בהיר בעיקר";
  if (t.includes("cloud")) return "מעונן";
  if (t.includes("rain") || t.includes("shower") || t.includes("drizzle")) {
    if (t.includes("light") || t.includes("patchy") || t.includes("isolated"))
      return "גשם קל";
    if (t.includes("heavy") || t.includes("moderate")) return "גשם כבד";
    return "גשם";
  }
  if (t.includes("thunder") || t.includes("storm")) return "סופת רעמים";
  if (t.includes("snow") || t.includes("sleet") || t.includes("blizzard"))
    return "שלג";
  if (t.includes("fog") || t.includes("mist") || t.includes("haze"))
    return "ערפל";
  if (t.includes("ice") || t.includes("freezing")) return "כפור/קפיאה";
  return text || "לא ידוע";
}

function normalizeName(s: string) {
  return (s || "").toLowerCase().replace(/\s|\-|\.|,/g, "");
}

@Injectable()
export class WeatherAccuService {
  private apiKey = process.env.ACCUWEATHER_API_KEY || "";

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private async geocode(city: string) {
    if (!this.apiKey) {
      throw new HttpException(
        "AccuWeather API key not configured (ACCUWEATHER_API_KEY)",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    // Try AccuWeather search with Hebrew localization first
    try {
      const resp = await axios.get(
        `http://dataservice.accuweather.com/locations/v1/cities/search`,
        {
          params: { apikey: this.apiKey, q: city, language: "he" },
        },
      );

      if (Array.isArray(resp.data) && resp.data.length > 0) {
        const r = resp.data[0];
        let displayName = r.LocalizedName || r.EnglishName || "";
        const normDisplay = normalizeName(displayName);
        const normQuery = normalizeName(city);
        if (normQuery && !normDisplay.includes(normQuery)) {
          displayName = city;
        }
        return {
          key: r.Key,
          name: displayName,
          country: r.Country?.LocalizedName || r.Country?.EnglishName || "",
          lat: r.GeoPosition?.Latitude,
          lon: r.GeoPosition?.Longitude,
        };
      }
    } catch (e) {
      // continue to fallback
    }

    // Fallback: use Open-Meteo geocoding (works well with Hebrew names), then AccuWeather geoposition lookup
    try {
      const om = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city,
        )}&count=1&language=he&format=json`,
      );

      if (!om.data.results?.length) {
        throw new HttpException(
          `City "${city}" not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const res = om.data.results[0];
      const lat = res.latitude;
      const lon = res.longitude;

      // Use AccuWeather geoposition search to get a location Key
      const geoResp = await axios.get(
        `http://dataservice.accuweather.com/locations/v1/cities/geoposition/search`,
        { params: { apikey: this.apiKey, q: `${lat},${lon}`, language: "he" } },
      );

      const r2 = geoResp.data;
      if (!r2) {
        throw new HttpException(
          `City "${city}" not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      let displayName = r2.LocalizedName || r2.EnglishName || res.name || city;
      const normDisplay2 = normalizeName(displayName);
      const normQuery2 = normalizeName(city);
      if (normQuery2 && !normDisplay2.includes(normQuery2)) {
        displayName = city;
      }
      return {
        key: r2.Key,
        name: displayName,
        country:
          r2.Country?.LocalizedName || r2.Country?.EnglishName || res.country,
        lat,
        lon,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(`City "${city}" not found`, HttpStatus.NOT_FOUND);
    }
  }

  async getWeather(city: string = "Haifa") {
    const cacheKey = `weather_accu_${city.toLowerCase()}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const location = await this.geocode(city);

    // Current conditions
    const currentRes = await axios.get(
      `http://dataservice.accuweather.com/currentconditions/v1/${location.key}`,
      { params: { apikey: this.apiKey, details: true } },
    );

    const current = currentRes.data?.[0];
    if (!current) {
      throw new HttpException(
        "No current data",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Hourly (24h)
    let hourlyData: any[] = [];
    try {
      const hourlyRes = await axios.get(
        `http://dataservice.accuweather.com/forecasts/v1/hourly/24hour/${location.key}`,
        { params: { apikey: this.apiKey, metric: true } },
      );
      hourlyData = (hourlyRes.data || []).map((h: any) => ({
        time: new Date(h.DateTime).toISOString(),
        temperature: h.Temperature?.Value,
        feelsLike: h.RealFeelTemperature?.Value || h.Temperature?.Value,
        humidity: h.RelativeHumidity,
        windSpeed: h.Wind?.Speed?.Value,
        weatherText: h.IconPhrase || current.WeatherText,
        description: accuDescriptionToHebrew(
          h.IconPhrase || current.WeatherText,
        ),
        icon: accuIconFromText(h.IconPhrase || current.WeatherText),
        precipitationProbability: h.PrecipitationProbability ?? 0,
      }));
    } catch (e) {
      hourlyData = [];
    }

    // Daily (5-day from AccuWeather)
    let dailyData: any[] = [];
    try {
      const dailyRes = await axios.get(
        `http://dataservice.accuweather.com/forecasts/v1/daily/5day/${location.key}`,
        { params: { apikey: this.apiKey, metric: true, details: false } },
      );
      dailyData = (dailyRes.data?.DailyForecasts || []).map((d: any) => ({
        date: new Date(d.Date).toISOString().split("T")[0],
        maxTemp: d.Temperature?.Maximum?.Value,
        minTemp: d.Temperature?.Minimum?.Value,
        weatherText: d.Day?.IconPhrase || d.Day?.LongPhrase,
        description: accuDescriptionToHebrew(
          d.Day?.IconPhrase || d.Day?.LongPhrase,
        ),
        icon: accuIconFromText(d.Day?.IconPhrase || d.Day?.LongPhrase),
        precipitationSum: null,
        sunrise: d.Sun?.Rise,
        sunset: d.Sun?.Set,
      }));
    } catch (e) {
      dailyData = [];
    }

    const result = {
      location: {
        name: location.name,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
      },
      current: {
        temperature:
          current.Temperature?.Metric?.Value ?? current.Temperature?.Value,
        windSpeed:
          current.Wind?.Speed?.Metric?.Value ?? current.Wind?.Speed?.Value,
        windDirection: current.Wind?.Direction?.Degrees,
        weatherText: current.WeatherText,
        description: accuDescriptionToHebrew(current.WeatherText),
        icon: accuIconFromText(current.WeatherText),
        isDay: current.IsDayTime,
      },
      hourly: hourlyData,
      daily: dailyData,
    };

    await this.cacheManager.set(cacheKey, result, 60 * 30);
    return result;
  }
}
