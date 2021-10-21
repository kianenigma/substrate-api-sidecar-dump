import * as react from 'react';

export interface Props {
  who: string,
  from: Date,
  to: Date,
  loading: boolean,
}

/**
 *
 * @param param0
 * @this Main
 */
export class Main extends react.Component<Props, {}> {
  public static defaultProps = {
    who: "...",
    from: new Date(),
    to: new Date(new Date().getTime() - (30 * 24 * 60 * 60 * 1000)),
    loading: false,
  }

  constructor(props: Props) {
    super(props);
    this.state = { ...props };
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleSubmit(e: react.FormEvent) {
    let from = (this.refs['from'] as any as HTMLInputElement).value;
    alert(from)
  }

  render() {
    return (
      <div>
        <p>
          Hopefully someday a good reward monitor and tracking tool will be installed here.
          In the meantime, enjoy the old fashioned way of things:
        </p>
        <form onSubmit={this.handleSubmit}>
          <input defaultValue={this.props.from.getTime()} name="from" required type="date" placeholder="from"></input>
          <input name="to" required type="date" placeholder="to"></input>
          <input name="who" required type="text" placeholder="who"></input>
          <input type="submit" value="Go!"></input>
          <div>{this.props.loading && "Loading your reward data..."}</div>
        </form>
      </div>
    );
  }
}
