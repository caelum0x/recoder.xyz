class RecoderCode < Formula
  desc "AI-powered coding assistant CLI"
  homepage "https://recoder.xyz"
  url "https://registry.npmjs.org/recoder-code-cli/-/recoder-code-cli-2.4.4.tgz"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/recoder --version")
  end
end
