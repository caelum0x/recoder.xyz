"""
Thread name generation utility
Uses the same LLM-based approach as project name generation
"""
import json
import traceback
from core.services.db import execute_mutate
from core.services.llm import make_llm_api_call
from .logger import logger


def _fallback_thread_title(prompt: str) -> str:
    cleaned = prompt.replace("\n", " ").strip()
    if not cleaned:
        return "New Chat"

    lowered = cleaned.lower()
    if "[attached:" in lowered:
        cleaned = cleaned.split("[Attached:", 1)[0].strip()
    if not cleaned:
        return "New Chat"

    words = [word for word in cleaned.replace('"', "").replace("'", "").split() if word]
    if not words:
        return "New Chat"

    title = " ".join(words[:6]).strip(" ,.-")
    return title.title()[:80] or "New Chat"


async def generate_and_update_thread_name(thread_id: str, prompt: str):
    """
    Generates a thread name using the same LLM approach as project name generation.
    
    This uses the same model, temperature, and pattern as generate_and_update_project_name,
    but only generates the title (no icon/category).
    
    Args:
        thread_id: The thread ID to update
        prompt: The initial user prompt to base the name on
    """
    logger.info(f"Starting background task to generate name for thread: {thread_id}")
    
    generated_name = None

    try:
        # Use same model and approach as project name generation
        # Use the platform default model (free tier) instead of hardcoded paid model
        from core.ai_models import FREE_MODEL_ID
        model_name = FREE_MODEL_ID
        
        system_prompt = """Generate a concise but accurate and meaningful title (2-6 words) for a chat thread.

Rules:
- 2-8 words maximum, Title Case
- Be ACCURATE: capture the user's actual intent/topic
- Be CONCISE: no filler words, get to the point
- If files are attached, combine the info you get from it /infer the topic of the file
- Ignore system metadata like [Attached: ...] brackets - extract the real intent/details of the attached data.

Examples:
{"title": "Fix CORS and Canvas Bug"}
{"title": "Next.js E-Commerce App"}
{"title": "Arxiv Research Paper"}
{"title": "Sales Prospect Analysis"}
{"title": "Analyze Budget Spreadsheet"}
{"title": "Debug Auth in Login Frontend"}

Respond with JSON: {"title": "Your Title"}"""

        # Truncate very long prompts but keep enough context
        truncated_prompt = prompt[:600] if len(prompt) > 600 else prompt
        user_message = f"Title this conversation:\n\n{truncated_prompt}"
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]

        logger.debug(f"Calling LLM ({model_name}) for thread {thread_id} naming.")
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            max_tokens=80,
            temperature=0.3,
            frequency_penalty=0.5,
            response_format={"type": "json_object"},
            stream=False
        )

        if response and response.get('choices') and response['choices'][0].get('message'):
            raw_content = response['choices'][0]['message'].get('content', '').strip()
            try:
                parsed_response = json.loads(raw_content)

                if isinstance(parsed_response, dict):
                    # Accept "title" or "name" key (models may use either)
                    title = (parsed_response.get('title') or parsed_response.get('name') or '').strip()
                    if title:
                        generated_name = title.strip('\'" \n\t')
                        logger.debug(f"LLM generated name for thread {thread_id}: '{generated_name}'")
                else:
                    logger.warning(f"LLM returned non-dict JSON for thread {thread_id}: {parsed_response}")

            except json.JSONDecodeError:
                # Not JSON — use first line as title, strip any JSON artifacts
                cleaned = raw_content.strip('\'" \n\t{}[]')
                # Remove JSON key prefixes like "title": or "name":
                for prefix in ['"title":', '"name":', 'title:', 'name:']:
                    if cleaned.lower().startswith(prefix):
                        cleaned = cleaned[len(prefix):].strip().strip('"\'')
                if cleaned and len(cleaned) < 80:
                    generated_name = cleaned
        else:
            logger.warning(f"Failed to get valid response from LLM for thread {thread_id} naming. Response: {response}")

        if generated_name:
            # Truncate to max 80 chars and remove repetition
            generated_name = generated_name[:80].strip()
            # Detect repetition: if same phrase appears 2+ times, keep only first occurrence
            words = generated_name.split()
            if len(words) > 6:
                half = len(words) // 2
                first_half = ' '.join(words[:half])
                if first_half in generated_name[len(first_half):]:
                    generated_name = first_half.strip()
            logger.info(f"Storing thread {thread_id} with name: '{generated_name}'")

            updated_rows = await execute_mutate(
                """
                UPDATE threads
                SET name = :name
                WHERE thread_id::text = :thread_id
                RETURNING thread_id
                """,
                {"name": generated_name, "thread_id": thread_id},
            )
            if updated_rows:
                logger.debug(f"Successfully updated thread {thread_id} with name")
            else:
                logger.error(f"Failed to update thread {thread_id} in database.")
        else:
            generated_name = _fallback_thread_title(prompt)
            logger.warning(f"No generated name, using fallback title '{generated_name}' for thread {thread_id}.")

        logger.info(f"Storing thread {thread_id} with name: '{generated_name}'")

        updated_rows = await execute_mutate(
            """
            UPDATE threads
            SET name = :name
            WHERE thread_id::text = :thread_id
            RETURNING thread_id
            """,
            {"name": generated_name, "thread_id": thread_id},
        )
        if updated_rows:
            logger.debug(f"Successfully updated thread {thread_id} with name")
        else:
            logger.error(f"Failed to update thread {thread_id} in database.")

    except Exception as e:
        generated_name = _fallback_thread_title(prompt)
        logger.warning(f"Thread naming fallback for {thread_id}: {str(e)}")
        try:
            updated_rows = await execute_mutate(
                """
                UPDATE threads
                SET name = :name
                WHERE thread_id::text = :thread_id
                RETURNING thread_id
                """,
                {"name": generated_name, "thread_id": thread_id},
            )
            if updated_rows:
                logger.debug(f"Successfully applied fallback thread title for {thread_id}")
        except Exception:
            logger.error(f"Error in background naming task for thread {thread_id}: {str(e)}\n{traceback.format_exc()}")
    finally:
        logger.debug(f"Finished background naming task for thread: {thread_id}")
