import * as dotenv from 'dotenv'

import { ApiPromise, WsProvider } from '@polkadot/api'
import { spawnSync } from 'child_process'
import * as Mongoose from 'mongoose'
import { get } from 'request-promise'
import { blockRangeDetector } from './block_scraper'
import { bucketRangeDetector } from './bukcet.scraper'
import { logger } from './logger'
import {
	BlockModel,
	BucketModel,
	connect,
	DB_HOST,
	IBlock,
	IBucket,
	IEvent
} from './mongodb/index'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

enum Command {
  Follow,
  Dump,
  Wipe,
  ScrapeBlock,
  ScrapeBucket,
}
const COMMANDS = ["follow", "dump", "wipe", "scrape-block", "scrape-bucket"]

const optionsPromise = yargs(hideBin(process.argv))
	.option('command', {
		alias: 'c',
		choices: COMMANDS,
		description: 'the command to execute',
		required: true
	})
	.argv

dotenv.config()

export const SIDECAR = process.env.SIDECAR_HOST
export const SUBSTRATE = process.env.SUBSTRATE_HOST
export const LOG_INTERVAL = Number(process.env.LOG_INTERVAL) || 10 * 1000
export const BATCH_SIZE = 64

export const MINUTE = 10
export const HOUR = MINUTE * 60
export const BUCKET_SIZE = 3 * HOUR

let command = 'NOTHING'
let initiated = false
export let exitRequested = false
let exitAllowed = false

export const allowExit = (x: boolean) => (exitAllowed = x)
const graceful = async () => {
	logger.warn('🗡  Signal received.')

	if (!initiated) {
		process.exit(0)
	}

	exitRequested = true
	setInterval(async () => {
		if (exitAllowed) {
			try {
				logger.info('exit allowed ✅')
				await Mongoose.connection.close(false)
				logger.info('mongodb shutdown.')
				process.exit(0)
			} catch (err) {
				logger.error(
					`failed to close down database. This will probably lead to a corrupt state: \n${err}`
				)
				process.exit(0)
			}
		}
	}, 10)
	// ^^ This is quite an ugly way: we basically pressurize the other loop to finish.
}
process.on('SIGTERM', graceful)
process.on('SIGINT', graceful)

export async function RequestBlock (
	api: ApiPromise,
	at: number
): Promise<IBlock> {
	const current = JSON.parse(await get(`${SIDECAR}/blocks/${at}`))
	const currentHash = api.createType('Hash', current.hash)
	const timestamp = await api.query.timestamp.now.at(currentHash)
	const time = new Date(Number(timestamp.toString()))

	const hooksEvents: [IEvent] = current.onInitialize.events.concat(
		current.onFinalize.events
	)

	const allExtrinsicEvents: [IEvent] = current.extrinsics
	  // @ts-ignore
		.map((e) => e.events)
		.flat()

	const hookEventMethods = hooksEvents.map((e) => e.method)
	const extrinsicMethods = allExtrinsicEvents.map((e) => e.method)

	const allEventMethods = hookEventMethods.concat(extrinsicMethods)
	// @ts-ignore
	const allExtrinsicMethods = current.extrinsics.map((e) => e.method)

	const block = new BlockModel({
		// default stuff from side-car
		time,
		number: current.number,
		hash: current.hash,
		parentHash: current.parentHash,
		extrinsicsRoot: current.extrinsicsRoot,
		authorId: current.authorId,
		logs: current.logs,
		onInitialize: current.onInitialize.events,
		onFinalize: current.onFinalize.events,
		extrinsics: current.extrinsics,

		// additional stuff for indexing;
		// all event and extrinsic methods
		allEventMethods,
		allExtrinsicMethods,

		// count of stuff; not sure if needed
		extrinsicsCount: current.extrinsics.length,
		extrinsicsEventCount: allExtrinsicEvents.length,
		hooksEventCount: hooksEvents.length,
		totalEventCount: allEventMethods.length
	})

	return block
}

(async () => {
	if (process.argv[2] !== undefined) {
		command = process.argv[2]
	}
	const provider = new WsProvider(SUBSTRATE)
	const api = await ApiPromise.create({ provider })
	const database = await connect()
	logger.info(`💩 command: ${command}`)
	const chain = (await api.rpc.system.chain()).toString()

	if (
		(database.name.toLowerCase().includes('kusama') &&
      !chain.toLowerCase().includes('kusama')) ||
    (!database.name.toLowerCase().includes('kusama') &&
      chain.toLowerCase().includes('kusama'))
	) {
		logger.error(
			`chain = ${chain}, database = ${database.name}: They are incompatible.`
		)
		process.exit(1)
	}

	logger.info(`database name = ${database.name} // node name = ${chain}`)
	initiated = true;

	const options = await optionsPromise;

	switch (options.command) {
	case COMMANDS[Command.ScrapeBucket]:
		try {
			await bucketRangeDetector(api, database)
		} catch (e) {
			logger.error('Error while scraping')
			logger.error(e)
			console.trace()
			process.exit(1)
		}
		break
	case COMMANDS[Command.ScrapeBlock]:
		try {
			await blockRangeDetector(api, database)
		} catch (e) {
			logger.error('Error while scraping')
			logger.error(e)
			process.exit(1)
		}
		break
	case COMMANDS[Command.Wipe]:
		await database.dropCollection('blocks')
		await database.dropCollection('buckets')
		exitAllowed = true
		logger.info('cleared collections.')
		break
	case COMMANDS[Command.Dump]:
		const output = spawnSync(`mongodump --uri ${DB_HOST} --gzip -d sidecar-dump`)
		logger.info(`💩 output: ${output.stdout}, ${output.stderr}`)
		exitAllowed = true
		break
	case COMMANDS[Command.Follow]:
		const _sub = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
			const block = await RequestBlock(api, header.number.toNumber());
			await block.save();
			logger.info(`scraped #${header.number}.`);
		});
		break;
	default:
		logger.info(`💩 unknown command: ${command}`)
		break
	}

	logger.info('✅ done')
	exitAllowed = true
})()
