// 极简 WAV 解码（无第三方依赖）。
// 支持 PCM 整型 8/16/24/32-bit（fmt=1）与 IEEE Float32（fmt=3），多声道降混为单声道。
// 返回 { sampleRate, channels, bits, samples: Float32Array(mono, -1..1), duration }。

export const decodeWav = (buf) => {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是合法的 WAV 文件');
  }
  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(offset + 8),
        channels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bits: buf.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
    }
    offset += 8 + size + (size & 1);
  }
  if (!fmt) throw new Error('缺少 fmt chunk');
  if (dataOffset < 0) throw new Error('缺少 data chunk');

  const {audioFormat, channels, bits, sampleRate} = fmt;
  const bytesPerSample = bits / 8;
  const frameCount = Math.floor(Math.min(dataSize, buf.length - dataOffset) / (bytesPerSample * channels));
  const mono = new Float32Array(frameCount);

  const readSample = (p) => {
    if (audioFormat === 3 && bits === 32) return buf.readFloatLE(p);
    if (bits === 16) return buf.readInt16LE(p) / 32768;
    if (bits === 32) return buf.readInt32LE(p) / 2147483648;
    if (bits === 24) {
      let x = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
      if (x & 0x800000) x |= ~0xffffff;
      return x / 8388608;
    }
    if (bits === 8) return (buf[p] - 128) / 128;
    throw new Error(`不支持的位深: ${bits}`);
  };

  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += readSample(dataOffset + (i * channels + c) * bytesPerSample);
    }
    mono[i] = sum / channels;
  }

  return {sampleRate, channels, bits, samples: mono, duration: frameCount / sampleRate};
};
