/**
 * ShikiCode Scroll Synchronization
 *
 * Synchronizes scrolling between the input textarea and the output display.
 */

export function hookScroll(input: HTMLElement, output: HTMLElement) {
  const onScroll = () => {
    output.scrollTo(input.scrollLeft, input.scrollTop);
  };

  input.addEventListener('scroll', onScroll);

  return () => {
    input.removeEventListener('scroll', onScroll);
  };
}
