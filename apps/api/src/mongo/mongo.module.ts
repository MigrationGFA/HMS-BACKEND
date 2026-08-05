import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongodb.uri');
        if (!uri) {
          throw new Error('MONGODB_URI is not configured');
        }
        const dbName = config.get<string>('mongodb.db') ?? 'HMS';
        return {
          uri,
          dbName,
          // Cosmos DB Mongo API compatibility
          retryWrites: false,
          maxIdleTimeMS: 120_000,
        };
      },
    }),
  ],
})
export class MongoModule {}
