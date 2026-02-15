# How to launch a token on Nad.fun using OpenClaw

Nad.fun is the Monad native launchpad, venue for token discovery and early narrative formation **token creation** with immediate on-chain trading. Allowing anyone to launch a token and have it tradable instantly.

**Fee to create a new token is** 10 $MON

Every launch automatically includes few block of fee normalization period right after trading starts.

In this guide, you will learn how you can install the `nadfun-token-creation` skill to enable your OpenClaw bot to launch tokens on Nad.fun

### Prerequisites

Nad.fun skill involves launching tokens via onchain Monad mainnet actions, make sure you have the `monad-development` skill installed for wallet operations and also make sure the OpenClaw bot wallet has funds to launch a token.

Install the `monad-development` skill for your OpenClaw bot using the command below:

```tsx
clawhub install monad-development
```

### Installing the Nad.fun skill

Use the below command to install the [Nad.fun](http://Nad.fun) token creation skill

```tsx
clawhub install nadfun-token-creation
```

Once the skill is installed, create a new chat session so the skill is loaded.

You can prompt the bot to launch a token for you!

### Example conversation with OpenClaw bot to launch a token.

<aside>
⚠️

DO NOT BUY, the token launched by the OpenClaw bot in the following conversation in the screenshots, it was created for educational purposes only.

</aside>

In the following screenshots you can see an example conversation with an OpenClaw bot to launch a token on Nad.fun

Prompt: “Create a token”

![image.png](attachment:f9480d7c-c2fd-4ad6-989f-343253bce145:image.png)

![image.png](attachment:0adf2f0f-65eb-4207-8c36-fabd29e03f18:image.png)

![image.png](attachment:5fe2943e-daec-4705-9bfa-9089d7af8722:image.png)

and that’s it, you can search the token on Nad.fun provided by the bot to view the token page!

You now have enabled your OpenClaw bot to launch tokens on Nad.fun!