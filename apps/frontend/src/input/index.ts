import { setupInputEventListeners } from "./listeners";

type InitializeInputParams = {
  inputEl: HTMLInputElement;
  handleKey: (value: string) => void;
};

export function initializeInput({ inputEl, handleKey }: InitializeInputParams): void {
  let compositionCommittedInInput = false;
  let lastCompositionCommitData = "";

  setupInputEventListeners({
    inputEl,
    handleKey,
    getCompositionCommittedInInput: () => compositionCommittedInInput,
    setCompositionCommittedInInput: (value) => {
      compositionCommittedInInput = value;
    },
    getLastCompositionCommitData: () => lastCompositionCommitData,
    setLastCompositionCommitData: (value) => {
      lastCompositionCommitData = value;
    },
  });
}
