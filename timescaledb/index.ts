import requestPromise = require('request-promise');
import { Sequelize, DataTypes } from "sequelize";
import { ApiPromise, WsProvider } from "@polkadot/api";

const sequelize = new Sequelize(
  'postgres://postgres:password@localhost/tutorial',
  {
    dialect: 'postgres',
    protocol: 'postgres',
  }
);

const BlocksModel = sequelize.define('blocks', {
  number: DataTypes.INTEGER,
  time: DataTypes.DATE,
  data: DataTypes.JSONB
});

(async () => {
  const provider = new WsProvider()
  const api = new ApiPromise( { provider })
  await sequelize.authenticate()

  let data = JSON.parse(
    await requestPromise.get('http://127.0.0.1:8080/blocks/head')
  );

  let hash: string = data['hash']
  let timestamp = await api.query.timestamp.now.at(hash)
  let number = Number(data['number'])
  delete data['number']
  let time = new Date(Number(timestamp));

  console.log(data, number, time);
  console.log(BlocksModel);

  await BlocksModel.create({
    number, data, time,
  });


})();
