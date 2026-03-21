export interface RenderState {
  words: string[];
  activeWordIndex: number;
  activeCharIndex: number;
  typedSoFar: string;
  errorBuffer: string;
  isError: boolean;
}
export class BatchRenderer {
  constructor(private container: HTMLElement) {}

  render(state: RenderState) {
    const { words, activeWordIndex, activeCharIndex, typedSoFar, errorBuffer, isError } = state;

    // Use a fragment to build the DOM off-screen
    const fragment = document.createDocumentFragment();

    const wordsPerLine = 5;
    const lines: string[][] = [];
    for (let i = 0; i < words.length; i += wordsPerLine) {
      lines.push(words.slice(i, i + wordsPerLine));
    }

    let globalWordIdx = 0;

    lines.forEach((lineWords) => {
      const lineDiv = document.createElement("div");
      lineDiv.classList.add("word-line");
      // Initially hide the line to prevent scale flickering
      lineDiv.style.visibility = "hidden";

      lineWords.forEach((word) => {
        const wordIdx = globalWordIdx++;
        const isActive = wordIdx === activeWordIndex;

        const wordDiv = document.createElement("div");
        wordDiv.classList.add("word");

        if (isActive) wordDiv.classList.add("active");
        if (wordIdx < activeWordIndex) wordDiv.classList.add("completed");

        word.split("").forEach((char, charIdx) => {
          if (isActive && charIdx === activeCharIndex && errorBuffer.length > 0) {
            errorBuffer.split("").forEach((errChar) => {
              const errSpan = document.createElement("span");
              errSpan.textContent = errChar === " " ? "_" : errChar;
              errSpan.classList.add("char", "incorrect", "extra");
              wordDiv.appendChild(errSpan);
            });
          }

          const span = document.createElement("span");
          span.textContent = char;
          span.classList.add("char");

          if (isActive) {
            if (charIdx < activeCharIndex) {
              span.classList.add(typedSoFar[charIdx] === char ? "correct" : "incorrect");
            } else if (charIdx === activeCharIndex) {
              span.classList.add("cursor");
              if (isError) span.classList.add("error");
            }
          }

          wordDiv.appendChild(span);
        });

        // space
        if (isActive && activeCharIndex === word.length && errorBuffer.length > 0) {
          errorBuffer.split("").forEach((errChar) => {
            const errSpan = document.createElement("span");
            errSpan.textContent = errChar === " " ? "_" : errChar;
            errSpan.classList.add("char", "incorrect", "extra");
            wordDiv.appendChild(errSpan);
          });
        }

        const space = document.createElement("span");
        space.textContent = " ";
        space.classList.add("char");

        if (isActive && activeCharIndex === word.length) {
          space.classList.add("cursor");
          if (isError) space.classList.add("error");
        }

        wordDiv.appendChild(space);
        lineDiv.appendChild(wordDiv);
      });

      fragment.appendChild(lineDiv);
    });

    // Atomic update of the container
    this.container.innerHTML = "";
    this.container.appendChild(fragment);

    // Measure, Scale, and Reveal
    this.fitLinesAndReveal();
  }

  private fitLinesAndReveal() {
    const lines = this.container.querySelectorAll(".word-line");
    const containerWidth = this.container.clientWidth;

    if (containerWidth === 0) return;

    lines.forEach((line) => {
      const lineEl = line as HTMLElement;

      // Force natural width for accurate measurement
      lineEl.style.width = "max-content";
      const naturalWidth = lineEl.offsetWidth;

      if (naturalWidth > containerWidth) {
        const ratio = containerWidth / naturalWidth;
        lineEl.style.transformOrigin = "center center";
        lineEl.style.transform = `scale(${ratio * 0.96})`;
      } else {
        lineEl.style.transform = "none";
      }

      // Restore layout and make visible
      lineEl.style.width = "100%";
      lineEl.style.visibility = "visible";
    });
  }
}
