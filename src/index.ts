import { ApiPromise, WsProvider } from '@polkadot/api';
import { get } from 'request-promise';
import { Block, connect, IEvent, DB_HOST } from '../mongodb/index';
import * as dotenv from 'dotenv'
import * as Mongoose from 'mongoose'

import { spawnSync } from 'child_process'
import { logger } from './logger'

import * as async from 'async';

dotenv.config()

const SIDECAR = process.env.SIDECAR_HOST;
const SUBSTRATE = process.env.SUBSTRATE_HOST;
const LOG_INTERVAL = Number(process.env.LOG_INTERVAL) || 60 * 1000;
const BATCH_SIZE = 64;

let exitRequested = false;
let lastBatchFinished = false;

async function scrapeBlock(api: ApiPromise, at: number): Promise<Date> {
  const current = JSON.parse(await get(`${SIDECAR}/blocks/${at}`));
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

  // save current
  await Block.create({
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

  return time;
}

async function scrapeRange(api: ApiPromise, database: Mongoose.Connection, start: number, stop: number) {
  if (start == stop) {
    return;
  }

  logger.info(`📑 start scraping range [${start} -> ${stop}]`)

  // @ts-ignore
  let lastKnownSize = (await database.db.stats()).dataSize;
  // speed in bps
  let lastKnownSpeed = 0;
  let lastKnowHeight = start;
  let currentHeight = start;
  let currentTime = new Date();

  const cancelSpeed = setInterval(async () => {
    lastKnownSpeed = Math.abs(lastKnowHeight - currentHeight) / (LOG_INTERVAL / 1000);
    lastKnowHeight = currentHeight;
    lastKnownSize = (await database.db.stats()).dataSize;
    logger.info(
      `⏳ scraping range [${start} -> ${stop}], current height ${currentHeight}, at ${currentTime}, ${Math.floor(
        ((start - currentHeight) * 100) / (start - stop)
      )}%, speed ${lastKnownSpeed}bps, storage size = ${(lastKnownSize / 1024 / 1024).toFixed(2)} MB`
    )
  }, LOG_INTERVAL);

  let i = start;
  while (i != stop) {
    if (exitRequested) {
      lastBatchFinished = true;
    }
    const remaining = Math.abs(i - stop);
    const batchSize = Math.min(remaining, BATCH_SIZE);
    let tasks = [];
    logger.debug(`starting a batch fetch from ${i} with size ${batchSize}.`)
    for (let t = 0; t < batchSize; t++) {
      tasks.push(scrapeBlock(api, i));
      if (i < stop) {
        i += 1;
      } else {
        i -= 1;
      }
    }

    // @ts-ignore
    const times = await Promise.all(tasks);
    currentHeight = i;
    currentTime = i < stop ? times[times.length - 1] : times[0]
  }

  clearInterval(cancelSpeed);
  logger.info(`✅ Finished scraping range [${start} -> ${stop}]`)

  return Promise.resolve()
}

async function continueScrape(api: ApiPromise, database: Mongoose.Connection) {
  const maybeLowest = await Block.find({})
    .sort({ number: 1 })
    .limit(1);

  const maybeHighest = await Block.find({})
    .sort({ number: -1 })
    .limit(1);

  const lowest = maybeLowest.length ? maybeLowest[0].number : 0;
  const highest = maybeHighest.length ? maybeHighest[0].number : 0;
  const height = JSON.parse(await get(`${SIDECAR}/blocks/head`)).number;
  const allRecords = await Block.countDocuments();

  if (!(allRecords === (highest - lowest + 1) || allRecords === 0)) {
    return Promise.reject(`❌ All records = ${allRecords}, expected ${(highest - lowest + 1)}`)
  }

  const size = (await database.db.stats()).dataSize / 1024 / 1024;
  logger.info(`📖 current database range: ${lowest} -> ${highest}, current height = ${height}`)
  logger.info(`💿 Size = ${size} MB`);

  if (highest !== lowest) {
    logger.info('🌈 scraping most recent blocks.');
    // TODO: this should simply continue from the reverse to ensure we won't have issues.
    await scrapeRange(api, database, highest + 1, height);
    logger.info('🌈 scraping historical blocks.');
    await scrapeRange(api, database, lowest - 1, 1);
  } else {
    logger.info('🌈 scraping historical blocks.');
    await scrapeRange(api, database, height, 1);
  }

  return Promise.resolve()
}

const graceful = async () => {
  console.log('\n🗡  Signal received. waiting for batch to finish Shutting down...');
  exitRequested = true;
  setInterval(async () => {
    if (lastBatchFinished) {
      try {
        await Mongoose.connection.close(false);
        logger.debug('mongodb shutdown.');
        process.exit(0);
      } catch (err) {
        logger.error(`failed to close down database. This will probably lead to a corrupt state: \n${err}`);
        process.exit(0);
      }
    } else {
      console.log('still waiting..');
    }
  }, 2000)

}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

(async () => {
  const command = process.argv[2] || 'scrape';
  const provider = new WsProvider(SUBSTRATE);
  const api = await ApiPromise.create({ provider });
  const database = await connect();
  logger.info(`💩 command: ${command}`);
  const chain = (await api.rpc.system.chain()).toString()

  // TODO: for now I will hard-code some checks. later on, we need to fix this.
  if (database.name.toLowerCase().includes("kusama") && !chain.toLowerCase().includes("kusama")) {
    logger.error(`chain = ${chain}, database = ${database.name}: They are incompatible.`);
    process.exit(1)
  }

  switch (command) {
    case 'scrape':
      try {
        await continueScrape(api, database)
      } catch (e) {
        logger.error("Error while scraping");
        logger.error(e);
        process.exit(1)
      }
      break;
    case 'wipe':
      await database.dropCollection("blocks");
      await database.dropCollection("buckets");
      logger.info('cleared collections.');
      break;
    case 'dump':
      const output = spawnSync(`mongodump --uri ${DB_HOST} --gzip -d sidecar-dump`)
      logger.info(`💩 output: ${output.stdout}, ${output.stderr}`);
      break;
  }
})();
