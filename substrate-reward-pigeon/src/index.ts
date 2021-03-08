import * as dotenv from 'dotenv'
dotenv.config()

import { connect } from '../../dump/src/mongodb/index';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { MonthlyRewardPeriod, MONTH, RewardPeriod } from './reward'
import { Application, Request, Response, NextFunction } from 'express';

const express = require('express')
const bodyParser = require('body-parser');

const app: Application = express()
const port = 3000
const SUBSTRATE = process.env.SUBSTRATE_HOST;

let provider, api: ApiPromise, _database;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//@ts-ignore
// TODO
const requireParams = (params: string[]) => (req: Request, res: Response, next: NextFunction) => {
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
	next();
};

app.get('/', (req, res) => {
	res.send('Hello World!')
})

app.get('/reward', requireParams(["from", "to", "who"]), async (req, res) => {
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
	res.end(period.toCsv())
})

app.listen(port, async () => {
	provider = new WsProvider(SUBSTRATE);
	api = await ApiPromise.create({ provider });
	_database = await connect();
	console.log(`Example app listening at http://localhost:${port}`)
})

