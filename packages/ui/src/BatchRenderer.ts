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

    this.container.innerHTML = "";

    words.forEach((word, wordIdx) => {
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
      this.container.appendChild(wordDiv);
    });
  }
}
