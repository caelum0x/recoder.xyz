Completion
POST
https://openrouter.ai/api/v1/completions
POST
/api/v1/completions

cURL

curl -X POST https://openrouter.ai/api/v1/completions \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
  "model": "string",
  "prompt": "string"
}'
Try it
200
Successful

{
  "id": "string",
  "choices": [
    {
      "text": "string",
      "index": 1,
      "finish_reason": "string"
    }
  ]
}
Send a completion request to a selected model (text-only format)

Headers
Authorization
string
Required
Bearer authentication of the form Bearer <token>, where token is your auth token.

Request
This endpoint expects an object.
model
string
Required
The model ID to use. If unspecified, the user's default is used.
prompt
string
Required
The text prompt to complete
models
list of strings
Optional
Alternate list of models for routing overrides.
provider
object
Optional
Preferences for provider routing.

Show 1 properties
reasoning
object
Optional
Configuration for model reasoning/thinking tokens


Show 3 properties
usage
object
Optional
Whether to include usage information in the response

Show 1 properties
transforms
list of strings
Optional
List of prompt transforms (OpenRouter-only).

stream
boolean
Optional
Defaults to false
Enable streaming of results.
max_tokens
integer
Optional
Maximum number of tokens (range: [1, context_length)).

temperature
double
Optional
Sampling temperature (range: [0, 2]).

seed
integer
Optional
Seed for deterministic outputs.
top_p
double
Optional
Top-p sampling value (range: (0, 1]).

top_k
integer
Optional
Top-k sampling value (range: [1, Infinity)).

frequency_penalty
double
Optional
Frequency penalty (range: [-2, 2]).

presence_penalty
double
Optional
Presence penalty (range: [-2, 2]).

repetition_penalty
double
Optional
Repetition penalty (range: (0, 2]).

logit_bias
map from strings to doubles
Optional
Mapping of token IDs to bias values.
top_logprobs
integer
Optional
Number of top log probabilities to return.
min_p
double
Optional
Minimum probability threshold (range: [0, 1]).

top_a
double
Optional
Alternate top sampling parameter (range: [0, 1]).

user
string
Optional
A stable identifier for your end-users. Used to help detect and prevent abuse.

Response
Successful completion
id
string or null
choices
list of objects or null

Show 3 properties
Was this page helpful?
Yes
No
Previous
Chat completion
Next
Built with
Versions by Token Share
16 Tem17 Tem18 Tem19 Tem20 Tem21 Tem22 Tem23 Tem30%60%100%
DeepSeek: R1 Distill Qwen 7B
Created May 30, 2025131.072 context
88,1M tokens
DeepSeek: R1 Distill Llama 8B
Created February 7, 20250 context
29,9M tokens
DeepSeek: R1 Distill Qwen 1.5B
Created January 31, 2025131.072 context
49,5M tokens
DeepSeek: R1 Distill Qwen 32B
Created January 30, 2025128.000 context
420M tokens
DeepSeek: R1 Distill Qwen 14B
Created January 30, 2025131.072 context
37,4M tokens
DeepSeek: R1 Distill Llama 70B
Created January 23, 2025128.000 context
12,4B tokens
Currently Viewing
DeepSeek: R1
Created January 20, 2025163.840 context
3,99B tokens
Uptime stats for R1 (free)
Uptime stats for R1 (free) on the only provider
When an error occurs in an upstream provider, we can recover by routing to another healthy provider, if your request filters allow it.
Learn more about our load balancing and customization options.
Sample code and API for R1 (free)
OpenRouter normalizes requests and responses across providers for you.
Create API key
OpenRouter provides an OpenAI-compatible completion API to 400+ models & providers that you can call directly, or using the OpenAI SDK. Additionally, some third-party SDKs are available.
In the examples below, the OpenRouter-specific headers are optional. Setting them allows your app to appear on the OpenRouter leaderboards.
openai-pythonpythontypescriptopenai-typescriptcurl
Copy

from openai import OpenAI

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key="<OPENROUTER_API_KEY>",
)

completion = client.chat.completions.create(
  extra_headers={
    "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
  },
  extra_body={},
  model="deepseek/deepseek-r1:free",
  messages=[
    {
      "role": "user",
      "content": "What is the meaning of life?"
    }
  ]
)
print(completion.choices[0].message.content)Quickstart

Copy page

Get started with OpenRouter
OpenRouter provides a unified API that gives you access to hundreds of AI models through a single endpoint, while automatically handling fallbacks and selecting the most cost-effective options. Get started with just a few lines of code using your preferred SDK or framework.

Looking for information about free models and rate limits? Please see the FAQ

In the examples below, the OpenRouter-specific headers are optional. Setting them allows your app to appear on the OpenRouter leaderboards. For detailed information about app attribution, see our App Attribution guide.

Using the OpenAI SDK

Python

TypeScript

import OpenAI from 'openai';
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});
async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });
  console.log(completion.choices[0].message);
}
main();
Using the OpenRouter API directly
You can use the interactive Request Builder to generate OpenRouter API requests in the language of your choice.


Python

TypeScript

Shell

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  }),
});
The API also supports streaming.

Models

Copy page

One API for hundreds of models
Explore and browse 400+ models and providers on our website, or with our API (including RSS).

Models API Standard
Our Models API makes the most important information about all LLMs freely available as soon as we confirm it.

