import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BroadcastDocument = HydratedDocument<Broadcast>;

@Schema({ collection: 'broadcasts', timestamps: true })
export class Broadcast {
  @Prop({ required: true })
  target!: string;

  @Prop({ type: [String], default: [] })
  moduleScope!: string[];

  @Prop({ required: true, enum: ['Normal', 'Urgent', 'Emergency'] })
  priority!: string;

  @Prop({ required: true })
  message!: string;

  @Prop()
  patientName?: string;

  @Prop()
  expiry?: Date;

  @Prop({ required: true })
  sentByUserId!: number;

  @Prop({ required: true })
  sentBy!: string;

  @Prop()
  conversationId?: string;
}

export const BroadcastSchema = SchemaFactory.createForClass(Broadcast);
BroadcastSchema.index({ createdAt: -1 });
