import { Document, Schema } from 'mongoose'

export interface IFrameMethod extends Document {
  pallet: string;
  method: string;
}

export interface IEvent extends Document {
  method: IFrameMethod;
  data: any[];
}

export interface IExtrinsic extends Document {
  method: IFrameMethod;
  signature: {} | null;
  nonce: number | null;
  tip: number | null;
  args: any;
  hash: string;
  info: {};
  events: IEvent[];
  success: string | boolean;
  paysFee: boolean | null;
}

export const FrameMethodSchema: Schema = new Schema({
	pallet: { type: String, required: true },
	method: { type: String, required: true }
})

export const EventSchema: Schema = new Schema({
	method: { type: FrameMethodSchema, required: true },
	data: { type: [{}], required: true }
})

// TODO: we can and should remove most of these.
export const ExtrinsicSchema: Schema = new Schema({
	// optional for unsigned
	signature: { type: {}, required: false },
	nonce: { type: Number, required: false },
	tip: { type: Number, required: false },
	method: { type: FrameMethodSchema, required: true },
	args: { type: {}, required: false },
	hash: { type: String, required: true },
	info: { type: {}, required: false },
	events: { type: [EventSchema], required: true },
	success: { type: String, required: true },
	paysFee: { type: Boolean, required: true }
})
