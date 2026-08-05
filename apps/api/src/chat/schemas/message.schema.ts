import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ collection: 'messages', timestamps: { createdAt: true, updatedAt: true } })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  senderUserId!: number;

  @Prop({ required: true })
  senderName!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ default: false })
  urgent!: boolean;

  @Prop({ type: [String], default: [] })
  mentions!: string[];

  @Prop()
  attachmentUrl?: string;

  @Prop({ type: [Number], default: [] })
  readBy!: number[];

  @Prop({ default: false })
  edited!: boolean;

  @Prop({ default: false })
  deletedFlag!: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
