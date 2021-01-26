import {
  RequestBlock,
  LOG_INTERVAL,
  BATCH_SIZE,
  BUCKET_SIZE,
  SIDECAR,
  exitRequested,
  allowExit,
} from './index';
import { logger } from './logger';
import { IBlock, BlockModel } from '../mongodb/block';
import { BucketModel, IBucket } from '../mongodb/bucket';
import { get } from 'request-promise';
import { ApiPromise } from '@polkadot/api';
import * as Mongoose from 'mongoose';

/**
 * scrapes all the block from `from_number` to `to_number` into a `iBucket`.
 *
 * For now this is designed as such that it alwasy scrapes from `from` to `to`.
 *
 * @param api
 * @param from_number
 * @param to_number
 */
async function scrapeBucket(
  api: ApiPromise,
  from_number: number,
  to_number: number
): Promise<IBucket> {
  if (from_number == to_number) { return Promise.reject("failed"); }

  let blocks: IBlock[] = [];
  let current = from_number;
  while (current != to_number) {
    const tasks = [];
    const leftover = Math.abs(current - to_number);
    const thisBatch = Math.min(BATCH_SIZE, leftover);
    if (isNaN(thisBatch)) {
      return Promise.reject("failed");
    }
    logger.debug(`preparing a batch with size ${thisBatch}, [${current}/${to_number}]`);
    for (let i = 0; i < thisBatch; i++) {
      if (to_number > current) {
        current++;
      } else {
        current--;
      }
      tasks.push(RequestBlock(api, current));
    }
    const batchBlocks = await Promise.all(tasks);
    blocks = blocks.concat(batchBlocks);
  }

  const from = blocks[0].time;
  const to = blocks[blocks.length - 1].time;
  return new BucketModel({
    from,
    to,
    blocks,
  });
}

async function scrapeBucketRange(
  api: ApiPromise,
  database: Mongoose.Connection,
  start: number,
  stop: number,
) {
  if (start == stop) {
    return;
  }

  logger.info(`📑 start scraping bucket range [${start} -> ${stop}]`);
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

  while (currentHeight != stop) {
    if (exitRequested) {
      // sleep for 2 secs, this should be enough to make sure the signal handler is picked up.
      await new Promise(r => setTimeout(r, 2000));
    }
    const remaining = Math.abs(currentHeight - stop);
    const bucketSize = Math.min(remaining, BUCKET_SIZE);
    const bucketFrom = currentHeight;
    const bucketTo =
      currentHeight < stop ? currentHeight + bucketSize : currentHeight - bucketSize;
    logger.info(`initiating a bucket scrape with size ${bucketSize} [${bucketFrom} -> ${bucketTo}]`)
    const bucket = await scrapeBucket(api, bucketFrom, bucketTo);
    allowExit(false);
    await bucket.save()
    allowExit(true);
    currentHeight = bucketTo;
  }

  clearInterval(cancelSpeed);
  logger.info(`✅ Finished scraping buckets in range [${start} -> ${stop}]`);

  return Promise.resolve();
}

export async function bucketRangeDetector(
  api: ApiPromise,
  database: Mongoose.Connection,
) {
  const maybeLowest = await BucketModel.aggregate([
    { $unwind: '$blocks' },
    { $project: { number: "$blocks.number" } },
    { $group: { _id: "_id", number: { $min: "$number" } } },
  ]).allowDiskUse(true);

  const maybeHighest = await BucketModel.aggregate([
    { $unwind: '$blocks' },
    { $project: { number: "$blocks.number" } },
    { $group: { _id: "_id", number: { $max: "$number" } } },
  ]).allowDiskUse(true);

  const lowest = maybeLowest.length ? maybeLowest[0].number : 0;
  const highest = maybeHighest.length ? maybeHighest[0].number : 0;
  const height = JSON.parse(await get(`${SIDECAR}/blocks/head`)).number;
  const allBlocks = (await BucketModel.aggregate([
    { $unwind: "$blocks" }
  ])).length;
  const allRecords = await BucketModel.countDocuments();

  if (allBlocks !== allRecords * BUCKET_SIZE) {
    logger.warn(`${allRecords} buckets and ${allBlocks} blocks don't add up with bucket size ${BUCKET_SIZE}. Did it change?`)
  }

  const size = (await database.db.stats()).dataSize / 1024 / 1024;
  logger.info(
    `📖 current database range: ${lowest} -> ${highest} [${allRecords} buckets, bucket size ${BUCKET_SIZE}], current height = ${height}`
  );
  logger.info(`💿 Size = ${size.toFixed(2)} MB`);

  if (highest !== lowest) {
    logger.info('🌈 scraping most recent blocks.');
    await scrapeBucketRange(api, database, highest + 1, height);
    logger.info('🌈 scraping historical blocks.');
    await scrapeBucketRange(api, database, lowest - 1, 1);
  } else {
    logger.info('🌈 scraping historical blocks.');
    await scrapeBucketRange(api, database, height, 1);
  }

  return Promise.resolve();
}
