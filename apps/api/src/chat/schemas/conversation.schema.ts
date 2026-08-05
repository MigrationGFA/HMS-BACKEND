import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ collection: 'conversations', timestamps: true })
export class Conversation {
  @Prop({ required: true, enum: ['direct', 'department', 'patient', 'broadcast'] })
  type!: string;

  @Prop({ type: [String], default: [] })
  moduleScope!: string[];

  @Prop({ required: true })
  group!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: [Number], required: true, index: true })
  participantUserIds!: number[];

  @Prop()
  patientId?: string;

  @Prop()
  patientName?: string;

  @Prop()
  hospitalNo?: string;

  @Prop({ default: false })
  urgent!: boolean;

  @Prop({ default: false })
  archived!: boolean;

  @Prop({ default: '' })
  lastMessage!: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ type: Map, of: Number, default: {} })
  unreadBy!: Map<string, number>;

  @Prop()
  createdById?: number;

  @Prop()
  createdBy?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ participantUserIds: 1, lastMessageAt: -1 });
ConversationSchema.index({ moduleScope: 1, archived: 1 });
