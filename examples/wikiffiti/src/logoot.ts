export type LogootValue = number[];

/**
 * Create arbitrary precision values between
 * two other values. For collaborative text editing.
 */
export class Logoot {
  /**
   * The minimum value.
   */
  static get min(): LogootValue {
    return [];
  }

  /**
   * The maximum value
   */
  static get max(): LogootValue {
    return [Number.MAX_SAFE_INTEGER];
  }

  /**
   * The length of a logoot array with
   * it's ending zeros stripped.
   */
  static lengthWithoutZeros(a: LogootValue): number {
    let length = a.length;
    while (length > 0 && a[length - 1] === 0) {
      length--;
    }
    return length;
  }

  /**
   * Generate a value between two logoot values.
   */
  static randomBetween(
    a: LogootValue,
    b: LogootValue,
    bias = 100,
  ): LogootValue {
    // Strip zeros and find common length
    const aLength = this.lengthWithoutZeros(a);
    const bLength = this.lengthWithoutZeros(b);
    const minLength = Math.min(aLength, bLength);

    // Initialize output
    const out: LogootValue = [];

    // Find the break point where a[i] != b[i]
    let i = 0;
    while (i < minLength && a[i] === b[i]) {
      out.push(a[i]);
      i++;
    }

    // Initialize upper and lower bounds for
    // sampling the last digit
    let lowerBound = 1;
    let upperBound = Number.MAX_SAFE_INTEGER - 1;

    if (i < minLength) {
      // If the break happened before we hit
      // the end of one of the arrays

      if (Math.abs(a[i] - b[i]) > 1) {
        // If a[i] and b[i] are more than one
        // away from each other, just sample
        // between them
        lowerBound = Math.min(a[i], b[i]) + 1;
        upperBound = Math.max(a[i], b[i]) - 1;
      } else {
        // If they are one away no integers
        // will fit in between, so add new layer
        const lesser = a[i] < b[i] ? a : b;
        out.push(lesser[i]);
        i++;

        while (i < lesser.length && lesser[i] >= Number.MAX_SAFE_INTEGER - 1) {
          // If the lesser is at it's limit,
          // we will need to add even more layers
          out.push(lesser[i]);
          i++;
        }

        if (i < lesser.length) {
          // Sample something greater than
          // the lesser digit
          lowerBound = lesser[i] + 1;
        }
      }
    } else {
      // The break happened because we hit
      // the end of one of the arrays.

      if (aLength === bLength) {
        // If they are entirely equal,
        // there is nothing in between
        // just return what we have
        return out;
      }

      const longerLength = Math.max(aLength, bLength);
      const longer = a.length === longerLength ? a : b;
      while (i < longerLength && longer[i] == 0) {
        // Skip past the zeros because we can't sample
        // for digits less than zero
        out.push(0);
        i++;
      }

      if (i < longerLength) {
        if (longer[i] === 1) {
          // If longer is at it's limit,
          // we still need to add another layer
          out.push(0);
        } else {
          upperBound = longer[i] - 1;
        }
      }
    }

    // Create a random number in [0,1] but bias it to be small,
    // so that numbers tend to increase by a small amount.
    let random = Math.random();
    random = -Math.log(1 - random) / bias;
    random = Math.min(random, 1);

    // Finally, sample between the upper and lower bounds
    out.push(Math.floor(random * (upperBound + 1 - lowerBound)) + lowerBound);
    return out;
  }

  /**
   * @returns 1 if a > b, -1 if a < b, 0 if a == b
   */
  static compare(a: LogootValue, b: LogootValue): 1 | -1 | 0 {
    // Strip zeros and find common length
    const aLength = this.lengthWithoutZeros(a);
    const bLength = this.lengthWithoutZeros(b);
    const minLength = Math.min(aLength, bLength);

    // See if there are any differences
    for (let i = 0; i < minLength; i++) {
      if (a[i] > b[i]) {
        return 1;
      } else if (a[i] < b[i]) {
        return -1;
      }
    }

    // If they are all the same up til now,
    // the longer one is bigger
    return aLength > bLength ? 1 : aLength < bLength ? -1 : 0;
  }
}
