/**
 * Endpoint Animation Components
 *
 * These components display animated canvas visualizations representing
 * different API endpoints and operations. They are designed to be used
 * in documentation, demos, and feature showcases.
 *
 * Usage:
 * - Add `active` prop to control animation state based on visibility
 * - Add `triggerOnHover` to activate animation on mouse hover
 * - Wrap in a `.group` class container for hover triggers to work
 * - Customize `size` and `color` props as needed
 */

export { default as EndpointsScrape } from './EndpointsScrape';
export { default as EndpointsMap } from './EndpointsMap';
export { default as EndpointsExtract } from './EndpointsExtract';
export { default as EndpointsCrawl } from './EndpointsCrawl';
export { default as EndpointsSearch } from './EndpointsSearch';
export { default as Mcp } from './Mcp';
export { default as Extract } from './Extract';

// Re-export the canvas initialization utility
export { initCanvas } from './init-canvas';
