import { getComposing } from "../composition";

type SetupKeyListenersParams = {
  inputEl: HTMLInputElement;
  handleKey: (value: string) => void;
};

export function setupKeyListeners({ inputEl, handleKey }: SetupKeyListenersParams): void {
  inputEl.addEventListener("keydown", (e) => {
    console.log(`[Keydown] key: "${e.key}", composing: ${getComposing()}`);
    if (getComposing()) return;

    if (e.key === "Backspace") {
      handleKey("Backspace");
      return;
    }

    if (e.key === " ") {
      // Prevent scroll, handled by 'input' or manual call
      e.preventDefault();
      handleKey(" ");
    }
  });
}
