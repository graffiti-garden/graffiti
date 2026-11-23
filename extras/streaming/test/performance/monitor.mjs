// Synthetic-tone continuity probe. Observe the player's actual output rather
// than assuming a decoded packet was rendered before its deadline.
class Monitor extends AudioWorkletProcessor {
  total = 0;
  silent = 0;
  run = 0;
  longest = 0;
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const silent = channel.every(sample => Math.abs(sample) < 0.00001);
    this.total += channel.length;
    if (silent) {
      this.silent += channel.length;
      this.run += channel.length;
      this.longest = Math.max(this.longest, this.run);
    } else this.run = 0;
    if (this.total >= sampleRate) {
      this.port.postMessage({ total: this.total, silent: this.silent, longest: this.longest, sampleRate });
      this.total = this.silent = this.longest = 0;
    }
    return true; // This side branch outputs silence; the original plays normally.
  }
}
registerProcessor("continuity-monitor", Monitor);
