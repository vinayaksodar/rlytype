import { WordCandidate, BATCH_SIZE } from "@rlytype/types";

export interface RenderState {
  words: WordCandidate[];
  activeWordIndex: number;
  activeCharIndex: number;
  typedSoFar: string;
  isError: boolean;
}

export class BatchRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    // No inline styles. Relies on external CSS.
  }

  render(state: RenderState) {
    const { words, activeWordIndex, activeCharIndex, typedSoFar, isError } = state;

    // Page logic: Show fixed set of words (aligned with engine batch size)
    const pageIndex = Math.floor(activeWordIndex / BATCH_SIZE);
    const visibleStart = pageIndex * BATCH_SIZE;
    const visibleEnd = Math.min(words.length, visibleStart + BATCH_SIZE);
    const visibleWords = words.slice(visibleStart, visibleEnd);

    // Clear content
    this.container.innerHTML = "";

    visibleWords.forEach((w, i) => {
      const globalIndex = visibleStart + i;
      const isActive = globalIndex === activeWordIndex;

      const wordDiv = document.createElement("div");
      wordDiv.classList.add("word");
      if (isActive) wordDiv.classList.add("active");

      // Dim past words (handled via CSS opacity if needed, or class)
      if (globalIndex < activeWordIndex) wordDiv.classList.add("completed");

      w.word.split("").forEach((char, charIdx) => {
        const span = document.createElement("span");
        span.textContent = char;
        span.classList.add("char");

        if (isActive) {
          if (charIdx < activeCharIndex) {
            // Past chars
            const typedChar = typedSoFar[charIdx];
            if (typedChar === char) {
              span.classList.add("correct");
            } else {
              span.classList.add("incorrect");
            }
          } else if (charIdx === activeCharIndex) {
            // Cursor
            span.classList.add("cursor");
            if (isError) span.classList.add("error");
          }
        }

        wordDiv.appendChild(span);
      });

      // Append space character
      const spaceSpan = document.createElement("span");
      spaceSpan.textContent = " ";
      spaceSpan.classList.add("char");
      // Space visualization logic if needed
      if (isActive && activeCharIndex === w.word.length) {
        spaceSpan.classList.add("cursor");
        if (isError) spaceSpan.classList.add("error");
      }
      wordDiv.appendChild(spaceSpan);

      this.container.appendChild(wordDiv);
    });
  }
}
