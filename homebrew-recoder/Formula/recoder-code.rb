class RecoderCode < Formula
  desc "AI-powered coding assistant CLI — 40+ models, tool calling, sandbox"
  homepage "https://recoder.xyz"
  url "https://registry.npmjs.org/recoder-code/-/recoder-code-2.5.4.tgz"
  sha256 "31ca354fe28b789735a4722599b2c33099f14c7b2f554580c7bbde6cd1f790ae"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/recoder-code --version")
  end
end
