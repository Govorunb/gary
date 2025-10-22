# OpenRouter Implementation

OpenRouter is a fully OpenAI-compatible API with a few additional endpoints for user management, model listing, etc.
The OpenRouter TypeScript SDK (https://github.com/OpenRouterTeam/typescript-sdk/) is freshly installed and we're in the process of integrating it with the rest of the app.

## Requirements

This app will need to implement the following:
- Setting API token - this should be stored (currently in `UserPrefs`, though ideally it should be stored securely using [stronghold](https://github.com/tauri-apps/tauri-plugin-stronghold)) and passed to the engine
- Model string field (a full selector with filters is out of scope - we will direct the user to select their model(s) at https://openrouter.ai/models)
- Display balance (`client.credits.getBalance()`)
    - When balance falls below $10, requests may incur additional latency due to more strict billing checks - inform the user
- Get completions (`client.chat.send(params)`) - OpenAI compatible with optional extra parameters
- Get generation info (costs, latency, etc.) for a completion (`client.generation.getGeneration({id})`)
    - These will be retrieved asynchronously and inserted as extra data into the generation result (actor `Message`)

Model selection has some behavior specific to OpenRouter. The `model` field for completions can be omitted if the user has a default model configured in OpenRouter account preferences. Additionally, the selected model must have at least one suitable provider that meets the user's policies (e.g. whether to allow storing prompt and completion data). Meaning, some extra errors may occur compared to a usual OpenAI endpoint:

- No default model selected:
```json
{
  "error": {
    "message": "No models provided",
    "code": 400
  },
  "user_id": "..."
}
```
- No model providers meet user's preferences:
```json
{
  "error": {
    "message": "No endpoints found matching your data policy (Free model publication). Configure: https://openrouter.ai/settings/privacy",
    "code": 404
  }
}
```

In both cases, we should direct the user to update their preferences at https://openrouter.ai/settings/preferences.