API Response Schema
The Models API returns a standardized JSON response format that provides comprehensive metadata for each available model. This schema is cached at the edge and designed for reliable integration for production applications.

Root Response Object
{
  "data": [
    /* Array of Model objects */
  ]
}

Model Object Schema
Each model in the data array contains the following standardized fields:

Field    Type    Description
id    string    Unique model identifier used in API requests (e.g., "google/gemini-2.5-pro-preview")
canonical_slug    string    Permanent slug for the model that never changes
name    string    Human-readable display name for the model
created    number    Unix timestamp of when the model was added to OpenRouter
description    string    Detailed description of the model’s capabilities and characteristics
context_length    number    Maximum context window size in tokens
architecture    Architecture    Object describing the model’s technical capabilities
pricing    Pricing    Lowest price structure for using this model
top_provider    TopProvider    Configuration details for the primary provider
per_request_limits    Rate limiting information (null if no limits)    
supported_parameters    string[]    Array of supported API parameters for this model
Architecture Object
{
  "input_modalities": string[], // Supported input types: ["file", "image", "text"]
  "output_modalities": string[], // Supported output types: ["text"]
  "tokenizer": string,          // Tokenization method used
  "instruct_type": string | null // Instruction format type (null if not applicable)
}

Pricing Object
All pricing values are in USD per token/request/unit. A value of "0" indicates the feature is free.

{
  "prompt": string,           // Cost per input token
  "completion": string,       // Cost per output token
  "request": string,          // Fixed cost per API request
  "image": string,           // Cost per image input
  "web_search": string,      // Cost per web search operation
  "internal_reasoning": string, // Cost for internal reasoning tokens
  "input_cache_read": string,   // Cost per cached input token read
  "input_cache_write": string   // Cost per cached input token write
}

Top Provider Object
{
  "context_length": number,        // Provider-specific context limit
  "max_completion_tokens": number, // Maximum tokens in response
  "is_moderated": boolean         // Whether content moderation is applied
}

Supported Parameters
The supported_parameters array indicates which OpenAI-compatible parameters work with each model:

tools - Function calling capabilities
tool_choice - Tool selection control
max_tokens - Response length limiting
temperature - Randomness control
top_p - Nucleus sampling
reasoning - Internal reasoning mode
include_reasoning - Include reasoning in response
structured_outputs - JSON schema enforcement
response_format - Output format specification
stop - Custom stop sequences
frequency_penalty - Repetition reduction
presence_penalty - Topic diversity
seed - Deterministic outputs
Different models tokenize text in different ways
Some models break up text into chunks of multiple characters (GPT, Claude, Llama, etc), while others tokenize by character (PaLM). This means that token counts (and therefore costs) will vary between models, even when inputs and outputs are the same. Costs are displayed and billed according to the tokenizer for the model in use. You can use the usage field in the response to get the token counts for the input and output.

If there are models or providers you are interested in that OpenRouter doesn’t have, please tell us about them in our Discord channel.

Web Search

Copy page

Model-agnostic grounding

You can incorporate relevant web search results for any model on OpenRouter by activating and customizing the web plugin, or by appending :online to the model slug:

{
  "model": "openai/gpt-4o:online"
}

This is a shortcut for using the web plugin, and is exactly equivalent to:

{
  "model": "openrouter/auto",
  "plugins": [{ "id": "web" }]
}

The web search plugin is powered by Exa and uses their “auto” method (a combination of keyword search and embeddings-based web search) to find the most relevant results and augment/ground your prompt.

Parsing web search results
Web search results for all models (including native-only models like Perplexity and OpenAI Online) are available in the API and standardized by OpenRouterto follow the same annotation schema in the OpenAI Chat Completion Message type:

{
  "message": {
    "role": "assistant",
    "content": "Here's the latest news I found: ...",
    "annotations": [
      {
        "type": "url_citation",
        "url_citation": {
          "url": "https://www.example.com/web-search-result",
          "title": "Title of the web search result",
          "content": "Content of the web search result", // Added by OpenRouter if available
          "start_index": 100, // The index of the first character of the URL citation in the message.
          "end_index": 200 // The index of the last character of the URL citation in the message.
        }
      }
    ]
  }
}

Customizing the Web Plugin
The maximum results allowed by the web plugin and the prompt used to attach them to your message stream can be customized:

{
  "model": "openai/gpt-4o:online",
  "plugins": [
    {
      "id": "web",
      "max_results": 1, // Defaults to 5
      "search_prompt": "Some relevant web results:" // See default below
    }
  ]
}

By default, the web plugin uses the following search prompt, using the current date:

