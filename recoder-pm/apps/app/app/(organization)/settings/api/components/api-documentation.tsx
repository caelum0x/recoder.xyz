import { Prose } from "@repo/design-system/components/prose";
import { MemoizedReactMarkdown } from "@/components/markdown";

const docs = `
Use the Recoder PM API to interact with your Recoder PM data programmatically. The Recoder PM API is organized around REST. Our API has predictable resource-oriented URLs, accepts JSON-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP response codes, authentication, and verbs.

The Recoder PM API doesn’t support bulk updates. You can work on only one object per request.

## Getting Started

To get started, create a new API Key in your Settings, then read about how to make requests for the resources you need to access using our HTTP APIs.

## Authentication

You'll need to authenticate your requests to access any of the endpoints in the Recoder PM API. You can do this by providing your API Key in the \`Authorization\` header.

## Errors

Recoder PM uses conventional HTTP response codes to indicate the success or failure of an API request. In general:

- Codes in the \`2xx\` range indicate success.
- Codes in the \`4xx\` range indicate an error that failed given the information provided (e.g. a required parameter was omitted).
- Codes in the \`5xx\` range indicate an error with Recoder PM’s servers (these are rare).

## Endpoints

### Get Changelog

\`\`\`bash
curl --request GET \\
  --url https://api.recoderpm.app/changelog \\
  --header 'Authorization: Bearer <token>'
\`\`\`

Example response:

\`\`\`json
{
  "data": [
    {
      "id": "<string>",
      "title": "<string>",
      "description": "<string>",
      "publishAt": "<string>",
      "slug": {}
    }
  ]
}
\`\`\`

### Create a feature

\`\`\`bash
curl --request POST \\
  --url https://api.recoderpm.app/feature \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{
  "title": "<string>",
  "text": "<string>",
  "custom": [
    {
      "key": "<string>",
      "value": "<string>"
    }
  ]
}'
\`\`\`

### Create Feedback

\`\`\`bash
curl --request POST \\
  --url https://api.recoderpm.app/feedback \\
  --header 'Authorization: Bearer <token>' \\
  --header 'Content-Type: application/json' \\
  --data '{
  "title": "<string>",
  "text": "<string>",
  "user": {
    "name": "<string>",
    "email": "<string>"
  },
  "organization": {
    "name": "<string>",
    "domain": "<string>"
  }
}'
\`\`\`
`;

export const APIDocumentation = () => (
  <Prose className="prose-sm">
    <MemoizedReactMarkdown>{docs}</MemoizedReactMarkdown>
  </Prose>
);
