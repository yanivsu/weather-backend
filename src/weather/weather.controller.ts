import { Controller, Get, Query, UseGuards, Optional } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { WeatherService } from "./weather.service";
import { AiService } from "./ai.service";
import { WeatherAccuService } from "./weatherAccu.service";

@ApiTags("Weather")
@Controller("weather")
export class WeatherController {
  constructor(
    private weatherService: WeatherService,
    private weatherAccuService: WeatherAccuService,
    private aiService: AiService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get weather data for a city" })
  @ApiQuery({
    name: "city",
    required: false,
    description: "City name (default: Haifa)",
  })
  async getWeather(@Query("city") city: string = "Haifa") {
    console.log("Get City From Accu Weather!");
    const weatherData = await this.weatherService.getWeather(city);
    return weatherData;
  }

  @Get("summary")
  @ApiOperation({
    summary: "Get AI-generated weather summary + clothing recommendation",
  })
  @ApiQuery({
    name: "city",
    required: false,
    description: "City name (default: Haifa)",
  })
  async getWeatherWithSummary(@Query("city") city: string = "Haifa") {
    // const weatherData = await this.weatherService.getWeather(city);
    const weatherData = await this.weatherAccuService.getWeather(city);
    const aiSummary = await this.aiService.getWeatherSummary(weatherData);
    return {
      ...(weatherData as any),
      aiSummary,
    };
  }
}