A web search was conducted on `date`. Incorporate the following web search results into your response.
IMPORTANT: Cite them using markdown links named using the domain of the source.
Example: [nytimes.com](https://nytimes.com/some-page).

Pricing
The web plugin uses your OpenRouter credits and charges $4 per 1000 results. By default, max_results set to 5, this comes out to a maximum of $0.02 per request, in addition to the LLM usage for the search result prompt tokens.

Non-plugin Web Search
Some models have built-in web search. These models charge a fee based on the search context size, which determines how much search data is retrieved and processed for a query.

Search Context Size Thresholds
Search context can be ‘low’, ‘medium’, or ‘high’ and determines how much search context is retrieved for a query:

Low: Minimal search context, suitable for basic queries
Medium: Moderate search context, good for general queries
High: Extensive search context, ideal for detailed research
Specifying Search Context Size
You can specify the search context size in your API request using the web_search_options parameter:

{
  "model": "openai/gpt-4.1",
  "messages": [
    {
      "role": "user",
      "content": "What are the latest developments in quantum computing?"
    }
  ],
  "web_search_options": {
    "search_context_size": "high"
  }
}

OpenAI Model Pricing
For GPT-4.1, GPT-4o, and GPT-4o search preview Models:

Search Context Size    Price per 1000 Requests
Low    $30.00
Medium    $35.00
High    $50.00
For GPT-4.1-Mini, GPT-4o-Mini, and GPT-4o-Mini-Search-Preview Models:

Search Context Size    Price per 1000 Requests
Low    $25.00
Medium    $27.50
High    $30.00
Perplexity Model Pricing
For Sonar and SonarReasoning:

Search Context Size    Price per 1000 Requests
Low    $5.00
Medium    $8.00
High    $12.00
For SonarPro and SonarReasoningPro:

Search Context Size    Price per 1000 Requests
Low    $6.00
Medium    $10.00
High    $14.00Model Routing

Copy page

Dynamically route requests to models
OpenRouter provides two options for model routing.

Auto Router
The Auto Router, a special model ID that you can use to choose between selected high-quality models based on your prompt, powered by NotDiamond.

{
  "model": "openrouter/auto",
  ... // Other params
}

The resulting generation will have model set to the model that was used.

The models parameter
The models parameter lets you automatically try other models if the primary model’s providers are down, rate-limited, or refuse to reply due to content moderation.

{
  "models": ["anthropic/claude-3.5-sonnet", "gryphe/mythomax-l2-13b"],
  ... // Other params
}

If the model you selected returns an error, OpenRouter will try to use the fallback model instead. If the fallback model is down or returns an error, OpenRouter will return that error.

By default, any error can trigger the use of a fallback model, including context length validation errors, moderation flags for filtered models, rate-limiting, and downtime.

Requests are priced using the model that was ultimately used, which will be returned in the model attribute of the response body.

Using with OpenAI SDK
To use the models array with the OpenAI SDK, include it in the extra_body parameter. In the example below, gpt-4o will be tried first, and the models array will be tried in order as fallbacks.


TypeScript

Python

import OpenAI from 'openai';
const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  // API key and headers
});
async function main() {
  // @ts-expect-error
  const completion = await openrouterClient.chat.completions.create({
    model: 'openai/gpt-4o',
    models: ['anthropic/claude-3.5-sonnet', 'gryphe/mythomax-l2-13b'],
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });
  console.log(completion.choices[0].message);
}
main();
Was this page helpful?
YesStructured Outputs

Copy page

Return structured data from your models
OpenRouter supports structured outputs for compatible models, ensuring responses follow a specific JSON Schema format. This feature is particularly useful when you need consistent, well-formatted responses that can be reliably parsed by your application.

Overview
Structured outputs allow you to:

Enforce specific JSON Schema validation on model responses
Get consistent, type-safe outputs
Avoid parsing errors and hallucinated fields
Simplify response handling in your application
Using Structured Outputs
To use structured outputs, include a response_format parameter in your request, with type set to json_schema and the json_schema object containing your schema:

{
  "messages": [
    { "role": "user", "content": "What's the weather like in London?" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City or location name"
          },
          "temperature": {
            "type": "number",
            "description": "Temperature in Celsius"
          },
          "conditions": {
            "type": "string",
            "description": "Weather conditions description"
          }
        },
        "required": ["location", "temperature", "conditions"],
        "additionalProperties": false
      }
    }
  }
}

The model will respond with a JSON object that strictly follows your schema:

{
  "location": "London",
  "temperature": 18,
  "conditions": "Partly cloudy with light drizzle"
}

Model Support
Structured outputs are supported by select models.

You can find a list of models that support structured outputs on the models page.

OpenAI models (GPT-4o and later versions) Docs
All Fireworks provided models Docs
To ensure your chosen model supports structured outputs:

Check the model’s supported parameters on the models page
Set require_parameters: true in your provider preferences (see Provider Routing)
Include response_format and set type: json_schema in the required parameters
Best Practices
Include descriptions: Add clear descriptions to your schema properties to guide the model

Use strict mode: Always set strict: true to ensure the model follows your schema exactly

Example Implementation
Here’s a complete example using the Fetch API:


With TypeScript

With Python

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [
      { role: 'user', content: 'What is the weather like in London?' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City or location name',
            },
            temperature: {
              type: 'number',
              description: 'Temperature in Celsius',
            },
            conditions: {
              type: 'string',
              description: 'Weather conditions description',
            },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
  }),
});
const data = await response.json();
const weatherInfo = data.choices[0].message.content;
Streaming with Structured Outputs
Structured outputs are also supported with streaming responses. The model will stream valid partial JSON that, when complete, forms a valid response matching your schema.

To enable streaming with structured outputs, simply add stream: true to your request:

{
  "stream": true,
  "response_format": {
    "type": "json_schema",
    // ... rest of your schema
  }
}

Error Handling
When using structured outputs, you may encounter these scenarios:
# Comprehensive AI Model Integration Plan for Recoder.xyz

