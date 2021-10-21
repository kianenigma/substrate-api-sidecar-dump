import * as BN from 'bn.js'

import { BlockModel, connect } from '../../dump/src/mongodb/index';

class RewardRecord {
  atTime: Date;
  atNumber: Number;
  amount: BN;

  constructor(time: Date, number: Number, amount: BN) {
    this.amount = amount;
    this.atNumber = number;
    this.atTime = time
  }
}

export class RewardPeriod {
  from: Date;
  to: Date;
  records: RewardRecord[];

  constructor(from: Date, to: Date) {
    this.from = from;
    this.to = to;
    this.records = [];
  }

  toCsv(): string {
    let csv = "number,time,amount";
    for (let record of this.records) {
      csv += `\n${record.atNumber},${record.atTime.getTime()},${record.amount.toNumber()}`;
    }
    return csv;
  }

  toJson(): string {
    return JSON.stringify(this.records)
  }

  // TODO using unwind, I think I can do it also with $in
  async execute(who: string) {
    console.log(`📕 [${this.from} -> ${this.to}] (${who})`);
    const rewardBlocks = await BlockModel.aggregate([
      {
        $match: {
          time: { $gt: this.from, $lt: this.to },
        },
      },
      { $unwind: '$allEventMethods' },
      { $match: { 'allEventMethods.method': 'Reward' } },
      {
        $group: {
          _id: '$_id',
          time: { $first: '$time' },
          number: { $first: '$number' },
          extrinsicEvents: { $first: '$extrinsics.events' },
        },
      },
      { $sort: { time: -1 } },
    ]).allowDiskUse(true);

    this.records = [];
    for (const rewardBlock of rewardBlocks) {
      for (const event of rewardBlock.extrinsicEvents.flat()) {
        if (
          event.method.method.toLowerCase() == 'reward' &&
          event.method.pallet.toLowerCase() === 'staking'
        ) {
          if (event.data.length === 2 && event.data[0] === who) {
            const amount = new BN(event.data[1]);
            const atTime = rewardBlock.time;
            const atNumber = rewardBlock.number;
            const record = new RewardRecord(atTime, atNumber, amount);
            this.records.push(record);
          }
        }
      }
    }
  }
}

export class MonthlyRewardPeriod extends RewardPeriod {
  constructor(month: MONTH, year: number) {
    const from = new Date(year, month, 0);
    const to = new Date(year, month, 32);
    super(from, to);
  }
}

export class WeeklyRewardPeriod extends RewardPeriod {
  constructor(from: Date) {
    const tomorrow = new Date(from.getTime());
    tomorrow.setDate(tomorrow.getDate() + 7);
    super(from, tomorrow);
  }
}

export class DailyRewardPeriod extends RewardPeriod {
  constructor(from: Date) {
    const tomorrow = new Date(from.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    super(from, tomorrow);
  }
}

export enum MONTH {
  Jan,
  Feb,
  Mar,
  Apr,
  May,
  Jun,
  Jul,
  Auh,
  Sep,
  Oct,
  Nov,
  Dec,
}
