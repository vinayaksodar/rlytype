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
    this.initStyles();
  }

  private initStyles() {
    this.container.style.display = "flex";
    this.container.style.flexWrap = "wrap"; // Allow wrapping
    this.container.style.alignItems = "flex-start"; // Top align for paragraph view
    this.container.style.justifyContent = "center";
    this.container.style.fontSize = "2.1rem";
    this.container.style.fontFamily = '"Fira Code", monospace';
    // this.container.style.overflow = 'hidden'; // Not strictly needed if we wrap
    this.container.style.padding = "2rem";
    this.container.style.background = "#1a1a1a";
    this.container.style.color = "#e0e0e0";
    this.container.style.width = "100%";
    this.container.style.borderBottom = "2px solid #333";
    this.container.style.boxSizing = "border-box";
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
      wordDiv.style.marginRight = "0";
      wordDiv.style.marginBottom = "1.0rem"; // Spacing for wrapped lines
      wordDiv.style.opacity = isActive ? "1" : globalIndex < activeWordIndex ? "0.3" : "0.6"; // Dim past words more
      wordDiv.style.display = "inline-block";

      w.word.split("").forEach((char, charIdx) => {
        let color = "#e0e0e0";
        let bg = "transparent";

        // Active Typing Feedback overrides
        if (isActive) {
          if (charIdx < activeCharIndex) {
            // Past chars
            const typedChar = typedSoFar[charIdx];
            if (typedChar === char) {
              color = "#81c784"; // Green
            } else {
              color = "#e57373"; // Red
            }
          } else if (charIdx === activeCharIndex) {
            // Cursor
            bg = isError ? "#b71c1c" : "#424242";
            if (isError) color = "#ffcdd2";
          }
        }

        const span = document.createElement("span");
        span.textContent = char;
        span.style.color = color;
        span.style.backgroundColor = bg;
        span.style.transition = "all 0.1s";

        wordDiv.appendChild(span);
      });

      // Append space character
      const spaceSpan = document.createElement("span");
      spaceSpan.textContent = " ";
      spaceSpan.style.whiteSpace = "pre";
      spaceSpan.style.transition = "all 0.1s";
      if (isActive && activeCharIndex === w.word.length) {
        spaceSpan.style.backgroundColor = isError ? "#b71c1c" : "#424242";
      }
      wordDiv.appendChild(spaceSpan);

      this.container.appendChild(wordDiv);
    });
  }
}
