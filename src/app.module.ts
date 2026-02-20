import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { WeatherModule } from "./weather/weather.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    CacheModule.register({ isGlobal: true, ttl: 600000 }),
    WeatherModule,
  ],
})
export class AppModule {}
