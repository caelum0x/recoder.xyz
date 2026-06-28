/**
 * The Homebrew tap repo writer. Distribution renders a formula and asks this
 * port to commit it; the commit is a customer-visible change and so is
 * approval-gated upstream by the engine. The port itself only does the git IO.
 */
export interface TapPort {
  /**
   * Write the formula file at `relativePath` with `contents` and commit+push
   * it to the tap repo. Returns the commit sha.
   */
  writeFormula(input: {
    relativePath: string;
    contents: string;
    commitMessage: string;
  }): Promise<{ commitSha: string }>;

  /** Read the current formula file, or null when it does not exist yet. */
  readFormula(relativePath: string): Promise<string | null>;
}
