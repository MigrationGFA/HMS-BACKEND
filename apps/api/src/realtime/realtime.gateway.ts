import { WebSocketGateway } from '@nestjs/websockets';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: '/events' })
export class RealtimeGateway {
  constructor(private readonly realtimeService: RealtimeService) {}
}