The integration of Kimi K2, Qwen 3, and DeepSeek R1 into the recoder.xyz project presents a significant opportunity to create a competitive AI coding platform. Based on extensive research into existing successful implementations, this plan provides a complete roadmap for integrating these models while maintaining profitability and competitive advantages.

## Executive integration strategy

**OpenRouter emerges as the central enabler** for this integration, providing unified access to all target models through a single API with intelligent routing, cost optimization, and fallback mechanisms. The integration follows proven patterns from Kilo Code's #1 ranking success and Llama Coder's architectural strengths, while implementing cost optimization strategies that can maintain target margins of $12-13 per user on $20 plans.

The three target models offer complementary capabilities: **Kimi K2 excels at agentic tasks and tool calling** ($0.15/$2.50 per million tokens), **Qwen3-Coder provides repository-scale code understanding** with 256K-1M context windows, and **DeepSeek R1 delivers advanced reasoning** at 27x lower cost than OpenAI o1. Strategic routing between these models can achieve 50-78% cost reductions while improving response quality and speed.

## Model integration technical implementation

### Kimi K2 (Moonshot AI) integration details

Kimi K2's 1-trillion parameter MoE architecture with 32B active parameters makes it ideal for autonomous coding agents and complex tool interactions. **Direct API access through platform.moonshot.ai** provides the most cost-effective integration at $0.15 per million input tokens (cache hit) and $2.50 per million output tokens.

The **OpenAI-compatible API format** simplifies integration into existing codebases. Authentication requires a Moonshot Developer Console API key, with requests formatted as:

```python
client = OpenAI(
    api_key="your-moonshot-api-key",
    base_url="https://platform.moonshot.ai/api"
)

response = client.chat.completions.create(
    model="kimi-k2-instruct",
    messages=messages,
    temperature=0.6,
    max_tokens=256
)
```

**OpenRouter integration** provides additional benefits through the `moonshotai/kimi-k2-instruct` model ID, offering automatic fallbacks and unified billing. The 128K native context length with full tool calling support makes it particularly valuable for complex coding workflows requiring multiple API interactions.

### Qwen 3 and Qwen3-Coder integration architecture

The **Qwen3-Coder-480B-A35B-Instruct model represents a breakthrough in code understanding**, featuring 480B total parameters with 35B active through MoE architecture. Its 256K native context (extensible to 1M tokens) enables repository-scale code analysis and generation.

**Multiple integration pathways** provide flexibility: Hugging Face Transformers for local deployment, Alibaba Cloud Model Studio for managed hosting, and Together AI for API access. The **OpenAI-compatible format** ensures seamless integration across platforms.

For the recoder.xyz project, **Together AI integration** offers the optimal balance of cost ($0.20/$0.60 per million tokens for Qwen3-235B-A22B) and performance. The tool calling format follows OpenAI standards:

```python
tools = [{
    "type": "function",
    "function": {
        "name": "analyze_code",
        "description": "Analyze code structure and suggest improvements",
        "parameters": {
            "type": "object",
            "required": ["code_snippet"],
            "properties": {
                "code_snippet": {
                    "type": "string",
                    "description": "Code to analyze"
                }
            }
        }
    }
}]
```

**Thinking mode capabilities** through the `enable_thinking` parameter provide transparency in the model's reasoning process, valuable for educational coding scenarios and debugging complex logic.

### DeepSeek R1 reasoning integration

DeepSeek R1's revolutionary approach to **transparent reasoning** makes it uniquely valuable for complex coding problems requiring step-by-step analysis. The model generates an average of 23K reasoning tokens before providing final answers, with these reasoning tokens visible to users.

**Direct API integration** through api.deepseek.com provides the most cost-effective access at $0.55/$2.19 per million tokens - representing a **27x cost advantage** over OpenAI o1. The OpenAI-compatible interface ensures easy integration:

```python
client = OpenAI(
    api_key="your-deepseek-api-key",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages,
    max_tokens=32000
)
```

**Context caching capabilities** can reduce input token costs by up to 90% for repeated queries, making it extremely cost-effective for iterative coding workflows. The **off-peak discount window** (16:30-00:30 UTC) provides additional savings opportunities.

## Existing project integration patterns

### Kilo Code architecture adaptation

Kilo Code's success with **35.3B tokens usage** stems from its sophisticated multi-provider routing through OpenRouter and specialized mode architecture. The extension employs five coordinated modes: Architect, Code, Debug, Ask, and Orchestrator, each optimized for specific coding tasks.

**Key architectural patterns** to adapt for recoder.xyz include:

The **provider abstraction layer** that supports OpenRouter, Anthropic, OpenAI, Ollama, and local models through a unified interface. This abstraction enables seamless switching between providers based on cost, performance, or availability constraints.

**MCP Server Marketplace integration** leverages the Model Context Protocol to extend capabilities with external tools and APIs. This pattern allows the recoder-extension to access web browsing, terminal commands, and file operations through standardized interfaces.

**Token-based cost tracking** provides real-time usage monitoring with per-request cost calculations, essential for maintaining profit margins. The system matches OpenAI, Google, and Anthropic API rates exactly with no markup, demonstrating how to provide competitive pricing while maintaining profitability.

### Llama Coder web platform patterns

Llama Coder's **Next.js-based architecture** with Sandpack integration provides a proven template for the recoder-web platform. The streaming response system with **real-time code generation** creates an engaging user experience while managing token consumption efficiently.

