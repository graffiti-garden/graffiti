let loading: Promise<void> | undefined;

/** MoQ uses this same Opus polyfill on browsers without native audio WebCodecs. */
export async function prepareAudio() {
  if (loading) return loading;
  if (globalThis.AudioEncoder && globalThis.AudioDecoder) return;
  loading ??= Promise.all([
    import("@libav.js/variant-opus-af"),
    import("@kixelated/libavjs-webcodecs-polyfill"),
  ]).then(async ([opus, codecs]) => {
    // Workers must start on the page's origin even when the library is on a CDN.
    // Its module and WASM assets still load from beside the library bundle.
    // These runtime exports are missing from libav's declaration file.
    const { VER, CONFIG } = opus as unknown as { VER: string; CONFIG: string };
    const base = `${opus.base}/libav-${VER}-${CONFIG}.wasm`;
    const response = await fetch(`${base}.mjs`);
    if (!response.ok) throw new Error(`Loading the Opus worker failed: ${response.status}`);
    const worker = URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
    try {
      await codecs.load({ LibAV: opus, polyfill: true, libavOptions: { toImport: worker, wasmurl: `${base}.wasm` } });
    } catch (error) {
      URL.revokeObjectURL(worker);
      throw error;
    }
    // Keep the worker URL: the polyfill can create more workers later.

    if (globalThis.AudioEncoder === codecs.AudioEncoder as unknown) {
      // In 0.5.6, encode() converts microseconds to milliseconds, but _filter()
      // uses that first timestamp as a sample count. Correct the units at its
      // input boundary; otherwise audio starts on a different clock from video.
      // Copying also lets Safari's native AudioData feed the polyfill safely.
      globalThis.AudioEncoder = class extends codecs.AudioEncoder {
        encode(frame: AudioData) {
          const data = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
          for (let channel = 0; channel < frame.numberOfChannels; channel++) {
            frame.copyTo(data.subarray(channel * frame.numberOfFrames, (channel + 1) * frame.numberOfFrames), {
              planeIndex: channel, format: "f32-planar",
            });
          }
          const translated = new codecs.AudioData({
            format: "f32-planar", sampleRate: frame.sampleRate,
            numberOfChannels: frame.numberOfChannels, numberOfFrames: frame.numberOfFrames,
            timestamp: frame.timestamp * frame.sampleRate / 1000, data, transfer: [data.buffer],
          });
          super.encode(translated);
          translated.close();
        }
      } as unknown as typeof AudioEncoder;
    }
  }).catch(error => { loading = undefined; throw error; });
  await loading;
}
