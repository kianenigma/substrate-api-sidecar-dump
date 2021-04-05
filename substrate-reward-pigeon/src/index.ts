import * as dotenv from 'dotenv'
dotenv.config()

import { connect } from '../../dump/src/mongodb/index';
import { ApiPromise, WsProvider, } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { MonthlyRewardPeriod, MONTH, RewardPeriod } from './reward'
import { Application, Request, Response, NextFunction } from 'express';
import * as BN from 'bn.js'

const keyring = new Keyring({ type: 'sr25519', ss58Format: 1 });

const express = require('express')
const bodyParser = require('body-parser');

const app: Application = express()
const port = 3000
const SUBSTRATE = process.env.SUBSTRATE_HOST;

let provider, api: ApiPromise, _database;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//@ts-ignore
const validateParams = () => (req: Request, res: Response, next: NextFunction) => {
  const params = ["from", "to", "who"];
  const reqParamList = Object.keys(req.query);
  const hasAllRequiredParams = params.every(param =>
    reqParamList.includes(param)
  );
  if (!hasAllRequiredParams)
    return res
      .status(400)
      .send(
        `The following parameters are all required for this route: ${params.join(", ")}`
      );

  // validate them
  let from = req.query.from?.toString() || "";
  let to = req.query.to?.toString() || "";

  let fromDate = new Date(from);
  let toDate = new Date(to);

  if (fromDate.getTime() >= toDate.getTime()) {
    return res
      .status(400)
      .send(
        `from cannot be earlier than to`
      );
  }

  // TODO: validate who being ss58
  next();
};

app.get('/', (_, res) => {
  res.sendFile(`${process.cwd()}/frontend-basic/index.html`)
})

app.get('/reward', validateParams(), async (req, res) => {
  // @ts-ignore
  let fromRaw: string = req.query.from;
  // @ts-ignore
  let toRaw: string = req.query.to;
  // @ts-ignore
  let who: string = req.query.who;

  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  let period = new RewardPeriod(from, to, api);
  await period.execute(who);
  let sum = new BN(0);
  period.records.forEach((record) => {
    sum = sum.add(record.amount)
  })
  res.json({
    sum: sum.toNumber(), csv: period.toCsv()
  })
})

app.listen(port, async () => {
  provider = new WsProvider(SUBSTRATE);
  api = await ApiPromise.create({ provider });
  _database = await connect();
  console.log(`Example app listening at http://localhost:${port}`)
})