**Together AI integration patterns** demonstrate how to implement OpenAI-compatible endpoints for seamless model switching. The **Helicone analytics integration** provides comprehensive usage tracking and debugging capabilities essential for production deployments.

The **export and sharing capabilities** enable users to generate URLs for their applications or export to local development environments, adding significant value beyond basic code generation.

### Claude Code Router CLI adaptation

The Claude Code Router's **Node.js CLI architecture** provides an excellent foundation for recoder-cli-router modification. The existing **JSON configuration system** supports multiple providers and specialized routing rules:

```json
{
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "sk-xxx",
      "models": ["kimi/kimi-k2", "qwen/qwen3-coder", "deepseek/deepseek-r1"]
    }
  ],
  "Router": {
    "default": "openrouter,kimi/kimi-k2",
    "coding": "openrouter,qwen/qwen3-coder",
    "reasoning": "openrouter,deepseek/deepseek-r1"
  }
}
```

**Specialized routing capabilities** enable different models for different request types, with router agents for classification, tool agents for function calling, coder agents for specialized coding, and reasoning agents for complex analysis.

## OpenRouter unified integration strategy

### Multi-model routing architecture

OpenRouter's **unified API gateway** provides access to all three target models through a single endpoint, significantly simplifying integration complexity. The **automatic fallback mechanism** ensures high availability by routing to alternative providers when primary models are unavailable.

**Smart routing algorithms** optimize for cost, latency, or throughput based on configurable preferences. The `sort: "price"` parameter prioritizes lowest cost, while `:nitro` suffix optimizes for throughput and `:floor` suffix ensures price priority.

**Provider abstraction** enables seamless switching between direct APIs and OpenRouter without code changes, providing flexibility for cost optimization and risk mitigation.

### Authentication and cost management

The **single API key approach** through OpenRouter Credits simplifies billing and management while providing access to hundreds of models. The **5.5% fee** on credit purchases ($0.80 minimum) represents reasonable overhead for unified access and billing.

**Real-time usage tracking** through the `/generation` endpoint provides detailed cost and token analytics essential for maintaining profit margins. The system supports both OpenRouter Credits and Bring Your Own Key (BYOK) models with 5% fee structure.

**Rate limit management** aggregates across providers while respecting individual provider limits, with automatic fallback mechanisms ensuring service continuity.

### Implementation best practices

**Model fallback chains** ensure reliability through ordered fallback lists. Production implementations should specify primary and backup models:

```javascript
{
  "model": "kimi/kimi-k2",
  "models": ["qwen/qwen3-coder", "deepseek/deepseek-r1"],
  "provider": {
    "order": ["Moonshot", "Together", "DeepSeek"],
    "allow_fallbacks": true
  }
}
```

**Error handling and retry logic** with exponential backoff ensures robust operation under varying load conditions. The comprehensive error handling pattern accounts for rate limits, provider outages, and network issues.

## Cost optimization and profit strategy

### Smart routing for target margins

Maintaining **$12-13 per user costs on $20 plans** requires sophisticated routing algorithms that balance cost and quality. Research shows that **50-78% cost reductions** are achievable through intelligent model selection without sacrificing user experience.

**Task complexity assessment** enables optimal model routing:
- **Simple queries** (FAQ, basic completion) → Qwen 2.5 7B ($0.30/1M)
- **Medium complexity** (refactoring, debugging) → Qwen Coder 32B ($0.80/1M)
- **Complex reasoning** (architecture, analysis) → DeepSeek R1 ($0.55/$2.19/1M)

**Dynamic routing implementation**:
```python
def select_optimal_model(complexity, input_length, budget_remaining):
    if complexity == 'low' and input_length < 1000:
        return 'qwen-2.5-7b'
    elif complexity == 'medium' and budget_remaining > threshold:
        return 'qwen-coder-32b'
    elif complexity == 'high' or requires_reasoning:
        return 'deepseek-r1'
    else:
        return 'gpt-4o-mini'  # Fallback
```

### Usage optimization techniques

**Context caching strategies** provide dramatic cost savings. DeepSeek R1's context caching reduces input token costs by **up to 90%** for repeated queries, while OpenAI's prompt caching offers **50% discounts** on cached prompts over 1,024 tokens.

**Batch processing optimization** through OpenAI's Batch API provides **50% discounts** on both input and output tokens for non-real-time processing. This approach is ideal for code analysis, documentation generation, and other background tasks.

**Token efficiency techniques** include prompt optimization, context window management, and progressive code generation. The **BatchPrompt technique** processes multiple data points per prompt, significantly reducing per-query costs.

### Revenue model recommendations

**Tiered pricing structure** following successful platforms:
- **Free tier**: 2,000 completions/month (GitHub Copilot model)
- **Pro tier**: $20/month with smart routing to maintain margins
- **Enterprise tier**: $40+/user with dedicated models and compliance features

**Usage analytics** enable identification of power users who may exceed target costs, allowing for **dynamic routing to more efficient models** or upselling to higher tiers.

## Development phases integration roadmap

### Phase 7B: Code Enhancement Engine integration

The Code Enhancement Engine represents the ideal starting point for AI model integration, providing controlled environment for testing routing algorithms and cost optimization strategies.

**Kimi K2 integration** focuses on **agentic code improvement workflows**, where the model analyzes code structure, suggests improvements, and implements changes through tool calling. The 128K context window accommodates substantial codebases while maintaining conversation continuity.

