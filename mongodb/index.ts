import { Document, Schema } from "mongoose";
import * as Mongoose from "mongoose";


export interface IFrameMethod {
  pallet: string;
  method: string;
}

export interface IEvent {
  method: IFrameMethod;
  data: any[];
}

export interface IExtrinsic {
  method: IFrameMethod;
  signature: {} | null;
  nonce: number | null;
  tip: number | null;
  args: any;
  hash: string;
  info: {}
  events: IEvent[];
  success: string | boolean;
  paysFee: boolean | null;
}

export interface IBlock extends Document {
  // TODO: time must be a numeric timestamp.. why did I do this?
  time: Date, // TODO: add a configurable validator here. polkadot is 25-05-2020
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

const FrameMethodSchema: Schema = new Schema({
  pallet: { type: String, required: true },
  method: { type: String, required: true },
});

const EventSchema: Schema = new Schema({
  method: { type: FrameMethodSchema, required: true },
  data: { type: [{}], required: true } ,
})

const ExtrinsicSchema: Schema = new Schema({
  // optional for unsigned
  signature: { type: {}, required: false },
  nonce: { type: Number, required: false },
  tip: { type: Number, required: false },
  method: { type: FrameMethodSchema, required: true },
  args: { type: {}, required: true },
  hash: { type: String, required: true },
  info: { type: {}, required: true },
  events: { type: [EventSchema], required: true },
  success: { type: String, required: true },
  paysFee: { type: Boolean, required: true },
})

const BlockSchema: Schema = new Schema({

  time: { type: Date, required: true },
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

export const Block = Mongoose.model<IBlock>('Block', BlockSchema)

export let database: Mongoose.Connection;
// TODO: make this async
export const connect = () => {
  // add your own uri below
  const uri = "mongodb://localhost:27017/sidecar-dump";
  if (database) {
    return;
  }

  Mongoose.connect(uri, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  database = Mongoose.connection;

  database.once("open", async () => {
    console.log("Connected to database");
  });

  database.on("error", () => {
    console.log("Error connecting to database");
  });
};

export const disconnect = () => {
  if (!database) {
    return;
  }

  Mongoose.disconnect();
};

