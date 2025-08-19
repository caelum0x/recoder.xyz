Code with Qwen3-Coder
Qwen Code
Qwen Code is a research-purpose CLI tool adapted from Gemini CLI, with enhanced parser and tool support for Qwen-Coder models.

Make sure you have installed nodejs 20+:

You could install it via the following commands:

curl -qL https://www.npmjs.com/install.sh | sh
Then install Qwen code via npm manager:

npm i -g @qwen-code/qwen-code
The other way is to install from the source:

git clone https://github.com/QwenLM/qwen-code.git
cd qwen-code && npm install && npm install -g
Qwen Code supports the OpenAI SDK when calling LLMs, and you can export the following environment variables or simply put them under the .envfile.

export OPENAI_API_KEY="your_api_key_here"
export OPENAI_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3-coder-plus"
Now enjoy your vibe coding with Qwen-Code and Qwen, by simply typing: qwen!

Claude Code
In addition to Qwen Code, you can now use Qwen3‑Coder with Claude Code. Simply request an API key on Alibaba Cloud Model Studio platform and install Claude Code to start coding.

npm install -g @anthropic-ai/claude-code
We have provided two entrypoints for seamlessly experiencing coding with Qwen3-Coder.

Optional 1: Claude Code proxy API
export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v2/apps/claude-code-proxy
export ANTHROPIC_AUTH_TOKEN=your-dashscope-apikey
Then you should be able to use Claude Code with Qwen3-Coder!

Optional 2: claude-code-config npm package for router customization
claude-code-router aims for customizing different backend models for Claude Code. The dashscope team also provide a convenient config npm extension, namely claude-code-config, that provides default configuration for claude-code-router with DashScope support. Run installation:

npm install -g @musistudio/claude-code-router
npm install -g @dashscope-js/claude-code-config
and then run configuration:

ccr-dashscope
The command will automatically generate the config json files and plugin directories for ccr. (You could also manually adjust these under ~/.claude-code-router/config.json and ~/.claude-code-router/plugins/ ) Start using claude code via ccr:

ccr code
Cline
Configure the Qwen3-Coder-480B-A35B-Instruct to cline ‒ Go to the Cline configuration settings ‒ For API Provider, select ‘OpenAI Compatible’ ‒ For the OpenAI Compatible API Key, enter the key obtained from Dashscope ‒ Check ‘Use custom base URL’ and enter: https://dashscope-intl.aliyuncs.com/compatible-mode/v1 ‒ Enter qwen3-coder-plus

Use Cases
Example: Physics-Based Chimney Demolition Simulation with Controlled Explosion (1/7)
Next
API
You can directly access the API of Qwen3-Coder through Alibaba Cloud Model Studio. Here is a demonstration of how to use this model with the Qwen API.

import os
from openai import OpenAI

# Create client - using intl URL for users outside of China
# If you are in mainland China, use the following URL:
# "https://dashscope.aliyuncs.com/compatible-mode/v1"
client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
)

prompt = "Help me create a web page for an online bookstore."


# Send request to qwen3-coder-plus model
completion = client.chat.completions.create(
    model="qwen3-coder-plus",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": prompt}
    ],
)

# Print the response
print(completion.choices[0].message.content.strip())