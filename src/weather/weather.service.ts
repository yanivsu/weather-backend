import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

const WMO_CODES: Record<number, string> = {
  0: 'שמיים בהירים',
  1: 'בהיר בעיקר',
  2: 'מעונן חלקית',
  3: 'מעונן',
  45: 'ערפל',
  48: 'ערפל קפוא',
  51: 'טפטוף קל',
  53: 'טפטוף מתון',
  55: 'טפטוף כבד',
  61: 'גשם קל',
  63: 'גשם מתון',
  65: 'גשם כבד',
  71: 'שלג קל',
  73: 'שלג מתון',
  75: 'שלג כבד',
  77: 'גרגרי שלג',
  80: 'מטר קל',
  81: 'מטר מתון',
  82: 'מטר כבד',
  85: 'מטר שלג קל',
  86: 'מטר שלג כבד',
  95: 'סופת רעמים',
  96: 'סופת רעמים עם ברד',
  99: 'סופת רעמים עם ברד כבד',
};

const WMO_ICONS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

@Injectable()
export class WeatherService {
  private async geocode(city: string): Promise<{ lat: number; lon: number; name: string; country: string }> {
    const response = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=he&format=json`
    );

    if (!response.data.results?.length) {
      throw new HttpException(`City "${city}" not found`, HttpStatus.NOT_FOUND);
    }

    const result = response.data.results[0];
    return {
      lat: result.latitude,
      lon: result.longitude,
      name: result.name,
      country: result.country,
    };
  }

  async getWeather(city: string = 'Haifa') {
    const location = await this.geocode(city);

    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast`,
      {
        params: {
          latitude: location.lat,
          longitude: location.lon,
          hourly: [
            'temperature_2m',
            'relative_humidity_2m',
            'wind_speed_10m',
            'weathercode',
            'precipitation_probability',
            'apparent_temperature',
          ].join(','),
          daily: [
            'temperature_2m_max',
            'temperature_2m_min',
            'weathercode',
            'precipitation_sum',
            'wind_speed_10m_max',
            'sunrise',
            'sunset',
          ].join(','),
          current_weather: true,
          timezone: 'auto',
          forecast_days: 7,
        },
      }
    );

    const data = response.data;
    const current = data.current_weather;

    // Build hourly data for charts (next 24 hours)
    const now = new Date();
    const hourlyData = data.hourly.time
      .map((time: string, i: number) => ({
        time,
        temperature: data.hourly.temperature_2m[i],
        feelsLike: data.hourly.apparent_temperature[i],
        humidity: data.hourly.relative_humidity_2m[i],
        windSpeed: data.hourly.wind_speed_10m[i],
        weatherCode: data.hourly.weathercode[i],
        precipitationProbability: data.hourly.precipitation_probability[i],
        icon: WMO_ICONS[data.hourly.weathercode[i]] || '🌡️',
        description: WMO_CODES[data.hourly.weathercode[i]] || 'לא ידוע',
      }))
      .filter((h: any) => {
        const t = new Date(h.time);
        return t >= now && t <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
      })
      .slice(0, 24);

    // Build daily forecast
    const dailyData = data.daily.time.map((date: string, i: number) => ({
      date,
      maxTemp: data.daily.temperature_2m_max[i],
      minTemp: data.daily.temperature_2m_min[i],
      weatherCode: data.daily.weathercode[i],
      precipitationSum: data.daily.precipitation_sum[i],
      maxWindSpeed: data.daily.wind_speed_10m_max[i],
      sunrise: data.daily.sunrise[i],
      sunset: data.daily.sunset[i],
      icon: WMO_ICONS[data.daily.weathercode[i]] || '🌡️',
      description: WMO_CODES[data.daily.weathercode[i]] || 'לא ידוע',
    }));

    return {
      location: {
        name: location.name,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
      },
      current: {
        temperature: current.temperature,
        windSpeed: current.windspeed,
        windDirection: current.winddirection,
        weatherCode: current.weathercode,
        icon: WMO_ICONS[current.weathercode] || '🌡️',
        description: WMO_CODES[current.weathercode] || 'לא ידוע',
        isDay: current.is_day === 1,
      },
      hourly: hourlyData,
      daily: dailyData,
    };
  }
}
