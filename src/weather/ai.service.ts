import { Injectable } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class AiService {
  async getWeatherSummary(weatherData: any): Promise<{
    today: string;
    tomorrow: string;
    clothing: string;
  }> {
    const { current, daily, location } = weatherData;
    const today = daily[0];
    const tomorrow = daily[1];

    const prompt = `אתה מנחה מזג אוויר ישראלי ידידותי.
מזג האוויר כעת ב${location.name}: ${current.description}, ${current.temperature}°C, רוח ${current.windSpeed} קמ"ש.
היום: מקסימום ${today.maxTemp}°C, מינימום ${today.minTemp}°C, ${today.description}.
מחר: מקסימום ${tomorrow.maxTemp}°C, מינימום ${tomorrow.minTemp}°C, ${tomorrow.description}.

ענה בפורמט JSON בלבד (בלי markdown, בלי קוד blocks):
{
  "today": "2 שורות על מזג האוויר כעת והיום",
  "tomorrow": "2 שורות על מחר",
  "clothing": "המלצה קצרה מה ללבוש עכשיו"
}`;

    try {
      // Try OpenRouter first (free tier available)
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (apiKey && apiKey !== "your_openrouter_api_key_here") {
        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct:free",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 300,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:3000",
            },
          },
        );

        const content = response.data.choices[0].message.content;
        return JSON.parse(content);
      } else {
        // Fallback: generate summary without AI
        return this.generateFallbackSummary(weatherData);
      }
    } catch (error) {
      console.error("AI service error:", error.message);
      return this.generateFallbackSummary(weatherData);
    }
  }

  private generateFallbackSummary(weatherData: any) {
    const { current, daily, location } = weatherData;
    const today = daily[0];
    const tomorrow = daily[1];

    const temp = current.temperature;
    const isHot = temp > 28;
    const isCold = temp < 15;
    const isRainy = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(
      current.weatherCode,
    );

    let clothing = "";
    if (isRainy) clothing = "☂️ קח מטרייה ומעיל עמיד למים!";
    else if (isHot) clothing = "👕 לבוש קל ונוח, אל תשכח קרם הגנה!";
    else if (isCold) clothing = "🧥 שכבות חמות מומלצות, מעיל חובה!";
    else clothing = "👔 לבוש נוח ונייטרלי, טמפרטורה נעימה!";

    return {
      today: `כיום ב${location.name} ${current.description} עם ${current.temperature}°C. הטמפרטורות ינועו בין ${today.minTemp}° ל-${today.maxTemp}°.`,
      tomorrow: `מחר צפוי ${tomorrow.description} עם מקסימום של ${tomorrow.maxTemp}°C ומינימום של ${tomorrow.minTemp}°C.`,
      clothing,
    };
  }
}
