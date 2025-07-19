# CodeCraft CLI - Homebrew Formula
class Codecraft < Formula
  desc "Intelligent code generation and project management CLI tool"
  homepage "https://codecraft.dev"
  url "https://github.com/recoder-team/recoder/archive/v1.0.0.tar.gz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"
  head "https://github.com/recoder-team/recoder.git", branch: "main"

  depends_on "node@18"

  def install
    system "npm", "ci", "--production"
    system "npm", "run", "build:core"
    
    # Install the CLI binary
    bin.install "dist/index.js" => "codecraft"
    
    # Make it executable
    chmod 0755, bin/"codecraft"
    
    # Install bash completion
    bash_completion.install "deployment/completions/codecraft.bash" => "codecraft"
    
    # Install zsh completion
    zsh_completion.install "deployment/completions/_codecraft"
    
    # Install fish completion
    fish_completion.install "deployment/completions/codecraft.fish"
    
    # Install man page
    man1.install "docs/man/codecraft.1"
  end

  test do
    assert_match "CodeCraft CLI", shell_output("#{bin}/codecraft --version")
    assert_match "Usage:", shell_output("#{bin}/codecraft --help")
    
    # Test basic functionality
    system bin/"codecraft", "version"
    
    # Test configuration
    system bin/"codecraft", "config", "get", "version"
  end

  def caveats
    <<~EOS
      CodeCraft CLI has been installed successfully!
      
      Get started by running:
        codecraft --help
      
      For detailed documentation, visit:
        https://codecraft.dev/docs
      
      To enable shell completions, add the following to your shell profile:
      
      For Bash:
        echo 'source #{HOMEBREW_PREFIX}/etc/bash_completion.d/codecraft' >> ~/.bashrc
      
      For Zsh:
        echo 'autoload -U compinit && compinit' >> ~/.zshrc
      
      For Fish:
        echo 'source #{HOMEBREW_PREFIX}/share/fish/vendor_completions.d/codecraft.fish' >> ~/.config/fish/config.fish
    EOS
  end
end