**Qwen3-Coder integration** leverages the **256K-1M context capability** for repository-scale analysis. The model can understand entire project structures, maintain architectural consistency, and suggest improvements that consider broad codebase implications.

**DeepSeek R1 integration** provides **transparent reasoning** for complex refactoring decisions, helping users understand why specific changes are recommended and how they improve code quality or performance.

### Phase 8: Cross-Platform Sync Infrastructure compatibility

Cross-platform synchronization requires careful consideration of **state management across VS Code, web, and CLI platforms**. The unified OpenRouter integration simplifies this by providing consistent API endpoints and authentication across platforms.

**Configuration synchronization** maintains user preferences for model selection, routing rules, and usage patterns across platforms while keeping **API keys local** for security. The sync service manages non-sensitive settings through cloud storage with conflict resolution.

**Usage tracking coordination** ensures accurate cost monitoring across platforms, preventing overage situations and enabling intelligent routing decisions based on cumulative usage patterns.

### Phase 9: Enhanced Security Layer considerations

Security implementation must address **multi-provider API key management**, **prompt injection protection**, and **data residency compliance**. Each AI provider has different security requirements and data handling policies.

**Zero-trust architecture** verifies every request regardless of source, with **comprehensive audit logging** of all AI interactions. The system implements **input validation and sanitization** to protect against prompt injection attacks.

**Compliance framework** addresses regional data protection requirements, with **provider routing based on data residency** requirements for enterprise customers.

### Phase 12: Extension modification requirements

Extension modifications focus on **adapting Kilo Code architecture** to support the new model trio while maintaining compatibility with existing workflows.

**Provider interface extensions** add support for Kimi K2's tool calling capabilities, Qwen3-Coder's extended context windows, and DeepSeek R1's reasoning transparency. The **MCP integration** enables access to external tools and APIs required for agentic workflows.

**UI enhancements** provide model selection interfaces, cost tracking displays, and reasoning visualization for DeepSeek R1's transparent thinking process.

## Implementation methodology and timeline

### Phase 1: Foundation (Weeks 1-4)
**OpenRouter integration setup** with basic routing to all three models. Implementation of **cost tracking infrastructure** and **basic model selection logic**. **API key management** and **error handling** frameworks.

### Phase 2: Smart routing (Weeks 5-8)
**Task complexity assessment** algorithms and **dynamic model selection**. **Context caching implementation** and **usage optimization**. **Cost monitoring dashboard** and **alert systems**.

### Phase 3: Advanced features (Weeks 9-12)
**Agentic workflows** with Kimi K2, **repository-scale analysis** with Qwen3-Coder, and **reasoning visualization** for DeepSeek R1. **Cross-platform sync** and **enterprise security** features.

### Phase 4: Production optimization (Weeks 13-16)
**Performance tuning**, **scalability testing**, and **user experience optimization**. **Documentation completion** and **community onboarding** processes.

## Competitive positioning and market advantages

This integration strategy positions recoder.xyz to **compete directly with Cursor and GitHub Copilot** while offering unique advantages through model diversity and cost optimization. The **transparent reasoning capability** of DeepSeek R1 provides educational value that competitors lack.

**Cost leadership** through intelligent routing enables competitive pricing while maintaining healthy margins. The **open-source foundation** builds community trust and enables customization that proprietary competitors cannot match.

**Multi-model specialization** allows optimization for different coding tasks, providing **superior performance** compared to single-model approaches while maintaining cost efficiency through strategic routing.

The comprehensive integration of these three complementary AI models, unified through OpenRouter's sophisticated routing platform, creates a robust foundation for the recoder.xyz project that can achieve both technical excellence and commercial success in the competitive AI coding assistant market.
Qwen3-Coder: Agentic Coding in the World.
Introduction
Today, we're announcing Qwen3-Coder, our most agentic code model to date. Qwen3-Coder is available in multiple sizes, but we're excited to introduce its most powerful variant first: Qwen3-Coder-480B-A35B-Instruct — a 480B-parameter Mixture-of-Experts model with 35B active parameters, offering exceptional performance in both coding and agentic tasks. Qwen3-Coder-480B-A35B-Instruct sets new state-of-the-art results among open models on Agentic Coding, Agentic Browser-Use, and Agentic Tool-Use, comparable to Claude Sonnet.

💻 Significant Performance: among open models on Agentic Coding, Agentic Browser-Use, and other foundational coding tasks, achieving results comparable to Claude Sonnet;

📚 Long-context Capabilities: with native support for 256K tokens, extendable up to 1M tokens using Yarn, optimized for repository-scale understanding;

🛠 Agentic Coding: supporting for most platform such as Qwen Code, CLINE, featuring a specially designed function call format;

