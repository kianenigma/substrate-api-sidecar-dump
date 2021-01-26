import * as Mongoose from 'mongoose';
import { Document, Schema } from 'mongoose';
import { IBlock, BlockSchema } from './block';

export interface IBucket extends Document {
  start: Date;
  end: Date;
  blocks: IBlock[];
}

export const BucketSchema: Schema = new Schema({
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  blocks: { type: [BlockSchema], required: true },
});

export const BucketModel = Mongoose.model<IBucket>('Bucket', BucketSchema);
