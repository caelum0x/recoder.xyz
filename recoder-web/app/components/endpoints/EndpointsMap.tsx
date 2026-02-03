'use client';

import type { ComponentProps } from 'react';
import EndpointsScrape from './EndpointsScrape';

/**
 * EndpointsMap - Animated canvas component visualizing sitemap generation
 * Uses the same base animation as EndpointsScrape but with specific cells
 * disabled to create a tree/map-like visual pattern.
 */
export default function EndpointsMap(
  props: ComponentProps<typeof EndpointsScrape>
) {
  return <EndpointsScrape {...props} disabledCells={[1, 2, 3, 7, 9, 12, 15]} />;
}