Basic information
✨ Supporting long context understanding and generation with the context length of 256K tokens;
✨ Supporting 358 coding languages;
['ABAP', 'ActionScript', 'Ada', 'Agda', 'Alloy', 'ApacheConf', 'AppleScript', 'Arc', 'Arduino', 'AsciiDoc', 'AspectJ', 'Assembly', 'Augeas', 'AutoHotkey', 'AutoIt', 'Awk', 'Batchfile', 'Befunge', 'Bison', 'BitBake', 'BlitzBasic', 'BlitzMax', 'Bluespec', 'Boo', 'Brainfuck', 'Brightscript', 'Bro', 'C', 'C#', 'C++', 'C2hs Haskell', 'CLIPS', 'CMake', 'COBOL', 'CSS', 'CSV', "Cap'n Proto", 'CartoCSS', 'Ceylon', 'Chapel', 'ChucK', 'Cirru', 'Clarion', 'Clean', 'Click', 'Clojure', 'CoffeeScript', 'ColdFusion', 'ColdFusion CFC', 'Common Lisp', 'Component Pascal', 'Coq', 'Creole', 'Crystal', 'Csound', 'Cucumber', 'Cuda', 'Cycript', 'Cython', 'D', 'DIGITAL Command Language', 'DM', 'DNS Zone', 'Darcs Patch', 'Dart', 'Diff', 'Dockerfile', 'Dogescript', 'Dylan', 'E', 'ECL', 'Eagle', 'Ecere Projects', 'Eiffel', 'Elixir', 'Elm', 'Emacs Lisp', 'EmberScript', 'Erlang', 'F#', 'FLUX', 'FORTRAN', 'Factor', 'Fancy', 'Fantom', 'Forth', 'FreeMarker', 'G-code', 'GAMS', 'GAP', 'GAS', 'GDScript', 'GLSL', 'Genshi', 'Gentoo Ebuild', 'Gentoo Eclass', 'Gettext Catalog', 'Glyph', 'Gnuplot', 'Go', 'Golo', 'Gosu', 'Grace', 'Gradle', 'Grammatical Framework', 'GraphQL', 'Graphviz (DOT)', 'Groff', 'Groovy', 'Groovy Server Pages', 'HCL', 'HLSL', 'HTML', 'HTML+Django', 'HTML+EEX', 'HTML+ERB', 'HTML+PHP', 'HTTP', 'Haml', 'Handlebars', 'Harbour', 'Haskell', 'Haxe', 'Hy', 'IDL', 'IGOR Pro', 'INI', 'IRC log', 'Idris', 'Inform 7', 'Inno Setup', 'Io', 'Ioke', 'Isabelle', 'J', 'JFlex', 'JSON', 'JSON5', 'JSONLD', 'JSONiq', 'JSX', 'Jade', 'Jasmin', 'Java', 'Java Server Pages', 'JavaScript', 'Julia', 'Jupyter Notebook', 'KRL', 'KiCad', 'Kit', 'Kotlin', 'LFE', 'LLVM', 'LOLCODE', 'LSL', 'LabVIEW', 'Lasso', 'Latte', 'Lean', 'Less', 'Lex', 'LilyPond', 'Linker Script', 'Liquid', 'Literate Agda', 'Literate CoffeeScript', 'Literate Haskell', 'LiveScript', 'Logos', 'Logtalk', 'LookML', 'Lua', 'M', 'M4', 'MAXScript', 'MTML', 'MUF', 'Makefile', 'Mako', 'Maple', 'Markdown', 'Mask', 'Mathematica', 'Matlab', 'Max', 'MediaWiki', 'Metal', 'MiniD', 'Mirah', 'Modelica', 'Module Management System', 'Monkey', 'MoonScript', 'Myghty', 'NSIS', 'NetLinx', 'NetLogo', 'Nginx', 'Nimrod', 'Ninja', 'Nit', 'Nix', 'Nu', 'NumPy', 'OCaml', 'ObjDump', 'Objective-C++', 'Objective-J', 'Octave', 'Omgrofl', 'Opa', 'Opal', 'OpenCL', 'OpenEdge ABL', 'OpenSCAD', 'Org', 'Ox', 'Oxygene', 'Oz', 'PAWN', 'PHP', 'POV-Ray SDL', 'Pan', 'Papyrus', 'Parrot', 'Parrot Assembly', 'Parrot Internal Representation', 'Pascal', 'Perl', 'Perl6', 'Pickle', 'PigLatin', 'Pike', 'Pod', 'PogoScript', 'Pony', 'PostScript', 'PowerShell', 'Processing', 'Prolog', 'Propeller Spin', 'Protocol Buffer', 'Public Key', 'Pure Data', 'PureBasic', 'PureScript', 'Python', 'Python traceback', 'QML', 'QMake', 'R', 'RAML', 'RDoc', 'REALbasic', 'RHTML', 'RMarkdown', 'Racket', 'Ragel in Ruby Host', 'Raw token data', 'Rebol', 'Red', 'Redcode', "Ren'Py", 'RenderScript', 'RobotFramework', 'Rouge', 'Ruby', 'Rust', 'SAS', 'SCSS', 'SMT', 'SPARQL', 'SQF', 'SQL', 'STON', 'SVG', 'Sage', 'SaltStack', 'Sass', 'Scala', 'Scaml', 'Scheme', 'Scilab', 'Self', 'Shell', 'ShellSession', 'Shen', 'Slash', 'Slim', 'Smali', 'Smalltalk', 'Smarty', 'Solidity', 'SourcePawn', 'Squirrel', 'Stan', 'Standard ML', 'Stata', 'Stylus', 'SuperCollider', 'Swift', 'SystemVerilog', 'TOML', 'TXL', 'Tcl', 'Tcsh', 'TeX', 'Tea', 'Text', 'Textile', 'Thrift', 'Turing', 'Turtle', 'Twig', 'TypeScript', 'Unified Parallel C', 'Unity3D Asset', 'Uno', 'UnrealScript', 'UrWeb', 'VCL', 'VHDL', 'Vala', 'Verilog', 'VimL', 'Visual Basic', 'Volt', 'Vue', 'Web Ontology Language', 'WebAssembly', 'WebIDL', 'X10', 'XC', 'XML', 'XPages', 'XProc', 'XQuery', 'XS', 'XSLT', 'Xojo', 'Xtend', 'YAML', 'YANG', 'Yacc', 'Zephir', 'Zig', 'Zimpl', 'desktop', 'eC', 'edn', 'fish', 'mupad', 'nesC', 'ooc', 'reStructuredText', 'wisp', 'xBase']
✨ Retain strengths in math and general capabilities from base model.
Important

