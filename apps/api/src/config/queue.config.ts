import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  sessionSecret: process.env.SESSION_SECRET,
}));
