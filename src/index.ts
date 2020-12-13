import { connect, Block, IEvent, database, IFrameMethod } from '../mongodb/index';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { get } from 'request-promise';
import { stdout } from 'single-line-log';
import { assert } from 'console';
import * as BN from 'bn.js'

// db.getCollection('blocks').find(
//   { $or: [{ "onInitialize.0": { $exists: true } }, { "onFinalize.0": { $exists: true } }] },
//   {},
// ).sort({ time: 1 })

// db.getCollection('blocks').aggregate([
//   { $unwind: "$eventMethods" },
//   { $match: { "eventMethods.method": "Reward" } },
//   { $group: { _id: "$_id", number: { $first: "$number" }, extrinsics: { $first: "$extrinsics.events" } } },
// ])

const SIDECAR = 'http://localhost:8080';

async function scrapeBlock(api: ApiPromise, at: number): Promise<Date> {
  const current = JSON.parse(await get(`${SIDECAR}/blocks/${at}`));
  const time = new Date(
    Number((await api.query.timestamp.now.at(current['hash'])).toString())
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
  try {
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
  } catch (error) {
    console.error(`Error happened at block ${current.number}: ${error}`);
  }

  return time;
}
async function scrapeRange(api: ApiPromise, start: number, stop: number) {
  if (start === stop) {
    return;
  }
  assert(start > stop);

  // @ts-ignore
  let lastKnownSize = (await database.db.stats())['dataSize'];

  for (let i = start; i > stop; i--) {
    let time = await scrapeBlock(api, i);
    if (i % 1000 == 0) {
      // @ts-ignore
      lastKnownSize = (await database.db.stats())['dataSize'];
    }
    stdout(
      `⏳ scraping range [${start} -> ${stop}], current height ${i}, at ${time}, ${Math.floor(
        ((start - i) * 100) / (start - stop)
      )}%, storage size = ${lastKnownSize / 1024 / 1024} MB`
    );
  }
}

async function continueScrape(api: ApiPromise) {
  const maybeLowest = await Block.find({})
    .sort({ number: 1 })
    .limit(1);
  const maybeHighest = await Block.find({})
    .sort({ number: -1 })
    .limit(1);
  const lowest = maybeLowest.length ? maybeLowest[0].number : 0;
  const highest = maybeHighest.length ? maybeHighest[0].number : 0;
  const height = JSON.parse(await get(`${SIDECAR}/blocks/head`)).number;

  if (highest !== lowest) {
    console.log('🌈 scraping most recent blocks.');
    await scrapeRange(api, height, highest);
    console.log('\n🌈 scraping historical blocks.');
    await scrapeRange(api, lowest - 1, 0);
  } else {
    console.log('\n🌈 scraping historical blocks.');
    await scrapeRange(api, height, 0);
  }
}

// TODO using unwind, I think I can do it also with $in
async function calculateRewardFor(api: ApiPromise, who: string) {
  console.log(`📕 account: ${(await api.query.system.account(who)).toString()}`)
  const rewardBlocks = await Block.aggregate([
    { $match: { time: { $gt: new Date(2020, 10, 1), $lt: new Date(2020, 11, 1) } } },
    { $unwind: "$allEventMethods" },
    { $match: { "allEventMethods.method": "Reward" } },
    { $group: { _id: "$_id", time: { $first: "$time" },  number: { $first: "$number" }, extrinsicEvents: { $first: "$extrinsics.events" } } },
    { $sort: { time: -1 } },
  ]).allowDiskUse(true)

  let sum = new BN(0)
  // let rewards: [BN | number] = []
  for (const rewardBlock of rewardBlocks) {
    for (const event of rewardBlock.extrinsicEvents.flat()) {
      if (event.method.method.toLowerCase() == "reward" && event.method.pallet.toLowerCase() === "staking") {
        if (event.data.length === 2 && event.data[0] === who) {
          const reward = new BN(event.data[1])
          sum = sum.add(reward)
          console.log(`💵 reward at #${rewardBlock.number} (${rewardBlock.time.toDateString()}): ${api.createType('Balance', reward).toHuman()}`)
        }
      }
    }
  }

  console.log(sum, api.createType('Balance', sum).toHuman())

}

(async () => {
  const command = process.argv[2] || 'scrape';
  const provider = new WsProvider();
  const api = await ApiPromise.create({ provider });

  connect();
  console.log(`✅ command: ${command}`);

  switch (command) {
    case 'scrape':
      await continueScrape(api);
      break;
    case 'test':
      await calculateRewardFor(api, "15yVR7d4VPLMC1KM2GsHDScQo7QjSSwrGPjD6rixNaWARHL7");
      break;
    default:
      break;
  }
})();
