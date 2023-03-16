function randomBytes(size) {
  const bytes = new Array(size)
  let r

  for (let i = 0, r; i < size; i++) {
    if ((i & 0x03) == 0) r = Math.random() * 0x100000000
    bytes[i] = (r >>> ((i & 0x03) << 3)) & 0xff
  }

  return bytes
}

/**
 * Taken from the base64-js module
 * https://github.com/beatgammit/base64-js/
 */
function byteArrayToBase64(uint8) {
  const lookup =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    extraBytes = uint8.length % 3 // if we have 1 byte left, pad 2 bytes
  let output = '',
    temp,
    length,
    i

  function tripletToBase64(num) {
    return (
      lookup[(num >> 18) & 0x3f] +
      lookup[(num >> 12) & 0x3f] +
      lookup[(num >> 6) & 0x3f] +
      lookup[num & 0x3f]
    )
  }

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
    temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + uint8[i + 2]
    output += tripletToBase64(temp)
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  switch (extraBytes) {
    case 1:
      temp = uint8[uint8.length - 1]
      output += lookup[temp >> 2]
      output += lookup[(temp << 4) & 0x3f]
      output += '=='
      break
    case 2:
      temp = (uint8[uint8.length - 2] << 8) + uint8[uint8.length - 1]
      output += lookup[temp >> 10]
      output += lookup[(temp >> 4) & 0x3f]
      output += lookup[(temp << 2) & 0x3f]
      output += '='
      break
  }

  return output
}

/**
 * Return a random alphanumerical string of length len
 * There is a very small probability (less than 1/1,000,000) for the length to be less than len
 * (il the base64 conversion yields too many pluses and slashes) but
 * that's not an issue here
 * The probability of a collision is tiny (need 3*10^12 documents to have one chance in a million of a collision)
 * See http://en.wikipedia.org/wiki/Birthday_problem
 */
export function uid(len) {
  return byteArrayToBase64(randomBytes(Math.ceil(Math.max(8, len * 2))))
    .replace(/[+/]/g, '')
    .slice(0, len)
}
