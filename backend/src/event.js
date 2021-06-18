//
export default class Event {
  streamId = "";
  type = "";
  data = {};
  meta = {};

  constructor(streamId, type, data, meta) {
    this.streamId = streamId;
    this.type = type;
    this.data = data;
    this.meta = meta;
  }
}
