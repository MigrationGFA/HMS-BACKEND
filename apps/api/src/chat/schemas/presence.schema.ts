import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PresenceDocument = HydratedDocument<Presence>;

@Schema({ collection: 'presence', timestamps: true })
export class Presence {
  @Prop({ required: true, unique: true, index: true })
  userId!: number;

  @Prop({ required: true, enum: ['online', 'away', 'offline'], default: 'offline' })
  status!: string;

  @Prop()
  lastSeenAt?: Date;

  @Prop({ type: [String], default: [] })
  modules!: string[];
}

export const PresenceSchema = SchemaFactory.createForClass(Presence);
