import json
from typing import List, Dict, Any, Optional
from core.utils.pagination import PaginationService, PaginationParams, PaginatedResponse, PaginationMeta
from core.utils.logger import logger
from core.services.db import execute_read


class MarketplaceFilters:
    def __init__(
        self,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_recoder_team: Optional[bool] = None,
        creator_id: Optional[str] = None,
        sort_by: str = "download_count",
        sort_order: str = "desc"
    ):
        self.search = search
        self.tags = tags or []
        self.is_recoder_team = is_recoder_team
        self.creator_id = creator_id
        self.sort_by = sort_by
        self.sort_order = sort_order


class MarketplaceService:
    def __init__(self):
        pass

    async def get_marketplace_templates_paginated(
        self,
        pagination_params: PaginationParams,
        filters: MarketplaceFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        try:
            from ..template_service import get_template_service
            from ..utils import format_template_for_response

            template_service = get_template_service()

            limit = pagination_params.page_size
            offset = (pagination_params.page - 1) * pagination_params.page_size

            templates = await template_service.get_public_templates(
                is_recoder_team=filters.is_recoder_team,
                limit=limit,
                offset=offset,
                search=filters.search,
                tags=filters.tags
            )

            total_items = await self._count_marketplace_templates(filters)

            if filters.creator_id is not None:
                templates = [t for t in templates if t.creator_id == filters.creator_id]
                if filters.creator_id:
                    all_templates = await template_service.get_public_templates(
                        is_recoder_team=filters.is_recoder_team,
                        search=filters.search,
                        tags=filters.tags
                    )
                    filtered_templates = [t for t in all_templates if t.creator_id == filters.creator_id]
                    total_items = len(filtered_templates)

            template_responses = []
            for template in templates:
                template_response = format_template_for_response(template)
                template_responses.append(template_response)

            total_pages = (total_items + pagination_params.page_size - 1) // pagination_params.page_size
            has_next = pagination_params.page < total_pages
            has_previous = pagination_params.page > 1

            return PaginatedResponse(
                data=template_responses,
                pagination=PaginationMeta(
                    current_page=pagination_params.page,
                    page_size=pagination_params.page_size,
                    total_items=total_items,
                    total_pages=total_pages,
                    has_next=has_next,
                    has_previous=has_previous
                )
            )

        except Exception as e:
            try:
                error_str = str(e)
            except Exception:
                error_str = f"Error of type {type(e).__name__}"
            logger.error(f"Error fetching marketplace templates: {error_str}")
            raise

    async def get_user_templates_paginated(
        self,
        pagination_params: PaginationParams,
        filters: MarketplaceFilters
    ) -> PaginatedResponse[Dict[str, Any]]:
        try:
            logger.debug(f"Fetching user templates with filters: {filters.__dict__}")

            from ..template_service import get_template_service
            from ..utils import format_template_for_response

            if not filters.creator_id:
                raise ValueError("creator_id is required for user templates")

            template_service = get_template_service()

            all_templates = await template_service.get_user_templates(filters.creator_id)

            filtered_templates = all_templates
            if filters.search:
                search_term = filters.search.lower()
                filtered_templates = [
                    t for t in filtered_templates
                    if (search_term in t.name.lower() if t.name else False)
                ]

            if filters.tags:
                tag_set = set(filters.tags)
                filtered_templates = [
                    t for t in filtered_templates
                    if tag_set.intersection(set(t.tags or []))
                ]

            if filters.sort_by == "name":
                filtered_templates.sort(key=lambda t: t.name.lower() if t.name else '',
                                      reverse=(filters.sort_order == "desc"))
            elif filters.sort_by == "download_count":
                filtered_templates.sort(key=lambda t: t.download_count,
                                      reverse=(filters.sort_order == "desc"))
            else:
                filtered_templates.sort(key=lambda t: t.created_at,
                                      reverse=(filters.sort_order == "desc"))

            total_items = len(filtered_templates)
            offset = (pagination_params.page - 1) * pagination_params.page_size
            limit = pagination_params.page_size
            paginated_templates = filtered_templates[offset:offset + limit]

            template_responses = []
            for template in paginated_templates:
                template_response = format_template_for_response(template)
                template_responses.append(template_response)

            total_pages = (total_items + pagination_params.page_size - 1) // pagination_params.page_size
            has_next = pagination_params.page < total_pages
            has_previous = pagination_params.page > 1

            return PaginatedResponse(
                data=template_responses,
                pagination=PaginationMeta(
                    current_page=pagination_params.page,
                    page_size=pagination_params.page_size,
                    total_items=total_items,
                    total_pages=total_pages,
                    has_next=has_next,
                    has_previous=has_previous
                )
            )

        except Exception as e:
            try:
                error_str = str(e)
            except Exception:
                error_str = f"Error of type {type(e).__name__}"
            logger.error(f"Error fetching user templates: {error_str}")
            raise

    async def _count_marketplace_templates(self, filters: MarketplaceFilters) -> int:
        """Count marketplace templates matching the given filters using raw SQL."""
        conditions = ['"is_public" = TRUE']
        params: Dict[str, Any] = {}

        if filters.search:
            conditions.append('"name" ILIKE :search')
            params["search"] = f"%{filters.search}%"

        if filters.is_recoder_team is not None:
            conditions.append('"is_recoder_team" = :is_recoder_team')
            params["is_recoder_team"] = filters.is_recoder_team

        if filters.creator_id is not None:
            conditions.append('"creator_id" = :creator_id')
            params["creator_id"] = filters.creator_id

        if filters.tags:
            for i, tag in enumerate(filters.tags):
                conditions.append(f'"tags" @> :tag_{i}::jsonb')
                params[f"tag_{i}"] = json.dumps([tag])

        where = " AND ".join(conditions)
        rows = await execute_read(
            f'SELECT COUNT(*) AS cnt FROM "agent_templates" WHERE {where}',
            params
        )
        return rows[0]["cnt"] if rows else 0
