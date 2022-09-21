export default {

  query(property) {
    return {
      [property]: {
        $type: 'array',
        $type: ['int', 'long'],
      },
      $nor: [
        { [property]: { $gt: this.maxInt } },
        { [property]: { $lt: 0 } },
      ]
    }
  },

  get before() {
    return []
  },

  get after() {
    return [this.maxInt+1]
  },

  between(a, b) {
    // Strip zeros and find common length
    const aLength = this.lengthWithoutZeros(a)
    const bLength = this.lengthWithoutZeros(b)
    const minLength = Math.min(aLength, bLength)

    // Initialize output
    const out = []

    // Find the break point where a[i] != b[i]
    let i = 0
    while (i < minLength && a[i] == b[i]) {
      out.push(a[i])
      i++
    }

    // Initialize upper and lower bounds for
    // sampling the last digit
    let lowerBound = 1
    let upperBound = this.maxInt

    if (i < minLength) {
      // If the break happened before we hit
      // the end of one of the arrays

      if (Math.abs(a[i] - b[i]) > 1) {
        // If a[i] and b[i] are more than one
        // away from each other, just sample
        // between them
        lowerBound = Math.min(a[i], b[i]) + 1
        upperBound = Math.max(a[i], b[i]) - 1
      } else {
        // If they are one away no integers
        // will fit in between, so add new layer
        const lesser = (a[i] < b[i])? a : b
        out.push(lesser[i])
        i++

        while (i < lesser.length && lesser[i] >= this.maxInt) {
          // If the lesser is at it's limit,
          // we will need to add even more layers
          out.push(lesser[i])
          i++
        }

        if (i < lesser.length) {
          // Sample something greater than
          // the lesser digit
          lowerBound = lesser[i] + 1
        }
      }
    } else {
      // The break happened because we hit
      // the end of one of the arrays.

      if (aLength == bLength) {
        // If they are entirely equal,
        // there is nothing in between
        // just return what we have
        return out
      }

      const longerLength = Math.max(aLength, bLength)
      const longer = (a.length == longerLength)? a : b
      while (i < longerLength && longer[i] == 0) {
        // Skip past the zeros because we can't sample
        // for digits less than zero
        out.push(0)
        i++
      }

      if (i < longerLength) {
        if (longer[i] == 1) {
          // If longer is at it's limit,
          // we still need to add another layer
          out.push(0)
        } else {
          upperBound = longer[i] - 1
        }
      }
    }

    // Finally, sample between the upper and
    // lower bounds
    out.push(Math.floor(Math.random() * (upperBound + 1 - lowerBound)) + lowerBound)
    return out
  },

  compare(a, b) {
    // Strip zeros and find common length
    const aLength = this.lengthWithoutZeros(a)
    const bLength = this.lengthWithoutZeros(b)
    const minLength = Math.min(aLength, bLength)

    // See if there are any differences
    for (let i = 0; i < minLength; i++) {
      if (a[i] > b[i]) {
        return 1
      } else if (a[i] < b[i]) {
        return -1
      }
    }

    // If they are all the same up til now,
    // the longer one is bigger
    if (aLength > bLength) {
      return 1
    } else if (aLength < bLength) {
      return -1
    } else {
      return 0
    }
  },


  lengthWithoutZeros(a) {
    let length = a.length
    while (length > 0 && a[length - 1] == 0) {
      length--
    }
    return length
  },

  maxInt: 9007199254740991,
}
