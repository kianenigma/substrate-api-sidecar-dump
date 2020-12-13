# substrate-api-sidecar-dump 💩
A dead simple tool to scrape the default block endpoint of [`substrate-api-sidecare`](https://github.com/paritytech/substrate-api-sidecar) for the entire
chain and allow queries on top of it.

For now only supports MongoDB. Might someday support TimescaleDB and more as well.

> Work in progress.


## Brain Dump

Current replacement for issue tracking 🧠.

#### Database stuff

- allow database export.
- Create index over a bunch of fields.
- CI job to dump the export somewhere public every week or sth; could also use a remote mongodb
  instance.
- allow other databases.
- configurable database connection.
- Provide write speed and query speed benchmarks.
- Use `$in` instead of `$unwind` and benchmark results.
#### Engineering

- Better wrapper around database: use classes.

#### sub-project: polkadot-pigeon

- compute balance per week, per month, and per day + average for each
- dump the results in a csv (as raw) + a pretty formatted pdf
- encrypt + email both files + remove immediately.
