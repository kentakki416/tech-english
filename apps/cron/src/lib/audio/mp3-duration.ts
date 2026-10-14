/**
 * MPEG オーディオのフレームヘッダの表（ISO/IEC 11172-3・13818-3）。Polly の mp3 は Layer III なので Layer III だけを読む
 *
 * - ビットレート（kbps）は index 1〜14。0（free format）と 15（不正）はフレーム長を求められないので扱わない
 * - サンプリング周波数は index 0〜2。3 は予約
 */
const MPEG1_LAYER3_BITRATES_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MPEG2_LAYER3_BITRATES_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]

/**
 * ヘッダのバージョンのビット（0: MPEG-2.5 / 1: 予約 / 2: MPEG-2 / 3: MPEG-1）ごとのサンプリング周波数
 */
const SAMPLE_RATES_BY_VERSION: Record<number, readonly number[]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
}

const MPEG1_VERSION_BITS = 3

/**
 * Layer III のレイヤのビット
 */
const LAYER3_BITS = 1

const FRAME_HEADER_BYTES = 4

const ID3V2_HEADER_BYTES = 10

/**
 * VBR のヘッダ（LAME の Xing / Info、Fraunhofer の VBRI）。音声ではないフレームなので長さに数えない
 */
const VBR_HEADER_TAGS = ["Xing", "Info", "VBRI"]

/**
 * VBRI のタグの位置（フレームの先頭から。ヘッダ 4 バイト + 32 バイト）
 */
const VBRI_TAG_OFFSET = 36

type FrameHeader = {
  /**
   * フレームのバイト数（ヘッダを含む）
   */
  frameBytes: number
  isMono: boolean
  isMpeg1: boolean
  samples: number
  sampleRate: number
}

/**
 * offset の位置の Layer III のフレームヘッダを読む。ヘッダとして不正なら null
 */
const readFrameHeader = (audio: Buffer, offset: number): FrameHeader | null => {
  if (offset + FRAME_HEADER_BYTES > audio.length) return null
  const byte1 = audio[offset + 1] ?? 0
  const byte2 = audio[offset + 2] ?? 0
  const byte3 = audio[offset + 3] ?? 0
  /**
   * 同期ビット（11 bit）
   */
  if (audio[offset] !== 0xff || (byte1 & 0xe0) !== 0xe0) return null
  const versionBits = (byte1 >> 3) & 0b11
  const layerBits = (byte1 >> 1) & 0b11
  const sampleRates = SAMPLE_RATES_BY_VERSION[versionBits]
  if (!sampleRates || layerBits !== LAYER3_BITS) return null

  const isMpeg1 = versionBits === MPEG1_VERSION_BITS
  const bitrateKbps = (isMpeg1 ? MPEG1_LAYER3_BITRATES_KBPS : MPEG2_LAYER3_BITRATES_KBPS)[byte2 >> 4] ?? 0
  const sampleRate = sampleRates[(byte2 >> 2) & 0b11]
  if (bitrateKbps === 0 || sampleRate === undefined) return null

  const padding = (byte2 >> 1) & 0b1
  /**
   * Layer III のフレーム長は MPEG-1 が 144 × bitrate ÷ samplerate + padding、MPEG-2 / 2.5 が 72 × …（1 フレームのサンプル数 ÷ 8）
   */
  const coefficient = isMpeg1 ? 144 : 72
  return {
    frameBytes: Math.floor((coefficient * bitrateKbps * 1000) / sampleRate) + padding,
    isMono: byte3 >> 6 === 0b11,
    isMpeg1,
    samples: isMpeg1 ? 1152 : 576,
    sampleRate,
  }
}

/**
 * フレームが VBR のヘッダ（Xing / Info / VBRI）か。Xing / Info はサイド情報の直後にある
 */
const isVbrHeaderFrame = (audio: Buffer, offset: number, header: FrameHeader): boolean => {
  const hasCrc = ((audio[offset + 1] ?? 0) & 0b1) === 0
  const sideInfoBytes = header.isMpeg1 ? (header.isMono ? 17 : 32) : header.isMono ? 9 : 17
  const xingOffset = offset + FRAME_HEADER_BYTES + (hasCrc ? 2 : 0) + sideInfoBytes
  const readTag = (tagOffset: number): string => audio.toString("latin1", tagOffset, tagOffset + 4)
  return [readTag(xingOffset), readTag(offset + VBRI_TAG_OFFSET)].some((tag) => VBR_HEADER_TAGS.includes(tag))
}

/**
 * 先頭の ID3v2 タグのバイト数（無ければ 0）。サイズは syncsafe 整数（各バイトの下位 7 bit）で、フッタがあれば 10 バイト足す
 */
const measureId3v2Bytes = (audio: Buffer): number => {
  if (audio.length < ID3V2_HEADER_BYTES || audio.toString("latin1", 0, 3) !== "ID3") return 0
  const size = [6, 7, 8, 9].reduce((total, index) => total * 128 + ((audio[index] ?? 0) & 0x7f), 0)
  const hasFooter = ((audio[5] ?? 0) & 0x10) !== 0
  return ID3V2_HEADER_BYTES + size + (hasFooter ? ID3V2_HEADER_BYTES : 0)
}

/**
 * mp3 の長さ（ミリ秒）。Polly は音声の長さを返さないので、フレームを数えて求める。
 * 先頭の ID3v2 タグを飛ばし、フレームヘッダを読んで フレーム長の分だけ進めながら「サンプル数 ÷ サンプリング周波数」を足し上げる。
 * フレームが続かなくなった位置（末尾の ID3v1 タグなど）で止める。フレームが 1 つも読めなければ throw
 */
export const measureMp3DurationMs = (audio: Buffer): number => {
  let offset = measureId3v2Bytes(audio)
  let frameCount = 0
  let totalMs = 0
  for (let header = readFrameHeader(audio, offset); header; header = readFrameHeader(audio, offset)) {
    if (offset + header.frameBytes > audio.length) break
    const isFirstFrame = frameCount === 0
    frameCount++
    if (!(isFirstFrame && isVbrHeaderFrame(audio, offset, header))) totalMs += (header.samples * 1000) / header.sampleRate
    offset += header.frameBytes
  }
  if (frameCount === 0) throw new Error("No MPEG audio frame was found in the mp3")
  return Math.round(totalMs)
}
