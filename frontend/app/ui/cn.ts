/**
 * Minimal class-name joiner.
 * Avoids pulling in a full dependency for a single utility.
 */
export function cn(...inputs: Array<string | undefined | null | false | 0>): string {
  return inputs.filter(Boolean).join(" ");
}
