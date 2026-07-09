import { Module } from '@nestjs/common';
import { PhysiotherapyController } from './physiotherapy.controller';
import { SpeechTherapyController } from './speech-therapy.controller';
import { NutritionController } from './nutrition.controller';
import { SocialWorkController } from './social-work.controller';
import { AlliedHealthService } from './allied-health.service';

@Module({
  imports: [],
  controllers: [PhysiotherapyController, SpeechTherapyController, NutritionController, SocialWorkController],
  providers: [AlliedHealthService],
  exports: [AlliedHealthService],
})
export class AlliedHealthModule {}
