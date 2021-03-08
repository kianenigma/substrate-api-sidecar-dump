import {
  RequestBlock,
  LOG_INTERVAL,
  BATCH_SIZE,
  SIDECAR,
  exitRequested,
  allowExit,
} from './index';
import { get } from 'request-promise';
import { logger } from './logger';
import { BlockModel } from './mongodb/block';
import { ApiPromise } from '@polkadot/api';
import * as Mongoose from 'mongoose';

async function scrapeBlock(api: ApiPromise, at: number) {
  let block = await RequestBlock(api, at);
  await block.save();
}

async function scrapeBlockRange(
  api: ApiPromise,
  database: Mongoose.Connection,
  start: number,
  stop: number
) {
  if (start == stop) {
    return;
  }

  logger.info(`📑 start scraping range [${start} -> ${stop}]`);
  let lastKnowHeight = start;
  let currentHeight = start;

  const cancelSpeed = setInterval(async () => {
    let lastKnownSpeed =
      Math.abs(lastKnowHeight - currentHeight) / (LOG_INTERVAL / 1000);
    lastKnowHeight = currentHeight;
    let lastKnownSize = (await database.db.stats()).dataSize;
    let lastKnownDate = (
      await BlockModel.find({ number: currentHeight }).limit(1)
    ).pop()?.time;
    logger.info(
      `⏳ scraping range [${start} -> ${stop}], current height ${currentHeight}, at ${lastKnownDate}, ${Math.floor(
        ((start - currentHeight) * 100) / (start - stop)
      )}%, speed ${lastKnownSpeed.toFixed(2)}bps, storage size = ${(
        lastKnownSize /
        1024 /
        1024
      ).toFixed(2)} MB`
    );
  }, LOG_INTERVAL);

  let i = start;
  while (i != stop) {
    if (exitRequested) {
      // sleep for 2 secs, this should be enough to make sure the signal handler is picked up.
      await new Promise(r => setTimeout(r, 2000));
    }
    const remaining = Math.abs(i - stop);
    const batchSize = Math.min(remaining, BATCH_SIZE);
    let tasks = [];
    logger.debug(`starting a batch fetch from ${i} with size ${batchSize}.`);
    for (let t = 0; t < batchSize; t++) {
      tasks.push(scrapeBlock(api, i));
      if (i < stop) {
        i += 1;
      } else {
        i -= 1;
      }
    }

    allowExit(false);
    // @ts-ignore
    await Promise.all(tasks);
    allowExit(true);

    currentHeight = i;
  }

  clearInterval(cancelSpeed);
  logger.info(`✅ Finished scraping range [${start} -> ${stop}]`);

  return Promise.resolve();
}

export async function blockRangeDetector(
  api: ApiPromise,
  database: Mongoose.Connection,
) {
  const maybeLowest = await BlockModel.find({})
    .sort({ number: 1 })
    .limit(1);

  const maybeHighest = await BlockModel.find({})
    .sort({ number: -1 })
    .limit(1);

  const lowest = maybeLowest.length ? maybeLowest[0].number : 0;
  const highest = maybeHighest.length ? maybeHighest[0].number : 0;
  const height = JSON.parse(await get(`${SIDECAR}/blocks/head`)).number;
  const allRecords = await BlockModel.countDocuments();

  if (!(allRecords === highest - lowest + 1 || allRecords === 0)) {
    return Promise.reject(
      `❌ All records = ${allRecords}, expected ${highest - lowest + 1}`
    );
  }

  const size = (await database.db.stats()).dataSize / 1024 / 1024;
  logger.info(
    `📖 current database range: ${lowest} -> ${highest}, current height = ${height}`
  );
  logger.info(`💿 Size = ${size.toFixed(2)} MB`);

  if (highest !== lowest) {
    logger.info('🌈 scraping most recent blocks.');
    await scrapeBlockRange(api, database, highest + 1, height);
    logger.info('🌈 scraping historical blocks.');
    await scrapeBlockRange(api, database, lowest - 1, 1);
  } else {
    logger.info('🌈 scraping historical blocks.');
    await scrapeBlockRange(api, database, height, 1);
  }

  return Promise.resolve();
}
