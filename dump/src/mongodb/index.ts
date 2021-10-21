import * as Mongoose from 'mongoose'

// TODO: there should be a way to unwrap here?
export const DB_HOST: string =
  process.env.DB_HOST || 'mongodb://localhost:27017/sidecar-dump'

export async function connect (): Promise<Mongoose.Connection> {
	await Mongoose.connect(DB_HOST)
	return Mongoose.connection
}

export async function disconnect () {
	await Mongoose.disconnect()
}

export * from './primitives'
export * from './bucket'
export * from './block'
