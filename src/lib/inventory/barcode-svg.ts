const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function barsToSvg(bits: string, label: string) {
  const width = bits.length + 16;
  let x = 8;
  let rects = "";
  for (const bit of bits) {
    if (bit === "1") rects += `<rect x="${x}" y="0" width="1" height="42" fill="#0f172a"/>`;
    x += 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 58" width="${Math.max(84, width)}" height="58" role="img" aria-label="${escapeXml(label)}">${rects}<text x="${width / 2}" y="55" text-anchor="middle" font-size="9" font-family="Arial, sans-serif" fill="#0f172a">${escapeXml(label)}</text></svg>`;
}

function code128Bits(value: string) {
  const codes = [104];
  let checksum = 104;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index) - 32;
    if (code < 0 || code > 94) return null;
    codes.push(code);
    checksum += code * (index + 1);
  }
  codes.push(checksum % 103, 106);
  return codes.map((code) => {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return "";
    let bits = "";
    for (let index = 0; index < pattern.length; index += 1) {
      bits += (index % 2 === 0 ? "1" : "0").repeat(Number(pattern[index]));
    }
    return bits;
  }).join("");
}

function ean13Bits(value: string) {
  if (!/^\d{13}$/.test(value)) return null;
  const digits = value.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  if ((10 - (sum % 10)) % 10 !== digits[12]) return null;
  const parity = EAN_PARITY[digits[0]];
  if (!parity) return null;
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = digits[index];
    const pattern = parity[index - 1] === "L" ? EAN_L[digit] : EAN_G[digit];
    if (!pattern) return null;
    bits += pattern;
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) {
    const pattern = EAN_R[digits[index]];
    if (!pattern) return null;
    bits += pattern;
  }
  return `${bits}101`;
}

export function barcodeMarkup(value: string) {
  const text = value.trim();
  if (!text) return { svg: "", format: "" };
  const ean = ean13Bits(text);
  if (ean) return { svg: barsToSvg(ean, text), format: "EAN-13" };
  const code128 = code128Bits(text);
  if (code128) return { svg: barsToSvg(code128, text), format: "Code128" };
  return { svg: "", format: "" };
}
