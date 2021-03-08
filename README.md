# substrate-api-sidecar-dump 💩
A dead simple tool to scrape the default block endpoint of [`substrate-api-sidecare`](https://github.com/paritytech/substrate-api-sidecar) for the entire
chain and allow queries on top of it.

For now only supports MongoDB. Might someday support TimescaleDB and more as well.

> Work in progress.


## Brain Dump

Current replacement for issue tracking 🧠.

#### Database stuff

- [x] allow database export.
- [x] buckets to optimize time based data https://docs.mongodb.com/manual/tutorial/model-time-data/.
- [ ] Create index over a bunch of fields.
- [ ] A fancy index field: scrape all `data` fields (or just the whole block) for any string that
  matches ss58 address format and store them. Then you can answer: **Give me all blocks tha had some
  event affecting my account**.
- [ ] CI job to dump the export somewhere public every week or sth; could also use a remote mongodb
  instance.
- [ ] allow other databases.
- [x] configurable database connection.
- [ ] consider running this on a remote, public mongodb instance. 
- [x] Provide write speed and query speed benchmarks.
- [ ] Use `$in` instead of `$unwind` and benchmark results.
#### Engineering

- [ ] Better wrapper around database: use classes. inspiration: https://gist.github.com/brennanMKE/ee8ea002d305d4539ef6, not sure if any good though.

#### sub-project: polkadot-pigeon

- [x] compute balance per week, per month, and per day + average for each
- [x] dump the results in a csv (as raw) + a pretty formatted pdf
- [ ] encrypt + email both files + remove immediately.