Qwen3-coder function calling relies on our new tool parser qwen3coder_tool_parser.py here.

We updated both the special tokens and their corresponding token ids, in order to maintain consistency with Qwen3. Please make sure to use the new tokenizer.

model name	type	length	Download
Qwen3-Coder-480B-A35B-Instruct	instruct	256k	🤗 Hugging Face • 🤖 ModelScope
Qwen3-Coder-480B-A35B-Instruct-FP8	instruct	256k	🤗 Hugging Face • 🤖 ModelScope
Detailed performance and introduction are shown in this 📑 blog.

Quick Start
Important

Qwen3-Coder-480B-A35B-Instruct are instruction models for chatting;

This model supports only non-thinking mode and does not generate <think></think> blocks in its output. Meanwhile, specifying enable_thinking=False is no longer required.**

👉🏻 Chat with Qwen3-Coder-480B-A35B-Instruct
You can just write several lines of code with transformers to chat with Qwen3-Coder-480B-A35B-Instruct. Essentially, we build the tokenizer and the model with from_pretrained method, and we use generate method to perform chatting with the help of chat template provided by the tokenizer. Below is an example of how to chat with Qwen3-Coder-480B-A35B-Instruct:

from transformers import AutoModelForCausalLM, AutoTokenizer

model_name = "Qwen/Qwen3-Coder-480B-A35B-Instruct"

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)

prompt = "write a quick sort algorithm."
messages = [
    {"role": "user", "content": prompt}
]
text = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True
)
model_inputs = tokenizer([text], return_tensors="pt").to(model.device)

generated_ids = model.generate(
    **model_inputs,
    max_new_tokens=65536
)
generated_ids = [
    output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
]

response = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
The apply_chat_template() function is used to convert the messages into a format that the model can understand. The add_generation_prompt argument is used to add a generation prompt, which refers to <|im_start|>assistant\n to the input. Notably, we apply ChatML template for chat models following our previous practice. The max_new_tokens argument is used to set the maximum length of the response. The tokenizer.batch_decode() function is used to decode the response. In terms of the input, the above messages is an example to show how to format your dialog history and system prompt. You can use the other size of instruct model in the same way.

Fill in the middle with Qwen3-Coder-480B-A35B-Instruct
The code insertion task, also referred to as the "fill-in-the-middle" challenge, requires the insertion of code segments in a manner that bridges the gaps within a given code context. For an approach aligned with best practices, we recommend adhering to the formatting guidelines outlined in the paper "Efficient Training of Language Models to Fill in the Middle"[arxiv].

The prompt should be structured as follows:

prompt = '<|fim_prefix|>' + prefix_code + '<|fim_suffix|>' + suffix_code + '<|fim_middle|>'
Following the approach mentioned, an example would be structured in this manner:

from transformers import AutoTokenizer, AutoModelForCausalLM
# load model
device = "cuda" # the device to load the model onto

TOKENIZER = AutoTokenizer.from_pretrained("Qwen/Qwen3-Coder-480B-A35B-Instruct")
MODEL = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-Coder-480B-A35B-Instruct", device_map="auto").eval()


input_text = """<|fim_prefix|>def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    <|fim_suffix|>
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)<|fim_middle|>"""
            
messages = [
    {"role": "system", "content": "You are a code completion assistant."},
    {"role": "user", "content": input_text}
]


text = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True
)
model_inputs = TOKENIZER([text], return_tensors="pt").to(model.device)

# Use `max_new_tokens` to control the maximum output length.
generated_ids = MODEL.generate(model_inputs.input_ids, max_new_tokens=512, do_sample=False)[0]
# The generated_ids include prompt_ids, we only need to decode the tokens after prompt_ids.
output_text = TOKENIZER.decode(generated_ids[len(model_inputs.input_ids[0]):], skip_special_tokens=True)

print(f"Prompt: {input_text}\n\nGenerated text: {output_text}")
Use Cases
Example: Physics-Based Chimney Demolition Simulation with Controlled Explosion
Prompt with Qwen Chat Web Dev


Example: Multicolor and Interactive Animation
Prompt with Cline [act mode]


Example: 3D Google Earth
Prompt with Qwen Chat Web Dev


Example: Testing Your WPM with a Famous Quote
Prompt with Qwen-Code CLI


Example: Bouncing Ball in Rotation Hypercube
Prompt with Qwen Chat Web Dev


Example: Solar System Simulation
Prompt with Cline [act mode]
write a web page to show the solar system simulation


Example: DUET Game
Prompt with Cline [act mode]


Star History
Star History Chart

Citation
If you find our work helpful, feel free to give us a cite.