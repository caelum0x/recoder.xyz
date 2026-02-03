/**
 * Levenshtein Distance Implementation
 * Provides fast string similarity calculation for fuzzy matching
 *
 * This is a high-performance implementation using Wagner-Fischer algorithm
 * with space optimization (only keeping two rows at a time).
 */

/**
 * Calculate the Levenshtein distance between two strings.
 * This is the minimum number of single-character edits (insertions, deletions, or substitutions)
 * required to change one string into the other.
 *
 * @param a First string
 * @param b Second string
 * @returns The Levenshtein distance (non-negative integer)
 */
export function distance(a: string, b: string): number {
  // Handle edge cases
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for better cache utilization
  if (a.length > b.length) {
    const temp = a;
    a = b;
    b = temp;
  }

  const aLen = a.length;
  const bLen = b.length;

  // Use two rows instead of a full matrix for O(min(m,n)) space complexity
  let prevRow = new Array(aLen + 1);
  let currRow = new Array(aLen + 1);

  // Initialize the first row
  for (let i = 0; i <= aLen; i++) {
    prevRow[i] = i;
  }

  // Fill in the rest of the matrix
  for (let j = 1; j <= bLen; j++) {
    currRow[0] = j;

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,     // Deletion
        currRow[i - 1] + 1, // Insertion
        prevRow[i - 1] + cost // Substitution
      );
    }

    // Swap rows
    const tempRow = prevRow;
    prevRow = currRow;
    currRow = tempRow;
  }

  return prevRow[aLen];
}

/**
 * Calculate similarity ratio between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * @param a First string
 * @param b Second string
 * @returns Similarity ratio (0 to 1)
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const dist = distance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - dist / maxLength;
}

/**
 * Find the closest matching string from an array of candidates.
 *
 * @param target The string to match against
 * @param candidates Array of candidate strings
 * @param threshold Minimum similarity threshold (0 to 1)
 * @returns The best match with its similarity score, or null if no match above threshold
 */
export function findClosestMatch(
  target: string,
  candidates: string[],
  threshold: number = 0
): { match: string; score: number; index: number } | null {
  if (candidates.length === 0) return null;

  let bestMatch: { match: string; score: number; index: number } | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const score = similarity(target, candidates[i]);
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { match: candidates[i], score, index: i };
    }
  }

  return bestMatch;
}

/**
 * Calculate the longest common subsequence length between two strings.
 * This is useful for a more flexible similarity measure.
 *
 * @param a First string
 * @param b Second string
 * @returns Length of the longest common subsequence
 */
export function lcsLength(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0 || bLen === 0) return 0;

  // Use two rows instead of a full matrix
  let prevRow = new Array(bLen + 1).fill(0);
  let currRow = new Array(bLen + 1).fill(0);

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      if (a[i - 1] === b[j - 1]) {
        currRow[j] = prevRow[j - 1] + 1;
      } else {
        currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
      }
    }

    // Swap rows
    const tempRow = prevRow;
    prevRow = currRow;
    currRow = tempRow;
    currRow.fill(0);
  }

  return prevRow[bLen];
}

/**
 * Calculate similarity based on longest common subsequence.
 * This is more tolerant of insertions and deletions than Levenshtein.
 *
 * @param a First string
 * @param b Second string
 * @returns Similarity ratio (0 to 1) based on LCS
 */
export function lcsSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const lcs = lcsLength(a, b);
  return (2 * lcs) / (a.length + b.length);
}

/**
 * Calculate a hybrid similarity score combining Levenshtein and LCS.
 * This provides a balanced similarity measure.
 *
 * @param a First string
 * @param b Second string
 * @param levWeight Weight for Levenshtein similarity (0 to 1)
 * @returns Combined similarity score (0 to 1)
 */
export function hybridSimilarity(a: string, b: string, levWeight: number = 0.6): number {
  const levSim = similarity(a, b);
  const lcsSim = lcsSimilarity(a, b);
  return levWeight * levSim + (1 - levWeight) * lcsSim;
}
