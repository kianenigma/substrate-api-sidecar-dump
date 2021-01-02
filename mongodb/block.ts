import {IEvent, IExtrinsic, IFrameMethod, EventSchema, ExtrinsicSchema, FrameMethodSchema} from './primitives'
import { Document, Schema, model } from "mongoose";
import { logger } from './../src/logger'

// kusama genesis hash, if not configured. Probably no chain earlier.
const MIN_BLOCK_TIME = process.env.MIN_BLOCK_TIME || '2019-11-27'

export interface IBlock extends Document {
  time: Date,
  number: number,
  hash: string,
  parentHash: string,
  extrinsicsRoot: string,
  authorId: string,
  logs: any[],
  onInitialize: IEvent[],
  onFinalize: IEvent[],
  extrinsics: IExtrinsic[],

  allEventMethods: IFrameMethod[],
  allExtrinsicMethods: IFrameMethod[],

  extrinsicsCount: number,
  extrinsicsEventCount: number,
  hooksEventCount: number,
  totalEventCount: number,
}

export const BlockSchema: Schema = new Schema({
  time: { type: Date, required: true, min: MIN_BLOCK_TIME },
  number: { type: Number, required: true, unique: true },
  hash: { type: String, required: true, unique: true },
  parentHash: { type: String, required: true },
  extrinsicsRoot: { type: String, required: true },
  authorId: { type: String, },
  logs: { type: [{}], },
  onInitialize: { type: [EventSchema], required: true },
  onFinalize: { type: [EventSchema], required: true },
  extrinsics: { type: [ExtrinsicSchema], required: true },

  allEventMethods: { type: [FrameMethodSchema], required: true },
  allExtrinsicMethods: { type: [FrameMethodSchema], required: true },

  extrinsicsCount: { type: Number, required: true },
  extrinsicsEventCount: { type: Number, required: true },
  hooksEventCount: { type: Number, required: true },
  totalEventCount: { type: Number, required: true },
})

BlockSchema.pre('aggregate', function () {
  // @ts-ignore
  this._startTime = Date.now();
});

BlockSchema.post('aggregate', function () {
  // @ts-ignore
  if (this._startTime != null) {
    // @ts-ignore
    logger.debug(`💽 query pipeline [${this._pipeline.map(e => Object.keys(e)[0].toString())}] => ${Date.now() - this._startTime}ms`)
  }
});

export const Block = model<IBlock>('Block', BlockSchema)
