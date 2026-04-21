"""Project-related helper functions."""
import json
import traceback
from core.services.db import execute_mutate
from core.services.llm import make_llm_api_call
from .logger import logger
from .icon_generator import RELEVANT_ICONS

# Project categories for analytics classification (based on actual usage data)
PROJECT_CATEGORIES = [
    "Research & Information Gathering",
    "Business & Marketing",
    "Code & Programming",
    "Web Development",
    "Content Creation",
    "Presentations",
    "Image Generation",
    "Other"
]


def _fallback_project_title(prompt: str) -> str:
    cleaned = prompt.replace("\n", " ").strip()
    if not cleaned:
        return "New Project"

    lowered = cleaned.lower()
    if "[attached:" in lowered:
        cleaned = cleaned.split("[Attached:", 1)[0].strip()
    if not cleaned:
        return "New Project"

    words = [word for word in cleaned.replace('"', "").replace("'", "").split() if word]
    if not words:
        return "New Project"

    title = " ".join(words[:4]).strip(" ,.-")
    return title.title()[:60] or "New Project"


async def generate_and_update_project_name(project_id: str, prompt: str):
    """
    Generates a project name and icon using an LLM and updates the database.
    
    Category is set separately by the periodic categorization job after 30 mins of inactivity.
    
    Args:
        project_id: The project ID to update
        prompt: The initial user prompt to base the name/icon on
    """
    logger.info(f"Starting background task to generate name and icon for project: {project_id}")
    
    generated_name = None
    selected_icon = "message-circle"

    try:
        from core.ai_models import FREE_MODEL_ID
        model_name = FREE_MODEL_ID

        relevant_icons = RELEVANT_ICONS
        system_prompt = f"""You are a helpful assistant that generates extremely concise titles (2-4 words maximum) and selects appropriate icons for chat threads.

        Available Lucide React icons to choose from:
        {', '.join(relevant_icons)}

        Respond with a JSON object containing:
        - "title": A concise 2-4 word title for the thread
        - "icon": The most appropriate icon name from the list above

        Example response:
        {{"title": "Code Review Help", "icon": "code"}}"""

        user_message = f"Generate an extremely brief title (2-4 words only) and select the most appropriate icon for this chat thread that starts with this message: \"{prompt}\""
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]

        logger.debug(f"Calling LLM ({model_name}) for project {project_id} naming and icon selection.")
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            max_tokens=100,
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
                    title = (parsed_response.get('title') or parsed_response.get('name') or '').strip()
                    if title:
                        generated_name = title.strip('\'" \n\t')
                        logger.debug(f"LLM generated name for project {project_id}: '{generated_name}'")
                    
                    icon = parsed_response.get('icon', '').strip()
                    if icon and icon in relevant_icons:
                        selected_icon = icon
                        logger.debug(f"LLM selected icon for project {project_id}: '{selected_icon}'")
                    else:
                        logger.warning(f"LLM selected invalid icon '{icon}' for project {project_id}, using default 'message-circle'")
                        selected_icon = "message-circle"
                else:
                    logger.warning(f"LLM returned non-dict JSON for project {project_id}: {parsed_response}")
                    
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse LLM JSON response for project {project_id}: {e}. Raw content: {raw_content}")
                cleaned_content = raw_content.strip('\'" \n\t{}')
                if cleaned_content:
                    generated_name = cleaned_content[:50]
        else:
            logger.warning(f"Failed to get valid response from LLM for project {project_id} naming. Response: {response}")

        if generated_name:
            # Hard truncate + repetition detection
            generated_name = generated_name[:60].strip()
            words = generated_name.split()
            if len(words) > 4:
                # Detect repeating phrase
                for phrase_len in range(2, len(words) // 2 + 1):
                    phrase = ' '.join(words[:phrase_len])
                    if generated_name.count(phrase) >= 2:
                        generated_name = phrase.strip()
                        break
            update_data = {"name": generated_name}
            if selected_icon:
                update_data["icon_name"] = selected_icon
            
            logger.info(f"Storing project {project_id} with title: '{generated_name}', icon: '{selected_icon}'")

            updated_rows = await execute_mutate(
                """
                UPDATE projects
                SET
                    name = :name,
                    icon_name = COALESCE(:icon_name, icon_name)
                WHERE project_id::text = :project_id
                RETURNING project_id
                """,
                {
                    "name": update_data["name"],
                    "icon_name": update_data.get("icon_name"),
                    "project_id": project_id,
                },
            )
            if updated_rows:
                logger.debug(f"Successfully updated project {project_id} with title and icon")
            else:
                logger.error(f"Failed to update project {project_id} in database.")
        else:
            generated_name = _fallback_project_title(prompt)
            logger.warning(f"No generated name, using fallback title '{generated_name}' for project {project_id}.")

        update_data = {"name": generated_name, "icon_name": selected_icon}
        logger.info(f"Storing project {project_id} with title: '{generated_name}', icon: '{selected_icon}'")

        updated_rows = await execute_mutate(
            """
            UPDATE projects
            SET
                name = :name,
                icon_name = COALESCE(:icon_name, icon_name)
            WHERE project_id::text = :project_id
            RETURNING project_id
            """,
            {
                "name": update_data["name"],
                "icon_name": update_data.get("icon_name"),
                "project_id": project_id,
            },
        )
        if updated_rows:
            logger.debug(f"Successfully updated project {project_id} with title and icon")
        else:
            logger.error(f"Failed to update project {project_id} in database.")

    except Exception as e:
        generated_name = _fallback_project_title(prompt)
        logger.warning(
            f"Project naming fallback for {project_id}: {str(e)}"
        )
        try:
            updated_rows = await execute_mutate(
                """
                UPDATE projects
                SET
                    name = :name,
                    icon_name = COALESCE(:icon_name, icon_name)
                WHERE project_id::text = :project_id
                RETURNING project_id
                """,
                {
                    "name": generated_name,
                    "icon_name": selected_icon,
                    "project_id": project_id,
                },
            )
            if updated_rows:
                logger.debug(f"Successfully applied fallback title/icon for project {project_id}")
        except Exception:
            logger.error(f"Error in background naming task for project {project_id}: {str(e)}\n{traceback.format_exc()}")
    finally:
        logger.debug(f"Finished background naming and icon selection task for project: {project_id}")
