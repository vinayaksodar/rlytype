import { getComposing } from "../composition";
import { isSupportedInputType } from "../helpers/input-type";

type SetupInputListenersParams = {
  inputEl: HTMLInputElement;
  handleKey: (value: string) => void;
  setCompositionCommittedInInput: (value: boolean) => void;
  getLastCompositionCommitData: () => string;
  setLastCompositionCommitData: (value: string) => void;
};

export function setupInputListeners({
  inputEl,
  handleKey,
  setCompositionCommittedInInput,
  getLastCompositionCommitData,
  setLastCompositionCommitData,
}: SetupInputListenersParams): void {
  inputEl.addEventListener("beforeinput", (e) => {
    if (!(e instanceof InputEvent)) {
      return;
    }

    if (!isSupportedInputType(e.inputType)) {
      e.preventDefault();
      return;
    }

    // Mirror Monkeytype's guard for stray composition input events.
    if (
      (e.inputType === "insertCompositionText" || e.inputType === "insertFromComposition") &&
      !e.isComposing
    ) {
      e.preventDefault();
    }
  });

  inputEl.addEventListener("input", (e) => {
    const inputEvent = e as InputEvent;
    const data = inputEvent.data;
    console.log(`[Input] data: "${data}", type: ${inputEvent.inputType}`);

    if (!isSupportedInputType(inputEvent.inputType)) {
      inputEvent.preventDefault();
      return;
    }

    // During composition, only accept explicit composition commit events.
    if (getComposing() && inputEvent.inputType !== "insertFromComposition") {
      return;
    }

    if (inputEvent.inputType === "insertCompositionText") {
      return;
    }

    if (
      inputEvent.inputType === "deleteWordBackward" ||
      inputEvent.inputType === "deleteContentBackward"
    ) {
      return;
    } else if (inputEvent.inputType === "insertFromComposition") {
      if (data) {
        if (data === getLastCompositionCommitData()) {
          return;
        }
        setLastCompositionCommitData(data);
        setCompositionCommittedInInput(true);
        handleKey(data);
      }
    } else if (inputEvent.inputType === "insertText") {
      if (data) {
        handleKey(data);
      } else if (inputEl.value.endsWith(" ")) {
        // Fallback for some browsers where space doesn't come in 'data'
        handleKey(" ");
      }
    }

    // Clear input to keep it ready for next character/composition
    if (!getComposing()) {
      inputEl.value = "";
    }
  });
}
