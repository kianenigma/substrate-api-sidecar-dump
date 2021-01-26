import * as dotenv from 'dotenv';
dotenv.config();

import { ApiPromise, WsProvider } from '@polkadot/api';
import { get } from 'request-promise';
import {
  BlockModel,
  connect,
  IEvent,
  DB_HOST,
  IBlock,
  BucketModel,
  IBucket,
} from '../mongodb/index';
import { blockRangeDetector } from './block_scraper';
import { bucketRangeDetector } from './bukcet.scraper';
import * as Mongoose from 'mongoose';
import { spawnSync } from 'child_process';
import { logger } from './logger';

export const SIDECAR = process.env.SIDECAR_HOST;
export const SUBSTRATE = process.env.SUBSTRATE_HOST;
export const LOG_INTERVAL = Number(process.env.LOG_INTERVAL) || 10 * 1000;
export const BATCH_SIZE = 32;

export const MINUTE = 10;
export const HOUR = MINUTE * 60;
export const BUCKET_SIZE = 3 * HOUR;

let command = 'scrape';
export let exitRequested = false;
let exitAllowed = false;

export const allowExit = (x: boolean) => (exitAllowed = x);
const graceful = async () => {
  logger.warn('🗡  Signal received.');
  exitRequested = true;
  setInterval(async () => {
    if (exitAllowed) {
      try {
        logger.info('exit allowed ✅');
        await Mongoose.connection.close(false);
        logger.info('mongodb shutdown.');
        process.exit(0);
      } catch (err) {
        logger.error(
          `failed to close down database. This will probably lead to a corrupt state: \n${err}`
        );
        process.exit(0);
      }
    }
  }, 10);
  // ^^ This is quite an ugly way: we basically pressurize the other loop to finish.
};
process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

export async function RequestBlock(
  api: ApiPromise,
  at: number
): Promise<IBlock> {
  const current = JSON.parse(await get(`${SIDECAR}/blocks/${at}`));
  // TODO: can't this be done better?
  const time = new Date(
    Number((await api.query.timestamp.now.at(current.hash)).toString())
  );

  const hooksEvents: [IEvent] = current.onInitialize.events.concat(
    current.onFinalize.events
  );

  const allExtrinsicEvents: [IEvent] = current.extrinsics
    // @ts-ignore
    .map(e => e.events)
    .flat();

  const hookEventMethods = hooksEvents.map(e => e.method);
  const extrinsicMethods = allExtrinsicEvents.map(e => e.method);

  const allEventMethods = hookEventMethods.concat(extrinsicMethods);
  // @ts-ignore
  const allExtrinsicMethods = current.extrinsics.map(e => e.method);

  let block = new BlockModel({
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
    totalEventCount: allEventMethods.length,
  });

  return block;
}

(async () => {
  if (process.argv[2] !== undefined) {
    command = process.argv[2];
  }
  const provider = new WsProvider(SUBSTRATE);
  const api = await ApiPromise.create({ provider });
  const database = await connect();
  logger.info(`💩 command: ${command}`);
  const chain = (await api.rpc.system.chain()).toString();

  if (
    (database.name.toLowerCase().includes('kusama') &&
      !chain.toLowerCase().includes('kusama')) ||
    (!database.name.toLowerCase().includes('kusama') &&
      chain.toLowerCase().includes('kusama'))
  ) {
    logger.error(
      `chain = ${chain}, database = ${database.name}: They are incompatible.`
    );
    process.exit(1);
  }

  logger.info(`database name = ${database.name} // node name = ${chain}`);

  switch (command) {
    case 'scrape-bucket':
      try {
        await bucketRangeDetector(api, database);
      } catch (e) {
        logger.error('Error while scraping');
        logger.error(e);
        console.trace();
        process.exit(1);
      }
      break;
    case 'scrape-block':
      try {
        await blockRangeDetector(api, database);
      } catch (e) {
        logger.error('Error while scraping');
        logger.error(e);
        process.exit(1);
      }
      break;
    case 'wipe':
      await database.dropCollection('blocks');
      await database.dropCollection('buckets');
      exitAllowed = true;
      logger.info('cleared collections.');
      break;
    case 'dump':
      const output = spawnSync(
        `mongodump --uri ${DB_HOST} --gzip -d sidecar-dump`
      );
      logger.info(`💩 output: ${output.stdout}, ${output.stderr}`);
      exitAllowed = true;
      break;
  }

  logger.info('✅ done');
  exitAllowed = true;
})();
